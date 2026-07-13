import fs from "node:fs";
import path from "node:path";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { DATA_DIR } from "../config.js";
import { getCredentials } from "../txline/auth.js";
import {
  createClient,
  extractStats,
  fetchFixtures,
  fetchScoresSnapshot,
  type Fixture,
} from "../txline/data.js";
import { generateMockMatches } from "../games/mock.js";
import {
  GAME,
  configPda,
  gameIdOrNone,
  getChain,
  marketPda,
  marketStateLabel,
  vaultPda,
} from "./client.js";

const STORE_PATH = path.join(DATA_DIR, "markets.json");

// Mercado 1X2: outcome 0 = casa, 1 = empate, 2 = visitante.
export const OUTCOME_HOME = 0;
export const OUTCOME_DRAW = 1;
export const OUTCOME_AWAY = 2;

const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000; // cria mercados até 7 dias antes do kickoff
const RESOLVE_GRACE_S = 2 * 60 * 60 + 30 * 60; // kickoff + 2h30 até liberar o resolve
const CANCEL_AFTER_S = 24 * 60 * 60; // sem resultado 24h após a janela → cancela

const FINISHED_STATES = new Set([5, 10, 13]); // F, FET, FPE (mesmo critério do gameService)

export interface MarketRecord {
  marketId: string;
  pda: string;
  fixtureId: number;
  home: string;
  away: string;
  participant1IsHome: boolean;
  game: "1x2";
  closeTs: number;
  resolveAfterTs: number;
  status: "open" | "resolved" | "voided";
  winningOutcome?: number;
  demo?: boolean;
  /** Placar pré-sorteado usado para liquidar mercados demo (sem feed real). */
  demoGoals?: [number, number];
  createdAt: number;
}

interface Store {
  markets: MarketRecord[];
}

let store: Store | null = null;

function loadStore(): Store {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    store = { markets: [] };
  }
  return store!;
}

