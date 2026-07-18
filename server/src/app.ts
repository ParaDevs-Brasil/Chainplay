import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cors from "cors";
import express from "express";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { corsOptions, rateLimiter, securityHeaders } from "./http/security.js";
import { arcadeRoutes } from "./http/routes/arcade.routes.js";
import { authRoutes } from "./http/routes/auth.routes.js";
import { custodialRoutes } from "./http/routes/custodial.routes.js";
import { gameRoutes } from "./http/routes/game.routes.js";
import { marketsRoutes } from "./http/routes/markets.routes.js";
import { nftRoutes } from "./http/routes/nft.routes.js";
import { quizRoutes } from "./http/routes/quiz.routes.js";
import { rpcRoutes } from "./http/routes/rpc.routes.js";
import { runsRoutes } from "./http/routes/runs.routes.js";
import { statsRoutes } from "./http/routes/stats.routes.js";
import { survivorRoutes } from "./http/routes/survivor.routes.js";
import { ticketsRoutes } from "./http/routes/tickets.routes.js";

export function createApp(): express.Express {
  const app = express();
  // atrás de proxy (Vercel/nginx): confia no X-Forwarded-For pro rate limit por IP
  app.set("trust proxy", 1);
  // não anuncia o framework (reduz fingerprinting da stack)
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(cors(corsOptions()));
  app.use(rateLimiter());
  // cast: @types/compression referencia outra cópia do express-serve-static-core
  app.use(compression() as unknown as express.RequestHandler);
  app.use(express.json({ limit: "64kb" }));

  app.use("/api/game", gameRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/custodial", custodialRoutes);
  app.use("/api/markets", marketsRoutes);
  app.use("/api/tickets", ticketsRoutes);
  app.use("/api/runs", runsRoutes);
  app.use("/api/stats", statsRoutes);
  app.use("/api/survivor", survivorRoutes);
  app.use("/api/arcade", arcadeRoutes);
  app.use("/api/quiz", quizRoutes);
  // JSON-RPC same-origin: o browser não fala direto com o RPC público (CORS/429)
  app.use("/api/rpc", rpcRoutes);
  // arte + metadata Metaplex das NFTs de identidade dos jogos
  app.use("/nft", nftRoutes);

  // Produção: serve o SPA buildado na mesma origem (sem CORS entre front e API,
  // e a assinatura on-chain sai pelo proxy /api/rpc same-origin). Em dev o app
  // roda no Vite (5173) com proxy /api; aqui só entra se o build existir.
  serveClient(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

/** Serve o build estático do client + fallback do SPA. No-op se não houver
 *  build (dev puro): aí a API sobe sozinha e o Vite serve o front. */
function serveClient(app: express.Express) {
  const indexHtml = path.join(CLIENT_DIST, "index.html");
  if (!fs.existsSync(indexHtml)) {
    console.warn(
      `[server] client/dist ausente — servindo só a API. Rode 'npm run build' pra servir o front junto.`
    );
    return;
  }
  // assets têm hash no nome (cache longo); o index.html não pode cachear
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
      },
    })
  );
  // fallback do SPA: GET que não seja /api|/nft e aceite HTML → index.html
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/nft")) return next();
    if (!req.accepts("html")) return next();
    res.sendFile(indexHtml);
  });
  console.log("[server] servindo client/dist na mesma origem");
}
