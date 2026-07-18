import { Router } from "express";
import type { StakedSessionGame } from "../games/stakedSession.js";
import { userAddress } from "../auth/store.js";
import { HttpError, asyncHandler } from "./errors.js";
import { requireChain, requireSession, type AuthedRequest } from "./middleware.js";

/**
 * Registra as rotas de uma sessão house-backed apostável (criar/listar/ver/
 * próximo desafio/responder) sob `router`. Mesmo contrato de segurança do
 * Penalty: `requireSession` em tudo, wallet vinda da sessão (nunca do body) e
 * dono validado (`assertOwner`) — fecha o IDOR das rotas de dinheiro real.
 */
export function registerSessionRoutes(router: Router, game: StakedSessionGame) {
  router.get("/session-config", (_req, res) => {
    res.json(game.config);
  });

  router.post(
    "/session",
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
      res.json(await game.create(user, target, stakeLamports));
    })
  );

  router.get(
    "/sessions/:wallet",
    requireSession,
    asyncHandler(async (req, res) => {
      const { user } = req as AuthedRequest;
      if (userAddress(user) !== req.params.wallet) {
        throw new HttpError(403, "só é possível listar as próprias sessões");
      }
      res.json({ sessions: game.listByWallet(req.params.wallet) });
    })
  );

  router.get(
    "/session/:id",
    requireSession,
    asyncHandler(async (req, res) => {
      const { user } = req as AuthedRequest;
      const s = game.get(req.params.id);
      if (!s) throw new HttpError(404, "sessão não encontrada");
      game.assertOwner(s, user);
      res.json(game.view(s));
    })
  );

  router.post(
    "/session/:id/next",
    requireChain,
    requireSession,
    asyncHandler(async (req, res) => {
      const { user } = req as AuthedRequest;
      res.json(await game.next(req.params.id, user));
    })
  );

  router.post(
    "/session/:id/answer",
    requireSession,
    asyncHandler(async (req, res) => {
      const { user } = req as AuthedRequest;
      const { choice, name } = req.body ?? {};
      res.json(game.answer(req.params.id, Number(choice), user, name));
    })
  );
}
