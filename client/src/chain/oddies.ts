import { AnchorProvider, BN, Program, type Idl, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import idlJson from "./oddies_bet.json";
import type { InjectedProvider } from "./wallet";

export const PROGRAM_ID = new PublicKey((idlJson as any).address);
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const LAMPORTS_PER_SOL = 1_000_000_000;

let rpcUrl = "https://api.devnet.solana.com";
let connection: Connection | null = null;

/** RPC vem do server (/api/game/status) pra client e backend olharem a mesma rede. */
export async function getConnection(): Promise<Connection> {
  if (connection) return connection;
  try {
    const status = await fetch("/api/game/status").then((r) => r.json());
    if (status?.chain?.rpcUrl) rpcUrl = status.chain.rpcUrl;
  } catch {
    /* fica no default devnet */
  }
  connection = new Connection(rpcUrl, "confirmed");
  return connection;
}

export const configPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

export const marketPda = (marketId: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];

export const vaultPda = (market: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID
  )[0];

export const betPda = (market: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  )[0];

async function getProgram(injected: InjectedProvider): Promise<Program> {
  const conn = await getConnection();
  // O provider injetado já implementa a interface Wallet que o Anchor espera.
  const wallet = injected as unknown as Wallet;
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  return new Program(idlJson as Idl, provider);
}

export interface PlacedBet {
  signature: string;
  ticketMint: string;
  ticketAccount: string;
  bet: string;
}

/**
 * Aposta: minta o ticket-NFT pro apostador. O mint e a token account são
 * keypairs novos gerados aqui — assinam junto com a wallet do jogador.
 */
export async function placeBet(
  injected: InjectedProvider,
  marketIdStr: string,
  outcome: number,
  lamports: number
): Promise<PlacedBet> {
  if (!injected.publicKey) throw new Error("wallet não conectada");
  const program = await getProgram(injected);
  const marketId = new BN(marketIdStr);
  const market = marketPda(marketId);
  const config: any = await (program.account as any).config.fetch(configPda());

  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  const bet = betPda(market, ticketMint.publicKey);

  const signature = await program.methods
    .placeBet(outcome, new BN(lamports))
    .accounts({
      config: configPda(),
      market,
      vault: vaultPda(market),
      teamWallet: config.teamWallet,
      bet,
      ticketMint: ticketMint.publicKey,
      ticketAccount: ticketAccount.publicKey,
      bettor: injected.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([ticketMint, ticketAccount])
    .rpc();

  return {
    signature,
    ticketMint: ticketMint.publicKey.toBase58(),
    ticketAccount: ticketAccount.publicKey.toBase58(),
    bet: bet.toBase58(),
  };
}

/** Resgate: queima o ticket e recebe o prêmio do vault. */
export async function claimTicket(
  injected: InjectedProvider,
  marketAddress: string,
  ticketMint: string,
  ticketAccount: string
): Promise<string> {
  if (!injected.publicKey) throw new Error("wallet não conectada");
  const program = await getProgram(injected);
  const market = new PublicKey(marketAddress);
  const mint = new PublicKey(ticketMint);

  return program.methods
    .claim()
    .accounts({
      market,
      vault: vaultPda(market),
      bet: betPda(market, mint),
      ticketMint: mint,
      ticketAccount: new PublicKey(ticketAccount),
      claimer: injected.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export function formatSol(lamports: number, digits = 3): string {
  return `${(lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })} SOL`;
}
