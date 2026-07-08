import axios, { AxiosInstance } from "axios";
import { apiOrigin } from "./config.js";
import type { TxlineCredentials } from "./txlineAuth.js";

export interface Fixture {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
}

export function createClient(creds: TxlineCredentials): AxiosInstance {
  return axios.create({
    baseURL: apiOrigin,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.jwt}`,
      "X-Api-Token": creds.apiToken,
    },
  });
}

export async function fetchFixtures(
  client: AxiosInstance,
  competitionId?: number
): Promise<Fixture[]> {
  const res = await client.get("/api/fixtures/snapshot", {
    params: competitionId ? { competitionId } : {},
  });
  return res.data ?? [];
}

export async function fetchScoresSnapshot(
  client: AxiosInstance,
  fixtureId: number
): Promise<any[]> {
  const res = await client.get(`/api/scores/snapshot/${fixtureId}`);
  return res.data ?? [];
}

// Chaves de stats do feed de futebol: (period * 1000) + base_key
// base 1/2 = gols P1/P2, 3/4 = amarelos, 5/6 = vermelhos, 7/8 = escanteios
const STAT_KEYS = {
  goals: [1, 2],
  yellowCards: [3, 4],
  redCards: [5, 6],
  corners: [7, 8],
} as const;

export interface MatchStats {
  goals: [number, number];
  corners: [number, number];
  yellowCards: [number, number];
  redCards: [number, number];
  possession?: [number, number];
  gameState?: number;
}

function readStat(stats: Record<string, unknown>, key: number): number | null {
  const raw = stats[String(key)] ?? stats[key as unknown as string];
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrai as estatísticas finais a partir da última mensagem de scores do feed.
 * O payload aninha objetos por esporte; procuramos de forma tolerante por um
 * mapa `stats` (chaves numéricas do encoding) e por `possession`.
 */
export function extractStats(scoreMessages: any[]): MatchStats | null {
  if (!scoreMessages.length) return null;

  const last = [...scoreMessages].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).at(-1);

  const findNested = (obj: any, field: string): any => {
    if (obj == null || typeof obj !== "object") return null;
    if (obj[field] && typeof obj[field] === "object") return obj[field];
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        const found = findNested(value, field);
        if (found) return found;
      }
    }
    return null;
  };

  const statsMap = findNested(last, "stats");
  if (!statsMap) return null;

  const pair = (keys: readonly [number, number]): [number, number] => [
    readStat(statsMap, keys[0]) ?? 0,
    readStat(statsMap, keys[1]) ?? 0,
  ];

  const result: MatchStats = {
    goals: pair(STAT_KEYS.goals),
    corners: pair(STAT_KEYS.corners),
    yellowCards: pair(STAT_KEYS.yellowCards),
    redCards: pair(STAT_KEYS.redCards),
    gameState: findNested(last, "clock")?.statusId ?? last?.gameState,
  };

  const possession = findNested(last, "possession");
  if (possession) {
    const p1 = Number(possession.participant1 ?? possession.p1 ?? possession["1"]);
    const p2 = Number(possession.participant2 ?? possession.p2 ?? possession["2"]);
    if (Number.isFinite(p1) && Number.isFinite(p2)) {
      result.possession = [p1, p2];
    }
  }

  return result;
}
