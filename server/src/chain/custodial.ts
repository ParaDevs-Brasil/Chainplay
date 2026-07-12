import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  betPda,
  configPda,
  getChain,
  marketPda,
  TOKEN_PROGRAM_ID,
  vaultPda,
} from "./client.js";

/**
 * Apostas em nome das contas custodiais (login social/convidado): a mesma
 * transação que a wallet do usuário assinaria no browser, assinada aqui com
 * a keypair custodial. O ticket-NFT vai pra wallet custodial do usuário.
 */

export interface CustodialBetResult {
  signature: string;
  ticketMint: string;
  ticketAccount: string;
}

export async function custodialPlaceBet(
  user: Keypair,
  marketIdStr: string,
  outcome: number,
  lamports: number
): Promise<CustodialBetResult> {
  const chain = getChain();
  if (!chain) throw new Error("on-chain desativado");
  const market = marketPda(new BN(marketIdStr));
  const config: any = await (chain.program.account as any).config.fetch(configPda());

  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  const signature = await chain.program.methods
    .placeBet(outcome, new BN(lamports))
    .accounts({
      config: configPda(),
      market,
      vault: vaultPda(market),
      teamWallet: config.teamWallet,
      bet: betPda(market, ticketMint.publicKey),
      ticketMint: ticketMint.publicKey,
      ticketAccount: ticketAccount.publicKey,
      bettor: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([user, ticketMint, ticketAccount])
    .rpc();

  return {
    signature,
    ticketMint: ticketMint.publicKey.toBase58(),
    ticketAccount: ticketAccount.publicKey.toBase58(),
  };
}

export async function custodialClaim(
  user: Keypair,
  marketAddress: string,
  ticketMint: string,
  ticketAccount: string
): Promise<string> {
  const chain = getChain();
  if (!chain) throw new Error("on-chain desativado");
  const market = new PublicKey(marketAddress);
  const mint = new PublicKey(ticketMint);

  return chain.program.methods
    .claim()
    .accounts({
      market,
      vault: vaultPda(market),
      bet: betPda(market, mint),
      ticketMint: mint,
      ticketAccount: new PublicKey(ticketAccount),
      claimer: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([user])
    .rpc();
}
