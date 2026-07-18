import crypto from "node:crypto";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getChain } from "../chain/client.js";
import { HttpError } from "../http/errors.js";
import { JsonFileStore } from "../store/jsonFile.js";

/**
 * Contas e sessões. Três provedores:
 *  - google/guest → custodial: o server guarda a keypair de devnet e assina;
 *  - wallet      → não-custodial (web3 connect): só o endereço, quem assina
 *    é a extensão do usuário.
 * Sessões são tokens opacos com expiração (suficiente pra devnet/hackathon;
 * em produção: secret manager + refresh).
 */

export type AuthProvider = "google" | "guest" | "wallet";

export interface UserRecord {
  id: string;
  provider: AuthProvider;
  /** `sub` do Google, uuid do convidado ou endereço base58 da wallet */
  subject: string;
  email?: string;
  name?: string;
  /** keypair custodial — ausente em contas `wallet` */
  secretKey?: number[];
  createdAt: number;
}

interface SessionEntry {
  userId: string;
  expiresAt: number;
}

interface AuthData {
  users: UserRecord[];
  /** token → sessão (formato antigo era token → userId direto) */
  sessions: Record<string, SessionEntry | string>;
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const store = new JsonFileStore<AuthData>("users.json", () => ({
  users: [],
  sessions: {},
}));

function sessionEntry(raw: SessionEntry | string): SessionEntry {
  // migra sessões do formato antigo (sem expiração) na leitura
  return typeof raw === "string"
    ? { userId: raw, expiresAt: Date.now() + SESSION_TTL_MS }
    : raw;
}

export function userKeypair(user: UserRecord): Keypair {
  if (!user.secretKey) {
    throw new HttpError(
      400,
      "conta conectada por wallet (não-custodial) — assine a transação na sua própria wallet"
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(user.secretKey));
}

export function userAddress(user: UserRecord): string {
  return user.secretKey ? userKeypair(user).publicKey.toBase58() : user.subject;
}

export function isCustodial(user: UserRecord): boolean {
  return Boolean(user.secretKey);
}

/** Bônus de boas-vindas em devnet pra contas custodiais novas: dá pra jogar
 *  sem faucet. Contas `wallet` usam os próprios fundos.
 *
 *  Dimensionado pelo custo real de uma aposta com ticket-NFT (~0.0117 SOL):
 *  stake mínimo 0.001 + rent da conta Bet, do mint, da token account e da
 *  metadata Metaplex (só a metadata é 0.0056). 0.15 SOL ≈ 12 apostas. */
const WELCOME_LAMPORTS = 0.15 * LAMPORTS_PER_SOL;
const MIN_AUTHORITY_RESERVE = 0.3 * LAMPORTS_PER_SOL;

async function fundWelcome(user: UserRecord) {
  const chain = getChain();
  if (!chain || !user.secretKey) return;
  try {
    const authorityBal = await chain.connection.getBalance(chain.authority.publicKey);
    if (authorityBal < MIN_AUTHORITY_RESERVE + WELCOME_LAMPORTS) return;
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: chain.authority.publicKey,
        toPubkey: userKeypair(user).publicKey,
        lamports: WELCOME_LAMPORTS,
      })
    );
    await sendAndConfirmTransaction(chain.connection, tx, [chain.authority]);
    console.log(
      `[auth] wallet custodial ${userAddress(user).slice(0, 6)}… fundeada com bônus devnet`
    );
  } catch (err) {
    console.warn(`[auth] falha no bônus de boas-vindas: ${(err as Error).message}`);
  }
}

export async function findOrCreateUser(
  provider: AuthProvider,
  subject: string,
  extras: Partial<Pick<UserRecord, "email" | "name">> = {}
): Promise<UserRecord> {
  const data = store.load();
  let user = data.users.find((u) => u.provider === provider && u.subject === subject);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      provider,
      subject,
      ...extras,
      ...(provider === "wallet"
        ? {}
        : { secretKey: Array.from(Keypair.generate().secretKey) }),
      createdAt: Date.now(),
    };
    data.users.push(user);
    store.save();
    console.log(
      `[auth] usuário ${provider} criado: ${extras.email ?? subject.slice(0, 8)}`
    );
    // em background: o login não espera a confirmação on-chain do bônus
    // (em devnet lenta isso segurava a resposta por 10-30s)
    void fundWelcome(user);
  }
  return user;
}

export function createSession(user: UserRecord): string {
  const token = crypto.randomBytes(32).toString("base64url");
  store.update((data) => {
    data.sessions[token] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS };
  });
  return token;
}

export function bearerToken(authorization: string | undefined): string | null {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

export function sessionUser(authorization: string | undefined): UserRecord | null {
  const token = bearerToken(authorization);
  if (!token) return null;
  const data = store.load();
  const raw = data.sessions[token];
  if (!raw) return null;
  const entry = sessionEntry(raw);
  if (entry.expiresAt < Date.now()) {
    delete data.sessions[token];
    store.save();
    return null;
  }
  return data.users.find((u) => u.id === entry.userId) ?? null;
}

export function destroySession(authorization: string | undefined) {
  const token = bearerToken(authorization);
  if (!token) return;
  store.update((data) => {
    delete data.sessions[token];
  });
}

export interface SessionInfo {
  token: string;
  address: string;
  provider: AuthProvider;
  name: string | null;
  email: string | null;
}

export function sessionInfo(user: UserRecord, token: string): SessionInfo {
  return {
    token,
    address: userAddress(user),
    provider: user.provider,
    name: user.name ?? null,
    email: user.email ?? null,
  };
}

export function publicKeyOf(user: UserRecord): PublicKey {
  return new PublicKey(userAddress(user));
}
