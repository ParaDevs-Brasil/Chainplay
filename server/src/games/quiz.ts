import crypto from "node:crypto";
import { addPoints } from "./leaderboard.js";
import { getGameData, type GameMatch } from "./matches.js";
import { HttpError } from "../http/errors.js";

/**
 * Guess the Team (Fase 5): quiz de 5 rodadas — o server mostra o raio-X
 * estatístico de uma seleção numa partida da Copa e 4 opções; o jogador
 * descobre quem jogou. Resposta certa fica só no server (mesma regra de ouro
 * anti-fraude das runs). Pontos: 20 por acerto + bônus de sequência.
 */

const ROUNDS = 5;
const ROUND_WINDOW_MS = 25_000;

interface QuizRound {
  /** time correto e adversário (escondidos até a resposta) */
  answer: string;
  opponent: string;
  options: string[];
  clues: {
    stage?: string;
    goalsFor: number;
    goalsAgainst: number;
    corners: number;
    yellowCards: number;
    possession: number;
  };
}

interface QuizSession {
  id: string;
  wallet: string;
  name?: string;
  rounds: QuizRound[];
  index: number;
  score: number;
  streak: number;
  roundExpiresAt: number;
  finished: boolean;
  createdAt: number;
}

const sessions = new Map<string, QuizSession>();

function buildRound(matches: GameMatch[], usedTeams: Set<string>): QuizRound {
  let m: GameMatch;
  let isHome: boolean;
  let answer: string;
  do {
    m = matches[crypto.randomInt(matches.length)];
    isHome = crypto.randomInt(2) === 0;
    answer = isHome ? m.home : m.away;
  } while (usedTeams.has(answer));
  usedTeams.add(answer);

  const side = isHome ? 0 : 1;
  const other = 1 - side;
  const allTeams = [...new Set(matches.flatMap((x) => [x.home, x.away]))].filter(
    (t) => t !== answer && t !== (isHome ? m.away : m.home)
  );
  const options = [answer];
  while (options.length < 4 && allTeams.length) {
    const [t] = allTeams.splice(crypto.randomInt(allTeams.length), 1);
    options.push(t);
  }
  // embaralha pra resposta não ser sempre a primeira
  for (let i = options.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    answer,
    opponent: isHome ? m.away : m.home,
    options,
    clues: {
      stage: m.stage,
      goalsFor: m.stats.goals[side],
      goalsAgainst: m.stats.goals[other],
      corners: m.stats.corners[side],
      yellowCards: m.stats.yellowCards[side],
      possession: m.stats.possession?.[side] ?? 50,
    },
  };
}

function prune() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.finished || now - s.createdAt > 30 * 60 * 1000) sessions.delete(id);
  }
}

function roundView(s: QuizSession) {
  const r = s.rounds[s.index];
  return {
    id: s.id,
    round: s.index + 1,
    totalRounds: ROUNDS,
    score: s.score,
    streak: s.streak,
    expiresAt: s.roundExpiresAt,
    options: r.options,
    clues: r.clues,
  };
}

export async function startQuiz(wallet: string, name?: string) {
  if (!wallet) throw new HttpError(400, "wallet obrigatória");
  prune();
  const matches = (await getGameData()).matches;
  const used = new Set<string>();
  const s: QuizSession = {
    id: crypto.randomUUID(),
    wallet,
    name,
    rounds: Array.from({ length: ROUNDS }, () => buildRound(matches, used)),
    index: 0,
    score: 0,
    streak: 0,
    roundExpiresAt: Date.now() + ROUND_WINDOW_MS,
    finished: false,
    createdAt: Date.now(),
  };
  sessions.set(s.id, s);
  return roundView(s);
}

/* ---- rodadas para a sessão valendo SOL (Guess the Team house-backed) ---- */
// A sessão apostada (teamSession.ts) usa estas rodadas avulsas: o segredo (time
// certo) fica só aqui e a checagem é server-side, igual à regra das runs.
interface StakedRound {
  answer: string;
  opponent: string;
  options: string[];
  expiresAt: number;
}
const stakedRounds = new Map<string, StakedRound>();

export async function buildStakedRound() {
  const matches = (await getGameData()).matches;
  const r = buildRound(matches, new Set());
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + ROUND_WINDOW_MS;
  stakedRounds.set(id, { answer: r.answer, opponent: r.opponent, options: r.options, expiresAt });
  // poda rodadas velhas
  const now = Date.now();
  for (const [k, v] of stakedRounds) if (now > v.expiresAt + 60_000) stakedRounds.delete(k);
  return { id, options: r.options, clues: r.clues, expiresAt };
}

/** Confere a rodada apostada. `choice` é o índice da opção escolhida. */
export function checkStakedRound(id: string, choice: number) {
  const r = stakedRounds.get(id);
  if (!r) throw new HttpError(404, "rodada não encontrada");
  stakedRounds.delete(id); // one-shot
  const late = Date.now() > r.expiresAt;
  const correct = !late && r.options[choice] === r.answer;
  return { correct, late, answer: r.answer, opponent: r.opponent };
}

export function answerQuiz(id: string, choice: string) {
  const s = sessions.get(id);
  if (!s || s.finished) throw new HttpError(404, "quiz não encontrado (ou já terminou)");
  const round = s.rounds[s.index];
  const late = Date.now() > s.roundExpiresAt;
  const correct = !late && choice === round.answer;

  let points = 0;
  if (correct) {
    s.streak += 1;
    points = 20 + 5 * (s.streak - 1); // bônus de sequência
    s.score += points;
  } else {
    s.streak = 0;
  }

  s.index += 1;
  const finished = s.index >= ROUNDS;
  s.finished = finished;
  s.roundExpiresAt = Date.now() + ROUND_WINDOW_MS;
  if (finished && s.score > 0) addPoints("quiz", s.wallet, s.score, s.name);

  return {
    correct,
    late,
    points,
    answer: round.answer,
    opponent: round.opponent,
    score: s.score,
    streak: s.streak,
    finished,
    next: finished ? null : roundView(s),
  };
}
