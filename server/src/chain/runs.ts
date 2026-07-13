import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BN } from "@coral-xyz/anchor";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { userAddress, type UserRecord } from "../auth/store.js";
import { DATA_DIR } from "../config.js";
import { getGameData, type GameMatch } from "../games/matches.js";
import { HttpError } from "../http/errors.js";
import {
  BPS,
  configPda,
  getChain,
  marketPda,
  vaultPda,
} from "./client.js";

const STORE_PATH = path.join(DATA_DIR, "runs.json");

// Meta de streak → odds em bps (inclui o stake de volta). A margem da casa está
// embutida: as odds justas de n acertos a ~50% seriam 2^n; pagamos bem menos e a
// habilidade do jogador (e os pushes, que não quebram a run) fecham a conta.
export const RUN_ODDS_BPS: Record<number, number> = {
  3: 15_000, // 1.5x
  5: 25_000, // 2.5x
  10: 60_000, // 6x
  15: 120_000, // 12x
  20: 250_000, // 25x
};

// Infinite Hi-Lo: escada de cash-out — streak → multiplicador em bps (payout
// total, stake incluso). O mercado on-chain é criado com as odds do topo da
// escada; sacar antes do topo anula o mercado (o ticket devolve o stake via
// claim) e a casa paga o lucro da escada por transferência direta. A escada
// 100% on-chain fica pra v2 do contrato (mercado-sessão com odds por tier).
export const INFINITE_LADDER_BPS: Record<number, number> = {
  1: 12_000, // 1.2x
  2: 15_000,
  3: 20_000,
  4: 27_000,
  5: 36_000,
  6: 48_000,
  7: 65_000,
  8: 90_000,
  9: 120_000,
  10: 160_000,
  11: 210_000,
  12: 280_000, // 28x — topo: resolve on-chain com odds cheias
};
export const INFINITE_CAP_STREAK = 12;

export const MIN_STAKE_LAMPORTS = 0.001 * LAMPORTS_PER_SOL;
// Piso de segurança pro vault da casa em devnet: payout máximo por run.
export const MAX_PAYOUT_LAMPORTS = 0.3 * LAMPORTS_PER_SOL;

const BET_WINDOW_S = 180; // jogador tem 3min pra assinar o place_bet
const RUN_OUTCOME_WIN = 0;
const RUN_OUTCOME_LOSE = 1;

export type RunMode = "target" | "infinite";

export type RunCategory = "goals" | "corners" | "yellowCards" | "possession";

interface RunRound {
  home: string;
  away: string;
  category: RunCategory;
  value: number;
  goals: [number, number];
}

export type RunStatus =
  | "awaiting_bet" // mercado criado, esperando o place_bet do jogador
  | "playing"
  | "won"
  | "lost"
  | "expired" // nunca apostou dentro da janela
  | "cashed" // infinite: sacou no meio da escada (mercado anulado, stake via claim)
  | "settled"; // mercado resolvido on-chain (claim liberado se ganhou)

export interface RunRecord {
  id: string;
  wallet: string;
  /** dono da sessão que criou a run — ausente só em runs persistidas antes da
   *  migração de auth; nesse caso o fallback compara pela wallet. */
  userId?: string;
  marketId: string;
  marketPdaB58: string;
  /** ausente em runs antigas = "target" */
  mode?: RunMode;
  target: number;
  oddsBps: number;
  stakeLamports: number;
  netLamports: number;
  payoutLamports: number;
  closeTs: number;
  resolveAfterTs: number;
  status: RunStatus;
  /** resultado congelado no fim do jogo, usado na liquidação on-chain */
  finalOutcome?: number;
  /** infinite: total sacado na escada (stake devolvido via claim + lucro pago pela casa) */
  cashedLamports?: number;
  streak: number;
  index: number;
  /** sequência secreta: nunca sai inteira pro client */
  rounds: RunRound[];
  createdAt: number;
}

interface Store {
  runs: RunRecord[];
}

let store: Store | null = null;

function loadStore(): Store {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    store = { runs: [] };
  }
  return store!;
}

