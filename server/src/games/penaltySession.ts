import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { userAddress, type UserRecord } from "../auth/store.js";
import { HttpError } from "../http/errors.js";
import {
  HOUSE_LOSE,
  HOUSE_WIN,
  createHouseMarket,
  houseBetArrived,
  settleHouseMarket,
} from "../chain/house.js";
import { GAME, getChain } from "../chain/client.js";
import { JsonFileStore } from "../store/jsonFile.js";
import { answerEvent, nextEvent } from "./arcade.js";

/**
 * Penalty Predictor valendo SOL (Padrão B): sessão de 8 pênaltis com meta de
 * acertos escolhida antes. O jogador assina UM place_bet (mercado house-backed
 * criado por sessão) e crava gol/defesa em cada pênalti dentro do timer; bater
 * a meta libera o claim com odds fixas. A margem da casa está nas odds
 * (p(gol)=0.76 por chute com a estratégia ótima):
 *   6/8 → p≈0.70 justo 1.42x, pagamos 1.3x · 7/8 → p≈0.39 justo 2.55x,
 *   pagamos 2.2x · 8/8 → p≈0.11 justo 9x, pagamos 7x.
 */

export const SHOTS_PER_SESSION = 8;
export const PENALTY_ODDS_BPS: Record<number, number> = {
  6: 13_000, // 1.3x
  7: 22_000, // 2.2x
  8: 70_000, // 7x
};

const BET_WINDOW_S = 180;
const WO_AFTER_S = 30 * 60; // sessão abandonada no meio = derrota

export type SessionStatus =
  | "awaiting_bet"
  | "playing"
  | "won"
  | "lost"
  | "expired"
  | "settled";

export interface SessionRecord {
  id: string;
  wallet: string;
  /** dono da sessão de auth que criou — ausente só em sessões pré-migração. */
  userId?: string;
  marketId: string;
  marketPdaB58: string;
  target: number;
  oddsBps: number;
  stakeLamports: number;
  netLamports: number;
  payoutLamports: number;
  closeTs: number;
  resolveAfterTs: number;
  status: SessionStatus;
  shots: number; // pênaltis já respondidos
  hits: number;
  /** evento arcade em aberto (aguardando resposta) */
  currentEventId?: string;
  finalOutcome?: number;
  createdAt: number;
}

interface Data {
  sessions: SessionRecord[];
}

const store = new JsonFileStore<Data>("penalty-sessions.json", () => ({ sessions: [] }));

export function sessionView(s: SessionRecord) {
  return {
    id: s.id,
    wallet: s.wallet,
    marketId: s.marketId,
    marketPda: s.marketPdaB58,
    target: s.target,
    oddsBps: s.oddsBps,
    stakeLamports: s.stakeLamports,
    payoutLamports: s.payoutLamports,
    closeTs: s.closeTs,
    status: s.status,
    shots: s.shots,
    hits: s.hits,
    totalShots: SHOTS_PER_SESSION,
  };
}

/** Garante que quem mexe na sessão é o dono. Sessões antigas sem `userId`
 *  caem no fallback por wallet — remover quando não houver mais sessão
 *  pré-migração ativa no store. */
export function assertSessionOwner(s: SessionRecord, user: UserRecord) {
  const owns = s.userId ? s.userId === user.id : s.wallet === userAddress(user);
  if (!owns) throw new HttpError(403, "essa sessão não pertence a esta conta");
}

export async function createSession(user: UserRecord, target: number, stakeLamports: number) {
  if (!getChain()) throw new HttpError(503, "on-chain desativado no server (authority ausente)");
  // wallet vem da sessão autenticada — ninguém abre sessão em nome de terceiros
  const wallet = userAddress(user);
  try {
    new PublicKey(wallet);
  } catch {
    throw new HttpError(400, "wallet inválida");
  }
  const oddsBps = PENALTY_ODDS_BPS[target];
  if (!oddsBps) {
    throw new HttpError(400, `meta inválida: escolha entre ${Object.keys(PENALTY_ODDS_BPS).join(", ")}`);
  }
  if (!Number.isInteger(stakeLamports) || stakeLamports < 1_000_000) {
    throw new HttpError(400, "stake mínimo: 1000000 lamports");
  }

  const s = store.load();
  const nowS = Math.floor(Date.now() / 1000);
  if (
    s.sessions.some(
      (x) =>
        x.wallet === wallet &&
        (x.status === "playing" || (x.status === "awaiting_bet" && nowS <= x.closeTs))
    )
  ) {
    throw new HttpError(409, "você já tem uma sessão ativa — termine-a antes de abrir outra");
  }
  // anti-drain: criar+fundear custa SOL da authority
  if (s.sessions.filter((x) => Date.now() - x.createdAt < 5 * 60 * 1000).length >= 10) {
    throw new HttpError(429, "limite de novas sessões atingido — tente em alguns minutos");
  }

  const market = await createHouseMarket(oddsBps, stakeLamports, BET_WINDOW_S, GAME.penalty);
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    wallet,
    userId: user.id,
    marketId: market.marketId,
    marketPdaB58: market.marketPdaB58,
    target,
    oddsBps,
    stakeLamports,
    netLamports: market.netLamports,
    payoutLamports: market.payoutLamports,
    closeTs: market.closeTs,
    resolveAfterTs: market.resolveAfterTs,
    status: "awaiting_bet",
    shots: 0,
    hits: 0,
    createdAt: Date.now(),
  };
  store.update((d) => d.sessions.push(session));
  console.log(
    `[penalty] sessão criada: ${wallet.slice(0, 6)}… meta ${target}/8 · stake ${stakeLamports}`
  );
  return sessionView(session);
}

