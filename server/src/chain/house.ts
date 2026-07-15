import crypto from "node:crypto";
// bn.js direto: o dist CJS do anchor não expõe BN como named export em Node ESM
import BN from "bn.js";
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { HttpError } from "../http/errors.js";
import {
  BPS,
  GAME_NONE,
  configPda,
  gameIdOrNone,
  marketGames,
  getChain,
  marketPda,
  vaultPda,
} from "./client.js";

/**
 * Ciclo de vida de mercados house-backed por sessão de jogo (Padrão B do
 * plano): cria + fundeia cobrindo o pior caso, verifica a chegada do
 * place_bet e liquida reciclando a liquidez livre. Usado pelas sessões do
 * Penalty (e por jogos futuros de skill individual); as runs do Hi-Lo
 * mantêm o próprio fluxo em runs.ts.
 *
 * Lucro da casa: a margem embutida nas odds (paga menos que o justo) +
 * a taxa de 10% de todo place_bet que já vai pra team wallet no contrato.
 */

export const HOUSE_WIN = 0; // outcome do jogador
export const HOUSE_LOSE = 1;

// Mesmo teto por sessão das runs: protege o caixa da casa em devnet.
export const HOUSE_MAX_PAYOUT_LAMPORTS = 0.3 * LAMPORTS_PER_SOL;

export interface HouseMarketInfo {
  marketId: string;
  marketPdaB58: string;
  netLamports: number;
  payoutLamports: number;
  closeTs: number;
  resolveAfterTs: number;
}

export async function createHouseMarket(
  oddsBps: number,
  stakeLamports: number,
  betWindowS: number,
  gameId: number = GAME_NONE
): Promise<HouseMarketInfo> {
  const chain = getChain();
  if (!chain) throw new HttpError(503, "on-chain desativado no server (authority ausente)");

  const config: any = await (chain.program.account as any).config.fetch(configPda());
  const net = stakeLamports - Math.floor((stakeLamports * config.feeBps) / BPS);
  const payout = Math.floor((net * oddsBps) / BPS);
  if (payout > HOUSE_MAX_PAYOUT_LAMPORTS) {
    throw new HttpError(
      400,
      `stake alto demais para essa meta: payout máximo é ${
        HOUSE_MAX_PAYOUT_LAMPORTS / LAMPORTS_PER_SOL
      } SOL`
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const closeTs = now + betWindowS;
  const resolveAfterTs = closeTs + 1;
  // mesmo namespace anti-colisão das runs: timestamp*1000 + aleatório
  const marketId = new BN(Date.now()).muln(1000).addn(crypto.randomInt(1000));
  const market = marketPda(marketId);
  const vault = vaultPda(market);

  const odds = Array(8).fill(new BN(0));
  odds[HOUSE_WIN] = new BN(oddsBps);
  odds[HOUSE_LOSE] = new BN(BPS + 1); // exigido > 1x; ninguém aposta nele

  const games = await marketGames(chain.program, gameId);
  await chain.program.methods
    .createMarket(
      marketId,
      marketId,
      { houseBacked: {} },
      2,
      odds,
      new BN(closeTs),
      new BN(resolveAfterTs),
      games.gameId,
      games.allowedGames
    )
    .accounts({
      config: configPda(),
      market,
      vault,
      authority: chain.authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  await chain.program.methods
    .fundHouse(new BN(Math.max(1, payout - net)))
    .accounts({
      config: configPda(),
      market,
      vault,
      authority: chain.authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return {
    marketId: marketId.toString(),
    marketPdaB58: market.toBase58(),
    netLamports: net,
    payoutLamports: payout,
    closeTs,
    resolveAfterTs,
  };
}

/** true quando o place_bet do jogador (outcome 0) já está no vault. */
export async function houseBetArrived(marketId: string, minNet: number): Promise<boolean> {
  const chain = getChain();
  if (!chain) return false;
  const acc: any = await (chain.program.account as any).market.fetch(
    marketPda(new BN(marketId))
  );
  return (acc.pools[HOUSE_WIN] as BN).toNumber() >= minNet;
}

/** Resolve o mercado e devolve pro caixa o que não é do jogador. */
export async function settleHouseMarket(marketId: string, outcome: number) {
  const chain = getChain();
  if (!chain) throw new HttpError(503, "chain desativada");
  const market = marketPda(new BN(marketId));

  // Idempotência: tenta resolver e trata "mercado não está aberto" (6004) como
  // já-resolvido — evita o loop de MarketNotOpen quando uma passada anterior
  // resolveu mas falhou na reciclagem. Não decodifica o market antes (quebraria
  // em markets de layout antiga durante upgrade do programa).
  try {
    await chain.program.methods
      .resolveMarket(outcome)
      .accounts({
        config: configPda(),
        market,
        authority: chain.authority.publicKey,
      })
      .rpc();
  } catch (e) {
    if (!/MarketNotOpen|6004/i.test((e as Error).message)) throw e;
  }

  // Reciclagem best-effort: falhar aqui não re-resolve nem trava a sessão.
  let free = 0;
  try {
    const acc: any = await (chain.program.account as any).market.fetch(market);
    const vault = vaultPda(market);
    const rentMin = await chain.connection.getMinimumBalanceForRentExemption(0);
    const usable = (await chain.connection.getBalance(vault)) - rentMin;
    free = usable - (acc.outstanding as BN).toNumber();
    if (free > 0) {
      await chain.program.methods
        .withdrawHouse(new BN(free))
        .accounts({
          config: configPda(),
          market,
          vault,
          teamWallet: (
            await (chain.program.account as any).config.fetch(configPda())
          ).teamWallet,
          authority: chain.authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  } catch (e) {
    console.warn(
      `[house] reciclagem do mercado ${marketId} falhou (não bloqueia): ${(e as Error).message}`
    );
  }
  return free;
}
