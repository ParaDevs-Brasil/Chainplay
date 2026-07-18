import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { HttpError } from "../http/errors.js";
import { JsonFileStore } from "../store/jsonFile.js";
import {
  collectionAuthorityPda,
  configPda,
  gameCollectionPda,
  getChain,
  masterEditionPda,
  metadataPda,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./client.js";

/**
 * Badges de identidade dos jogos sem aposta on-chain (ex.: Live Challenge):
 * o server (authority) emite um NFT supply-1 membro da Collection NFT do jogo
 * direto pra wallet do jogador via `mint_game_badge`. Um badge por wallet por
 * jogo — o rent sai da authority, então o dedupe aqui também é proteção de
 * fundos (sem ele, farmear badges drenaria a carteira do server).
 */

export interface BadgeRecord {
  wallet: string;
  gameId: number;
  mint: string;
  signature: string;
  mintedAt: number;
}

interface Data {
  badges: BadgeRecord[];
}

const store = new JsonFileStore<Data>("badges.json", () => ({ badges: [] }));

export function badgeOf(wallet: string, gameId: number): BadgeRecord | null {
  return (
    store.load().badges.find((b) => b.wallet === wallet && b.gameId === gameId) ?? null
  );
}

export async function mintGameBadge(wallet: string, gameId: number): Promise<BadgeRecord> {
  const chain = getChain();
  if (!chain) throw new HttpError(503, "on-chain desativado no server (authority ausente)");

  const existing = badgeOf(wallet, gameId);
  if (existing) throw new HttpError(409, "badge deste jogo já emitido para essa wallet");

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(wallet);
  } catch {
    throw new HttpError(400, "wallet inválida");
  }

  const gc = gameCollectionPda(gameId);
  const gcAcc: any = await (chain.program.account as any).gameCollection
    .fetchNullable(gc)
    .catch(() => null);
  if (!gcAcc) {
    throw new HttpError(503, "coleção deste jogo ainda não existe on-chain");
  }
  const collectionMint: PublicKey = gcAcc.collectionMint;

  const badgeMint = Keypair.generate();
  const badgeAccount = Keypair.generate();
  const signature = await chain.program.methods
    .mintGameBadge(gameId)
    .accountsPartial({
      config: configPda(),
      authority: chain.authority.publicKey,
      recipient,
      gameCollection: gc,
      badgeMint: badgeMint.publicKey,
      badgeAccount: badgeAccount.publicKey,
      badgeMetadata: metadataPda(badgeMint.publicKey),
      collectionMint,
      collectionMetadata: metadataPda(collectionMint),
      collectionMasterEdition: masterEditionPda(collectionMint),
      collectionAuthority: collectionAuthorityPda(),
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    // metadata + verify na coleção custam CU extra além dos ~200k padrão
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .signers([badgeMint, badgeAccount])
    .rpc();

  const record: BadgeRecord = {
    wallet,
    gameId,
    mint: badgeMint.publicKey.toBase58(),
    signature,
    mintedAt: Date.now(),
  };
  store.update((data) => {
    data.badges.push(record);
    return record;
  });
  console.log(
    `[badges] badge do jogo ${gameId} emitido pra ${wallet.slice(0, 6)}…: ${record.mint}`
  );
  return record;
}
