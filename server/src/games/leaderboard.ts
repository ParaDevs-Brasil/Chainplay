import { JsonFileStore } from "../store/jsonFile.js";

/**
 * Ranking off-chain compartilhado pelos mini games (pontos por proximidade,
 * arcade, quiz). O dinheiro fica on-chain; aqui só vive a camada free-to-play
 * de aquisição/retenção do plano (docs/plano-minigames.md, transversal).
 */

export type LeaderGame = "stats" | "penalty" | "live" | "quiz";

export interface LeaderEntry {
  wallet: string;
  name?: string;
  points: number;
  plays: number;
  /** melhor pontuação numa jogada única */
  best: number;
  updatedAt: number;
}

interface Data {
  boards: Partial<Record<LeaderGame, LeaderEntry[]>>;
}

const store = new JsonFileStore<Data>("leaderboards.json", () => ({ boards: {} }));

export function addPoints(
  game: LeaderGame,
  wallet: string,
  points: number,
  name?: string
): LeaderEntry {
  return store.update((data) => {
    const board = (data.boards[game] ??= []);
    let entry = board.find((e) => e.wallet === wallet);
    if (!entry) {
      entry = { wallet, points: 0, plays: 0, best: 0, updatedAt: 0 };
      board.push(entry);
    }
    // nome vem do body de jogos grátis (sem sessão): limita a 24 chars pra não
    // inflar o store/leaderboard nem quebrar o layout (React já escapa o HTML)
    if (name) entry.name = String(name).slice(0, 24);
    entry.points += Math.max(0, Math.round(points));
    entry.plays += 1;
    entry.best = Math.max(entry.best, Math.round(points));
    entry.updatedAt = Date.now();
    return entry;
  });
}

/** Entrada de uma wallet num board (ou null) — usado pra elegibilidade de badge. */
export function boardEntry(game: LeaderGame, wallet: string): LeaderEntry | null {
  return store.load().boards[game]?.find((e) => e.wallet === wallet) ?? null;
}

export function topBoard(game: LeaderGame, limit = 20) {
  const board = store.load().boards[game] ?? [];
  return [...board]
    .sort((a, b) => b.points - a.points || a.updatedAt - b.updatedAt)
    .slice(0, limit)
    .map((e, i) => ({
      rank: i + 1,
      wallet: e.wallet,
      name: e.name ?? null,
      points: e.points,
      plays: e.plays,
      best: e.best,
    }));
}
