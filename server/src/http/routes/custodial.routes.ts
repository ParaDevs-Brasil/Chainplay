import { Router } from "express";
import { userKeypair } from "../../auth/store.js";
import { custodialClaim, custodialPlaceBet } from "../../chain/custodial.js";
import { HttpError, asyncHandler } from "../errors.js";
import { requireChain, requireSession, type AuthedRequest } from "../middleware.js";

/** Apostas assinadas pelo server com a wallet custodial da sessão. */
export const custodialRoutes = Router();

custodialRoutes.use(requireChain, requireSession);

custodialRoutes.post(
  "/place-bet",
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const { marketId, outcome, lamports, gameId } = req.body ?? {};
    if (
      typeof marketId !== "string" ||
      !Number.isInteger(outcome) ||
      !Number.isInteger(lamports) ||
      lamports <= 0
    ) {
      throw new HttpError(400, "marketId, outcome e lamports (inteiro > 0) obrigatórios");
    }
    // gameId opcional: qual jogo o usuário está jogando (define a coleção do
    // ticket); sem ele vale o jogo principal do mercado. O contrato valida
    // contra o allowed_games do mercado.
    if (gameId !== undefined && (!Number.isInteger(gameId) || gameId < 0 || gameId > 255)) {
      throw new HttpError(400, "gameId deve ser um inteiro (0-255)");
    }
    res.json(await custodialPlaceBet(userKeypair(user), marketId, outcome, lamports, gameId));
  }),
);

custodialRoutes.post(
  "/claim",
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const { market, ticketMint, ticketAccount } = req.body ?? {};
    if (![market, ticketMint, ticketAccount].every((v) => typeof v === "string" && v)) {
      throw new HttpError(400, "market, ticketMint e ticketAccount obrigatórios");
    }
    res.json({
      signature: await custodialClaim(userKeypair(user), market, ticketMint, ticketAccount),
    });
  }),
);
