import http from "node:http";
import { createApp } from "./app.js";
import { NETWORK, PORT } from "./config.js";
import { startCrons } from "./crons.js";
import { attachLiveHub } from "./realtime/liveHub.js";

const server = http.createServer(createApp());
const live = attachLiveHub(server);
const stopCrons = startCrons();

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[server] porta ${PORT} já está em uso — outro server rodando? ` +
        `Descubra com: ss -tlnp | grep :${PORT} (ou use PORT=outra no .env)`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`ChainPlay server em http://localhost:${PORT} (rede TxLINE: ${NETWORK})`);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} recebido — encerrando…`);
  stopCrons();
  live.close();
  server.close(() => process.exit(0));
  // não fica pendurado em conexões keep-alive
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