function saveStore() {
  if (!store) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

const zeroOdds = () => Array(8).fill(new BN(0));

async function createParimutuelMarket(rec: Omit<MarketRecord, "pda" | "status" | "createdAt">) {
  const chain = getChain();
  if (!chain) throw new Error("chain desativada");
  const marketId = new BN(rec.marketId);
  const market = marketPda(marketId);
  await chain.program.methods
    .createMarket(
      marketId,
      new BN(rec.fixtureId),
      { parimutuel: {} },
      3,
      zeroOdds(),
      new BN(rec.closeTs),
      new BN(rec.resolveAfterTs),
      // mercados 1X2 = "Guess the Team" (palpite no vencedor da partida)
      await gameIdOrNone(chain.program, GAME.team)
    )
    .accounts({
      config: configPda(),
      market,
      vault: vaultPda(market),
      authority: chain.authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const full: MarketRecord = {
    ...rec,
    pda: market.toBase58(),
    status: "open",
    createdAt: Date.now(),
  };
  loadStore().markets.push(full);
  saveStore();
  console.log(
    `[markets] mercado 1X2 criado: ${rec.home} × ${rec.away} (market_id=${rec.marketId})`
  );
  return full;
}

function isWorldCup(f: Fixture): boolean {
  return /world cup/i.test(f.Competition ?? "");
}

// Cooldown pra não tentar reativar a TxLINE (que envolve airdrop + tx on-chain)
// a cada ciclo do cron quando ela está indisponível.
let txlineFailedAt = 0;
const TXLINE_RETRY_MS = 10 * 60 * 1000;

async function fetchUpcomingFixtures(): Promise<Fixture[] | null> {
  if (Date.now() - txlineFailedAt < TXLINE_RETRY_MS) return null;
  try {
    const creds = await getCredentials();
    const client = createClient(creds);
    const now = Date.now();
    return (await fetchFixtures(client))
      .filter(isWorldCup)
      .filter((f) => f.StartTime > now && f.StartTime < now + LOOKAHEAD_MS)
      .sort((a, b) => a.StartTime - b.StartTime);
  } catch (err) {
    txlineFailedAt = Date.now();
    console.warn(`[markets] TxLINE indisponível para fixtures: ${(err as Error).message}`);
    return null;
  }
}

/** IDs de fixtures demo ficam num namespace alto pra nunca colidir com os reais. */
const DEMO_FIXTURE_BASE = 900_000_000;
const DEMO_OPEN_TARGET = 3;
const DEMO_CLOSE_MIN = [10, 20, 30]; // minutos até o lock de cada mercado demo

/**
 * Sem feed de fixtures futuras (fora da janela da Copa ou TxLINE fora do ar),
 * mantém N mercados demo abertos usando confrontos do dataset mock — mesma UX,
 * liquidação com placar pré-sorteado.
 */
async function ensureDemoMarkets() {
  const s = loadStore();
  const openDemos = s.markets.filter((m) => m.demo && m.status === "open");
  if (openDemos.length >= DEMO_OPEN_TARGET) return;

  const mock = generateMockMatches();
  const now = Math.floor(Date.now() / 1000);
  for (let i = openDemos.length; i < DEMO_OPEN_TARGET; i++) {
    const pick = mock[Math.floor(Math.random() * mock.length)];
    const fixtureId = DEMO_FIXTURE_BASE + (Date.now() % 1_000_000) * 10 + i;
    const closeTs = now + DEMO_CLOSE_MIN[i % DEMO_CLOSE_MIN.length] * 60;
    try {
      await createParimutuelMarket({
        marketId: String(fixtureId),
        fixtureId,
        home: pick.home,
        away: pick.away,
        participant1IsHome: true,
        game: "1x2",
        closeTs,
        resolveAfterTs: closeTs + 60, // demo liquida 1min após o lock
        demo: true,
        demoGoals: pick.stats.goals,
      });
    } catch (err) {
      console.warn(`[markets] falha criando mercado demo: ${(err as Error).message}`);
      return; // sem saldo/RPC fora — tenta no próximo ciclo
    }
  }
}

/** Com o feed real de volta, mercados demo abertos são cancelados on-chain
 *  (viram Voided: quem apostou recupera o stake líquido via claim). */
async function cancelOpenDemoMarkets() {
  const chain = getChain();
  if (!chain) return;
  const s = loadStore();
  for (const rec of s.markets.filter((m) => m.demo && m.status === "open")) {
    try {
      await chain.program.methods
        .cancelMarket()
        .accounts({
          config: configPda(),
          market: marketPda(new BN(rec.marketId)),
          authority: chain.authority.publicKey,
        })
        .rpc();
      rec.status = "voided";
      console.log(`[markets] mercado demo cancelado (feed real ativo): ${rec.home} × ${rec.away}`);
    } catch (err) {
      console.warn(`[markets] falha cancelando demo ${rec.marketId}: ${(err as Error).message}`);
    }
  }
  saveStore();
}

/** Cron: garante 1 mercado 1X2 aberto por fixture futura da Copa (feed real).
 *  Mercados demo só existem se DEMO_MARKETS=1 e o feed estiver fora. */
export async function syncMarkets() {
  if (!getChain()) return;
  const s = loadStore();
  const fixtures = await fetchUpcomingFixtures();

  if (!fixtures || !fixtures.length) {
    if (process.env.DEMO_MARKETS === "1") await ensureDemoMarkets();
    return;
  }

  await cancelOpenDemoMarkets();

  for (const f of fixtures) {
    if (s.markets.some((m) => m.fixtureId === f.FixtureId && !m.demo)) continue;
    const home = f.Participant1IsHome ? f.Participant1 : f.Participant2;
    const away = f.Participant1IsHome ? f.Participant2 : f.Participant1;
    const closeTs = Math.floor(f.StartTime / 1000);
    try {
      await createParimutuelMarket({
        marketId: String(f.FixtureId),
        fixtureId: f.FixtureId,
        home,
        away,
        participant1IsHome: f.Participant1IsHome,
        game: "1x2",
        closeTs,
        resolveAfterTs: closeTs + RESOLVE_GRACE_S,
      });
    } catch (err) {
      console.warn(
        `[markets] falha criando mercado do fixture ${f.FixtureId}: ${(err as Error).message}`
      );
    }
  }
}

function winnerFromGoals(home: number, away: number): number {
  if (home > away) return OUTCOME_HOME;
  if (home < away) return OUTCOME_AWAY;
  return OUTCOME_DRAW;
}

async function fetchFinalGoals(rec: MarketRecord): Promise<[number, number] | null> {
  if (rec.demo) return rec.demoGoals ?? [1, 0];
  try {
    const creds = await getCredentials();
    const client = createClient(creds);
    const stats = extractStats(await fetchScoresSnapshot(client, rec.fixtureId));
    if (!stats || stats.gameState == null || !FINISHED_STATES.has(stats.gameState)) {
      return null; // ainda não terminou de verdade
    }
    return rec.participant1IsHome
      ? stats.goals
      : [stats.goals[1], stats.goals[0]];
  } catch {
    return null;
  }
}

/** Cron: resolve mercados cuja janela abriu; cancela os que ficaram órfãos de resultado. */
export async function settleFixtureMarkets() {
  const chain = getChain();
  if (!chain) return;
  const s = loadStore();
  const now = Math.floor(Date.now() / 1000);

  for (const rec of s.markets.filter((m) => m.status === "open" && now >= m.resolveAfterTs)) {
    const goals = await fetchFinalGoals(rec);
    try {
      if (goals) {
        const winning = winnerFromGoals(goals[0], goals[1]);
        await chain.program.methods
          .resolveMarket(winning)
          .accounts({
            config: configPda(),
            market: marketPda(new BN(rec.marketId)),
            authority: chain.authority.publicKey,
          })
          .rpc();
        // On-chain o mercado pode virar Voided (parimutuel sem vencedores).
        const onchain: any = await (chain.program.account as any).market.fetch(
          marketPda(new BN(rec.marketId))
        );
        rec.status = marketStateLabel(onchain.state);
        rec.winningOutcome = winning;
        console.log(
          `[markets] resolvido ${rec.home} ${goals[0]}×${goals[1]} ${rec.away} → outcome ${winning} (${rec.status})`
        );
      } else if (now > rec.resolveAfterTs + CANCEL_AFTER_S) {
        await chain.program.methods
          .cancelMarket()
          .accounts({
            config: configPda(),
            market: marketPda(new BN(rec.marketId)),
            authority: chain.authority.publicKey,
          })
          .rpc();
        rec.status = "voided";
        console.log(`[markets] cancelado (sem resultado): market_id=${rec.marketId}`);
      }
      saveStore();
    } catch (err) {
      console.warn(
        `[markets] falha liquidando market_id=${rec.marketId}: ${(err as Error).message}`
      );
    }
  }
}

export interface MarketView extends MarketRecord {
  pools: number[];
  totalPool: number;
  /** % do pote por outcome (consenso da comunidade). */
  poolPct: number[];
  secondsToClose: number;
}

/** Mercados para o client: só jogos que ainda não começaram (feed em tempo
 *  real), lock mais próximo primeiro. Mercados demo só com DEMO_MARKETS=1;
 *  liquidados/anulados não aparecem aqui — resgate fica no Claim Center. */
export async function listMarkets(): Promise<MarketView[]> {
  const chain = getChain();
  const s = loadStore();
  const now = Math.floor(Date.now() / 1000);
  const recent = s.markets
    .filter(
      (m) =>
        m.status === "open" &&
        m.closeTs > now &&
        (!m.demo || process.env.DEMO_MARKETS === "1")
    )
    .sort((a, b) => a.closeTs - b.closeTs);
  if (!chain || !recent.length) {
    return recent.map((m) => ({
      ...m,
      pools: [0, 0, 0],
      totalPool: 0,
      poolPct: [0, 0, 0],
      secondsToClose: Math.max(0, m.closeTs - now),
    }));
  }

  const accounts: any[] = await (chain.program.account as any).market.fetchMultiple(
    recent.map((m) => marketPda(new BN(m.marketId)))
  );
  return recent.map((m, i) => {
    const acc = accounts[i];
    const pools: number[] = acc
      ? acc.pools.slice(0, 3).map((p: BN) => p.toNumber())
      : [0, 0, 0];
    const totalPool = pools.reduce((a, b) => a + b, 0);
    return {
      ...m,
      status: acc ? marketStateLabel(acc.state) : m.status,
      winningOutcome: acc?.state?.resolved ? acc.winningOutcome : m.winningOutcome,
      pools,
      totalPool,
      poolPct: pools.map((p) => (totalPool ? Math.round((p / totalPool) * 100) : 0)),
      secondsToClose: Math.max(0, m.closeTs - now),
    };
  });
}

export function findMarketRecord(marketId: string): MarketRecord | undefined {
  return loadStore().markets.find((m) => m.marketId === marketId);
}
