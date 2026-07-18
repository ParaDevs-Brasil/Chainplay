// bn.js direto: o dist CJS do anchor não expõe BN como named export em Node ESM
import BN from "bn.js";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import {
  BPS,
  getChain,
  marketPda,
  marketStateLabel,
  TOKEN_PROGRAM_ID,
} from "./client.js";
import { HttpError } from "../http/errors.js";
import { findMarketRecord } from "./markets.js";
import { getRun, listRunsByWallet } from "./runs.js";

export type TicketStatus =
  | "open" // mercado ainda aberto/aguardando resolução
  | "claimable" // ganhou (ou void) e ainda não resgatou
  | "lost"
  | "claimed";

export interface TicketView {
  ticketMint: string;
  ticketAccount: string;
  market: string;
  marketId: string;
  outcome: number;
  stakeNet: number;
  status: TicketStatus;
  /** payout estimado/real em lamports (parimutuel: proporção do pote atual) */
  payout: number;
  marketState: "open" | "resolved" | "voided";
  winningOutcome: number | null;
  kind: "parimutuel" | "houseBacked";
  /** metadados de exibição, quando o server conhece o mercado */
  label: string | null;
  closeTs: number;
}

/**
 * Tickets de uma wallet: cruza os NFTs (amount=1) que ela segura com as contas
 * Bet do programa. A posse do ticket é a única fonte de verdade — apostas
 * transferidas aparecem pra quem segura o NFT agora.
 */
export async function listTickets(wallet: string): Promise<TicketView[]> {
  const chain = getChain();
  if (!chain) return [];
  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet);
  } catch {
    throw new HttpError(400, "wallet inválida");
  }

  // Decodifica as Bets uma a uma: contas de layout pré-migração (sem o campo
  // game_id) não derrubam a listagem inteira — são só ignoradas.
  // (o Anchor camelCasa os nomes de conta do IDL em runtime: "Bet" → "bet")
  const betDiscriminator: number[] = (chain.program.idl as any).accounts.find(
    (a: any) => a.name.toLowerCase() === "bet"
  ).discriminator;
  const [tokenAccounts, rawBets] = await Promise.all([
    chain.connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    }),
    chain.connection.getProgramAccounts(chain.program.programId, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from(betDiscriminator)) } },
      ],
    }),
  ]);
  const allBets = rawBets.flatMap(({ pubkey, account }) => {
    try {
      return [
        {
          publicKey: pubkey,
          account: chain.program.coder.accounts.decode("bet", account.data),
        },
      ];
    } catch {
      return [];
    }
  });

  const heldMints = new Map<string, string>(); // mint → token account
  for (const { pubkey, account } of tokenAccounts.value) {
    const info = account.data.parsed?.info;
    if (info?.tokenAmount?.decimals === 0 && info?.tokenAmount?.uiAmount === 1) {
      heldMints.set(info.mint, pubkey.toBase58());
    }
  }

  const mine = allBets.filter((b: any) =>
    heldMints.has(b.account.ticketMint.toBase58())
  );
  if (!mine.length) return [];

  const marketKeys = [...new Set(mine.map((b: any) => b.account.market.toBase58()))];
  const marketAccs: any[] = await (chain.program.account as any).market.fetchMultiple(
    marketKeys.map((k) => new PublicKey(k as string))
  );
  const markets = new Map(marketKeys.map((k, i) => [k, marketAccs[i]]));

  return mine.map((b: any) => {
    const bet = b.account;
    const marketKey = bet.market.toBase58();
    const m = markets.get(marketKey);
    const state = m ? marketStateLabel(m.state) : "open";
    const kind = m?.kind?.houseBacked ? "houseBacked" : "parimutuel";
    const marketId = m ? (m.marketId as BN).toString() : "";
    const winning = state === "resolved" ? m.winningOutcome : null;
    const stakeNet = (bet.stakeNet as BN).toNumber();

    let payout = 0;
    let status: TicketStatus = "open";
    if (bet.claimed) {
      status = "claimed";
    } else if (state === "voided") {
      status = "claimable";
      payout = stakeNet;
    } else if (state === "resolved") {
      if (bet.outcome !== winning) {
        status = "lost";
      } else {
        status = "claimable";
        payout =
          kind === "houseBacked"
            ? (bet.fixedPayout as BN).toNumber()
            : Math.floor(
                (stakeNet * (m.payoutPool as BN).toNumber()) /
                  Math.max(1, (m.pools[winning] as BN).toNumber())
              );
      }
    } else {
      // mercado aberto: estimativa do que valeria hoje
      payout =
        kind === "houseBacked"
          ? (bet.fixedPayout as BN).toNumber()
          : estimateParimutuel(m, bet.outcome, stakeNet);
    }

    const rec = marketId ? findMarketRecord(marketId) : undefined;
    const label = rec
      ? `${rec.home} × ${rec.away}`
      : kind === "houseBacked"
      ? "Run Hi-Lo"
      : null;

    return {
      ticketMint: bet.ticketMint.toBase58(),
      ticketAccount: heldMints.get(bet.ticketMint.toBase58())!,
      market: marketKey,
      marketId,
      outcome: bet.outcome,
      stakeNet,
      status,
      payout,
      marketState: state,
      winningOutcome: winning,
      kind,
      label,
      closeTs: m ? (m.closeTs as BN).toNumber() : 0,
    };
  });
}

function estimateParimutuel(m: any, outcome: number, stakeNet: number): number {
  if (!m) return 0;
  const pools: number[] = m.pools.map((p: BN) => p.toNumber());
  const total = pools.reduce((a: number, b: number) => a + b, 0);
  const mine = pools[outcome] || 0;
  if (!mine) return 0;
  return Math.floor((stakeNet * total) / mine);
}

export { listRunsByWallet, getRun };
