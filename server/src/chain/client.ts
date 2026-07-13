import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

// O programa oddies-bet vive na devnet independente da rede da TxLINE.
export const CHAIN_RPC_URL =
  process.env.CHAIN_RPC_URL || "https://api.devnet.solana.com";

const IDL_PATH = new URL("../../idl/oddies_bet.json", import.meta.url);
export const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const PROGRAM_ID = new PublicKey(idl.address);

/**
 * Authority do programa (config.authority): cria mercados, resolve e funda a casa.
 * Ordem: env AUTHORITY_KEYPAIR (array JSON) → AUTHORITY_KEYPAIR_PATH →
 * program/keys/devnet-deploy-wallet.json (fonte da verdade em keys_contract.md).
 */
function loadAuthority(): Keypair | null {
  if (process.env.AUTHORITY_KEYPAIR) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.AUTHORITY_KEYPAIR))
    );
  }
  const candidates = [
    process.env.AUTHORITY_KEYPAIR_PATH,
    new URL("../../../program/keys/devnet-deploy-wallet.json", import.meta.url)
      .pathname,
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")))
      );
    }
  }
  return null;
}

export interface Chain {
  connection: Connection;
  authority: Keypair;
  program: Program;
}

let chain: Chain | null | undefined;

/** null = sem keypair da authority: endpoints on-chain respondem 503. */
export function getChain(): Chain | null {
  if (chain !== undefined) return chain;
  const authority = loadAuthority();
  if (!authority) {
    console.warn(
      "[chain] authority keypair não encontrada — funcionalidades on-chain desativadas"
    );
    chain = null;
    return chain;
  }
  const connection = new Connection(CHAIN_RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(authority),
    { commitment: "confirmed" }
  );
  const program = new Program(idl as anchor.Idl, provider);
  console.log(
    `[chain] programa ${PROGRAM_ID.toBase58()} · authority ${authority.publicKey.toBase58()} · ${CHAIN_RPC_URL}`
  );
  chain = { connection, authority, program };
  return chain;
}

export const configPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

export const marketPda = (marketId: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];

export const vaultPda = (market: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID
  )[0];

export const betPda = (market: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  )[0];

export const BPS = 10_000;

// ---------------------------------------------------------------------------
// Identidade dos jogos: uma Collection NFT por jogo (arte em NFTs/). O
// `game_id` vai no create_market; os tickets de aposta entram na coleção do
// jogo via place_bet. GAME_NONE = mercado sem coleção.
// ---------------------------------------------------------------------------
export const GAME_NONE = 255;

export interface GameDef {
  id: number;
  slug: string; // arquivo da arte/metadata (NFTs/<slug>.png|json)
  name: string; // nome da NFT (≤ 32 chars)
  symbol: string; // símbolo da NFT (≤ 10 chars)
}

/** Registro canônico dos 7 jogos — precisa casar com GAME_COUNT no contrato. */
export const GAMES: GameDef[] = [
  { id: 0, slug: "hi-lo", name: "Hi-Lo", symbol: "HILO" },
  { id: 1, slug: "infinite-hi-lo", name: "Infinite Hi-Lo", symbol: "IHILO" },
  { id: 2, slug: "penalty-predictor", name: "Penalty Predictor", symbol: "PENA" },
  { id: 3, slug: "survivor", name: "Survivor", symbol: "SURV" },
  { id: 4, slug: "guess-the-stats", name: "Guess the Stats", symbol: "STATS" },
  { id: 5, slug: "guess-the-team", name: "Guess the Team", symbol: "TEAM" },
  { id: 6, slug: "live-challenge", name: "Live Challenge", symbol: "LIVE" },
];

/** Atalhos por nome para os call sites do backend não usarem número mágico. */
export const GAME = {
  hilo: 0,
  infinite: 1,
  penalty: 2,
  survivor: 3,
  stats: 4,
  team: 5,
  live: 6,
} as const;

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export const metadataPda = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];

export const masterEditionPda = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];

export const gameCollectionPda = (gameId: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("game_collection"), Buffer.from([gameId])],
    PROGRAM_ID
  )[0];

export const collectionAuthorityPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("collection_authority")], PROGRAM_ID)[0];

const collectionReadyCache = new Map<number, boolean>();
/**
 * Retorna `gameId` se a coleção desse jogo já existe on-chain, senão GAME_NONE.
 * Usado no create_market: enquanto as coleções não foram deployadas, os mercados
 * saem sem coleção (apostas seguem funcionando, tickets sem marca) — o contrato
 * exige as contas da coleção só quando game_id != GAME_NONE.
 */
export async function gameIdOrNone(program: Program, gameId: number): Promise<number> {
  if (collectionReadyCache.get(gameId)) return gameId;
  const gc = gameCollectionPda(gameId);
  const acc = await (program.account as any).gameCollection
    .fetchNullable(gc)
    .catch(() => null);
  if (acc) {
    collectionReadyCache.set(gameId, true);
    return gameId;
  }
  return GAME_NONE;
}

/**
 * Monta as contas opcionais de coleção do place_bet a partir do game_id do
 * mercado. GAME_NONE (ou coleção ainda não criada) → todas null (o ticket sai
 * sem coleção, sem quebrar a aposta).
 */
export async function collectionAccounts(
  program: Program,
  gameId: number,
  ticketMint: PublicKey
) {
  // contas opcionais: omitidas quando não há coleção (place_bet as ignora)
  const none: Record<string, PublicKey> = {};
  if (gameId === GAME_NONE || gameId == null) return none;
  const gc = gameCollectionPda(gameId);
  const gcAcc: any = await (program.account as any).gameCollection
    .fetchNullable(gc)
    .catch(() => null);
  if (!gcAcc) return none; // coleção ainda não deployada: degrada pra sem-coleção
  const collectionMint: PublicKey = gcAcc.collectionMint;
  return {
    gameCollection: gc,
    ticketMetadata: metadataPda(ticketMint),
    collectionMint,
    collectionMetadata: metadataPda(collectionMint),
    collectionMasterEdition: masterEditionPda(collectionMint),
    collectionAuthority: collectionAuthorityPda(),
    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
  };
}

export function marketStateLabel(state: any): "open" | "resolved" | "voided" {
  if (state?.resolved) return "resolved";
  if (state?.voided) return "voided";
  return "open";
}
