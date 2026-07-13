import { Router } from "express";
import { PROGRAM_ID } from "../../chain/client.js";
import { listMarkets } from "../../chain/markets.js";
import { asyncHandler } from "../errors.js";
import { requireChain } from "../middleware.js";

export const marketsRoutes = Router();

marketsRoutes.get(
  "/",
  // mesma condição (authority ausente) responde 503 como em tickets/runs
  requireChain,
  asyncHandler(async (_req, res) => {
    res.json({ programId: PROGRAM_ID.toBase58(), markets: await listMarkets() });
  })
);
