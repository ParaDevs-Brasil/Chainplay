import crypto from "node:crypto";
// bn.js direto: o dist CJS do anchor não expõe BN como named export em Node ESM
import BN from "bn.js";
import { SystemProgram } from "@solana/web3.js";
import { GAME, configPda, gameIdOrNone,
  marketGames, getChain, marketPda, vaultPda } from "../chain/client.js";
import { JsonFileStore } from "../store/jsonFile.js";
import { HttpError } from "../http/errors.js";
import { addPoints } from "./leaderboard.js";
import { getGameData } from "./matches.js";

/**
 * Guess the Stats (Fase 2): duas camadas por partida —
 *  - pontos por proximidade (grátis, alimenta o leaderboard);
 *  - aposta parimutuel on-chain nas FAIXAS de gols totais (0–1 / 2–3 / 4+),
 *    resolvida com o mesmo resultado secreto do server. A casa lucra a taxa
 *    de 10% de cada place_bet (vai pra team wallet direto no contrato).
 *
 * Motor de rodadas: mantém N partidas "prevísiveis" abertas de cada vez,
 * sorteadas do dataset (TxLINE ou mock) com estatísticas finais SECRETAS no
 * server. O lock é curto (estilo demo dos mercados 1X2) pra sessão ser jogável
 * na hora; com o feed ao vivo validado, o mesmo motor recebe kickoffs reais.
 */

/** faixa de gols totais → outcome do mercado parimutuel */
export function goalBucket(totalGoals: number): number {
  return totalGoals <= 1 ? 0 : totalGoals <= 3 ? 1 : 2;
}

export interface StatGuess {
  goals: number;
  corners: number;
  yellowCards: number;
  possession: number; // % do mandante
}

interface PredictMatch {
  id: string;
  home: string;
  away: string;
  stage?: string;
  locksAt: number; // epoch s — depois disso não aceita palpite
  revealsAt: number; // epoch s — quando o resultado sai e os pontos são dados
  /** números finais — nunca saem pro client antes do reveal */
  secret: StatGuess;
  settled: boolean;
  /** mercado parimutuel de faixas de gols (ausente com a chain desativada) */
  marketId?: string;
  marketPda?: string;
  marketSettled?: boolean;
}

export interface PredictionRecord {
  id: string;
  wallet: string;
  name?: string;
  matchId: string;
  guess: StatGuess;
  createdAt: number;
  /** preenchidos na liquidação */
  score?: number;
  breakdown?: Partial<Record<keyof StatGuess, number>>;
  actual?: StatGuess;
}

interface Data {
  matches: PredictMatch[];
  predictions: PredictionRecord[];
}

const store = new JsonFileStore<Data>("stat-predictions.json", () => ({
  matches: [],
  predictions: [],
}));

const OPEN_TARGET = 3; // partidas abertas simultaneamente
const LOCK_MIN = [3, 6, 9]; // minutos até o lock de cada uma
const REVEAL_AFTER_LOCK_S = 45; // "partida relâmpago": revela logo após o lock

// Pontuação por proximidade (máx 100): stats mais difíceis valem mais.
function scoreStat(stat: keyof StatGuess, guess: number, actual: number): number {
  const d = Math.abs(guess - actual);
  switch (stat) {
    case "goals":
      return Math.max(0, 30 - 10 * d);
    case "corners":
      return Math.max(0, 25 - 5 * d);
    case "yellowCards":
      return Math.max(0, 20 - 6 * d);
    case "possession":
      return Math.max(0, 25 - d);
  }
}

/** Mercado parimutuel de 3 faixas de gols pra partida — melhor esforço:
 *  sem chain (ou RPC fora) a partida segue jogável só na camada de pontos. */
