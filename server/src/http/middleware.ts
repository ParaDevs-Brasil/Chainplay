import type { NextFunction, Request, Response } from "express";
import { sessionUser, type UserRecord } from "../auth/store.js";
import { getChain } from "../chain/client.js";
import { HttpError } from "./errors.js";

export interface AuthedRequest extends Request {
  user: UserRecord;
}

/** Exige sessão Bearer válida e anexa o usuário ao request. */
export function requireSession(req: Request, _res: Response, next: NextFunction) {
  const user = sessionUser(req.headers.authorization);
  if (!user) return next(new HttpError(401, "faça login primeiro"));
  (req as AuthedRequest).user = user;
  next();
}

/** Exige a authority on-chain configurada (503 caso contrário). */
export function requireChain(_req: Request, _res: Response, next: NextFunction) {
  if (!getChain()) {
    return next(
      new HttpError(
        503,
        "on-chain desativado: configure AUTHORITY_KEYPAIR(_PATH) ou coloque a keypair em program/keys/devnet-deploy-wallet.json"
      )
    );
  }
  next();
}
