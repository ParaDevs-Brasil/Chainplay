import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { getGameData, type GameData, type GameMatch } from "../games/matches.js";

/**
 * Real-time das partidas: a TxLINE (free tier) expõe snapshots REST, então o
 * hub faz poll no servidor e empurra só os deltas por WebSocket — o client
 * abre `ws://…/ws/live` e recebe:
 *   { type: "snapshot", …GameData }                    ao conectar
 *   { type: "update", matches: [só as que mudaram] }   a cada mudança
 * Heartbeat ping/pong derruba conexões mortas; sem clients não há poll.
 */

const POLL_INTERVAL_MS = 45_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface LiveSocket extends WebSocket {
  alive?: boolean;
}

export interface LiveHub {
  clientCount(): number;
  close(): void;
}

export function attachLiveHub(server: Server): LiveHub {
  const wss = new WebSocketServer({ server, path: "/ws/live" });
  // o ws re-emite erros do http.Server (ex.: EADDRINUSE) — sem handler o
  // processo morre com throw dentro do EventEmitter; quem decide é o index.ts
  wss.on("error", (err) => console.error(`[live] ${err.message}`));
  let last: GameData | null = null;

  const send = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const broadcast = (msg: unknown) => {
    const payload = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  };

  const diffMatches = (prev: GameData | null, next: GameData): GameMatch[] => {
    if (!prev) return next.matches;
    const before = new Map(prev.matches.map((m) => [m.fixtureId, JSON.stringify(m)]));
    return next.matches.filter((m) => before.get(m.fixtureId) !== JSON.stringify(m));
  };

  wss.on("connection", async (ws: LiveSocket) => {
    ws.alive = true;
    ws.on("pong", () => {
      ws.alive = true;
    });
    ws.on("error", () => ws.terminate());
    try {
      const data = await getGameData();
      last ??= data;
      send(ws, { type: "snapshot", ...data });
    } catch (err) {
      send(ws, { type: "error", error: (err as Error).message });
    }
  });

  const poll = setInterval(async () => {
    if (!wss.clients.size) return; // ninguém ouvindo — não gasta TxLINE
    try {
      const data = await getGameData({ maxAgeMs: POLL_INTERVAL_MS - 5_000 });
      const changed = diffMatches(last, data);
      last = data;
      if (changed.length) {
        broadcast({
          type: "update",
          source: data.source,
          fetchedAt: data.fetchedAt,
          matches: changed,
        });
      }
    } catch (err) {
      console.warn(`[live] poll falhou: ${(err as Error).message}`);
    }
  }, POLL_INTERVAL_MS);

  const heartbeat = setInterval(() => {
    for (const client of wss.clients as Set<LiveSocket>) {
      if (client.alive === false) {
        client.terminate();
        continue;
      }
      client.alive = false;
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log("[live] hub WebSocket em /ws/live");

  return {
    clientCount: () => wss.clients.size,
    close() {
      clearInterval(poll);
      clearInterval(heartbeat);
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}