async function createBucketMarket(
  closeTs: number,
  resolveAfterTs: number
): Promise<{ marketId: string; marketPda: string } | null> {
  const chain = getChain();
  if (!chain) return null;
  try {
    const marketId = new BN(Date.now()).muln(1000).addn(crypto.randomInt(1000));
    const market = marketPda(marketId);
    const games = await marketGames(chain.program, GAME.stats);
    await chain.program.methods
      .createMarket(
        marketId,
        marketId,
        { parimutuel: {} },
        3,
        Array(8).fill(new BN(0)),
        new BN(closeTs),
        new BN(resolveAfterTs),
        games.gameId,
        games.allowedGames
      )
      .accounts({
        config: configPda(),
        market,
        vault: vaultPda(market),
        authority: chain.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { marketId: marketId.toString(), marketPda: market.toBase58() };
  } catch (err) {
    console.warn(`[stats] falha criando mercado de faixas: ${(err as Error).message}`);
    return null;
  }
}

async function refillMatches(data: Data) {
  const open = data.matches.filter((m) => !m.settled);
  if (open.length >= OPEN_TARGET) return;
  const pool = (await getGameData()).matches;
  const now = Math.floor(Date.now() / 1000);
  for (let i = open.length; i < OPEN_TARGET; i++) {
    const pick = pool[crypto.randomInt(pool.length)];
    const locksAt = now + LOCK_MIN[i % LOCK_MIN.length] * 60;
    const revealsAt = locksAt + REVEAL_AFTER_LOCK_S;
    const market = await createBucketMarket(locksAt, revealsAt);
    data.matches.push({
      id: crypto.randomUUID(),
      home: pick.home,
      away: pick.away,
      stage: pick.stage,
      locksAt,
      revealsAt,
      secret: {
        goals: pick.stats.goals[0] + pick.stats.goals[1],
        corners: pick.stats.corners[0] + pick.stats.corners[1],
        yellowCards: pick.stats.yellowCards[0] + pick.stats.yellowCards[1],
        possession: pick.stats.possession?.[0] ?? 50,
      },
      settled: false,
      ...(market ?? {}),
    });
  }
}

async function settleDue(data: Data) {
  const now = Math.floor(Date.now() / 1000);
  for (const match of data.matches.filter((m) => !m.settled && now >= m.revealsAt)) {
    match.settled = true;
    // resolve o mercado de faixas com o mesmo resultado secreto (parimutuel
    // sem vencedores vira Voided no contrato: todo mundo recupera o stake)
    if (match.marketId && !match.marketSettled) {
      const chain = getChain();
      if (chain) {
        try {
          await chain.program.methods
            .resolveMarket(goalBucket(match.secret.goals))
            .accounts({
              config: configPda(),
              market: marketPda(new BN(match.marketId)),
              authority: chain.authority.publicKey,
            })
            .rpc();
          match.marketSettled = true;
        } catch (err) {
          console.warn(
            `[stats] falha resolvendo mercado ${match.marketId}: ${(err as Error).message}`
          );
        }
      }
    }
    for (const p of data.predictions.filter(
      (pr) => pr.matchId === match.id && pr.score == null
    )) {
      const breakdown = {
        goals: scoreStat("goals", p.guess.goals, match.secret.goals),
        corners: scoreStat("corners", p.guess.corners, match.secret.corners),
        yellowCards: scoreStat(
          "yellowCards",
          p.guess.yellowCards,
          match.secret.yellowCards
        ),
        possession: scoreStat("possession", p.guess.possession, match.secret.possession),
      };
      p.breakdown = breakdown;
      p.score = Object.values(breakdown).reduce((a, b) => a + b, 0);
      p.actual = match.secret;
      addPoints("stats", p.wallet, p.score, p.name);
    }
  }
  // poda o histórico: guarda só as 50 partidas mais recentes
  if (data.matches.length > 50) {
    const keep = new Set(data.matches.slice(-50).map((m) => m.id));
    data.matches = data.matches.filter((m) => keep.has(m.id));
    data.predictions = data.predictions.filter(
      (p) => keep.has(p.matchId) || p.score == null
    );
  }
}

/** Cron/lazy: liquida o que venceu e mantém a fila de partidas cheia. */
export async function syncStatsGame() {
  const data = store.load();
  await settleDue(data);
  await refillMatches(data);
  store.save();
}

export async function listPredictable() {
  await syncStatsGame();
  const now = Math.floor(Date.now() / 1000);
  const open = store
    .load()
    .matches.filter((m) => !m.settled && m.locksAt > now)
    .sort((a, b) => a.locksAt - b.locksAt);

  // pools dos mercados de faixa (consenso da comunidade por faixa)
  const chain = getChain();
  const withMarket = open.filter((m) => m.marketId);
  const pools = new Map<string, number[]>();
  if (chain && withMarket.length) {
    try {
      const accs: any[] = await (chain.program.account as any).market.fetchMultiple(
        withMarket.map((m) => marketPda(new BN(m.marketId!)))
      );
      withMarket.forEach((m, i) => {
        if (accs[i]) {
          pools.set(m.id, accs[i].pools.slice(0, 3).map((p: BN) => p.toNumber()));
        }
      });
    } catch {
      /* RPC fora: segue sem pools */
    }
  }

  return open.map((m) => {
    const p = pools.get(m.id) ?? [0, 0, 0];
    const total = p.reduce((a, b) => a + b, 0);
    return {
      id: m.id,
      home: m.home,
      away: m.away,
      stage: m.stage,
      locksAt: m.locksAt,
      secondsToLock: Math.max(0, m.locksAt - now),
      marketId: m.marketId ?? null,
      pools: p,
      totalPool: total,
      poolPct: p.map((x) => (total ? Math.round((x / total) * 100) : 0)),
    };
  });
}

function validGuess(g: unknown): g is StatGuess {
  const v = g as StatGuess;
  return (
    v != null &&
    Number.isInteger(v.goals) && v.goals >= 0 && v.goals <= 15 &&
    Number.isInteger(v.corners) && v.corners >= 0 && v.corners <= 30 &&
    Number.isInteger(v.yellowCards) && v.yellowCards >= 0 && v.yellowCards <= 15 &&
    Number.isInteger(v.possession) && v.possession >= 20 && v.possession <= 80
  );
}

export async function submitPrediction(
  wallet: string,
  matchId: string,
  guess: unknown,
  name?: string
) {
  await syncStatsGame();
  if (!wallet || typeof wallet !== "string") throw new HttpError(400, "wallet obrigatória");
  if (!validGuess(guess)) throw new HttpError(400, "palpite fora dos limites");
  const data = store.load();
  const match = data.matches.find((m) => m.id === matchId);
  const now = Math.floor(Date.now() / 1000);
  if (!match || match.settled) throw new HttpError(404, "partida não encontrada");
  if (now >= match.locksAt) throw new HttpError(409, "palpites encerrados para essa partida");
  if (data.predictions.some((p) => p.matchId === matchId && p.wallet === wallet)) {
    throw new HttpError(409, "você já palpitou nessa partida");
  }
  const record: PredictionRecord = {
    id: crypto.randomUUID(),
    wallet,
    name: name ? String(name).slice(0, 24) : name, // cap: nome vem do body
    matchId,
    guess,
    createdAt: Date.now(),
  };
  data.predictions.push(record);
  store.save();
  return { id: record.id, revealsAt: match.revealsAt };
}

/** Palpites do jogador, com raio-X (palpite × real) nos já liquidados. */
export async function listPredictionsByWallet(wallet: string) {
  await syncStatsGame();
  const data = store.load();
  return data.predictions
    .filter((p) => p.wallet === wallet)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((p) => {
      const match = data.matches.find((m) => m.id === p.matchId);
      return {
        id: p.id,
        home: match?.home ?? "?",
        away: match?.away ?? "?",
        guess: p.guess,
        score: p.score ?? null,
        breakdown: p.breakdown ?? null,
        actual: p.actual ?? null,
        revealsAt: match?.revealsAt ?? 0,
      };
    });
}
