import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";
import {
  DATA_DIR,
  DURATION_WEEKS,
  NETWORK,
  SELECTED_LEAGUES,
  SERVICE_LEVEL_ID,
  apiBaseUrl,
  apiOrigin,
  programId,
  rpcUrl,
  txlTokenMint,
} from "../config.js";
import { loadOrCreateKeypair, ensureFunds } from "./wallet.js";

export interface TxlineCredentials {
  jwt: string;
  apiToken: string;
  network: string;
  wallet: string;
  txSig: string;
  activatedAt: number;
}

const CREDS_PATH = path.join(DATA_DIR, "credentials.json");
// JWT do guest dura 30 dias e a assinatura free 4 semanas; renova com folga de 2 dias
const MAX_AGE_MS = 26 * 24 * 60 * 60 * 1000;

export function loadCachedCredentials(): TxlineCredentials | null {
  // Credenciais via ambiente (útil na Vercel: ative localmente com
  // `npm run subscribe` e cole TXLINE_JWT / TXLINE_API_TOKEN no painel)
  if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
    return {
      jwt: process.env.TXLINE_JWT,
      apiToken: process.env.TXLINE_API_TOKEN,
      network: NETWORK,
      wallet: "env",
      txSig: "env",
      activatedAt: Date.now(),
    };
  }
  if (!fs.existsSync(CREDS_PATH)) return null;
  try {
    const creds: TxlineCredentials = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
    if (creds.network !== NETWORK) return null;
    if (Date.now() - creds.activatedAt > MAX_AGE_MS) return null;
    return creds;
  } catch {
    return null;
  }
}

function loadIdl(): anchor.Idl {
  const file = NETWORK === "mainnet" ? "txoracle-mainnet.json" : "txoracle-devnet.json";
  // os IDLs vivem em server/idl/ (raiz do pacote), não em src/idl/
  const idlPath = new URL(`../../idl/${file}`, import.meta.url);
  return JSON.parse(fs.readFileSync(idlPath, "utf8")) as anchor.Idl;
}

export async function subscribeAndActivate(): Promise<TxlineCredentials> {
  const keypair = loadOrCreateKeypair();
  await ensureFunds(keypair);

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = loadIdl();
  const program = new anchor.Program(idl, provider);
  if (!program.programId.equals(programId)) {
    throw new Error(
      `IDL aponta para ${program.programId.toBase58()}, esperado ${programId.toBase58()} (${NETWORK})`
    );
  }

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlTokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    txlTokenMint,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // O programa exige a token account do TXL já inicializada, mesmo no free
  // tier (que não cobra TXL) — cria a ATA se ainda não existir.
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey,
        userTokenAccount,
        keypair.publicKey,
        txlTokenMint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ),
    [keypair]
  );

  console.log(
    `[txline] assinando on-chain (${NETWORK}, service level ${SERVICE_LEVEL_ID}, ${DURATION_WEEKS} semanas)...`
  );
  const txSig = await program.methods
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: txlTokenMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`[txline] transação de assinatura: ${txSig}`);

  const authResponse = await axios.post(`${apiOrigin}/auth/guest/start`);
  const jwt: string = authResponse.data.token;

  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  const activationResponse = await axios.post(
    `${apiBaseUrl}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const apiToken: string =
    activationResponse.data.token || activationResponse.data;

  const creds: TxlineCredentials = {
    jwt,
    apiToken,
    network: NETWORK,
    wallet: keypair.publicKey.toBase58(),
    txSig,
    activatedAt: Date.now(),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });
  console.log("[txline] token de API ativado e salvo");
  return creds;
}

// A ativação envolve airdrop + transação on-chain + chamadas à API; quando
// falha (faucet seco, API fora), não adianta re-tentar a cada cache-miss dos
// consumidores (gameService a cada 5min, crons a cada 60s) — segura 15min.
let activationFailedAt = 0;
const ACTIVATION_RETRY_MS = 15 * 60 * 1000;

export async function getCredentials(): Promise<TxlineCredentials> {
  const cached = loadCachedCredentials();
  if (cached) return cached;
  if (Date.now() - activationFailedAt < ACTIVATION_RETRY_MS) {
    throw new Error("ativação TxLINE em cooldown após falha recente");
  }
  try {
    return await subscribeAndActivate();
  } catch (err) {
    activationFailedAt = Date.now();
    throw err;
  }
}
