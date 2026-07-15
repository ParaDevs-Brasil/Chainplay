import { getChain } from "./chain/client.js";
import { settleFixtureMarkets, syncMarkets } from "./chain/markets.js";
import { settleRuns } from "./chain/runs.js";
import { liveSession } from "./games/liveSession.js";
import { settlePenaltySessions } from "./games/penaltySession.js";
import { syncStatsGame } from "./games/stats.js";
import { syncSurvivor } from "./games/survivor.js";
import { teamSession } from "./games/teamSession.js";

/**
 * Crons on-chain (só no server standalone — na Vercel não há processo
 * residente): sincroniza mercados com os fixtures e liquida runs/mercados.
 */

const SYNC_INTERVAL_MS = 60_000;
const SETTLE_INTERVAL_MS = 15_000;

export function startCrons(): () => void {
  if (process.env.VERCEL || !getChain()) return () => {};

  let syncing = false;
  let settling = false;

  const sync = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      await syncMarkets();
    } finally {
      syncing = false;
    }
  }, SYNC_INTERVAL_MS);

  const settle = setInterval(async () => {
    if (settling) return;
    settling = true;
    try {
      await settleRuns();
      await settleFixtureMarkets();
      await settlePenaltySessions();
      await liveSession.settle();
      await teamSession.settle();
      // off-chain e baratos: liquida palpites de stats e picks do survivor
      await syncStatsGame();
      syncSurvivor();
    } finally {
      settling = false;
    }
  }, SETTLE_INTERVAL_MS);

  // primeira sincronização logo na subida
  syncMarkets().catch((e) => console.warn(`[markets] sync inicial: ${e.message}`));

  return () => {
    clearInterval(sync);
    clearInterval(settle);
  };
}
