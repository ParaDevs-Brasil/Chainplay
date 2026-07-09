export interface MatchStats {
  goals: [number, number];
  corners: [number, number];
  yellowCards: [number, number];
  redCards: [number, number];
  possession?: [number, number];
}

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

export type StatCategory = "goals" | "corners" | "yellowCards" | "possession";

export const CATEGORY_LABELS: Record<StatCategory, string> = {
  goals: "Gols na partida",
  corners: "Escanteios na partida",
  yellowCards: "Cartões amarelos",
  possession: "Posse de bola do mandante (%)",
};

// unidade curta para montar frases ("11 escanteios", "54% de posse")
export const CATEGORY_UNITS: Record<StatCategory, string> = {
  goals: "gols",
  corners: "escanteios",
  yellowCards: "cartões amarelos",
  possession: "% de posse",
};

export const CATEGORY_ICONS: Record<StatCategory, string> = {
  goals: "⚽",
  corners: "🚩",
  yellowCards: "🟨",
  possession: "⏱️",
};

export function statValue(match: GameMatch, category: StatCategory): number {
  switch (category) {
    case "goals":
      return match.stats.goals[0] + match.stats.goals[1];
    case "corners":
      return match.stats.corners[0] + match.stats.corners[1];
    case "yellowCards":
      return match.stats.yellowCards[0] + match.stats.yellowCards[1];
    case "possession":
      return match.stats.possession?.[0] ?? 50;
  }
}