export function getSession(id: string): SessionRecord | undefined {
  return store.load().sessions.find((s) => s.id === id);
}

function finishIfDecided(s: SessionRecord) {
  const remaining = SHOTS_PER_SESSION - s.shots;
  if (s.hits >= s.target) {
    s.status = "won";
    s.finalOutcome = HOUSE_WIN;
  } else if (s.hits + remaining < s.target) {
    // matematicamente impossível bater a meta: encerra já
    s.status = "lost";
    s.finalOutcome = HOUSE_LOSE;
  } else if (s.shots >= SHOTS_PER_SESSION) {
    s.status = "lost";
    s.finalOutcome = HOUSE_LOSE;
  }
}

/** Contabiliza um chute na sessão e decide won/lost quando der. */
function recordShot(s: SessionRecord, correct: boolean) {
  s.currentEventId = undefined;
  s.shots += 1;
  if (correct) s.hits += 1;
  finishIfDecided(s);
}

/** Serve o próximo pênalti da sessão (verifica o place_bet na primeira vez). */
export async function nextShot(id: string, user: UserRecord) {
  const s = getSession(id);
  if (!s) throw new HttpError(404, "sessão não encontrada");
  assertSessionOwner(s, user);
  if (s.status === "awaiting_bet") {
    if (!(await houseBetArrived(s.marketId, s.netLamports))) {
      throw new HttpError(400, "aposta ainda não confirmada on-chain — assine o place_bet primeiro");
    }
    s.status = "playing";
    store.save();
  }
  if (s.status !== "playing") throw new HttpError(409, `sessão encerrada (${s.status})`);

  // pênalti abandonado (página fechou no meio): conta como erro e segue
  if (s.currentEventId) {
    try {
      answerEvent(s.currentEventId, -1);
    } catch {
      /* evento já podado */
    }
    recordShot(s, false);
    store.save();
    if (s.status !== "playing") return { session: sessionView(s), event: null };
  }

  const event = await nextEvent("penalty", s.wallet);
  s.currentEventId = event.id;
  store.save();
  return { session: sessionView(s), event };
}

/** Resposta do pênalti em aberto (timeout do evento conta como erro). */
export function answerShot(id: string, choice: number, user: UserRecord, name?: string) {
  const s = getSession(id);
  if (!s) throw new HttpError(404, "sessão não encontrada");
  assertSessionOwner(s, user);
  if (s.status !== "playing" || !s.currentEventId) {
    throw new HttpError(409, "nenhum pênalti em aberto nessa sessão");
  }
  let result: ReturnType<typeof answerEvent>;
  try {
    result = answerEvent(s.currentEventId, choice, name);
  } catch {
    // evento já podado (ficou muito tempo sem resposta): conta como erro
    result = {
      correct: false,
      late: true,
      secret: -1,
      points: 0,
      streak: 0,
      home: "",
      away: "",
      kind: "penalty",
    };
  }
  recordShot(s, result.correct);
  store.save();
  return { ...result, session: sessionView(s) };
}

/** Cron: liquida sessões terminadas e expira as que nunca apostaram. */
export async function settlePenaltySessions() {
  if (!getChain()) return;
  const now = Math.floor(Date.now() / 1000);
  for (const s of store.load().sessions) {
    const done = s.status === "won" || s.status === "lost";
    const betWindowDead = s.status === "awaiting_bet" && now > s.resolveAfterTs + 120;
    const abandoned =
      betWindowDead || (s.status === "playing" && now > s.resolveAfterTs + WO_AFTER_S);
    if (!done && !abandoned) continue;
    if (now < s.resolveAfterTs) continue;

    if (betWindowDead && (await houseBetArrived(s.marketId, s.netLamports).catch(() => false))) {
      s.status = "playing"; // aposta chegou em cima da hora
      store.save();
      continue;
    }

    try {
      const outcome = s.finalOutcome ?? HOUSE_LOSE;
      const free = await settleHouseMarket(s.marketId, outcome);
      s.status = s.status === "awaiting_bet" ? "expired" : "settled";
      store.save();
      console.log(
        `[penalty] sessão ${s.id.slice(0, 8)} liquidada (outcome ${outcome}, ${free} lamports reciclados)`
      );
    } catch (err) {
      console.warn(
        `[penalty] falha liquidando sessão ${s.id.slice(0, 8)}: ${(err as Error).message}`
      );
    }
  }
}

export function listSessionsByWallet(wallet: string) {
  return store
    .load()
    .sessions.filter((s) => s.wallet === wallet)
    .map(sessionView);
}
