import { GAME } from "../chain/client.js";
import { answerEvent, nextEvent } from "./arcade.js";
import { StakedSessionGame, type ChallengeProvider } from "./stakedSession.js";

/**
 * Live Challenge valendo SOL: sessão de 8 desafios relâmpago (sim/não) com meta
 * de acertos. Reusa o motor genérico de sessão house-backed (o mesmo do Penalty)
 * e o feed de eventos do arcade — mas com a coleção NFT do LIVE (GAME.live), sua
 * própria escada de odds e o timer curto dos desafios ao vivo.
 *
 * Odds da casa (justo ≈ soma binomial de acertos com p≈0.5 por desafio):
 *   5/8 justo ≈ 3.6x, pagamos 3x · 6/8 justo ≈ 7.3x, pagamos 6x ·
 *   7/8 justo ≈ 22x, pagamos 15x. A margem fica embutida nas odds.
 */
export const LIVE_ROUNDS = 8;
export const LIVE_ODDS_BPS: Record<number, number> = {
  5: 30_000, // 3x
  6: 60_000, // 6x
  7: 150_000, // 15x
};

// O feed de eventos "live" do arcade é o provedor de desafios; o segredo (se o
// evento acontece) nunca sai do server — a checagem é 100% server-side.
const liveProvider: ChallengeProvider = {
  async serveNext(wallet) {
    const view = await nextEvent("live", wallet);
    return { eventId: view.id, view };
  },
  check(eventId, choice, name) {
    const r = answerEvent(eventId, choice, name);
    return { correct: r.correct, view: r };
  },
  timeout(eventId) {
    try {
      answerEvent(eventId, -1);
    } catch {
      /* evento já podado */
    }
  },
};

export const liveSession = new StakedSessionGame({
  label: "live",
  gameId: GAME.live,
  rounds: LIVE_ROUNDS,
  oddsByTarget: LIVE_ODDS_BPS,
  storeFile: "live-sessions.json",
  provider: liveProvider,
});
