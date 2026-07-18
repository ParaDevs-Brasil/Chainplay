/**
 * Migra a identidade das 7 coleções de jogo para o metadata público
 * (raw.githubusercontent pinado por commit — URL imutável), via
 * `update_game_collection`: atualiza o PDA GameCollection (URI herdado pelos
 * tickets/badges futuros) e a metadata Metaplex da Collection NFT.
 *
 *   npm run update:collections            → usa NFT_METADATA_BASE_URL ou o raw pinado
 *   NFT_METADATA_BASE_URL=https://api.chainplay.app/nft npm run update:collections
 */
import {
  collectionAuthorityPda,
  configPda,
  gameCollectionPda,
  GAMES,
  getChain,
  metadataPda,
  TOKEN_METADATA_PROGRAM_ID,
} from "../chain/client.js";

// commit público que contém server/assets/nft/*.json (e as artes .png)
const PINNED_BASE =
  "https://raw.githubusercontent.com/ParaDevs-Brasil/sol-hackton/8f86ccd419bfedf93a45694bf7c33b0968f47243/server/assets/nft";

async function main() {
  const chain = getChain();
  if (!chain) throw new Error("authority keypair ausente");
  const { program, authority } = chain;
  const base = (process.env.NFT_METADATA_BASE_URL || PINNED_BASE).replace(/\/$/, "");
  console.log(`[collections] novo host do metadata: ${base}`);

  for (const game of GAMES) {
    const gc = gameCollectionPda(game.id);
    const acc: any = await (program.account as any).gameCollection
      .fetchNullable(gc)
      .catch(() => null);
    if (!acc) {
      console.log(`  ⏭️  ${game.name} (id ${game.id}): coleção não existe — rode create:collections`);
      continue;
    }
    const uri = `${base}/${game.slug}.json`;
    if (acc.ticketUri === uri) {
      console.log(`  ✔️  ${game.name} (id ${game.id}): já aponta pro host público`);
      continue;
    }
    await program.methods
      .updateGameCollection(game.id, game.name, game.symbol, uri)
      .accountsPartial({
        config: configPda(),
        authority: authority.publicKey,
        gameCollection: gc,
        collectionMint: acc.collectionMint,
        collectionMetadata: metadataPda(acc.collectionMint),
        collectionAuthority: collectionAuthorityPda(),
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .rpc();
    console.log(`  ✅ ${game.name} (id ${game.id}) → ${uri}`);
  }
  console.log("[collections] migração concluída.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
