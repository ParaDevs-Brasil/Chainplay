/**
 * Cenário real: um jogador entra na aplicação e joga TODOS os jogos via as
 * mesmas requisições HTTP que o browser faz — login, aposta, jogada, resgate.
 * Depois confere, na chain, se o NFT que caiu na carteira dele é membro
 * VERIFICADO da coleção do jogo certo (a identidade on-chain por jogo).
 *
 *   npm run e2e:games
 */
import { PublicKey } from "@solana/web3.js";
import {
  GAMES,
  gameCollectionPda,
  getChain,
  metadataPda,
  TOKEN_PROGRAM_ID,
} from "../chain/client.js";

const API = process.env.API_URL || "http://localhost:3001";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Coleção (mint) que o ticket-NFT do jogador declara — lida da metadata Metaplex. */
async function collectionOfNft(mint: string): Promise<string | null> {
  const chain = getChain()!;
  const meta = await chain.connection.getAccountInfo(metadataPda(new PublicKey(mint)));
  if (!meta) return null;
  const data = meta.data;
  let o = 1 + 32 + 32; // key + update_authority + mint
  const skipStr = () => {
    const len = data.readUInt32LE(o);
    o += 4 + len;
  };
  skipStr(); // name
  skipStr(); // symbol
  skipStr(); // uri
  o += 2; // seller_fee_basis_points
  if (data[o++] === 1) {
    const n = data.readUInt32LE(o);
    o += 4 + n * (32 + 1 + 1); // creators
  }
  o += 1; // primary_sale_happened
  o += 1; // is_mutable
  if (data[o++] === 1) o += 1; // edition_nonce
  if (data[o++] === 1) o += 1; // token_standard
  if (data[o++] !== 1) return null; // collection: Option
  const verified = data[o] === 1;
  o += 1;
  const key = new PublicKey(data.subarray(o, o + 32)).toBase58();
  return verified ? key : null;
}

/** Mint da Collection NFT de um jogo (fonte da verdade on-chain). */
async function collectionMintOf(gameId: number): Promise<string> {
  const chain = getChain()!;
  const gc: any = await (chain.program.account as any).gameCollection.fetch(
    gameCollectionPda(gameId)
  );
  return gc.collectionMint.toBase58();
}

/** NFTs (supply 1) que a wallet segura agora. */
async function nftsOf(wallet: string): Promise<string[]> {
  const chain = getChain()!;
  const res = await chain.connection.getParsedTokenAccountsByOwner(new PublicKey(wallet), {
    programId: TOKEN_PROGRAM_ID,
  });
  return res.value
    .filter((a) => {
      const i: any = a.account.data.parsed?.info;
      return i?.tokenAmount?.decimals === 0 && i?.tokenAmount?.uiAmount === 1;
    })
    .map((a) => (a.account.data.parsed as any).info.mint as string);
}

/** Confere que o jogador ganhou um NFT novo e que ele é da coleção do jogo. */
async function checkNftOfGame(label: string, wallet: string, gameId: number, before: string[]) {
  const game = GAMES.find((g) => g.id === gameId)!;
  const after = await nftsOf(wallet);
  const fresh = after.filter((m) => !before.includes(m));
  check(`${label}: NFT novo na carteira do jogador`, fresh.length > 0, `${fresh.length} novos`);
  if (!fresh.length) return;
  const expected = await collectionMintOf(gameId);
  const found = await Promise.all(fresh.map(collectionOfNft));
  check(
    `${label}: NFT é membro VERIFICADO da coleção "${game.name}"`,
    found.includes(expected),
    `esperado ${expected.slice(0, 8)}… · achado ${found.map((f) => f?.slice(0, 8) ?? "sem coleção")}`
  );
}

