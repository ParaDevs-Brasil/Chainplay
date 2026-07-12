import crypto from "node:crypto";
import { addPoints, topBoard, type LeaderGame } from "./leaderboard.js";
import { getGameData } from "./matches.js";

/**
 * Motor arcade dos mercados relâmpago (Fases 4/5): Penalty Predictor e Live
 * Challenge, em modo demo simulado — mesma UX do feed real, resultado sorteado
 * no server com probabilidades realistas. Pontos por acerto ponderados pela
 * raridade + multiplicador de sequência. O spike de latência do feed ao vivo
 * (pré-requisito da versão on-chain relâmpago) segue pendente no plano.
 */

export type ArcadeGame = Extract<LeaderGame, "penalty" | "live">;

export interface ArcadeEvent {
  id: string;
  game: ArcadeGame;
  wallet: string;
  home: string;
  away: string;
  /** live: qual desafio; penalty: sempre "penalty" */
  kind: "penalty" | "nextGoal" | "corner" | "card";
  /** minuto simulado da partida, só pra ambientação */
  minute: number;
  expiresAt: number; // epoch ms
  options: [string, string]; // rótulos i18n ficam no client; aqui é a semântica
  /** índice da opção correta — nunca sai pro client antes da resposta */
  secret: 0 | 1;
  /** pontos-base por opção (inverso da probabilidade) */
  reward: [number, number];
  answered: boolean;
}

const events = new Map<string, ArcadeEvent>();
// sequência de acertos por wallet+jogo (em memória: zera no restart, ok pra demo)
const streaks = new Map<string, number>();

const PENALTY_WINDOW_MS = 8_000;
const LIVE_WINDOW_MS = 12_000;
const PENALTY_GOAL_P = 0.76; // taxa histórica de conversão de pênaltis

const LIVE_KINDS: Array<{ kind: ArcadeEvent["kind"]; yesP: number }> = [
  { kind: "nextGoal", yesP: 0.55 }, // sai gol nos próximos 10min?
  { kind: "corner", yesP: 0.62 }, // escanteio nos próximos 5min?
  { kind: "card", yesP: 0.42 }, // cartão nos próximos 10min?
];

function rewardFor(p: number): number {
  return Math.round(10 / p);
}

function prune() {
  const now = Date.now();
  for (const [id, ev] of events) {
    if (ev.answered || now > ev.expiresAt + 60_000) events.delete(id);
  }
}

function publicView(ev: ArcadeEvent) {
  return {
    id: ev.id,
    game: ev.game,
    home: ev.home,
    away: ev.away,
    kind: ev.kind,
    minute: ev.minute,
    expiresAt: ev.expiresAt,
    secondsToAnswer: Math.max(0, (ev.expiresAt - Date.now()) / 1000),
    reward: ev.reward,
    streak: streaks.get(`${ev.game}:${ev.wallet}`) ?? 0,
  };
}

export async function nextEvent(game: ArcadeGame, wallet: string) {
  if (!wallet) throw new Error("wallet obrigatória");
  prune();
  const matches = (await getGameData()).matches;
  const m = matches[crypto.randomInt(matches.length)];

  let ev: ArcadeEvent;
  if (game === "penalty") {
    const secret = crypto.randomInt(100) < PENALTY_GOAL_P * 100 ? 0 : 1;
    ev = {
      id: crypto.randomUUID(),
      game,
      wallet,
      home: m.home,
      away: m.away,
      kind: "penalty",
      minute: 1 + crypto.randomInt(90),
      expiresAt: Date.now() + PENALTY_WINDOW_MS,
      options: ["goal", "save"],
      secret,
      reward: [rewardFor(PENALTY_GOAL_P), rewardFor(1 - PENALTY_GOAL_P)],
      answered: false,
    };
  } else {
    const { kind, yesP } = LIVE_KINDS[crypto.randomInt(LIVE_KINDS.length)];
    const secret = crypto.randomInt(100) < yesP * 100 ? 0 : 1;
    ev = {
      id: crypto.randomUUID(),
      game,
      wallet,
      home: m.home,
      away: m.away,
      kind,
      minute: 1 + crypto.randomInt(85),
      expiresAt: Date.now() + LIVE_WINDOW_MS,
      options: ["yes", "no"],
      secret,
      reward: [rewardFor(yesP), rewardFor(1 - yesP)],
      answered: false,
    };
  }
  events.set(ev.id, ev);
  return publicView(ev);
}

export function answerEvent(id: string, choice: number, name?: string) {
  const ev = events.get(id);
  if (!ev || ev.answered) throw new Error("evento não encontrado (ou já respondido)");
  ev.answered = true;

  const key = `${ev.game}:${ev.wallet}`;
  const late = Date.now() > ev.expiresAt;
  const correct = !late && (choice === 0 || choice === 1) && choice === ev.secret;

  let points = 0;
  let streak = streaks.get(key) ?? 0;
  if (correct) {
    streak += 1;
    // multiplicador de sequência: +25% por acerto seguido
    points = Math.round(ev.reward[choice] * (1 + 0.25 * (streak - 1)));
    addPoints(ev.game, ev.wallet, points, name);
  } else {
    streak = 0;
  }
  streaks.set(key, streak);

  return {
    correct,
    late,
    secret: ev.secret as number,
    points,
    streak,
    home: ev.home,
    away: ev.away,
    kind: ev.kind,
  };
}

export function arcadeLeaderboard(game: ArcadeGame, limit = 20) {
  return topBoard(game, limit);
}
