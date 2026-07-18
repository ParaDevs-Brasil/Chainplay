import crypto from "node:crypto";
import { HttpError } from "../http/errors.js";
import {
  createSession,
  findOrCreateUser,
  sessionInfo,
  type SessionInfo,
} from "./store.js";

// Anti-abuso do modo convidado (cada conta pode receber bônus da authority).
const guestCreations: number[] = [];
const GUEST_WINDOW_MS = 60 * 60 * 1000;
const MAX_GUESTS_PER_WINDOW = 20;

/** Convidado (devnet): conta custodial descartável usada SÓ pela suíte e2e e
 *  em dev — a conta é irrecuperável (UUID + localStorage) e cada criação torra
 *  o bônus da authority, então não existe como opção de login do produto.
 *  Desligado por padrão; habilite explicitamente com ALLOW_GUEST=1. */
export async function loginAsGuest(): Promise<SessionInfo> {
  if (process.env.ALLOW_GUEST !== "1") {
    throw new HttpError(403, "modo convidado desativado (dev/e2e: ALLOW_GUEST=1)");
  }
  const now = Date.now();
  while (guestCreations.length && now - guestCreations[0] > GUEST_WINDOW_MS) {
    guestCreations.shift();
  }
  if (guestCreations.length >= MAX_GUESTS_PER_WINDOW) {
    throw new HttpError(429, "limite de contas convidadas — tente mais tarde");
  }
  guestCreations.push(now);
  const user = await findOrCreateUser("guest", crypto.randomUUID());
  return sessionInfo(user, createSession(user));
}
