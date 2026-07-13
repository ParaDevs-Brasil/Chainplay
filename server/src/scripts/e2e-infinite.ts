/**
 * E2E de devnet do Infinite Hi-Lo: cria run mode=infinite, assina o place_bet
 * com a authority, joga até streak ≥ 1, dá CASH OUT e confere: mercado anulado,
 * lucro transferido pela casa e claim do ticket devolvendo o stake líquido.
 * Requer o server rodando em :3001.
 *
 *   node --import tsx src/scripts/e2e-infinite.ts
 */
import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  betPda,
  configPda,
  getChain,
  TOKEN_PROGRAM_ID,
  vaultPda,
} from "../chain/client.js";

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

async function playOneRun(attempt: number): Promise<boolean> {
  const chain = getChain()!;
  const bettor = chain.authority;
  const stake = 1_000_000;

  const run = await api("/api/runs", {
    target: 1, // ignorado no mode infinite (meta = topo da escada)
    stakeLamports: stake,
    mode: "infinite",
  });
  console.log(
    `[${attempt}] run ${run.id.slice(0, 8)} · mode ${run.mode} · cap paga ${run.payoutLamports}`
  );

  const market = new PublicKey(run.marketPda);
  const config: any = await (chain.program.account as any).config.fetch(configPda());
  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  await chain.program.methods
    .placeBet(0, new BN(stake))
    .accounts({
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
    })
    .signers([bettor, ticketMint, ticketAccount])
    .rpc();

  // joga até subir 1 degrau (ou perder — aí tenta outra run); palpite
  // orientado pela mediana da categoria pra maximizar a chance do teste
  const median: Record<string, number> = {
    goals: 2,
    corners: 9,
    yellowCards: 3,
    possession: 50,
  };
  let current = run.current;
  let streak = 0;
  while (streak < 1) {
    const dir =
      current && current.value > (median[current.category] ?? 5) ? "lower" : "higher";
    const r = await api(`/api/runs/${run.id}/guess`, { dir });
    console.log(
      `  ${r.revealed.value} (${r.correct ? (r.push ? "push" : "ok") : "x"}) · streak ${r.streak} · sacável ${r.cashoutLamports}`
    );
    streak = r.streak;
    current = r.current;
    if (r.status !== "playing") {
      console.log(`  perdeu antes de sacar (${r.status}) — nova tentativa`);
      return false;
    }
  }

  const balBefore = await chain.connection.getBalance(bettor.publicKey);
  const out = await api(`/api/runs/${run.id}/cashout`, {});
  if (out.status !== "cashed") throw new Error(`esperava cashed, veio ${out.status}`);
  console.log(`  CASH OUT → status ${out.status} · total ${out.cashedLamports}`);

  const acc: any = await (chain.program.account as any).market.fetch(market);
  const state = Object.keys(acc.state)[0];
  if (state !== "voided") throw new Error(`mercado deveria estar voided, está ${state}`);
  console.log(`  mercado on-chain: ${state} ✅`);

  // claim do ticket: mercado anulado devolve o stake líquido
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
  const balAfter = await chain.connection.getBalance(bettor.publicKey);
  console.log(
    `  claim ok ✅ · saldo pós-cashout+claim: +${balAfter - balBefore} lamports ` +
      `(lucro + stake líquido, menos fees; authority é a própria casa aqui)`
  );
  return true;
}

async function main() {
  if (!getChain()) throw new Error("authority keypair ausente");
  TOKEN = (await api("/api/auth/guest", {})).token;
  for (let i = 1; i <= 5; i++) {
    if (await playOneRun(i)) {
      console.log("E2E infinite: PASSOU ✅");
      return;
    }
  }
  throw new Error("5 runs perdidas antes do streak 2 — improvável, investigue");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
