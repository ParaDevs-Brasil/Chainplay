import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { GAME, GAMES } from "../../chain/client.js";
import { badgeOf, mintGameBadge } from "../../chain/badges.js";
import { boardEntry } from "../../games/leaderboard.js";
import { userAddress } from "../../auth/store.js";
import { HttpError, asyncHandler } from "../errors.js";
import { requireChain, requireSession, type AuthedRequest } from "../middleware.js";

/**
 * Hospeda a identidade das NFTs de jogo: a arte (PNG) e o metadata JSON
 * (padrão Metaplex) que a Collection NFT de cada jogo referencia por URI.
 * Servido pelo próprio backend — é o "host público" das imagens (sem depender
 * de Arweave/IPFS externo pro escopo do hackathon).
 *
 * URLs:
 *   GET /nft/<slug>.png   → arte do jogo
 *   GET /nft/<slug>.json  → metadata Metaplex (name/symbol/image/attributes)
 */

const ASSET_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../assets/nft"
);

/** Base pública onde o server é servido — vai dentro do metadata (image URL). */
export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
}

const bySlug = new Map(GAMES.map((g) => [g.slug, g]));

export const nftRoutes = Router();

/**
 * Badges resgatáveis: jogos sem aposta on-chain, onde a identidade-NFT é
 * emitida pelo server quando o jogador cumpre o critério. Por ora só o Live
 * Challenge (>= 1 acerto no leaderboard); os demais jogos emitem a identidade
 * junto do ticket de aposta no place_bet.
 */
const CLAIMABLE_BADGES: Record<string, { gameId: number; eligible: (wallet: string) => boolean }> =
  {
    live: {
      gameId: GAME.live,
      eligible: (wallet) => (boardEntry("live", wallet)?.points ?? 0) > 0,
    },
  };

function claimableBadge(game: string) {
  const def = CLAIMABLE_BADGES[game];
  if (!def) throw new HttpError(404, "esse jogo não tem badge resgatável");
  return def;
}

/** Status do badge da sessão: elegibilidade + emissão. */
nftRoutes.get(
  "/badge/:game",
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const def = claimableBadge(req.params.game);
    const wallet = userAddress(user);
    const badge = badgeOf(wallet, def.gameId);
    res.json({
      game: req.params.game,
      eligible: def.eligible(wallet),
      minted: Boolean(badge),
      badge,
    });
  })
);

/** Resgata o badge do jogo pra wallet da sessão (1 por wallet por jogo). */
nftRoutes.post(
  "/badge/:game/claim",
  requireChain,
  requireSession,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthedRequest;
    const def = claimableBadge(req.params.game);
    const wallet = userAddress(user);
    if (!def.eligible(wallet)) {
      throw new HttpError(403, "complete um desafio do jogo primeiro para resgatar o badge");
    }
    res.json({ badge: await mintGameBadge(wallet, def.gameId) });
  })
);

nftRoutes.get("/:file", (req, res) => {
  const file = req.params.file;
  const dot = file.lastIndexOf(".");
  const slug = dot >= 0 ? file.slice(0, dot) : file;
  const ext = dot >= 0 ? file.slice(dot + 1) : "";
  const game = bySlug.get(slug);
  if (!game) throw new HttpError(404, "NFT desconhecida");

  if (ext === "png") {
    // sem path traversal: o nome vem do slug validado no registry
    res.sendFile(path.join(ASSET_DIR, `${game.slug}.png`));
    return;
  }
  if (ext === "json") {
    const base = publicBaseUrl();
    res.json({
      name: game.name,
      symbol: game.symbol,
      description: `Identidade on-chain do mini game "${game.name}" no ChainPlay — cada aposta vira uma NFT membro desta coleção.`,
      image: `${base}/nft/${game.slug}.png`,
      external_url: base,
      attributes: [{ trait_type: "game", value: game.name }],
      properties: {
        category: "image",
        files: [{ uri: `${base}/nft/${game.slug}.png`, type: "image/png" }],
      },
    });
    return;
  }
  throw new HttpError(404, "formato não suportado (use .png ou .json)");
});
