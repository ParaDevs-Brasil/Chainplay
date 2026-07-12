/**
 * E2E de devnet da sessão apostada do Penalty: cria sessão (meta 6/8), assina
 * o place_bet com a authority, chuta sempre GOL nos 8 pênaltis e valida a
 * liquidação on-chain + claim quando bate a meta. Requer o server em :3001.
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

async function api(path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error ?? res.status}`);
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function playSession(attempt: number): Promise<boolean> {
  const chain = getChain()!;
  const bettor = chain.authority;

  const session = await api("/api/arcade/penalty/session", {
    wallet: bettor.publicKey.toBase58(),
    target: 6,
    stakeLamports: 1_000_000,
  });
  console.log(
    `[${attempt}] sessão ${session.id.slice(0, 8)} · meta ${session.target}/8 · paga ${session.payoutLamports}`
  );

  const market = new PublicKey(session.marketPda);
  const config: any = await (chain.program.account as any).config.fetch(configPda());
  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  await chain.program.methods
    .placeBet(0, new BN(session.stakeLamports))
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
  console.log("  place_bet ok");

  let status = "playing";
  while (status === "playing") {
    const shot = await api(`/api/arcade/penalty/session/${session.id}/shot`, {});
    if (!shot.event) {
      status = shot.session.status;
      break;
    }
    const r = await api(`/api/arcade/penalty/session/${session.id}/answer`, {
      choice: 0, // sempre GOL (estratégia ótima, p≈0.76)
    });
    console.log(
      `  chute ${r.session.shots}/8: ${r.correct ? "acertou" : "errou"} · hits ${r.session.hits}`
    );
    status = r.session.status;
  }
  console.log(`  sessão terminou: ${status}`);
  if (status !== "won") return false;

  process.stdout.write("  aguardando liquidação");
  for (let i = 0; i < 40; i++) {
    await sleep(5_000);
    const s = await api(`/api/arcade/penalty/session/${session.id}`);
    process.stdout.write(".");
    if (s.status === "settled") break;
    if (i === 39) throw new Error("timeout esperando liquidação");
  }
  console.log(" settled");

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
  console.log(`  claim ok ✅ (${session.payoutLamports} lamports)`);
  return true;
}

async function main() {
  if (!getChain()) throw new Error("authority keypair ausente");
  for (let i = 1; i <= 4; i++) {
    if (await playSession(i)) {
      console.log("E2E penalty session: PASSOU ✅");
      return;
    }
  }
  throw new Error("4 sessões perdidas com p≈0.70 cada — improvável, investigue");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
