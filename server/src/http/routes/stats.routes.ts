import { Router } from "express";
import { topBoard } from "../../games/leaderboard.js";
import { listPredictable, listPredictionsByWallet, submitPrediction } from "../../games/stats.js";
import { asyncHandler } from "../errors.js";

export const statsRoutes = Router();

statsRoutes.get(
  "/matches",
  asyncHandler(async (_req, res) => {
    res.json({ matches: await listPredictable() });
  }),
);

statsRoutes.post(
  "/predict",
  asyncHandler(async (req, res) => {
    const { wallet, matchId, guess, name } = req.body ?? {};
    res.json(await submitPrediction(wallet, String(matchId ?? ""), guess, name));
  }),
);

statsRoutes.get(
  "/mine/:wallet",
  asyncHandler(async (req, res) => {
    res.json({ predictions: await listPredictionsByWallet(req.params.wallet) });
  }),
);

statsRoutes.get("/leaderboard", (_req, res) => {
  res.json({ top: topBoard("stats") });
});
