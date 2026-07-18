// bn.js direto: o dist CJS do anchor não expõe BN como named export em Node ESM
import BN from "bn.js";
import { HttpError } from "../http/errors.js";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  betPda,
  collectionAccounts,
  configPda,
  GAME_NONE,
  GAMES,
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
  lamports: number,
  gameId?: number
): Promise<CustodialBetResult> {
  const chain = getChain();
  if (!chain) throw new HttpError(503, "on-chain desativado");
  const market = marketPda(new BN(marketIdStr));
  const [config, marketAcc] = await Promise.all([
    (chain.program.account as any).config.fetch(configPda()),
    (chain.program.account as any).market.fetch(market),
  ]);

  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  // Jogo declarado na aposta: define a coleção do ticket. Sem gameId explícito,
  // usa o jogo principal do mercado; se a coleção ainda não existe on-chain,
  // degrada pra GAME_NONE (ticket sem coleção) — o contrato valida o resto.
  const requested = gameId ?? marketAcc.gameId;
  // Só o mercado sem jogo aceita apostar sem identidade: um game_id
  // desconhecido é erro do chamador, não motivo pra emitir ticket sem NFT.
  if (requested !== GAME_NONE && !GAMES.some((g) => g.id === requested)) {
    throw new HttpError(400, "gameId desconhecido");
  }
  // O jogo precisa estar habilitado no mercado (allowed_games) — o contrato
  // rejeita, mas checar aqui devolve 403 claro em vez de um revert genérico.
  if (requested !== GAME_NONE && !(marketAcc.allowedGames & (1 << requested))) {
    throw new HttpError(403, "esse jogo não pode apostar neste mercado");
  }
  const collection = await collectionAccounts(chain.program, requested, ticketMint.publicKey);
  const effectiveGameId = collection.gameCollection ? requested : GAME_NONE;
  const signature = await chain.program.methods
    .placeBet(outcome, new BN(lamports), effectiveGameId)
    .accountsPartial({
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
      ...collection,
    })
    // metadata + verify na coleção custam CU extra além dos ~200k padrão
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
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
  if (!chain) throw new HttpError(503, "on-chain desativado");
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
