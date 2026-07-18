import { findMarketRecord, listMarkets } from "../chain/markets.js";
import { JsonFileStore } from "../store/jsonFile.js";
import { HttpError } from "../http/errors.js";

/**
 * Survivor (Fase 3): um pick por rodada nos mercados 1X2. Errou um → eliminado
 * da temporada. O pick é uma aposta parimutuel real — o client assina o
 * place_bet e registra o pick aqui; vida/morte é derivada da liquidação
 * on-chain dos mercados (via markets.json, que espelha o estado da chain).
 * Mercado anulado = pick devolvido (não mata nem conta rodada).
 */

export type PickResult = "pending" | "survived" | "eliminated" | "void";

export interface SurvivorPick {
  wallet: string;
  name?: string;
  marketId: string;
  home: string;
  away: string;
  outcome: number; // 0 casa · 1 empate · 2 fora
  /** rodada = dia (UTC) do lock do mercado — 1 pick por rodada */
  round: string;
  result: PickResult;
  createdAt: number;
}

interface Data {
  picks: SurvivorPick[];
}

const store = new JsonFileStore<Data>("survivor.json", () => ({ picks: [] }));

function roundOf(closeTs: number): string {
  return new Date(closeTs * 1000).toISOString().slice(0, 10);
}

/** Atualiza os picks pendentes com o resultado dos mercados liquidados. */
export function syncSurvivor() {
  const data = store.load();
  let changed = false;
  for (const pick of data.picks.filter((p) => p.result === "pending")) {
    const market = findMarketRecord(pick.marketId);
    if (!market || market.status === "open") continue;
    if (market.status === "voided") pick.result = "void";
    else pick.result = market.winningOutcome === pick.outcome ? "survived" : "eliminated";
    changed = true;
  }
  if (changed) store.save();
}

function picksOf(wallet: string): SurvivorPick[] {
  return store.load().picks.filter((p) => p.wallet === wallet);
}

export function survivorStatus(wallet: string) {
  syncSurvivor();
  const picks = picksOf(wallet).sort((a, b) => b.createdAt - a.createdAt);
  const alive = !picks.some((p) => p.result === "eliminated");
  return {
    alive,
    survived: picks.filter((p) => p.result === "survived").length,
    pending: picks.filter((p) => p.result === "pending").length,
    picks: picks.slice(0, 20),
  };
}

export async function makePick(
  wallet: string,
  marketId: string,
  outcome: number,
  name?: string
) {
  if (name) name = String(name).slice(0, 24); // cap: nome vem do body
  syncSurvivor();
  if (!wallet) throw new HttpError(400, "wallet obrigatória");
  if (![0, 1, 2].includes(outcome)) throw new HttpError(400, "outcome deve ser 0, 1 ou 2");

  const market = findMarketRecord(marketId);
  const now = Math.floor(Date.now() / 1000);
  if (!market || market.status !== "open" || market.closeTs <= now) {
    throw new HttpError(409, "mercado fechado ou inexistente — escolha outro jogo");
  }

  const mine = picksOf(wallet);
  if (mine.some((p) => p.result === "eliminated")) {
    throw new HttpError(403, "você foi eliminado nesta temporada — acompanhe como espectador");
  }
  const round = roundOf(market.closeTs);
  if (mine.some((p) => p.round === round && p.result !== "void")) {
    throw new HttpError(409, "você já tem um pick nessa rodada");
  }

  const pick: SurvivorPick = {
    wallet,
    name,
    marketId,
    home: market.home,
    away: market.away,
    outcome,
    round,
    result: "pending",
    createdAt: Date.now(),
  };
  store.update((d) => d.picks.push(pick));
  return pick;
}

/** Ranking dos sobreviventes + contagem de vivos ("só restam N"). */
export function survivorLeaderboard(limit = 20) {
  syncSurvivor();
  const byWallet = new Map<string, { name?: string; survived: number; alive: boolean }>();
  for (const p of store.load().picks) {
    const e = byWallet.get(p.wallet) ?? { name: p.name, survived: 0, alive: true };
    if (p.name) e.name = p.name;
    if (p.result === "survived") e.survived += 1;
    if (p.result === "eliminated") e.alive = false;
    byWallet.set(p.wallet, e);
  }
  const all = [...byWallet.entries()].map(([wallet, e]) => ({
    wallet,
    name: e.name ?? null,
    survived: e.survived,
    alive: e.alive,
  }));
  return {
    totalPlayers: all.length,
    aliveCount: all.filter((e) => e.alive).length,
    top: all
      .sort((a, b) => Number(b.alive) - Number(a.alive) || b.survived - a.survived)
      .slice(0, limit)
      .map((e, i) => ({ rank: i + 1, ...e })),
  };
}

/** Mercados 1X2 abertos elegíveis pra pick (reusa a listagem on-chain). */
export async function listPickableMarkets() {
  syncSurvivor();
  return listMarkets();
}
