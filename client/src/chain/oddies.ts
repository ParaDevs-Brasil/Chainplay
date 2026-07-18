import { AnchorProvider, BN, Program, type Idl, type Wallet } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import idlJson from "./oddies_bet.json";
import type { InjectedProvider } from "./wallet";

export const PROGRAM_ID = new PublicKey((idlJson as any).address);
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
export const GAME_NONE = 255;
/** Ids canônicos dos jogos — precisam casar com GAME_COUNT/registry do server. */
export const GAME = {
  hilo: 0,
  infinite: 1,
  penalty: 2,
  survivor: 3,
  stats: 4,
  team: 5,
  live: 6,
} as const;
export const LAMPORTS_PER_SOL = 1_000_000_000;

let rpcUrl = "https://api.devnet.solana.com";
let connection: Connection | null = null;

/** RPC vem do server (/api/game/status) pra client e backend olharem a mesma rede. */
export async function getConnection(): Promise<Connection> {
  if (connection) return connection;
  try {
    const status = await fetch("/api/game/status").then((r) => r.json());
    if (status?.chain?.rpcUrl) rpcUrl = status.chain.rpcUrl;
  } catch {
    /* fica no default devnet */
  }
  // HTTP JSON-RPC via proxy same-origin do server: o RPC público da devnet
  // bloqueia/limita browsers (aparece como "CORS failure" intermitente).
  // Confirmações via WebSocket seguem direto no RPC — WS não tem CORS.
  connection = new Connection(new URL("/api/rpc", window.location.origin).toString(), {
    commitment: "confirmed",
    wsEndpoint: rpcUrl.replace(/^http/, "ws"),
  });
  return connection;
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

// Identidade do jogo: PDAs da coleção + metadata do Token Metadata.
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

/** Contas opcionais de coleção do place_bet a partir do game_id do mercado. */
async function collectionAccounts(program: Program, gameId: number, ticketMint: PublicKey) {
  // contas opcionais: `null` explícito quando não há coleção — o client TS do
  // Anchor exige o valor (vira placeholder on-chain), não aceita omissão
  const none: Record<string, PublicKey | null> = {
    gameCollection: null,
    ticketMetadata: null,
    collectionMint: null,
    collectionMetadata: null,
    collectionMasterEdition: null,
    collectionAuthority: null,
    tokenMetadataProgram: null,
  };
  if (gameId === GAME_NONE || gameId == null) return none;
  const gc = gameCollectionPda(gameId);
  const gcAcc: any = await (program.account as any).gameCollection
    .fetchNullable(gc)
    .catch(() => null);
  if (!gcAcc) return none;
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

async function getProgram(injected: InjectedProvider): Promise<Program> {
  const conn = await getConnection();
  // O provider injetado já implementa a interface Wallet que o Anchor espera.
  const wallet = injected as unknown as Wallet;
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  return new Program(idlJson as Idl, provider);
}

export interface PlacedBet {
  signature: string;
  ticketMint: string;
  ticketAccount: string;
  bet: string;
}

/**
 * Aposta: minta o ticket-NFT pro apostador. O mint e a token account são
 * keypairs novos gerados aqui — assinam junto com a wallet do jogador.
 * `gameId` declara qual jogo está sendo jogado (define a coleção do ticket);
 * sem ele vale o jogo principal do mercado.
 */
export async function placeBet(
  injected: InjectedProvider,
  marketIdStr: string,
  outcome: number,
  lamports: number,
  gameId?: number
): Promise<PlacedBet> {
  if (!injected.publicKey) throw new Error("wallet não conectada");
  const program = await getProgram(injected);
  const marketId = new BN(marketIdStr);
  const market = marketPda(marketId);
  const [config, marketAcc] = await Promise.all([
    (program.account as any).config.fetch(configPda()),
    // decode falha em market de layout antigo (pré-upgrade do programa) — o
    // erro cru do buffer-layout ("clo is null") não diz nada pro jogador
    (program.account as any).market.fetch(market).catch(() => {
      throw new Error(
        "esse mercado é de uma versão antiga do programa e não aceita mais apostas — escolha outro"
      );
    }),
  ]);

  const ticketMint = Keypair.generate();
  const ticketAccount = Keypair.generate();
  const bet = betPda(market, ticketMint.publicKey);
  // o ticket entra na coleção-identidade do jogo declarado (degrada pra sem
  // coleção enquanto ela não existir on-chain)
  const requested = gameId ?? marketAcc.gameId;
  // o contrato rejeita, mas falhar aqui dá mensagem clara em vez de revert
  if (
    requested !== GAME_NONE &&
    !((marketAcc.allowedGames as number) & (1 << (requested as number)))
  ) {
    throw new Error("esse jogo não pode apostar neste mercado");
  }
  const collection = await collectionAccounts(program, requested, ticketMint.publicKey);
  const effectiveGameId = collection.gameCollection ? requested : GAME_NONE;

  const signature = await program.methods
    .placeBet(outcome, new BN(lamports), effectiveGameId)
    .accountsPartial({
      config: configPda(),
      market,
      vault: vaultPda(market),
      teamWallet: config.teamWallet,
      bet,
      ticketMint: ticketMint.publicKey,
      ticketAccount: ticketAccount.publicKey,
      bettor: injected.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      ...collection,
    })
    // metadata + verify na coleção custam CU extra além dos ~200k padrão
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .signers([ticketMint, ticketAccount])
    .rpc();

  return {
    signature,
    ticketMint: ticketMint.publicKey.toBase58(),
    ticketAccount: ticketAccount.publicKey.toBase58(),
    bet: bet.toBase58(),
  };
}

/** Resgate: queima o ticket e recebe o prêmio do vault. */
export async function claimTicket(
  injected: InjectedProvider,
  marketAddress: string,
  ticketMint: string,
  ticketAccount: string
): Promise<string> {
  if (!injected.publicKey) throw new Error("wallet não conectada");
  const program = await getProgram(injected);
  const market = new PublicKey(marketAddress);
  const mint = new PublicKey(ticketMint);

  return program.methods
    .claim()
    .accounts({
      market,
      vault: vaultPda(market),
      bet: betPda(market, mint),
      ticketMint: mint,
      ticketAccount: new PublicKey(ticketAccount),
      claimer: injected.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export function formatSol(lamports: number, digits = 3): string {
  return `${(lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })} SOL`;
}
