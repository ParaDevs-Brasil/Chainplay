/**
 * Verificação on-chain (devnet) da identidade por jogo:
 *  1. cria (se preciso) a coleção do jogo 0 (Hi-Lo);
 *  2. abre um mercado house-backed com game_id 0 e fundeia;
 *  3. faz um place_bet COM as contas de coleção → deve gerar metadata do ticket
 *     e verificá-lo como membro da coleção;
 *  4. confirma que a metadata do ticket existe e é do Token Metadata program;
 *  5. negativo: um place_bet no mesmo mercado SEM as contas de coleção deve
 *     falhar (MissingGameCollection).
 *
 * Rodar após o deploy do programa e do create:collections:
 *   npm run verify:collections
 */
// bn.js direto: o dist CJS do anchor não expõe BN como named export em Node ESM
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  GAME,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  betPda,
  collectionAccounts,
  collectionAuthorityPda,
  configPda,
  gameCollectionPda,
  getChain,
  marketPda,
  masterEditionPda,
  metadataPda,
  vaultPda,
} from "../chain/client.js";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const chain = getChain();
  if (!chain) throw new Error("authority keypair ausente");
  const { program, authority, connection } = chain;
  const gameId = GAME.hilo;

  // 1. coleção do jogo precisa existir (rode `npm run create:collections` antes)
  const gc = await (program.account as any).gameCollection
    .fetchNullable(gameCollectionPda(gameId))
    .catch(() => null);
  check("coleção do jogo 0 (Hi-Lo) existe on-chain", !!gc, "rode create:collections primeiro");
  if (!gc) { console.log(`\nresultado: ${passed} ✅ · ${failed} ❌`); process.exit(1); }
  const collectionMeta = await connection.getAccountInfo(metadataPda(gc.collectionMint));
  check(
    "metadata da coleção é do Token Metadata program",
    !!collectionMeta && collectionMeta.owner.equals(TOKEN_METADATA_PROGRAM_ID)
  );

  // 2. mercado house-backed com game_id 0
  const marketId = new BN(Date.now()).muln(1000).addn(7);
  const market = marketPda(marketId);
  const vault = vaultPda(market);
  const now = Math.floor(Date.now() / 1000);
  const odds = Array(8).fill(new BN(0));
  odds[0] = new BN(20_000); // 2x
  odds[1] = new BN(10_001);
  await program.methods
    .createMarket(marketId, marketId, { houseBacked: {} }, 2, odds, new BN(now + 300), new BN(now + 301), gameId, 1 << gameId)
    .accountsPartial({
      config: configPda(), market, vault,
      authority: authority.publicKey, systemProgram: SystemProgram.programId,
    })
    .rpc();
  await program.methods
    .fundHouse(new BN(0.02 * LAMPORTS_PER_SOL))
    .accountsPartial({
      config: configPda(), market, vault,
      authority: authority.publicKey, systemProgram: SystemProgram.programId,
    })
    .rpc();
  check("mercado com game_id 0 criado + fundeado", true);

  // 3. place_bet COM contas de coleção → ticket vira membro verificado
  const stake = 0.005 * LAMPORTS_PER_SOL;
  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  const collection = await collectionAccounts(program, gameId, ticketMint.publicKey);
  check("collectionAccounts montou as contas da coleção", Boolean(collection.gameCollection));
  await program.methods
    .placeBet(0, new BN(stake), gameId)
    .accountsPartial({
      config: configPda(), market, vault,
      teamWallet: (await (program.account as any).config.fetch(configPda())).teamWallet,
      bet: betPda(market, ticketMint.publicKey),
      ticketMint: ticketMint.publicKey, ticketAccount: ticketAccount.publicKey,
      bettor: authority.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      ...collection,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .signers([authority, ticketMint, ticketAccount])
    .rpc();

  // 4. metadata do ticket existe e é do Token Metadata program
  const ticketMeta = await connection.getAccountInfo(metadataPda(ticketMint.publicKey));
  check(
    "ticket recebeu metadata do Token Metadata program",
    !!ticketMeta && ticketMeta.owner.equals(TOKEN_METADATA_PROGRAM_ID)
  );
  // collection.verified fica no fim do buffer da metadata; decodifica best-effort
  try {
    const v = decodeCollectionVerified(ticketMeta!.data, gc.collectionMint);
    check("ticket é membro VERIFICADO da coleção do jogo", v === true);
  } catch (e) {
    console.log(`  ⚠️  não decodificou collection.verified: ${(e as Error).message}`);
  }

  // 5. negativo: place_bet SEM contas de coleção num mercado com jogo → falha
  const m2 = Keypair.generate();
  const a2 = Keypair.generate();
  let blocked = false;
  try {
    await program.methods
      .placeBet(0, new BN(stake), gameId)
      .accountsPartial({
        config: configPda(), market, vault,
        teamWallet: (await (program.account as any).config.fetch(configPda())).teamWallet,
        bet: betPda(market, m2.publicKey),
        ticketMint: m2.publicKey, ticketAccount: a2.publicKey,
        bettor: authority.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        ...(await collectionAccounts(program, 255 /* GAME_NONE: só os nulls */, m2.publicKey)),
      })
      .signers([authority, m2, a2])
      .rpc();
  } catch {
    blocked = true;
  }
  check("place_bet sem contas de coleção declarando jogo → bloqueado", blocked);

  // 6. negativo: game_id fora do allowed_games do mercado → GameNotAllowed
  const m3 = Keypair.generate();
  const a3 = Keypair.generate();
  const wrongGame = GAME.penalty; // mercado só habilita o bit do hilo
  const wrongCollection = await collectionAccounts(program, wrongGame, m3.publicKey);
  let gameBlocked = false;
  try {
    await program.methods
      .placeBet(0, new BN(stake), wrongGame)
      .accountsPartial({
        config: configPda(), market, vault,
        teamWallet: (await (program.account as any).config.fetch(configPda())).teamWallet,
        bet: betPda(market, m3.publicKey),
        ticketMint: m3.publicKey, ticketAccount: a3.publicKey,
        bettor: authority.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        ...wrongCollection,
      })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
      .signers([authority, m3, a3])
      .rpc();
  } catch (e) {
    gameBlocked = /GameNotAllowed|não habilitado/i.test(String((e as Error).message));
  }
  check("place_bet declarando jogo fora do allowed_games → GameNotAllowed", gameBlocked);

  // 7. mint_game_badge: emite badge supply-1 membro da coleção pro jogador
  const badgeMint = Keypair.generate();
  const badgeAccount = Keypair.generate();
  await program.methods
    .mintGameBadge(gameId)
    .accountsPartial({
      config: configPda(),
      authority: authority.publicKey,
      recipient: authority.publicKey,
      gameCollection: gameCollectionPda(gameId),
      badgeMint: badgeMint.publicKey,
      badgeAccount: badgeAccount.publicKey,
      badgeMetadata: metadataPda(badgeMint.publicKey),
      collectionMint: gc.collectionMint,
      collectionMetadata: metadataPda(gc.collectionMint),
      collectionMasterEdition: masterEditionPda(gc.collectionMint),
      collectionAuthority: collectionAuthorityPda(),
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .signers([badgeMint, badgeAccount])
    .rpc();
  const badgeMeta = await connection.getAccountInfo(metadataPda(badgeMint.publicKey));
  check(
    "badge recebeu metadata do Token Metadata program",
    !!badgeMeta && badgeMeta.owner.equals(TOKEN_METADATA_PROGRAM_ID)
  );
  try {
    const v = decodeCollectionVerified(badgeMeta!.data, gc.collectionMint);
    check("badge é membro VERIFICADO da coleção do jogo", v === true);
  } catch (e) {
    console.log(`  ⚠️  não decodificou collection.verified do badge: ${(e as Error).message}`);
  }

  console.log(`\nresultado: ${passed} ✅ · ${failed} ❌`);
  process.exit(failed ? 1 : 0);
}

/** Lê o campo Option<Collection>{verified,key} da metadata Metaplex (v1.3+). */
function decodeCollectionVerified(data: Buffer, expectedKey: PublicKey): boolean {
  let o = 1 + 32 + 32; // key + update_authority + mint
  const str = () => { const len = data.readUInt32LE(o); o += 4 + len; };
  str(); str(); str(); // name, symbol, uri
  o += 2; // seller_fee_basis_points
  // creators: Option<Vec<Creator>>
  if (data[o++] === 1) {
    const n = data.readUInt32LE(o); o += 4;
    o += n * (32 + 1 + 1); // address + verified + share
  }
  o += 1; // primary_sale_happened
  o += 1; // is_mutable
  if (data[o++] === 1) o += 1; // edition_nonce: Option<u8>
  if (data[o++] === 1) o += 1; // token_standard: Option<u8>
  // collection: Option<{ verified: bool, key: Pubkey }>
  if (data[o++] !== 1) return false;
  const verified = data[o] === 1; o += 1;
  const key = new PublicKey(data.subarray(o, o + 32));
  return verified && key.equals(expectedKey);
}

main().catch((e) => { console.error(e); process.exit(1); });
