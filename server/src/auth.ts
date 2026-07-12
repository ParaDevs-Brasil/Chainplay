import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { Request } from "express";
import { DATA_DIR } from "./config.js";
import { getChain } from "./chain/client.js";

/**
 * Login social (Google) e convidado, com wallet custodial de devnet por
 * usuário: o server guarda a keypair e assina as apostas em nome do usuário.
 * Sessões são tokens opacos guardados junto (suficiente pra devnet/hackathon;
 * em produção: secret manager + expiração + refresh).
 */

const STORE_PATH = path.join(DATA_DIR, "users.json");

export interface UserRecord {
  id: string;
  provider: "google" | "guest";
  /** `sub` do Google ou uuid do convidado */
  subject: string;
  email?: string;
  name?: string;
  secretKey: number[];
  createdAt: number;
}

interface Store {
  users: UserRecord[];
  /** token de sessão → user id */
  sessions: Record<string, string>;
}

let store: Store | null = null;

function loadStore(): Store {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    store = { users: [], sessions: {} };
  }
  return store!;
}

function saveStore() {
  if (!store) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function userKeypair(user: UserRecord): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(user.secretKey));
}

export function userAddress(user: UserRecord): string {
  return userKeypair(user).publicKey.toBase58();
}

/** Bônus de boas-vindas em devnet: fundeia a wallet custodial nova a partir
 *  da authority (uma única vez por usuário) pra dar pra jogar sem faucet. */
const WELCOME_LAMPORTS = 0.03 * LAMPORTS_PER_SOL;
const MIN_AUTHORITY_RESERVE = 0.3 * LAMPORTS_PER_SOL;

async function fundWelcome(user: UserRecord) {
  const chain = getChain();
  if (!chain) return;
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
    console.log(`[auth] wallet custodial ${userAddress(user).slice(0, 6)}… fundeada com bônus devnet`);
  } catch (err) {
    console.warn(`[auth] falha no bônus de boas-vindas: ${(err as Error).message}`);
  }
}

async function findOrCreateUser(
  provider: UserRecord["provider"],
  subject: string,
  extras: Partial<Pick<UserRecord, "email" | "name">> = {}
): Promise<UserRecord> {
  const s = loadStore();
  let user = s.users.find((u) => u.provider === provider && u.subject === subject);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      provider,
      subject,
      ...extras,
      secretKey: Array.from(Keypair.generate().secretKey),
      createdAt: Date.now(),
    };
    s.users.push(user);
    saveStore();
    console.log(`[auth] usuário ${provider} criado: ${extras.email ?? subject.slice(0, 8)}`);
    await fundWelcome(user);
  }
  return user;
}

function createSession(user: UserRecord): string {
  const s = loadStore();
  const token = crypto.randomBytes(32).toString("base64url");
  s.sessions[token] = user.id;
  saveStore();
  return token;
}

export function sessionUser(req: Request): UserRecord | null {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const s = loadStore();
  const userId = s.sessions[token];
  return s.users.find((u) => u.id === userId) ?? null;
}

export interface SessionInfo {
  token: string;
  address: string;
  provider: UserRecord["provider"];
  name: string | null;
  email: string | null;
}

function sessionInfo(user: UserRecord, token: string): SessionInfo {
  return {
    token,
    address: userAddress(user),
    provider: user.provider,
    name: user.name ?? null,
    email: user.email ?? null,
  };
}

/** Login com Google: valida o ID token (Google Identity Services) contra o
 *  endpoint tokeninfo e amarra ao GOOGLE_CLIENT_ID configurado. */
export async function loginWithGoogle(credential: string): Promise<SessionInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw Object.assign(
      new Error(
        "login Google não configurado: defina GOOGLE_CLIENT_ID no server/.env (e VITE_GOOGLE_CLIENT_ID no client/.env)"
      ),
      { status: 501 }
    );
  }
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  if (!res.ok) throw Object.assign(new Error("token do Google inválido"), { status: 401 });
  const info: any = await res.json();
  if (info.aud !== clientId) {
    throw Object.assign(new Error("token de outro app (aud não confere)"), { status: 401 });
  }
  if (Number(info.exp) * 1000 < Date.now()) {
    throw Object.assign(new Error("token do Google expirado"), { status: 401 });
  }
  const user = await findOrCreateUser("google", info.sub, {
    email: info.email,
    name: info.name ?? info.given_name,
  });
  return sessionInfo(user, createSession(user));
}

// Anti-abuso do modo convidado (cada conta pode receber bônus da authority).
const guestCreations: number[] = [];
const GUEST_WINDOW_MS = 60 * 60 * 1000;
const MAX_GUESTS_PER_WINDOW = 20;

/** Convidado (devnet): conta custodial sem Google — útil pra testar o fluxo
 *  social completo sem configurar OAuth. Desative com ALLOW_GUEST=0. */
export async function loginAsGuest(): Promise<SessionInfo> {
  if (process.env.ALLOW_GUEST === "0") {
    throw Object.assign(new Error("modo convidado desativado"), { status: 403 });
  }
  const now = Date.now();
  while (guestCreations.length && now - guestCreations[0] > GUEST_WINDOW_MS) {
    guestCreations.shift();
  }
  if (guestCreations.length >= MAX_GUESTS_PER_WINDOW) {
    throw Object.assign(new Error("limite de contas convidadas — tente mais tarde"), {
      status: 429,
    });
  }
  guestCreations.push(now);
  const user = await findOrCreateUser("guest", crypto.randomUUID());
  return sessionInfo(user, createSession(user));
}

export function logout(req: Request) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return;
  const s = loadStore();
  delete s.sessions[token];
  saveStore();
}
