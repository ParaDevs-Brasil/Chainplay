import compression from "compression";
import cors from "cors";
import express from "express";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { arcadeRoutes } from "./http/routes/arcade.routes.js";
import { authRoutes } from "./http/routes/auth.routes.js";
import { custodialRoutes } from "./http/routes/custodial.routes.js";
import { gameRoutes } from "./http/routes/game.routes.js";
import { marketsRoutes } from "./http/routes/markets.routes.js";
import { nftRoutes } from "./http/routes/nft.routes.js";
import { quizRoutes } from "./http/routes/quiz.routes.js";
import { runsRoutes } from "./http/routes/runs.routes.js";
import { statsRoutes } from "./http/routes/stats.routes.js";
import { survivorRoutes } from "./http/routes/survivor.routes.js";
import { ticketsRoutes } from "./http/routes/tickets.routes.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  // cast: @types/compression referencia outra cópia do express-serve-static-core
  app.use(compression() as unknown as express.RequestHandler);
  app.use(express.json());

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
  // arte + metadata Metaplex das NFTs de identidade dos jogos
  app.use("/nft", nftRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
