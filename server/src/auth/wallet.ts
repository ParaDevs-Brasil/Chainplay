import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { HttpError } from "../http/errors.js";
import {
  createSession,
  findOrCreateUser,
  sessionInfo,
  type SessionInfo,
} from "./store.js";

/**
 * Login não-custodial via web3 connect (Sign-In With Solana simplificado):
 * 1. POST /api/auth/wallet/nonce   { address }             → { message, nonce }
 * 2. o client assina `message` com wallet.signMessage()
 * 3. POST /api/auth/wallet/verify  { address, signature }  → sessão Bearer
 * A assinatura é ed25519 destacada, enviada em base64. O nonce é one-shot
 * e expira em 5 minutos.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface Challenge {
  nonce: string;
  issuedAt: string;
  expiresAt: number;
}

const challenges = new Map<string, Challenge>();

function pruneChallenges() {
  const now = Date.now();
  for (const [address, c] of challenges) {
    if (c.expiresAt < now) challenges.delete(address);
  }
}

function parseAddress(address: unknown): PublicKey {
  if (typeof address !== "string" || !address) {
    throw new HttpError(400, "address (base58) obrigatório");
  }
  try {
    return new PublicKey(address);
  } catch {
    throw new HttpError(400, "address não é uma chave Solana válida");
  }
}

function buildMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    "ChainPlay · verificação de wallet",
    "",
    "Assine para entrar — não custa gas e não move fundos.",
    "",
    `wallet: ${address}`,
    `nonce: ${nonce}`,
    `emitido em: ${issuedAt}`,
  ].join("\n");
}

export interface WalletChallenge {
  address: string;
  nonce: string;
  message: string;
  expiresInSeconds: number;
}

export function walletChallenge(address: unknown): WalletChallenge {
  const pub = parseAddress(address);
  pruneChallenges();
  const challenge: Challenge = {
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: new Date().toISOString(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  challenges.set(pub.toBase58(), challenge);
  return {
    address: pub.toBase58(),
    nonce: challenge.nonce,
    message: buildMessage(pub.toBase58(), challenge.nonce, challenge.issuedAt),
    expiresInSeconds: CHALLENGE_TTL_MS / 1000,
  };
}

export async function loginWithWallet(
  address: unknown,
  signatureB64: unknown
): Promise<SessionInfo> {
  const pub = parseAddress(address);
  const key = pub.toBase58();

  const challenge = challenges.get(key);
  if (!challenge || challenge.expiresAt < Date.now()) {
    challenges.delete(key);
    throw new HttpError(401, "desafio inexistente ou expirado — peça um novo nonce");
  }

  if (typeof signatureB64 !== "string" || !signatureB64) {
    throw new HttpError(400, "signature (base64 da assinatura ed25519) obrigatória");
  }
  const signature = Buffer.from(signatureB64, "base64");
  if (signature.length !== 64) {
    throw new HttpError(400, "assinatura deve ter 64 bytes (ed25519) em base64");
  }

  const message = new TextEncoder().encode(
    buildMessage(key, challenge.nonce, challenge.issuedAt)
  );
  if (!nacl.sign.detached.verify(message, signature, pub.toBytes())) {
    throw new HttpError(401, "assinatura inválida para esta wallet");
  }

  challenges.delete(key); // nonce é one-shot
  const user = await findOrCreateUser("wallet", key);
  return sessionInfo(user, createSession(user));
}
