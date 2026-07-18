import { Router } from "express";
import { CHAIN_RPC_URL, PROGRAM_ID, getChain } from "../../chain/client.js";
import { NETWORK } from "../../config.js";
import { getGameData } from "../../games/matches.js";
import { loadCachedCredentials } from "../../txline/auth.js";
import { asyncHandler } from "../errors.js";

export const gameRoutes = Router();

gameRoutes.get("/status", (_req, res) => {
  const creds = loadCachedCredentials();
  res.json({
    network: NETWORK,
    txlineActivated: Boolean(creds),
    wallet: creds?.wallet ?? null,
    txSig: creds?.txSig ?? null,
    chain: {
      enabled: Boolean(getChain()),
      programId: PROGRAM_ID.toBase58(),
      rpcUrl: CHAIN_RPC_URL,
    },
  });
});

gameRoutes.get(
  "/matches",
  asyncHandler(async (_req, res) => {
    res.json(await getGameData());
  })
);