async function main() {
  if (!getChain()) throw new Error("authority ausente");
  console.log(`cenário real de jogo · API ${API}\n`);

  // ---- login (como o botão "entrar como convidado" do site) ----
  const { json: session } = await api("/api/auth/guest", {});
  const token: string = session.token;
  const wallet: string = session.address;
  check("login de convidado cria wallet custodial", Boolean(token && wallet));
  console.log(`  jogador: ${wallet}\n`);
  await sleep(4000); // bônus de boas-vindas cair na wallet

  // ---- 1) Hi-Lo (run com meta) ----
  console.log("1. Hi-Lo — aposta on-chain e joga a run");
  let before = await nftsOf(wallet);
  const { json: run } = await api(
    "/api/runs",
    { target: 3, stakeLamports: 1_000_000, mode: "target" },
    token
  );
  check("run criada", Boolean(run.id), JSON.stringify(run).slice(0, 90));
  if (run.id) {
    const bet = await api(
      "/api/custodial/place-bet",
      { marketId: run.marketId, outcome: 0, lamports: run.stakeLamports, gameId: 0 },
      token
    );
    check("aposta assinada pelo server (wallet custodial)", bet.status === 200, bet.json.error);
    const g = await api(`/api/runs/${run.id}/guess`, { dir: "higher" }, token);
    check("palpite aceito após a aposta confirmar", g.status === 200, g.json.error);
    await checkNftOfGame("Hi-Lo", wallet, 0, before);
    // encerra a run (limite de 1 ativa por wallet) pra liberar o próximo jogo
    await api(`/api/runs/${run.id}/cashout`, {}, token);
  }

  // ---- 2) Infinite Hi-Lo ----
  console.log("\n2. Infinite Hi-Lo — mesma mecânica, escada de cash-out");
  before = await nftsOf(wallet);
  const { json: inf, status: infStatus } = await api(
    "/api/runs",
    { target: 3, stakeLamports: 1_000_000, mode: "infinite" },
    token
  );
  check("run infinite criada", infStatus === 200 && Boolean(inf.id), inf.error);
  if (inf.id) {
    const bet = await api(
      "/api/custodial/place-bet",
      { marketId: inf.marketId, outcome: 0, lamports: inf.stakeLamports, gameId: 1 },
      token
    );
    check("aposta da run infinite assinada", bet.status === 200, bet.json.error);
    await checkNftOfGame("Infinite Hi-Lo", wallet, 1, before);
    // encerra a run (1 ativa por wallet) pra não travar os jogos seguintes
    await api(`/api/runs/${inf.id}/cashout`, {}, token);
  }

  // ---- 3) Penalty Predictor (sessão apostada) ----
  console.log("\n3. Penalty Predictor — sessão de 8 pênaltis valendo SOL");
  before = await nftsOf(wallet);
  const { json: sess, status: sStatus } = await api(
    "/api/arcade/penalty/session",
    { target: 6, stakeLamports: 1_000_000 },
    token
  );
  check("sessão de penalty criada", sStatus === 200 && Boolean(sess.id), sess.error);
  if (sess.id) {
    const bet = await api(
      "/api/custodial/place-bet",
      { marketId: sess.marketId, outcome: 0, lamports: sess.stakeLamports, gameId: 2 },
      token
    );
    check("stake do penalty assinado on-chain", bet.status === 200, bet.json.error);
    const shot = await api(`/api/arcade/penalty/session/${sess.id}/shot`, {}, token);
    check("primeiro pênalti liberado após o stake", shot.status === 200, shot.json.error);
    if (shot.status === 200) {
      const ans = await api(
        `/api/arcade/penalty/session/${sess.id}/answer`,
        { choice: 0 },
        token
      );
      check("chute registrado", ans.status === 200, ans.json.error);
    }
    await checkNftOfGame("Penalty Predictor", wallet, 2, before);
  }

  // ---- 4) Survivor (pick = aposta no mercado 1X2 compartilhado) ----
  console.log("\n4. Survivor — pick vira aposta real no mercado 1X2");
  before = await nftsOf(wallet);
  const { json: sm } = await api("/api/survivor/markets");
  const open = (sm.markets ?? []).find((m: any) => m.status === "open");
  check("mercado 1X2 aberto pro pick", Boolean(open), "nenhum mercado aberto");
  if (open) {
    // gameId 3 (survivor): o mercado é do Guess the Team, mas o allowed_games
    // habilita o Survivor — o ticket tem que sair na coleção do SURVIVOR
    const bet = await api(
      "/api/custodial/place-bet",
      { marketId: open.marketId, outcome: 0, lamports: 1_000_000, gameId: 3 },
      token
    );
    check("aposta do pick assinada", bet.status === 200, bet.json.error);
    const pick = await api(
      "/api/survivor/pick",
      { marketId: open.marketId, outcome: 0, name: "e2e" },
      token
    );
    check("pick registrado na temporada", pick.status === 200, pick.json.error);
    await checkNftOfGame("Survivor", wallet, 3, before);
  }

  // ---- 4b) adversarial: não dá pra forjar a NFT de outro jogo ----
  console.log("\n4b. Tentativas de forjar a identidade da NFT");
  if (open) {
    const forged = await api(
      "/api/custodial/place-bet",
      // Penalty (2) não está no allowed_games do mercado 1X2
      { marketId: open.marketId, outcome: 0, lamports: 1_000_000, gameId: 2 },
      token
    );
    check(
      "apostar declarando jogo não habilitado no mercado → 403",
      forged.status === 403,
      `status ${forged.status}`
    );
    const bogus = await api(
      "/api/custodial/place-bet",
      { marketId: open.marketId, outcome: 0, lamports: 1_000_000, gameId: 99 },
      token
    );
    check(
      "gameId inexistente → 400 (não emite ticket sem identidade)",
      bogus.status === 400,
      `status ${bogus.status}`
    );
  }

  // ---- 5) Guess the Team (mesmo mercado, coleção diferente) ----
  console.log("\n5. Guess the Team — mesmo mercado 1X2, coleção do jogo dele");
  before = await nftsOf(wallet);
  const open2 = (sm.markets ?? []).find((m: any) => m.status === "open");
  if (open2) {
    const bet = await api(
      "/api/custodial/place-bet",
      { marketId: open2.marketId, outcome: 1, lamports: 1_000_000, gameId: 5 },
      token
    );
    check("aposta do Guess the Team assinada", bet.status === 200, bet.json.error);
    await checkNftOfGame("Guess the Team", wallet, 5, before);
  }

  // ---- 6) Guess the Stats (mercado de faixas de gols) ----
  console.log("\n6. Guess the Stats — palpite + aposta na faixa de gols");
  before = await nftsOf(wallet);
  const { json: matches } = await api("/api/stats/matches");
  const match = (matches.matches ?? []).find((m: any) => m.marketId);
  check("partida com mercado de faixas aberta", Boolean(match), "nenhuma partida com mercado");
  if (match) {
    const guess = await api("/api/stats/predict", {
      wallet,
      matchId: match.id,
      guess: { goals: 2, corners: 8, yellowCards: 3, possession: 55 },
      name: "e2e",
    });
    check("palpite de stats registrado", guess.status === 200, guess.json.error);
    const bet = await api(
      "/api/custodial/place-bet",
      { marketId: match.marketId, outcome: 1, lamports: 1_000_000, gameId: 4 },
      token
    );
    check("aposta na faixa de gols assinada", bet.status === 200, bet.json.error);
    await checkNftOfGame("Guess the Stats", wallet, 4, before);
  }

  // ---- 7) Live Challenge (grátis) + badge-NFT resgatável ----
  console.log("\n7. Live Challenge — jogo grátis + resgate do badge-NFT");
  before = await nftsOf(wallet);
  const badge0 = await api("/nft/badge/live", undefined, token);
  check("badge ainda não elegível antes de jogar", badge0.json.eligible === false);
  const denied = await api("/nft/badge/live/claim", {}, token);
  check("claim do badge bloqueado sem acerto (403)", denied.status === 403, `status ${denied.status}`);

  // joga até acertar um desafio (o resultado é sorteado no server)
  let hit = false;
  for (let i = 0; i < 12 && !hit; i++) {
    const { json: ev } = await api("/api/arcade/live/next", { wallet });
    if (!ev?.id) break;
    const { json: out } = await api(`/api/arcade/live/answer/${ev.id}`, {
      choice: i % 2,
      name: "e2e",
    });
    hit = Boolean(out?.correct);
  }
  check("acertou ao menos um desafio ao vivo", hit);
  if (hit) {
    const badge1 = await api("/nft/badge/live", undefined, token);
    check("badge vira elegível após o acerto", badge1.json.eligible === true);
    const claim = await api("/nft/badge/live/claim", {}, token);
    check("badge emitido pro jogador", claim.status === 200, claim.json.error);
    await checkNftOfGame("Live Challenge", wallet, 6, before);
    const again = await api("/nft/badge/live/claim", {}, token);
    check("badge não pode ser resgatado 2x (409)", again.status === 409, `status ${again.status}`);
  }

  // ---- carteira do jogador: tudo que ele juntou jogando ----
  console.log("\n8. Carteira do jogador");
  const { json: tk } = await api(`/api/tickets/${wallet}`);
  check("tickets do jogador listados pela API", Array.isArray(tk.tickets), JSON.stringify(tk).slice(0, 80));
  const nfts = await nftsOf(wallet);
  console.log(`  ${nfts.length} NFTs na carteira · ${tk.tickets?.length ?? 0} tickets de aposta`);
  // nome do jogo por mint da coleção — resolvido uma vez só (o RPC público da
  // devnet rate-limita se consultarmos as 7 coleções por NFT)
  const byCollection = new Map<string, string>();
  for (const g of GAMES) byCollection.set(await collectionMintOf(g.id), g.name);
  for (const mint of nfts) {
    await sleep(300); // respeita o rate limit do RPC público
    const col = await collectionOfNft(mint);
    const name = col ? byCollection.get(col) ?? "coleção desconhecida" : "sem coleção";
    console.log(`   • ${mint.slice(0, 8)}… → ${name}`);
  }

  console.log(`\nresultado: ${passed} ✅ · ${failed} ❌`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
