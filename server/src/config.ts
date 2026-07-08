import "dotenv/config";
import { PublicKey } from "@solana/web3.js";

export type Network = "mainnet" | "devnet";

export const NETWORK: Network =
  (process.env.TXLINE_NETWORK as Network) || "devnet";

const CONFIG = {
  mainnet: {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
  },
  devnet: {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
  },
} as const;

export const { rpcUrl, apiOrigin, programId, txlTokenMint } = CONFIG[NETWORK];
export const apiBaseUrl = `${apiOrigin}/api`;

// Free World Cup tier: level 1 = 60s delay (mainnet e devnet), level 12 = tempo real (mainnet)
export const SERVICE_LEVEL_ID = Number(process.env.TXLINE_SERVICE_LEVEL || 1);
export const DURATION_WEEKS = 4;
export const SELECTED_LEAGUES: number[] = [];

export const PORT = Number(process.env.PORT || 3001);

// Na Vercel o filesystem é somente leitura, exceto /tmp
export const DATA_DIR = process.env.VERCEL
  ? "/tmp/hilo-data/"
  : new URL("../.data/", import.meta.url).pathname;
