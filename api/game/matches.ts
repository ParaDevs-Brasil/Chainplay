import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getGameData } from "../../server/src/games/matches.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const data = await getGameData();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
