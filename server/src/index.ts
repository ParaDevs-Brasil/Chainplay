import cors from "cors";
import express from "express";
import { NETWORK, PORT } from "./config.js";
import { getGameData } from "./gameService.js";
import { loadCachedCredentials } from "./txlineAuth.js";

const app = express();
app.use(cors());

app.get("/api/game/status", (_req, res) => {
  const creds = loadCachedCredentials();
  res.json({
    network: NETWORK,
    txlineActivated: Boolean(creds),
    wallet: creds?.wallet ?? null,
    txSig: creds?.txSig ?? null,
  });
});

app.get("/api/game/matches", async (_req, res) => {
  try {
    const data = await getGameData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Hi-Lo Stats server em http://localhost:${PORT} (rede: ${NETWORK})`);
});
