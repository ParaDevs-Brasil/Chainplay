/**
 * Suíte E2E do ChainPlay contra a devnet real. Requer o server em :3001.
 *
 *   npm run e2e:full
 *
 * Cobre:
 *  A. validações e abusos da API (sem custo on-chain)
 *  B. segurança: a API não pode vazar a sequência secreta das runs
 *  C. run vencedora de ponta a ponta: place_bet → 3 acertos → settle → claim
 *     (o teste lê o segredo em .data/runs.json — só é possível de dentro do server)
 *  D. aposta parimutuel em mercado 1X2 aberto: pools/percentuais refletem on-chain
 */
import fs from "node:fs";
import path from "node:path";
import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { DATA_DIR } from "../config.js";
import {
  betPda,
  configPda,
  getChain,
  TOKEN_PROGRAM_ID,
  vaultPda,
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

async function api(
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function placeBetOnchain(
  marketPdaB58: string,
  outcome: number,
  lamports: number
): Promise<{ ticketMint: Keypair; ticketAccount: Keypair }> {
  const chain = getChain()!;
  const market = new PublicKey(marketPdaB58);
  const config: any = await (chain.program.account as any).config.fetch(configPda());
  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  await chain.program.methods
    .placeBet(outcome, new BN(lamports))
    .accounts({
      config: configPda(),
      market,
      vault: vaultPda(market),
      teamWallet: config.teamWallet,
      bet: betPda(market, ticketMint.publicKey),
      ticketMint: ticketMint.publicKey,
      ticketAccount: ticketAccount.publicKey,
      bettor: chain.authority.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([chain.authority, ticketMint, ticketAccount])
    .rpc();
  return { ticketMint, ticketAccount };
}

/** lê a sequência secreta da run direto do disco do server (vantagem de teste local) */
function secretRounds(runId: string): Array<{ value: number }> {
  const store = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "runs.json"), "utf8"));
  const run = store.runs.find((r: any) => r.id === runId);
  if (!run) throw new Error("run não encontrada no disco");
  return run.rounds;
}

async function main() {
  const chain = getChain();
  if (!chain) throw new Error("authority keypair ausente");
  const me = chain.authority.publicKey.toBase58();

  // as rotas de runs exigem sessão: uma "vítima" (dona da run) e um "atacante"
  const victim = (await api("/api/auth/guest", {})).json;
  const attacker = (await api("/api/auth/guest", {})).json;
  const TOKEN: string = victim.token;
  if (!TOKEN || !attacker.token) throw new Error("login de convidado falhou");

  // -------------------------------------------------------------------------
  console.log("\nA. validações e abusos da API");
  // -------------------------------------------------------------------------
  {
    let r = await api("/api/runs", { target: 3, stakeLamports: 1_000_000 });
    check("run sem sessão → 401", r.status === 401);

    r = await api("/api/runs", { target: 4, stakeLamports: 1_000_000 }, TOKEN);
    check("meta inválida (4) → 400", r.status === 400);

    r = await api("/api/runs", { target: 3, stakeLamports: 10 }, TOKEN);
    check("stake abaixo do mínimo → 400", r.status === 400);

    r = await api("/api/runs", { target: 20, stakeLamports: 500_000_000 }, TOKEN);
    check("payout acima do teto da casa → 400", r.status === 400);

    r = await api("/api/runs", { target: 3, stakeLamports: 1_000_000.5 }, TOKEN);
    check("stake não-inteiro → 400", r.status === 400);

    r = await api("/api/runs/nao-existe/guess", { dir: "higher" }, TOKEN);
    check("guess em run inexistente → 404", r.status === 404);

    r = await api("/api/runs/nao-existe", undefined, TOKEN);
    check("GET run inexistente → 404", r.status === 404);
  }

  // -------------------------------------------------------------------------
  console.log("\nB. segurança: sem vazamento da sequência secreta + sem IDOR");
  // -------------------------------------------------------------------------
  const run = (
    await api("/api/runs", { target: 3, stakeLamports: 1_000_000 }, TOKEN)
  ).json;
  {
    const body = JSON.stringify(run);
    check("createRun não expõe 'rounds'", !body.includes('"rounds"'));
    check(
      "próxima carta não expõe o valor",
      run.next && run.next.value === undefined,
      JSON.stringify(run.next)
    );

    const view = (await api(`/api/runs/${run.id}`, undefined, TOKEN)).json;
    check(
      "GET /runs/:id não expõe 'rounds' nem valor futuro",
      !JSON.stringify(view).includes('"rounds"') && view.next?.value === undefined
    );

    const g = await api(`/api/runs/${run.id}/guess`, { dir: "sideways" }, TOKEN);
    check("dir inválida → 400", g.status === 400);

    const g2 = await api(`/api/runs/${run.id}/guess`, { dir: "higher" }, TOKEN);
    check(
      "guess sem aposta on-chain → bloqueado",
      g2.status === 400 && /não confirmada/.test(g2.json.error ?? "")
    );

    // regressão dos achados #5/#6 (IDOR): terceiro autenticado não lê nem joga
    let r = await api(`/api/runs/wallet/${victim.address}`);
    check("listar runs de outra wallet sem sessão → 401", r.status === 401);

    r = await api(`/api/runs/wallet/${victim.address}`, undefined, attacker.token);
    check("listar runs de outra wallet → 403", r.status === 403);

    r = await api(`/api/runs/${run.id}`, undefined, attacker.token);
    check("GET run de outra conta → 403", r.status === 403);

    r = await api(`/api/runs/${run.id}/guess`, { dir: "higher" }, attacker.token);
    check("guess na run de outra conta → 403", r.status === 403);

    r = await api(`/api/runs/${run.id}/cashout`, {}, attacker.token);
    check("cashout na run de outra conta → 403", r.status === 403);
  }

  // -------------------------------------------------------------------------
  console.log("\nC. run vencedora: place_bet → acertos → settle → claim");
  // -------------------------------------------------------------------------
  {
    const { ticketMint, ticketAccount } = await placeBetOnchain(
      run.marketPda,
      0,
      run.stakeLamports
    );
    console.log(`  place_bet ok · ticket ${ticketMint.publicKey.toBase58().slice(0, 8)}…`);

    // joga com gabarito: o teste conhece a sequência secreta (roda na mesma máquina)
    const rounds = secretRounds(run.id);
    let state: any = run;
    let idx = 0;
    while (state.status === "playing" || state.status === "awaiting_bet") {
      const dir =
        rounds[idx + 1].value >= rounds[idx].value ? "higher" : "lower";
      const r = await api(`/api/runs/${run.id}/guess`, { dir }, TOKEN);
      if (r.status !== 200) throw new Error(`guess falhou: ${r.json.error}`);
      state = r.json;
      check(
        `rodada ${idx + 1}: acerto contabilizado`,
        r.json.correct === true,
        `value ${r.json.revealed?.value}`
      );
      idx++;
    }
    check("run terminou vencedora", state.status === "won", state.status);

    const after = await api(`/api/runs/${run.id}/guess`, { dir: "higher" }, TOKEN);
    check("guess após o fim → bloqueado", after.status === 400);

    // espera o cron liquidar on-chain
    process.stdout.write("  aguardando liquidação");
    let settled = false;
    for (let i = 0; i < 40; i++) {
      await sleep(10_000);
      const s = (await api(`/api/runs/${run.id}`, undefined, TOKEN)).json;
      process.stdout.write(".");
      if (s.status === "settled") {
        settled = true;
        break;
      }
    }
    console.log("");
    check("run liquidada on-chain pelo cron", settled);

    const { json: tj } = await api(`/api/tickets/${me}`);
    const ticket = tj.tickets?.find(
      (t: any) => t.ticketMint === ticketMint.publicKey.toBase58()
    );
    check("ticket aparece como claimable", ticket?.status === "claimable");
    check(
      "payout do ticket = payout prometido",
      ticket?.payout === run.payoutLamports,
      `${ticket?.payout} vs ${run.payoutLamports}`
    );

    // claim + saldo
    const balBefore = await chain.connection.getBalance(chain.authority.publicKey);
    await chain.program.methods
      .claim()
      .accounts({
        market: new PublicKey(run.marketPda),
        vault: vaultPda(new PublicKey(run.marketPda)),
        bet: betPda(new PublicKey(run.marketPda), ticketMint.publicKey),
        ticketMint: ticketMint.publicKey,
        ticketAccount: ticketAccount.publicKey,
        claimer: chain.authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([chain.authority])
      .rpc();
    const balAfter = await chain.connection.getBalance(chain.authority.publicKey);
    check(
      "claim pagou o prêmio",
      balAfter - balBefore > run.payoutLamports - 100_000,
      `Δ ${balAfter - balBefore}`
    );

    // dupla tentativa deve falhar (ticket queimado)
    let doubleClaimBlocked = false;
    try {
      await chain.program.methods
        .claim()
        .accounts({
          market: new PublicKey(run.marketPda),
          vault: vaultPda(new PublicKey(run.marketPda)),
          bet: betPda(new PublicKey(run.marketPda), ticketMint.publicKey),
          ticketMint: ticketMint.publicKey,
          ticketAccount: ticketAccount.publicKey,
          claimer: chain.authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([chain.authority])
        .rpc();
    } catch {
      doubleClaimBlocked = true;
    }
    check("segundo claim → bloqueado (ticket queimado)", doubleClaimBlocked);
  }

  // -------------------------------------------------------------------------
  console.log("\nD. mercado parimutuel: pools refletem a aposta");
  // -------------------------------------------------------------------------
  {
    const { json } = await api("/api/markets");
    const open = json.markets?.find(
      (m: any) => m.status === "open" && m.secondsToClose > 60
    );
    if (!open) {
      check("mercado 1X2 aberto disponível", false, "nenhum mercado aberto");
    } else {
      const stake = 2_000_000;
      await placeBetOnchain(open.pda, 0, stake);
      const { json: after } = await api("/api/markets");
      const m = after.markets.find((x: any) => x.marketId === open.marketId);
      const expectedNet = open.pools[0] + Math.floor(stake * 0.9);
      check(
        "pool do outcome refletiu o stake líquido",
        m.pools[0] === expectedNet,
        `${m.pools[0]} vs ${expectedNet}`
      );
      check("totalPool consistente", m.totalPool === m.pools.reduce((a: number, b: number) => a + b, 0));
      check(
        "percentuais somam ~100",
        Math.abs(m.poolPct.reduce((a: number, b: number) => a + b, 0) - 100) <= 2,
        String(m.poolPct)
      );
    }
  }

  console.log(`\nresultado: ${passed} ✅ · ${failed} ❌`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
