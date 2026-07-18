import { Router } from "express";
import {
  listPickableMarkets,
  makePick,
  survivorLeaderboard,
  survivorStatus,
} from "../../games/survivor.js";
import { userAddress } from "../../auth/store.js";
import { asyncHandler } from "../errors.js";
import { requireSession, type AuthedRequest } from "../middleware.js";

export const survivorRoutes = Router();

survivorRoutes.get(
  "/markets",
  asyncHandler(async (_req, res) => {
    res.json({ markets: await listPickableMarkets() });
  }),
);

survivorRoutes.post(
  "/pick",
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const { marketId, outcome, name } = req.body ?? {};
    // wallet vem da sessão autenticada — impede forjar/bloquear pick de terceiros
    const wallet = userAddress(user);
    res.json(await makePick(wallet, String(marketId ?? ""), Number(outcome), name));
  }),
);

survivorRoutes.get("/status/:wallet", (req, res) => {
  res.json(survivorStatus(req.params.wallet));
});

survivorRoutes.get("/leaderboard", (_req, res) => {
  res.json(survivorLeaderboard());
});
