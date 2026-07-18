/**
 * E2E de devnet: cria uma run apostada via API, assina o place_bet com a
 * authority (fazendo as vezes do jogador), joga até ganhar/perder, espera a
 * liquidação do cron e tenta o claim. Requer o server rodando em :3001.
 *
 *   npm run e2e:run
 */
// bn.js direto: o dist CJS do anchor não expõe BN como named export em Node ESM
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  GAME_NONE,
  betPda,
  collectionAccounts,
  configPda,
  getChain,
  TOKEN_PROGRAM_ID,
  vaultPda,
} from "../chain/client.js";

/** Jogo declarado na aposta: o principal do mercado, degradando pra GAME_NONE
 *  quando a coleção ainda não existe (collectionAccounts vazio). */
function effectiveGame(marketAcc: any, collection: Record<string, unknown>): number {
  return collection.gameCollection != null ? marketAcc.gameId : GAME_NONE;
}

const API = process.env.API_URL || "http://localhost:3001";

// rotas de runs agora exigem sessão — o E2E entra como convidado
let TOKEN = "";

async function api(path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error ?? res.status}`);
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chain = getChain();
  if (!chain) throw new Error("authority keypair ausente");
  const bettor = chain.authority; // em devnet a authority banca o teste
  console.log(`bettor: ${bettor.publicKey.toBase58()}`);
  const startBalance = await chain.connection.getBalance(bettor.publicKey);

  // 0. sessão de convidado (a wallet da run é a da sessão; o place_bet
  //    on-chain pode ser assinado por qualquer wallet — aqui, a authority)
  const guest = await api("/api/auth/guest", {});
  TOKEN = guest.token;
  console.log(`sessão convidado: ${guest.address}`);

  // 1. cria a run
  const run = await api("/api/runs", {
    target: 3,
    stakeLamports: 1_000_000,
  });
  console.log(`run ${run.id} · market ${run.marketId} · payout ${run.payoutLamports}`);

  // 2. place_bet no outcome 0 (bater a meta)
  const market = new PublicKey(run.marketPda);
  const [config, marketAcc] = await Promise.all([
    (chain.program.account as any).config.fetch(configPda()),
    (chain.program.account as any).market.fetch(market),
  ]);
  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  const collection = await collectionAccounts(chain.program, marketAcc.gameId, ticketMint.publicKey);
  await chain.program.methods
    .placeBet(0, new BN(run.stakeLamports), effectiveGame(marketAcc, collection))
    .accountsPartial({
      config: configPda(),
      market,
      vault: vaultPda(market),
      teamWallet: config.teamWallet,
      bet: betPda(market, ticketMint.publicKey),
      ticketMint: ticketMint.publicKey,
      ticketAccount: ticketAccount.publicKey,
      bettor: bettor.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      ...collection,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .signers([bettor, ticketMint, ticketAccount])
    .rpc();
  console.log(`place_bet ok · ticket ${ticketMint.publicKey.toBase58()}`);

  // 3. joga: sempre chuta "higher" (o resultado não importa pro E2E)
  let state = run;
  while (true) {
    const r = await api(`/api/runs/${run.id}/guess`, { dir: "higher" });
    console.log(
      `  ${r.revealed.home} × ${r.revealed.away} → ${r.revealed.value} ` +
        `(${r.correct ? (r.push ? "push" : "acertou") : "errou"}) · streak ${r.streak}`
    );
    state = r;
    if (r.status !== "playing") break;
  }
  console.log(`run terminou: ${state.status}`);

  // 4. espera o cron liquidar on-chain
  process.stdout.write("aguardando liquidação");
  for (let i = 0; i < 40; i++) {
    await sleep(10_000);
    const s = await api(`/api/runs/${run.id}`);
    process.stdout.write(".");
    if (s.status === "settled" || s.status === "expired") {
      console.log(` ${s.status}`);
      break;
    }
    if (i === 39) throw new Error("timeout esperando liquidação");
  }

  // 5. tickets + claim
  const { tickets } = await api(`/api/tickets/${bettor.publicKey.toBase58()}`);
  const ticket = tickets.find((t: any) => t.ticketMint === ticketMint.publicKey.toBase58());
  console.log(`ticket status: ${ticket?.status} · payout ${ticket?.payout}`);

  if (ticket?.status === "claimable") {
    await chain.program.methods
      .claim()
      .accounts({
        market,
        vault: vaultPda(market),
        bet: betPda(market, ticketMint.publicKey),
        ticketMint: ticketMint.publicKey,
        ticketAccount: ticketAccount.publicKey,
        claimer: bettor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bettor])
      .rpc();
    console.log("claim ok ✅");
  }

  const endBalance = await chain.connection.getBalance(bettor.publicKey);
  console.log(
    `balanço: ${startBalance} → ${endBalance} (${(endBalance - startBalance) / 1e9} SOL)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