function saveStore() {
  if (!store) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function statValue(m: GameMatch, c: RunCategory): number {
  switch (c) {
    case "goals":
      return m.stats.goals[0] + m.stats.goals[1];
    case "corners":
      return m.stats.corners[0] + m.stats.corners[1];
    case "yellowCards":
      return m.stats.yellowCards[0] + m.stats.yellowCards[1];
    case "possession":
      return m.stats.possession?.[0] ?? 50;
  }
}

/** Sequência secreta da run: partidas embaralhadas com seed criptográfica. */
async function buildRounds(target: number): Promise<RunRound[]> {
  const data = await getGameData();
  const matches = [...data.matches];
  const canUsePossession = matches.every((m) => m.stats.possession);
  const categories: RunCategory[] = canUsePossession
    ? ["goals", "corners", "yellowCards", "possession"]
    : ["goals", "corners", "yellowCards"];

  // Fisher-Yates com bytes do crypto — o client não tem como prever a ordem.
  for (let i = matches.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [matches[i], matches[j]] = [matches[j], matches[i]];
  }

  // target acertos consomem target+1 cartas; buffer extra pra cobrir pushes.
  const need = Math.min(matches.length, target + 1 + Math.ceil(target / 2) + 3);
  return matches.slice(0, need).map((m) => {
    const category = categories[crypto.randomInt(categories.length)];
    return {
      home: m.home,
      away: m.away,
      category,
      value: statValue(m, category),
      goals: m.stats.goals,
    };
  });
}

function ladderPayout(run: RunRecord, streak: number): number {
  const bps = INFINITE_LADDER_BPS[Math.min(streak, INFINITE_CAP_STREAK)] ?? 0;
  return Math.floor((run.netLamports * bps) / BPS);
}

/** Visão pública de uma run — nunca inclui valores ainda não revelados. */
export function runView(run: RunRecord) {
  const current = run.rounds[run.index];
  const next = run.rounds[run.index + 1];
  const mode: RunMode = run.mode ?? "target";
  return {
    id: run.id,
    wallet: run.wallet,
    marketId: run.marketId,
    marketPda: run.marketPdaB58,
    mode,
    target: run.target,
    // infinite: quanto sai sacando agora e quanto vale o próximo degrau
    cashoutLamports:
      mode === "infinite" && run.streak >= 1 ? ladderPayout(run, run.streak) : 0,
    nextRungLamports: mode === "infinite" ? ladderPayout(run, run.streak + 1) : 0,
    cashedLamports: run.cashedLamports ?? 0,
    oddsBps: run.oddsBps,
    stakeLamports: run.stakeLamports,
    payoutLamports: run.payoutLamports,
    closeTs: run.closeTs,
    resolveAfterTs: run.resolveAfterTs,
    status: run.status,
    streak: run.streak,
    current: current
      ? { home: current.home, away: current.away, category: current.category, value: current.value }
      : null,
    next: next ? { home: next.home, away: next.away, category: next.category } : null,
  };
}

// Anti-drain: criar mercado + fund_house custa SOL da authority (rent não volta),
// então runs sem aposta não podem ser criadas à vontade por qualquer um.
const MAX_RUNS_PER_WINDOW = 10;
const RUN_WINDOW_MS = 5 * 60 * 1000;

/** Garante que quem chama guess/cashout/consulta é o dono da run. Runs antigas
 *  sem `userId` caem no fallback por wallet — remover o fallback quando o store
 *  não tiver mais nenhuma run pré-migração ativa. */
export function assertRunOwner(run: RunRecord, user: UserRecord) {
  const owns = run.userId
    ? run.userId === user.id
    : run.wallet === userAddress(user);
  if (!owns) throw new HttpError(403, "essa run não pertence a esta conta");
}

export async function createRun(
  user: UserRecord,
  target: number,
  stakeLamports: number,
  mode: RunMode = "target"
) {
  const chain = getChain();
  if (!chain) throw new Error("on-chain desativado no server (authority ausente)");

  // wallet vem da sessão autenticada — ninguém cria run "em nome" de terceiros
  const wallet = userAddress(user);
  try {
    new PublicKey(wallet);
  } catch {
    throw new HttpError(400, "wallet inválida");
  }
  const s = loadStore();
  // Bloqueia só runs que ainda podem andar: playing, ou awaiting_bet com a
  // janela de aposta aberta. Uma awaiting_bet com janela vencida está morta
  // (o mercado on-chain já fechou) — não pode segurar o jogador 30min.
  const nowS = Math.floor(Date.now() / 1000);
  if (
    s.runs.some(
      (r) =>
        r.wallet === wallet &&
        (r.status === "playing" ||
          (r.status === "awaiting_bet" && nowS <= r.closeTs))
    )
  ) {
    throw new HttpError(409, "você já tem uma run ativa — termine-a antes de abrir outra");
  }
  const recentRuns = s.runs.filter((r) => Date.now() - r.createdAt < RUN_WINDOW_MS);
  if (recentRuns.length >= MAX_RUNS_PER_WINDOW) {
    throw new HttpError(429, "limite de novas runs atingido — tente de novo em alguns minutos");
  }

  // infinite: a meta é o topo da escada e as odds on-chain são as do topo —
  // sacar antes disso liquida via cancel_market + pagamento da casa
  if (mode === "infinite") target = INFINITE_CAP_STREAK;
  const oddsBps =
    mode === "infinite" ? INFINITE_LADDER_BPS[INFINITE_CAP_STREAK] : RUN_ODDS_BPS[target];
  if (!oddsBps) {
    throw new Error(`meta inválida: escolha entre ${Object.keys(RUN_ODDS_BPS).join(", ")}`);
  }
  if (!Number.isInteger(stakeLamports) || stakeLamports < MIN_STAKE_LAMPORTS) {
    throw new Error(`stake mínimo: ${MIN_STAKE_LAMPORTS} lamports`);
  }

  const config: any = await (chain.program.account as any).config.fetch(configPda());
  const net = stakeLamports - Math.floor((stakeLamports * config.feeBps) / BPS);
  const payout = Math.floor((net * oddsBps) / BPS);
  if (payout > MAX_PAYOUT_LAMPORTS) {
    throw new Error(
      `stake alto demais para essa meta: payout máximo é ${MAX_PAYOUT_LAMPORTS / LAMPORTS_PER_SOL} SOL`
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const closeTs = now + BET_WINDOW_S;
  const resolveAfterTs = closeTs + 1;
  // Namespace de runs: timestamp*1000 + aleatório — nunca colide com fixtureIds.
  const marketId = new BN(Date.now()).muln(1000).addn(crypto.randomInt(1000));
  const market = marketPda(marketId);
  const vault = vaultPda(market);

  const odds = Array(8).fill(new BN(0));
  odds[RUN_OUTCOME_WIN] = new BN(oddsBps);
  odds[RUN_OUTCOME_LOSE] = new BN(BPS + 1); // exigido > 1x; ninguém aposta nele

  await chain.program.methods
    .createMarket(
      marketId,
      marketId, // fixture sintético = o próprio id da run
      { houseBacked: {} },
      2,
      odds,
      new BN(closeTs),
      new BN(resolveAfterTs)
    )
    .accounts({
      config: configPda(),
      market,
      vault,
      authority: chain.authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  // Cobre exatamente o pior caso: liability = payout, e o stake líquido do
  // jogador também entra no vault (payout - net é o que falta da casa).
  const fund = Math.max(1, payout - net);
  await chain.program.methods
    .fundHouse(new BN(fund))
    .accounts({
      config: configPda(),
      market,
      vault,
      authority: chain.authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const run: RunRecord = {
    id: crypto.randomUUID(),
    wallet,
    userId: user.id,
    marketId: marketId.toString(),
    marketPdaB58: market.toBase58(),
    mode,
    target,
    oddsBps,
    stakeLamports,
    netLamports: net,
    payoutLamports: payout,
    closeTs,
    resolveAfterTs,
    status: "awaiting_bet",
    streak: 0,
    index: 0,
    rounds: await buildRounds(target),
    createdAt: Date.now(),
  };
  loadStore().runs.push(run);
  saveStore();
  console.log(
    `[runs] run ${mode} criada: ${wallet.slice(0, 6)}… meta ${target} · stake ${stakeLamports} · market ${marketId}`
  );
  return runView(run);
}

export function getRun(id: string): RunRecord | undefined {
  return loadStore().runs.find((r) => r.id === id);
}

/** Confirma que o place_bet do jogador chegou on-chain antes de liberar o jogo. */
async function ensureBetPlaced(run: RunRecord) {
  if (run.status !== "awaiting_bet") return;
  const chain = getChain()!;
  const acc: any = await (chain.program.account as any).market.fetch(
    marketPda(new BN(run.marketId))
  );
  const pool = (acc.pools[RUN_OUTCOME_WIN] as BN).toNumber();
  if (pool < run.netLamports) {
    throw new Error("aposta ainda não confirmada on-chain — assine o place_bet primeiro");
  }
  run.status = "playing";
  saveStore();
}

export async function guessRun(id: string, dir: "higher" | "lower", user: UserRecord) {
  const run = getRun(id);
  if (!run) throw new HttpError(404, "run não encontrada");
  assertRunOwner(run, user);
  if (run.status === "awaiting_bet") await ensureBetPlaced(run);
  if (run.status !== "playing") throw new Error(`run encerrada (${run.status})`);

  const current = run.rounds[run.index];
  const next = run.rounds[run.index + 1];
  if (!next) {
    // acabaram as cartas do buffer sem bater a meta — trata como derrota honrosa
    run.status = "lost";
    run.finalOutcome = RUN_OUTCOME_LOSE;
    saveStore();
    throw new Error("run sem cartas restantes");
  }

  const push = next.value === current.value;
  const correct =
    push || (dir === "higher" ? next.value > current.value : next.value < current.value);

  if (correct && !push) run.streak += 1;
  run.index += 1;

  if (!correct) {
    run.status = "lost";
    run.finalOutcome = RUN_OUTCOME_LOSE;
  } else if (run.streak >= run.target) {
    run.status = "won";
    run.finalOutcome = RUN_OUTCOME_WIN;
  }
  saveStore();

  return {
    correct,
    push,
    revealed: { home: next.home, away: next.away, category: next.category, value: next.value, goals: next.goals },
    ...runView(run),
  };
}

/**
 * Encerra a run por decisão do jogador.
 * - target: desistência conta como derrota.
 * - infinite com streak ≥ 1: saque na escada — o mercado é anulado on-chain
 *   (o ticket devolve o stake líquido via claim) e a casa transfere o lucro
 *   `net*(m-1)` direto pra wallet. Bater o topo não passa por aqui: vira
 *   `won` no guess e liquida com as odds cheias do mercado.
 */
export async function cashoutRun(id: string, user: UserRecord) {
  const run = getRun(id);
  if (!run) throw new HttpError(404, "run não encontrada");
  assertRunOwner(run, user);
  if (run.status !== "playing" && run.status !== "awaiting_bet") {
    throw new Error(`run encerrada (${run.status})`);
  }

  const infinite = (run.mode ?? "target") === "infinite";
  if (infinite && run.status === "playing" && run.streak >= 1) {
    const chain = getChain();
    if (!chain) throw new Error("on-chain desativado no server");
    const total = ladderPayout(run, run.streak);
    const profit = total - run.netLamports;
    const market = marketPda(new BN(run.marketId));
    const vault = vaultPda(market);

    // 1) anula o mercado: o claim do ticket passa a devolver o stake líquido
    await chain.program.methods
      .cancelMarket()
      .accounts({
        config: configPda(),
        market,
        authority: chain.authority.publicKey,
      })
      .rpc();
    run.status = "cashed";
    run.cashedLamports = total;
    saveStore();

    // 2) best-effort daqui pra baixo: o stake do jogador já está garantido
    try {
      if (profit > 0) {
        await sendAndConfirmTransaction(
          chain.connection,
          new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: chain.authority.publicKey,
              toPubkey: new PublicKey(run.wallet),
              lamports: profit,
            })
          ),
          [chain.authority]
        );
      }
      // recicla a liquidez da casa que sobrou no vault (não comprometida)
      const acc: any = await (chain.program.account as any).market.fetch(market);
      const rentMin = await chain.connection.getMinimumBalanceForRentExemption(0);
      const usable = (await chain.connection.getBalance(vault)) - rentMin;
      const free = usable - (acc.outstanding as BN).toNumber();
      if (free > 0) {
        await chain.program.methods
          .withdrawHouse(new BN(free))
          .accounts({
            config: configPda(),
            market,
            vault,
            teamWallet: (
              await (chain.program.account as any).config.fetch(configPda())
            ).teamWallet,
            authority: chain.authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    } catch (err) {
      console.warn(
        `[runs] pós-cashout da run ${run.id.slice(0, 8)}: ${(err as Error).message}`
      );
    }
    console.log(
      `[runs] cashout infinite: ${run.wallet.slice(0, 6)}… streak ${run.streak} → ${total} lamports`
    );
    return runView(run);
  }

  run.status = run.streak >= run.target ? "won" : "lost";
  run.finalOutcome = run.streak >= run.target ? RUN_OUTCOME_WIN : RUN_OUTCOME_LOSE;
  saveStore();
  return runView(run);
}

/**
 * Cron: resolve on-chain as runs terminadas assim que o relógio permite e
 * recicla a liquidez livre do vault de volta pra team wallet (mesma da authority
 * em devnet — mantém o saldo girando entre runs).
 */
export async function settleRuns() {
  const chain = getChain();
  if (!chain) return;
  const s = loadStore();
  const now = Math.floor(Date.now() / 1000);

  for (const run of s.runs) {
    const done = run.status === "won" || run.status === "lost";
    // awaiting_bet: 2min de folga após o fechamento cobrem uma assinatura de
    // última hora ainda confirmando; depois disso, ou a aposta chegou (vira
    // playing) ou a run expira já — sem segurar o jogador por 30min.
    const betWindowDead =
      run.status === "awaiting_bet" && now > run.resolveAfterTs + 120;
    const abandoned =
      betWindowDead ||
      (run.status === "playing" && now > run.resolveAfterTs + 30 * 60); // W.O.
    if (!done && !abandoned) continue;
    if (now < run.resolveAfterTs) continue;

    if (betWindowDead) {
      try {
        // se o place_bet chegou on-chain, promove a playing em vez de expirar
        await ensureBetPlaced(run);
        continue;
      } catch {
        // sem aposta no vault: segue pra resolver e expirar
      }
    }

    const outcome = run.finalOutcome ?? RUN_OUTCOME_LOSE;
    const market = marketPda(new BN(run.marketId));
    try {
      await chain.program.methods
        .resolveMarket(outcome)
        .accounts({
          config: configPda(),
          market,
          authority: chain.authority.publicKey,
        })
        .rpc();

      // Devolve pro caixa o que não está comprometido com o jogador.
      const acc: any = await (chain.program.account as any).market.fetch(market);
      const vault = vaultPda(market);
      const rentMin = await chain.connection.getMinimumBalanceForRentExemption(0);
      const usable = (await chain.connection.getBalance(vault)) - rentMin;
      const free = usable - (acc.outstanding as BN).toNumber();
      if (free > 0) {
        await chain.program.methods
          .withdrawHouse(new BN(free))
          .accounts({
            config: configPda(),
            market,
            vault,
            teamWallet: (await (chain.program.account as any).config.fetch(configPda())).teamWallet,
            authority: chain.authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      run.status = run.status === "awaiting_bet" ? "expired" : "settled";
      if (abandoned && run.status !== "expired") run.finalOutcome = outcome;
      saveStore();
      console.log(
        `[runs] run ${run.id.slice(0, 8)} liquidada on-chain (outcome ${outcome}, ${free} lamports reciclados)`
      );
    } catch (err) {
      console.warn(`[runs] falha liquidando run ${run.id.slice(0, 8)}: ${(err as Error).message}`);
    }
  }
}

export function listRunsByWallet(wallet: string) {
  return loadStore()
    .runs.filter((r) => r.wallet === wallet)
    .map(runView);
}
