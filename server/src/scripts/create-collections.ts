/**
 * Cria (idempotente) as 7 Collection NFTs de identidade dos jogos on-chain.
 * Cada coleção referencia a arte/metadata servida pelo backend em /nft/<slug>.json.
 * Rode uma vez após o deploy do programa (e sempre que adicionar um jogo novo):
 *
 *   PUBLIC_BASE_URL=https://<seu-server> npm run create:collections
 *
 * Requer a authority keypair (mesma do deploy) — só ela pode criar coleções.
 */
import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  GAMES,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  collectionAuthorityPda,
  configPda,
  gameCollectionPda,
  getChain,
  masterEditionPda,
  metadataPda,
} from "../chain/client.js";
import { publicBaseUrl } from "../http/routes/nft.routes.js";

async function main() {
  const chain = getChain();
  if (!chain) throw new Error("authority keypair ausente — configure AUTHORITY_KEYPAIR(_PATH)");
  const base = publicBaseUrl();
  console.log(`[collections] base pública: ${base}`);
  console.log(`[collections] authority: ${chain.authority.publicKey.toBase58()}`);

  for (const game of GAMES) {
    const gcPda = gameCollectionPda(game.id);
    const existing = await (chain.program.account as any).gameCollection
      .fetchNullable(gcPda)
      .catch(() => null);
    if (existing) {
      console.log(`  • ${game.name} (id ${game.id}) já existe: mint ${existing.collectionMint.toBase58()}`);
      continue;
    }

    const collectionMint = Keypair.generate();
    const collectionTokenAccount = Keypair.generate();
    const uri = `${base}/nft/${game.slug}.json`;

    await chain.program.methods
      .createGameCollection(game.id, game.name, game.symbol, uri)
      .accountsPartial({
        config: configPda(),
        gameCollection: gcPda,
        collectionAuthority: collectionAuthorityPda(),
        collectionMint: collectionMint.publicKey,
        collectionTokenAccount: collectionTokenAccount.publicKey,
        collectionMetadata: metadataPda(collectionMint.publicKey),
        collectionMasterEdition: masterEditionPda(collectionMint.publicKey),
        authority: chain.authority.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
      .signers([collectionMint, collectionTokenAccount])
      .rpc();

    console.log(
      `  ✅ ${game.name} (id ${game.id}) criada · mint ${collectionMint.publicKey.toBase58()} · uri ${uri}`
    );
  }

  console.log("[collections] concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
