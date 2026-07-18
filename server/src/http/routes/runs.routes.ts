import { Router } from "express";
import { getChain } from "../../chain/client.js";
import {
  INFINITE_CAP_STREAK,
  INFINITE_LADDER_BPS,
  MIN_STAKE_LAMPORTS,
  RUN_ODDS_BPS,
  assertRunOwner,
  cashoutRun,
  createRun,
  getRun,
  guessRun,
  listRunsByWallet,
  runView,
} from "../../chain/runs.js";
import { userAddress } from "../../auth/store.js";
import { HttpError, asyncHandler } from "../errors.js";
import { requireChain, requireSession, type AuthedRequest } from "../middleware.js";

export const runsRoutes = Router();

runsRoutes.get("/config", (_req, res) => {
  res.json({
    enabled: Boolean(getChain()),
    odds: RUN_ODDS_BPS,
    minStakeLamports: MIN_STAKE_LAMPORTS,
    infiniteLadder: INFINITE_LADDER_BPS,
    infiniteCap: INFINITE_CAP_STREAK,
  });
});

runsRoutes.post(
  "/",
  requireChain,
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const { target, stakeLamports, mode } = req.body ?? {};
    if (!Number.isInteger(target) || target <= 0) {
      throw new HttpError(400, "target deve ser um inteiro positivo");
    }
    if (!Number.isInteger(stakeLamports) || stakeLamports <= 0) {
      throw new HttpError(400, "stakeLamports deve ser um inteiro positivo");
    }
    res.json(
      await createRun(user, target, stakeLamports, mode === "infinite" ? "infinite" : "target"),
    );
  }),
);

runsRoutes.get(
  "/wallet/:wallet",
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    if (userAddress(user) !== req.params.wallet) {
      throw new HttpError(403, "só é possível listar as próprias runs");
    }
    res.json({ runs: listRunsByWallet(req.params.wallet) });
  }),
);

runsRoutes.get(
  "/:id",
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const run = getRun(req.params.id);
    if (!run) throw new HttpError(404, "run não encontrada");
    assertRunOwner(run, user);
    res.json(runView(run));
  }),
);

runsRoutes.post(
  "/:id/guess",
  requireChain,
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const dir = req.body?.dir;
    if (dir !== "higher" && dir !== "lower") {
      throw new HttpError(400, "dir deve ser higher|lower");
    }
    res.json(await guessRun(req.params.id, dir, user));
  }),
);

runsRoutes.post(
  "/:id/cashout",
  requireChain,
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    res.json(await cashoutRun(req.params.id, user));
  }),
);
