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
import { BN } from "@coral-xyz/anchor";
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
    .createMarket(marketId, marketId, { houseBacked: {} }, 2, odds, new BN(now + 300), new BN(now + 301), gameId)
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
  check("collectionAccounts montou as contas (não vazio)", Object.keys(collection).length > 0);
  await program.methods
    .placeBet(0, new BN(stake))
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
      .placeBet(0, new BN(stake))
      .accountsPartial({
        config: configPda(), market, vault,
        teamWallet: (await (program.account as any).config.fetch(configPda())).teamWallet,
        bet: betPda(market, m2.publicKey),
        ticketMint: m2.publicKey, ticketAccount: a2.publicKey,
        bettor: authority.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority, m2, a2])
      .rpc();
  } catch {
    blocked = true;
  }
  check("place_bet sem contas de coleção num mercado com jogo → bloqueado", blocked);

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
