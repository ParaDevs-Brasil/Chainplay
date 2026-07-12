import { Router } from "express";
import {
  answerEvent,
  arcadeLeaderboard,
  nextEvent,
  type ArcadeGame,
} from "../../games/arcade.js";
import {
  PENALTY_ODDS_BPS,
  SHOTS_PER_SESSION,
  answerShot,
  createSession,
  getSession,
  listSessionsByWallet,
  nextShot,
  sessionView,
} from "../../games/penaltySession.js";
import { getChain } from "../../chain/client.js";
import { HttpError, asyncHandler } from "../errors.js";

export const arcadeRoutes = Router();

function gameParam(raw: string): ArcadeGame {
  if (raw !== "penalty" && raw !== "live") {
    throw new HttpError(404, "jogo arcade desconhecido");
  }
  return raw;
}

arcadeRoutes.post(
  "/:game/next",
  asyncHandler(async (req, res) => {
    const game = gameParam(req.params.game);
    const { wallet } = req.body ?? {};
    try {
      res.json(await nextEvent(game, wallet));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);

arcadeRoutes.post("/:game/answer/:id", (req, res) => {
  gameParam(req.params.game);
  const { choice, name } = req.body ?? {};
  try {
    res.json(answerEvent(req.params.id, Number(choice), name));
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
});

arcadeRoutes.get("/:game/leaderboard", (req, res) => {
  res.json({ top: arcadeLeaderboard(gameParam(req.params.game)) });
});

/* ---- Penalty valendo SOL: sessão de 8 pênaltis com meta de acertos ---- */

arcadeRoutes.get("/penalty/session-config", (_req, res) => {
  res.json({
    enabled: Boolean(getChain()),
    odds: PENALTY_ODDS_BPS,
    shots: SHOTS_PER_SESSION,
  });
});

arcadeRoutes.post(
  "/penalty/session",
  asyncHandler(async (req, res) => {
    const { wallet, target, stakeLamports } = req.body ?? {};
    try {
      res.json(await createSession(String(wallet ?? ""), Number(target), Number(stakeLamports)));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);

arcadeRoutes.get("/penalty/sessions/:wallet", (req, res) => {
  res.json({ sessions: listSessionsByWallet(req.params.wallet) });
});

arcadeRoutes.get("/penalty/session/:id", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) throw new HttpError(404, "sessão não encontrada");
  res.json(sessionView(s));
});

arcadeRoutes.post(
  "/penalty/session/:id/shot",
  asyncHandler(async (req, res) => {
    try {
      res.json(await nextShot(req.params.id));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);

arcadeRoutes.post("/penalty/session/:id/answer", (req, res) => {
  const { choice, name } = req.body ?? {};
  try {
    res.json(answerShot(req.params.id, Number(choice), name));
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
});
