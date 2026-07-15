import { GAME } from "../chain/client.js";
import { buildStakedRound, checkStakedRound } from "./quiz.js";
import { StakedSessionGame, type ChallengeProvider } from "./stakedSession.js";

/**
 * Guess the Team valendo SOL: sessão de 5 rodadas com meta de acertos. Cada
 * rodada mostra o raio-X estatístico de uma seleção e 4 opções; acertar quem
 * jogou soma um ponto. Bater a meta paga odds fixas. Reusa o motor genérico de
 * sessão house-backed, mas com a coleção NFT do TEAM (GAME.team) e sua própria
 * escada de odds — 4 opções por rodada (p base ≈ 0.25, sobe com as pistas).
 *
 * Odds da casa (conservadoras sobre o justo de 4 opções):
 *   3/5 → 3x · 4/5 → 8x · 5/5 → 25x. A margem fica embutida nas odds.
 */
export const TEAM_ROUNDS = 5;
export const TEAM_ODDS_BPS: Record<number, number> = {
  3: 30_000, // 3x
  4: 80_000, // 8x
  5: 250_000, // 25x
};

// O provedor de desafios são as rodadas do quiz; o time certo nunca sai do
// server (checagem server-side, igual às runs).
const teamProvider: ChallengeProvider = {
  async serveNext() {
    const r = await buildStakedRound();
    return { eventId: r.id, view: { options: r.options, clues: r.clues, expiresAt: r.expiresAt } };
  },
  check(eventId, choice) {
    const r = checkStakedRound(eventId, choice);
    return { correct: r.correct, view: r };
  },
  timeout(eventId) {
    try {
      checkStakedRound(eventId, -1);
    } catch {
      /* rodada já podada */
    }
  },
};

export const teamSession = new StakedSessionGame({
  label: "team",
  gameId: GAME.team,
  rounds: TEAM_ROUNDS,
  oddsByTarget: TEAM_ODDS_BPS,
  storeFile: "team-sessions.json",
  provider: teamProvider,
});
