import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.js";
import { getCredentials } from "./txlineAuth.js";
import {
  createClient,
  extractStats,
  fetchFixtures,
  fetchScoresSnapshot,
  type Fixture,
  type MatchStats,
} from "./txlineData.js";
import { generateMockMatches } from "./mockData.js";

export interface GameMatch {
  fixtureId: number;
  competition: string;
  stage?: string;
  matchNumber: number;
  startTime: number;
  home: string;
  away: string;
  stats: MatchStats;
  finished: boolean;
}

export interface GameData {
  source: "txline" | "mock";
  network?: string;
  fetchedAt: number;
  matches: GameMatch[];
}

const CACHE_PATH = path.join(DATA_DIR, "matches-cache.json");
const CACHE_TTL_MS = 5 * 60 * 1000;

const FINISHED_STATES = new Set([5, 10, 13]); // F, FET, FPE

let memoryCache: GameData | null = null;

function isWorldCup(f: Fixture): boolean {
  return /world cup/i.test(f.Competition ?? "");
}

async function fetchFromTxline(): Promise<GameData> {
  const creds = await getCredentials();
  const client = createClient(creds);

  let fixtures = (await fetchFixtures(client)).filter(isWorldCup);
  fixtures.sort((a, b) => a.StartTime - b.StartTime);

  if (!fixtures.length) {
    throw new Error("Nenhum fixture da Copa do Mundo retornado pela TxLINE");
  }

  const now = Date.now();
  const started = fixtures.filter((f) => f.StartTime < now - 2 * 60 * 60 * 1000);

  const matches: GameMatch[] = [];
  // Busca sequencial com pequeno paralelismo para não estourar timeouts
  const CONCURRENCY = 5;
  for (let i = 0; i < started.length; i += CONCURRENCY) {
    const batch = started.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (f) => {
        const scores = await fetchScoresSnapshot(client, f.FixtureId);
        const stats = extractStats(scores);
        if (!stats) return null;
        const finished = stats.gameState != null && FINISHED_STATES.has(stats.gameState);
        const home = f.Participant1IsHome ? f.Participant1 : f.Participant2;
        const away = f.Participant1IsHome ? f.Participant2 : f.Participant1;
        const homeFirst = f.Participant1IsHome;
        const orient = <T,>(pair: [T, T]): [T, T] =>
          homeFirst ? pair : [pair[1], pair[0]];
        return {
          fixtureId: f.FixtureId,
          competition: f.Competition,
          matchNumber: 0,
          startTime: f.StartTime,
          home,
          away,
          stats: {
            ...stats,
            goals: orient(stats.goals),
            corners: orient(stats.corners),
            yellowCards: orient(stats.yellowCards),
            redCards: orient(stats.redCards),
            possession: stats.possession ? orient(stats.possession) : undefined,
          },
          finished,
        } satisfies GameMatch;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) matches.push(r.value);
    }
  }

  if (!matches.length) {
    throw new Error("Nenhuma partida com estatísticas disponíveis na TxLINE");
  }

  matches.forEach((m, i) => (m.matchNumber = i + 1));
  return {
    source: "txline",
    network: creds.network,
    fetchedAt: Date.now(),
    matches,
  };
}

export async function getGameData(): Promise<GameData> {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache;
  }

  try {
    const data = await fetchFromTxline();
    memoryCache = data;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data));
    return data;
  } catch (err) {
    console.warn(
      `[game] TxLINE indisponível (${(err as Error).message}) — usando fallback`
    );
  }

  // Fallback 1: último cache em disco vindo da TxLINE
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const cached: GameData = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
      if (cached.matches?.length) {
        memoryCache = { ...cached, fetchedAt: Date.now() };
        return memoryCache;
      }
    } catch {
      // cache corrompido, segue para o mock
    }
  }

  // Fallback 2: dataset simulado dos 104 jogos
  memoryCache = {
    source: "mock",
    fetchedAt: Date.now(),
    matches: generateMockMatches(),
  };
  return memoryCache;
}
