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
  assertSessionOwner,
  createSession,
  getSession,
  listSessionsByWallet,
  nextShot,
  sessionView,
} from "../../games/penaltySession.js";
import { getChain } from "../../chain/client.js";
import { userAddress } from "../../auth/store.js";
import { HttpError, asyncHandler } from "../errors.js";
import { requireChain, requireSession, type AuthedRequest } from "../middleware.js";

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
  requireChain,
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const { target, stakeLamports } = req.body ?? {};
    if (!Number.isInteger(target) || target <= 0) {
      throw new HttpError(400, "target deve ser um inteiro positivo");
    }
    if (!Number.isInteger(stakeLamports) || stakeLamports <= 0) {
      throw new HttpError(400, "stakeLamports deve ser um inteiro positivo");
    }
    try {
      res.json(await createSession(user, target, stakeLamports));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, (err as Error).message);
    }
  })
);

arcadeRoutes.get(
  "/penalty/sessions/:wallet",
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    if (userAddress(user) !== req.params.wallet) {
      throw new HttpError(403, "só é possível listar as próprias sessões");
    }
    res.json({ sessions: listSessionsByWallet(req.params.wallet) });
  })
);

arcadeRoutes.get(
  "/penalty/session/:id",
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const s = getSession(req.params.id);
    if (!s) throw new HttpError(404, "sessão não encontrada");
    assertSessionOwner(s, user);
    res.json(sessionView(s));
  })
);

arcadeRoutes.post(
  "/penalty/session/:id/shot",
  requireChain,
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    try {
      res.json(await nextShot(req.params.id, user));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, (err as Error).message);
    }
  })
);

arcadeRoutes.post(
  "/penalty/session/:id/answer",
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const { choice, name } = req.body ?? {};
    try {
      res.json(answerShot(req.params.id, Number(choice), user, name));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, (err as Error).message);
    }
  })
);
