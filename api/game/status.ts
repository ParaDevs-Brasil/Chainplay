import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NETWORK } from "../../server/src/config.js";
import { loadCachedCredentials } from "../../server/src/txline/auth.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const creds = loadCachedCredentials();
  res.status(200).json({
    network: NETWORK,
    txlineActivated: Boolean(creds),
    wallet: creds?.wallet ?? null,
    txSig: creds?.txSig ?? null,
  });
}
