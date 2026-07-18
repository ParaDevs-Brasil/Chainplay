import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { assert } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

// anchor test roda a partir de program/, então o cwd resolve o caminho do IDL.
const idl = JSON.parse(
  readFileSync(join(process.cwd(), "target/idl/oddies_bet.json"), "utf8")
);

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const BPF_LOADER_UPGRADEABLE_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

const SOL = LAMPORTS_PER_SOL;
const FEE_BPS = 1000; // 10%
const GAME_NONE = 255;
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

describe("oddies-bet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider);
  const authority = provider.wallet as anchor.Wallet;

  const teamWallet = Keypair.generate();
  const bettor1 = Keypair.generate();
  const bettor2 = Keypair.generate();
  const impostor = Keypair.generate();

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [programDataPda] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_ID
  );

  const marketPda = (marketId: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  const vaultPda = (market: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), market.toBuffer()],
      program.programId
    )[0];

  const betPda = (market: PublicKey, mint: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), market.toBuffer(), mint.toBuffer()],
      program.programId
    )[0];

  const zeroOdds = () => Array(8).fill(new BN(0));

  async function placeBet(
    marketId: BN,
    bettor: Keypair,
    outcome: number,
    amount: number,
    gameId: number = GAME_NONE
  ): Promise<{ ticketMint: Keypair; ticketAccount: Keypair }> {
    const market = marketPda(marketId);
    const ticketMint = Keypair.generate();
    const ticketAccount = Keypair.generate();
    await program.methods
      .placeBet(outcome, new BN(amount), gameId)
      .accounts({
        config: configPda,
        market,
        vault: vaultPda(market),
        teamWallet: teamWallet.publicKey,
        bet: betPda(market, ticketMint.publicKey),
        ticketMint: ticketMint.publicKey,
        ticketAccount: ticketAccount.publicKey,
        bettor: bettor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([bettor, ticketMint, ticketAccount])
      .rpc();
    return { ticketMint, ticketAccount };
  }

  async function claim(
    marketId: BN,
    claimer: Keypair,
    ticketMint: PublicKey,
    ticketAccount: PublicKey
  ) {
    const market = marketPda(marketId);
    await program.methods
      .claim()
      .accounts({
        market,
        vault: vaultPda(market),
        bet: betPda(market, ticketMint),
        ticketMint,
        ticketAccount,
        claimer: claimer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([claimer])
      .rpc();
  }

  async function createMarket(
    marketId: BN,
    kind: object,
    outcomeCount: number,
    oddsBps: BN[],
    closeTs: number,
    resolveAfterTs: number,
    signer: Keypair | anchor.Wallet = authority,
    gameId: number = GAME_NONE
  ) {
    const isWallet = "publicKey" in signer && !(signer instanceof Keypair);
    await program.methods
      .createMarket(
        marketId,
        new BN(1001),
        kind,
        outcomeCount,
        oddsBps,
        new BN(closeTs),
        new BN(resolveAfterTs),
        gameId,
        gameId === GAME_NONE ? 0 : 1 << gameId
      )
      .accounts({
        config: configPda,
        market: marketPda(marketId),
        vault: vaultPda(marketPda(marketId)),
        authority: signer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(isWallet ? [] : [signer as Keypair])
      .rpc();
  }

  async function balance(pk: PublicKey): Promise<number> {
    return provider.connection.getBalance(pk);
  }

  before(async () => {
    for (const kp of [bettor1, bettor2, impostor]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        10 * SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  it("rejeita initialize de quem não é a upgrade authority do programa", async () => {
    try {
      await program.methods
        .initialize(FEE_BPS)
        .accounts({
          config: configPda,
          authority: impostor.publicKey,
          teamWallet: teamWallet.publicKey,
          program: program.programId,
          programData: programDataPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([impostor])
        .rpc();
      assert.fail("deveria ter falhado");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  it("inicializa a config com taxa de 10%", async () => {
    await program.methods
      .initialize(FEE_BPS)
      .accounts({
        config: configPda,
        authority: authority.publicKey,
        teamWallet: teamWallet.publicKey,
        program: program.programId,
        programData: programDataPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const config = await (program.account as any).config.fetch(configPda);
    assert.equal(config.feeBps, FEE_BPS);
    assert.ok(config.teamWallet.equals(teamWallet.publicKey));
  });

  it("rejeita inicializar a config duas vezes", async () => {
    try {
      await program.methods
        .initialize(FEE_BPS)
        .accounts({
          config: configPda,
          authority: authority.publicKey,
          teamWallet: teamWallet.publicKey,
          program: program.programId,
          programData: programDataPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("deveria ter falhado");
    } catch (e: any) {
      assert.include(e.toString(), "Error");
    }
  });

  describe("parimutuel (multiplayer)", () => {
    const marketId = new BN(1);
    let ticket1: { ticketMint: Keypair; ticketAccount: Keypair };
    let ticket2: { ticketMint: Keypair; ticketAccount: Keypair };
    let closeTs: number;
    let resolveAfterTs: number;

    it("rejeita criar mercado com resolve_after_ts antes de close_ts", async () => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await createMarket(
          new BN(999),
          { parimutuel: {} },
          3,
          zeroOdds(),
          now + 10,
          now + 5 // antes do close_ts: inválido
        );
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidResolveWindow");
      }
    });

    it("rejeita criar mercado de quem não é a authority", async () => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await createMarket(
          new BN(998),
          { parimutuel: {} },
          3,
          zeroOdds(),
          now + 10,
          now + 20,
          impostor
        );
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintHasOne");
      }
    });

    it("cria o mercado e aceita apostas com split 10/90", async () => {
      const now = Math.floor(Date.now() / 1000);
      closeTs = now + 6;
      resolveAfterTs = closeTs + 3;
      await createMarket(
        marketId,
        { parimutuel: {} },
        3,
        zeroOdds(),
        closeTs,
        resolveAfterTs
      );

      const teamBefore = await balance(teamWallet.publicKey);
      ticket1 = await placeBet(marketId, bettor1, 0, 1 * SOL);
      ticket2 = await placeBet(marketId, bettor2, 1, 1 * SOL);
      const teamAfter = await balance(teamWallet.publicKey);

      // 10% de cada aposta de 1 SOL foi para a wallet do time.
      assert.equal(teamAfter - teamBefore, 0.2 * SOL);

      const market = await (program.account as any).market.fetch(
        marketPda(marketId)
      );
      assert.equal(market.pools[0].toNumber(), 0.9 * SOL);
      assert.equal(market.pools[1].toNumber(), 0.9 * SOL);
    });

    it("rejeita resolver antes do fim da partida", async () => {
      try {
        await program.methods
          .resolveMarket(0)
          .accounts({
            config: configPda,
            market: marketPda(marketId),
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "MatchNotFinished");
      }
    });

    it("rejeita resolver de quem não é a authority", async () => {
      try {
        await program.methods
          .resolveMarket(0)
          .accounts({
            config: configPda,
            market: marketPda(marketId),
            authority: impostor.publicKey,
          })
          .signers([impostor])
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintHasOne");
      }
    });

    it("resolve e o vencedor leva o pote inteiro (90% de 2 SOL)", async () => {
      // Espera o resolve_after_ts passar no clock on-chain.
      await new Promise((r) => setTimeout(r, 11000));
      await program.methods
        .resolveMarket(0)
        .accounts({
          config: configPda,
          market: marketPda(marketId),
          authority: authority.publicKey,
        })
        .rpc();

      const before = await balance(bettor1.publicKey);
      await claim(
        marketId,
        bettor1,
        ticket1.ticketMint.publicKey,
        ticket1.ticketAccount.publicKey
      );
      const after = await balance(bettor1.publicKey);
      // Pote = 1.8 SOL (menos taxa da tx de claim).
      assert.approximately(after - before, 1.8 * SOL, 0.01 * SOL);
    });

    it("perdedor não consegue resgatar", async () => {
      try {
        await claim(
          marketId,
          bettor2,
          ticket2.ticketMint.publicKey,
          ticket2.ticketAccount.publicKey
        );
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "LosingBet");
      }
    });

    it("vencedor não resgata duas vezes (ticket queimado)", async () => {
      try {
        await claim(
          marketId,
          bettor1,
          ticket1.ticketMint.publicKey,
          ticket1.ticketAccount.publicKey
        );
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "Error");
      }
    });

    it("rejeita cancelar mercado de quem não é a authority", async () => {
      const now = Math.floor(Date.now() / 1000);
      const id = new BN(4);
      await createMarket(
        id,
        { parimutuel: {} },
        2,
        zeroOdds(),
        now + 3600,
        now + 3700
      );
      try {
        await program.methods
          .cancelMarket()
          .accounts({
            config: configPda,
            market: marketPda(id),
            authority: impostor.publicKey,
          })
          .signers([impostor])
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintHasOne");
      }
    });
  });

  describe("house-backed (singleplayer)", () => {
    const marketId = new BN(2);
    let ticket: { ticketMint: Keypair; ticketAccount: Keypair };

    it("cria mercado com odds 2x, rejeita fund_house de impostor e funda a casa", async () => {
      const now = Math.floor(Date.now() / 1000);
      const closeTs = now + 6;
      const resolveAfterTs = closeTs + 3;
      const odds = zeroOdds();
      odds[0] = new BN(20000); // 2.0x
      odds[1] = new BN(15000); // 1.5x
      await createMarket(
        marketId,
        { houseBacked: {} },
        2,
        odds,
        closeTs,
        resolveAfterTs
      );

      try {
        await program.methods
          .fundHouse(new BN(1 * SOL))
          .accounts({
            config: configPda,
            market: marketPda(marketId),
            vault: vaultPda(marketPda(marketId)),
            authority: impostor.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([impostor])
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintHasOne");
      }

      await program.methods
        .fundHouse(new BN(5 * SOL))
        .accounts({
          config: configPda,
          market: marketPda(marketId),
          vault: vaultPda(marketPda(marketId)),
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      ticket = await placeBet(marketId, bettor1, 0, 1 * SOL);
      const bet = await (program.account as any).bet.fetch(
        betPda(marketPda(marketId), ticket.ticketMint.publicKey)
      );
      // Payout travado na entrada: 0.9 SOL líquido × 2.0 = 1.8 SOL.
      assert.equal(bet.fixedPayout.toNumber(), 1.8 * SOL);
    });

    it("rejeita aposta que a casa não consegue pagar", async () => {
      try {
        // Vault tem ~5.9 SOL usáveis; payout seria 20×0.9×2 = 36 SOL.
        await placeBet(marketId, bettor2, 0, 20 * SOL);
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "InsufficientHouseLiquidity");
      }
    });

    it("resolve e paga o payout fixo; casa saca o lucro livre", async () => {
      await new Promise((r) => setTimeout(r, 11000));
      await program.methods
        .resolveMarket(0)
        .accounts({
          config: configPda,
          market: marketPda(marketId),
          authority: authority.publicKey,
        })
        .rpc();

      const before = await balance(bettor1.publicKey);
      await claim(
        marketId,
        bettor1,
        ticket.ticketMint.publicKey,
        ticket.ticketAccount.publicKey
      );
      const after = await balance(bettor1.publicKey);
      assert.approximately(after - before, 1.8 * SOL, 0.01 * SOL);

      // Sobrou 5 + 0.9 - 1.8 = 4.1 SOL livres; sacar mais que isso falha.
      const freeLamports = 4_100_000_000;
      try {
        await program.methods
          .withdrawHouse(new BN(freeLamports + 1))
          .accounts({
            config: configPda,
            market: marketPda(marketId),
            vault: vaultPda(marketPda(marketId)),
            teamWallet: teamWallet.publicKey,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "InsufficientHouseLiquidity");
      }

      try {
        await program.methods
          .withdrawHouse(new BN(1))
          .accounts({
            config: configPda,
            market: marketPda(marketId),
            vault: vaultPda(marketPda(marketId)),
            teamWallet: teamWallet.publicKey,
            authority: impostor.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([impostor])
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintHasOne");
      }

      const teamBefore = await balance(teamWallet.publicKey);
      await program.methods
        .withdrawHouse(new BN(freeLamports))
        .accounts({
          config: configPda,
          market: marketPda(marketId),
          vault: vaultPda(marketPda(marketId)),
          teamWallet: teamWallet.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      const teamAfter = await balance(teamWallet.publicKey);
      assert.equal(teamAfter - teamBefore, freeLamports);
    });
  });

  describe("mercado cancelado (Voided)", () => {
    const marketId = new BN(3);

    it("cancela e devolve o stake líquido ao apostador", async () => {
      const now = Math.floor(Date.now() / 1000);
      await createMarket(
        marketId,
        { parimutuel: {} },
        3,
        zeroOdds(),
        now + 3600,
        now + 3700
      );
      const ticket = await placeBet(marketId, bettor2, 2, 1 * SOL);

      await program.methods
        .cancelMarket()
        .accounts({
          config: configPda,
          market: marketPda(marketId),
          authority: authority.publicKey,
        })
        .rpc();

      const before = await balance(bettor2.publicKey);
      await claim(
        marketId,
        bettor2,
        ticket.ticketMint.publicKey,
        ticket.ticketAccount.publicKey
      );
      const after = await balance(bettor2.publicKey);
      // Recupera os 90% líquidos (a taxa de 10% não volta).
      assert.approximately(after - before, 0.9 * SOL, 0.01 * SOL);
    });
  });

  describe("identidade por jogo (allowed_games)", () => {
    // marketId 4: parimutuel de fixture com jogos {0 (hilo), 3 (survivor)} habilitados
    const marketId = new BN(4);
    const GAME_HILO = 0;
    const GAME_PENALTY = 2;
    const GAME_SURVIVOR = 3;

    it("rejeita create_market com o jogo principal fora do allowed_games", async () => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await program.methods
          .createMarket(
            new BN(400),
            new BN(1001),
            { parimutuel: {} },
            3,
            zeroOdds(),
            new BN(now + 3600),
            new BN(now + 7200),
            GAME_HILO,
            0 // mask vazio: o bit do jogo principal precisa estar ligado
          )
          .accounts({
            config: configPda,
            market: marketPda(new BN(400)),
            vault: vaultPda(marketPda(new BN(400))),
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidGameId");
      }
    });

    it("rejeita create_market GAME_NONE com allowed_games não-zero", async () => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await program.methods
          .createMarket(
            new BN(401),
            new BN(1001),
            { parimutuel: {} },
            3,
            zeroOdds(),
            new BN(now + 3600),
            new BN(now + 7200),
            GAME_NONE,
            1 << GAME_HILO
          )
          .accounts({
            config: configPda,
            market: marketPda(new BN(401)),
            vault: vaultPda(marketPda(new BN(401))),
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidGameId");
      }
    });

    it("aceita apostas dos jogos habilitados e rejeita jogo fora do mask", async () => {
      const now = Math.floor(Date.now() / 1000);
      await program.methods
        .createMarket(
          marketId,
          new BN(1001),
          { parimutuel: {} },
          3,
          zeroOdds(),
          new BN(now + 3600),
          new BN(now + 7200),
          GAME_HILO,
          (1 << GAME_HILO) | (1 << GAME_SURVIVOR)
        )
        .accounts({
          config: configPda,
          market: marketPda(marketId),
          vault: vaultPda(marketPda(marketId)),
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const acc: any = await (program.account as any).market.fetch(marketPda(marketId));
      assert.equal(acc.allowedGames, (1 << GAME_HILO) | (1 << GAME_SURVIVOR));

      // GAME_NONE sempre passa (ticket sem coleção)
      await placeBet(marketId, bettor1, 0, 0.5 * SOL, GAME_NONE);

      // jogo fora do mask → GameNotAllowed (validado antes das contas de coleção)
      try {
        await placeBet(marketId, bettor2, 1, 0.5 * SOL, GAME_PENALTY);
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "GameNotAllowed");
      }

      // jogo habilitado mas sem as contas de coleção → MissingGameCollection
      // (no validador local não há Metaplex; o caminho feliz com coleção é
      // coberto na devnet pelo script verify-collections)
      try {
        await placeBet(marketId, bettor2, 1, 0.5 * SOL, GAME_SURVIVOR);
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "MissingGameCollection");
      }

      // o game_id declarado fica gravado na Bet
      const bets = await (program.account as any).bet.all();
      const noneBet = bets.find(
        (b: any) =>
          b.account.market.equals(marketPda(marketId)) && b.account.gameId === GAME_NONE
      );
      assert.ok(noneBet, "aposta GAME_NONE registrada com game_id na Bet");
    });
  });

  describe("update_config", () => {
    it("rejeita update_config de quem não é a authority", async () => {
      try {
        await program.methods
          .updateConfig(null, null, 500)
          .accounts({
            config: configPda,
            authority: impostor.publicKey,
          })
          .signers([impostor])
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintHasOne");
      }
    });

    it("authority consegue trocar a fee e migrar a authority pra outra chave", async () => {
      const newAuthority = Keypair.generate();
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(newAuthority.publicKey, 2 * SOL)
      );

      await program.methods
        .updateConfig(newAuthority.publicKey, null, 500)
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      let config = await (program.account as any).config.fetch(configPda);
      assert.equal(config.feeBps, 500);
      assert.ok(config.authority.equals(newAuthority.publicKey));

      // a chave antiga não manda mais; a nova sim (migra de volta pro estado original).
      try {
        await program.methods
          .updateConfig(authority.publicKey, null, FEE_BPS)
          .accounts({
            config: configPda,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.include(e.toString(), "ConstraintHasOne");
      }

      await program.methods
        .updateConfig(authority.publicKey, null, FEE_BPS)
        .accounts({
          config: configPda,
          authority: newAuthority.publicKey,
        })
        .signers([newAuthority])
        .rpc();

      config = await (program.account as any).config.fetch(configPda);
      assert.equal(config.feeBps, FEE_BPS);
      assert.ok(config.authority.equals(authority.publicKey));
    });
  });
});
