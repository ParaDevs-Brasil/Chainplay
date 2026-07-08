import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DATA_DIR, NETWORK, rpcUrl } from "./config.js";

const WALLET_PATH = path.join(DATA_DIR, "wallet.json");

export function loadOrCreateKeypair(): Keypair {
  if (process.env.WALLET_SECRET) {
    const secret = Uint8Array.from(JSON.parse(process.env.WALLET_SECRET));
    return Keypair.fromSecretKey(secret);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(WALLET_PATH)) {
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")));
    return Keypair.fromSecretKey(secret);
  }
  const kp = Keypair.generate();
  fs.writeFileSync(WALLET_PATH, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`[wallet] nova carteira criada: ${kp.publicKey.toBase58()} (${WALLET_PATH})`);
  return kp;
}

export async function ensureFunds(kp: Keypair): Promise<void> {
  const connection = new Connection(rpcUrl, "confirmed");
  const balance = await connection.getBalance(kp.publicKey);
  if (balance >= 0.01 * LAMPORTS_PER_SOL) return;

  if (NETWORK === "devnet") {
    console.log("[wallet] saldo baixo, pedindo airdrop na devnet...");
    const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("[wallet] airdrop confirmado");
    return;
  }

  throw new Error(
    `Carteira ${kp.publicKey.toBase58()} sem SOL na mainnet. ` +
      `Envie ~0.01 SOL para pagar a taxa da transação de assinatura (free tier não cobra TxL).`
  );
}
