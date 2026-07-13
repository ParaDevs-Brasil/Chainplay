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
import fc from "fast-check";

// Roda depois de oddies-bet.ts no mesmo validador (ordem alfabética: "oddies-bet.ts" < "z-fuzz.ts"),
// reaproveitando a config já inicializada lá.
//
// Foco: exatamente a preocupação de "PDA vaza token" / "valor fora do alcance" — em vez de
// só testar os caminhos felizes com valores fixos, geramos entradas aleatórias (amounts, outcomes,
// odds, sequências de apostas de vários bettors) e checamos invariantes do contrato a cada passo:
// o vault nunca fica devendo mais do que consegue pagar, e a soma do que sai no claim nunca
// ultrapassa o que entrou.
const idl = JSON.parse(
  readFileSync(join(process.cwd(), "target/idl/oddies_bet.json"), "utf8")
);

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const SOL = LAMPORTS_PER_SOL;

describe("oddies-bet :: fuzzing", function () {
  this.timeout(600_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider);
  const authority = provider.wallet as anchor.Wallet;

  // team_wallet é validado on-chain contra config.team_wallet (setado no initialize() de
  // oddies-bet.ts, que roda antes) — buscamos o valor real em vez de gerar outro por engano.
  let teamWallet: PublicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
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
  const RENT_MIN = 890_880; // Rent::minimum_balance(0) — mesmo valor em toda a suíte

  let nextMarketId = 100;
  let bettors: Keypair[] = [];

  async function fundedBettor(): Promise<Keypair> {
    const kp = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(kp.publicKey, 20 * SOL);
    await provider.connection.confirmTransaction(sig);
    return kp;
  }

  before(async () => {
    bettors = await Promise.all([1, 2, 3, 4].map(() => fundedBettor()));
    const config = await (program.account as any).config.fetch(configPda);
    teamWallet = config.teamWallet as PublicKey;
  });

  async function createMarket(opts: {
    kind: "parimutuel" | "houseBacked";
    outcomeCount: number;
    oddsBps?: BN[];
    closeInSec?: number;
    resolveBufferSec?: number;
  }) {
    const marketId = new BN(nextMarketId++);
    const now = Math.floor(Date.now() / 1000);
    const closeTs = now + (opts.closeInSec ?? 4);
    const resolveAfterTs = closeTs + (opts.resolveBufferSec ?? 1);
    await program.methods
      .createMarket(
        marketId,
        new BN(9999),
        { [opts.kind]: {} },
        opts.outcomeCount,
        opts.oddsBps ?? zeroOdds(),
        new BN(closeTs),
        new BN(resolveAfterTs),
        255 // GAME_NONE: fuzz não exercita coleção
      )
      .accounts({
        config: configPda,
        market: marketPda(marketId),
        vault: vaultPda(marketPda(marketId)),
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { marketId, closeTs, resolveAfterTs };
  }

  async function placeBet(
    marketId: BN,
    bettor: Keypair,
    outcome: number,
    amount: number
  ) {
    const market = marketPda(marketId);
    const ticketMint = Keypair.generate();
    const ticketAccount = Keypair.generate();
    await program.methods
      .placeBet(outcome, new BN(amount))
      .accounts({
        config: configPda,
        market,
        vault: vaultPda(market),
        teamWallet,
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

  async function claim(marketId: BN, claimer: Keypair, ticketMint: PublicKey, ticketAccount: PublicKey) {
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

  async function vaultUsable(market: PublicKey): Promise<number> {
    const lamports = await provider.connection.getBalance(vaultPda(market));
    return Math.max(0, lamports - RENT_MIN);
  }

  function errCode(e: any): string {
    return e?.error?.errorCode?.code ?? e?.toString() ?? "";
  }

  // ---------------------------------------------------------------------
  // 1) Boundary / valores fora do alcance — enumerados, não aleatórios,
  //    porque são os limites exatos onde bugs de off-by-one costumam morar.
  // ---------------------------------------------------------------------
  describe("valores fora do alcance", () => {
    it("outcome == outcome_count é rejeitado (limite exato)", async () => {
      const { marketId } = await createMarket({ kind: "parimutuel", outcomeCount: 3, closeInSec: 3600 });
      try {
        await placeBet(marketId, bettors[0], 3, 1 * SOL);
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.equal(errCode(e), "InvalidOutcome");
      }
    });

    it("outcome == 255 (u8 max) é rejeitado", async () => {
      const { marketId } = await createMarket({ kind: "parimutuel", outcomeCount: 3, closeInSec: 3600 });
      try {
        await placeBet(marketId, bettors[0], 255, 1 * SOL);
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.equal(errCode(e), "InvalidOutcome");
      }
    });

    it("amount == 0 é rejeitado", async () => {
      const { marketId } = await createMarket({ kind: "parimutuel", outcomeCount: 2, closeInSec: 3600 });
      try {
        await placeBet(marketId, bettors[0], 0, 0);
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.equal(errCode(e), "ZeroAmount");
      }
    });

    it("odds_bps == 10000 (exatamente 1x) é rejeitado em HouseBacked", async () => {
      const odds = zeroOdds();
      odds[0] = new BN(10000);
      odds[1] = new BN(20000);
      try {
        await createMarket({ kind: "houseBacked", outcomeCount: 2, oddsBps: odds, closeInSec: 3600 });
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.equal(errCode(e), "InvalidOdds");
      }
    });

    it("outcome_count == 1 e == 9 são rejeitados (limite 2..=8)", async () => {
      for (const count of [1, 9]) {
        try {
          await createMarket({ kind: "parimutuel", outcomeCount: count, closeInSec: 3600 });
          assert.fail(`deveria ter falhado para outcome_count=${count}`);
        } catch (e: any) {
          assert.equal(errCode(e), "InvalidOutcomeCount");
        }
      }
    });

    it("resolve_after_ts == close_ts (não estritamente depois) é rejeitado", async () => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await program.methods
          .createMarket(
            new BN(nextMarketId++),
            new BN(1),
            { parimutuel: {} },
            2,
            zeroOdds(),
            new BN(now + 100),
            new BN(now + 100), // igual, não maior
            255
          )
          .accounts({
            config: configPda,
            market: marketPda(new BN(nextMarketId - 1)),
            vault: vaultPda(marketPda(new BN(nextMarketId - 1))),
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("deveria ter falhado");
      } catch (e: any) {
        assert.equal(errCode(e), "InvalidResolveWindow");
      }
    });
  });

  // ---------------------------------------------------------------------
  // 2) Fuzz: liquidez da casa nunca fica descoberta, pra qualquer sequência
  //    aleatória de apostas (stake e outcome aleatórios).
  // ---------------------------------------------------------------------
  describe("fuzz: house-backed nunca aceita mais risco do que o vault cobre", () => {
    it("worst-case liability <= vault usável depois de toda aposta aceita", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              bettorIdx: fc.integer({ min: 0, max: bettors.length - 1 }),
              outcome: fc.integer({ min: 0, max: 1 }),
              // de 1 lamport até ~1.5 SOL — cobre desde poeira até valores que estouram a liquidez
              amountLamports: fc.integer({ min: 1, max: 1.5 * SOL }),
            }),
            { minLength: 3, maxLength: 8 }
          ),
          async (bets) => {
            const odds = zeroOdds();
            odds[0] = new BN(15000); // 1.5x
            odds[1] = new BN(30000); // 3.0x
            const { marketId } = await createMarket({
              kind: "houseBacked",
              outcomeCount: 2,
              oddsBps: odds,
              closeInSec: 3600,
            });
            const market = marketPda(marketId);

            await program.methods
              .fundHouse(new BN(2 * SOL))
              .accounts({
                config: configPda,
                market,
                vault: vaultPda(market),
                authority: authority.publicKey,
                systemProgram: SystemProgram.programId,
              })
              .rpc();

            for (const b of bets) {
              const before = await (program.account as any).market.fetch(market);
              const usableBefore = await vaultUsable(market);

              let accepted = true;
              try {
                await placeBet(marketId, bettors[b.bettorIdx], b.outcome, b.amountLamports);
              } catch (e: any) {
                accepted = false;
                // se rejeitou, só pode ter sido por falta de liquidez (ou stake líquido zerado
                // por truncamento da taxa em valores de 1 lamport) — nunca um erro genérico/painico.
                const code = errCode(e);
                assert.include(
                  ["InsufficientHouseLiquidity", "ZeroAmount"],
                  code,
                  `motivo de rejeição inesperado: ${code}`
                );
              }

              const after = await (program.account as any).market.fetch(market);
              const usableAfter = await vaultUsable(market);

              if (accepted) {
                // invariante central: em nenhum outcome a obrigação da casa pode superar
                // o que o vault realmente tem disponível pra pagar.
                for (let i = 0; i < 2; i++) {
                  assert.isTrue(
                    Number(after.liabilities[i].toString()) <= usableAfter,
                    `liability[${i}]=${after.liabilities[i]} > vault usável=${usableAfter}`
                  );
                }
              } else {
                // aposta rejeitada não pode ter mudado estado nenhum (nem liabilities, nem vault).
                assert.deepEqual(
                  before.liabilities.map((x: BN) => x.toString()),
                  after.liabilities.map((x: BN) => x.toString())
                );
                assert.equal(usableBefore, usableAfter);
              }
            }
          }
        ),
        { numRuns: 12 }
      );
    });
  });

  // ---------------------------------------------------------------------
  // 3) Fuzz: parimutuel nunca paga mais do que entrou (sem vazamento do vault).
  // ---------------------------------------------------------------------
  describe("fuzz: parimutuel nunca vaza mais do que o pote", () => {
    it("soma dos payouts dos vencedores <= payout_pool, e sobra do vault é só poeira", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              bettorIdx: fc.integer({ min: 0, max: bettors.length - 1 }),
              outcome: fc.integer({ min: 0, max: 2 }),
              amountLamports: fc.integer({ min: 1000, max: 1 * SOL }),
            }),
            { minLength: 2, maxLength: 6 }
          ),
          fc.integer({ min: 0, max: 2 }),
          async (bets, winningOutcome) => {
            const { marketId } = await createMarket({
              kind: "parimutuel",
              outcomeCount: 3,
              closeInSec: 4,
              resolveBufferSec: 1,
            });
            const market = marketPda(marketId);

            const tickets: { bettor: Keypair; outcome: number; ticketMint: PublicKey; ticketAccount: PublicKey }[] = [];
            for (const b of bets) {
              const t = await placeBet(marketId, bettors[b.bettorIdx], b.outcome, b.amountLamports);
              tickets.push({
                bettor: bettors[b.bettorIdx],
                outcome: b.outcome,
                ticketMint: t.ticketMint.publicKey,
                ticketAccount: t.ticketAccount.publicKey,
              });
            }

            // O clock do validador local (slot-based) pode andar mais devagar que o
            // relógio de parede; em vez de esperar um tempo fixo calculado, tenta de
            // novo até o resolve_after_ts realmente ter passado on-chain.
            for (let attempt = 0; ; attempt++) {
              try {
                await program.methods
                  .resolveMarket(winningOutcome)
                  .accounts({ config: configPda, market, authority: authority.publicKey })
                  .rpc();
                break;
              } catch (e: any) {
                if (errCode(e) === "MatchNotFinished" && attempt < 20) {
                  await new Promise((r) => setTimeout(r, 1000));
                  continue;
                }
                throw e;
              }
            }

            const resolved = await (program.account as any).market.fetch(market);
            const isVoided = "voided" in resolved.state;

            let totalPaid = 0;
            for (const t of tickets) {
              const isWinner = !isVoided && t.outcome === winningOutcome;
              try {
                const before = await provider.connection.getBalance(t.bettor.publicKey);
                await claim(marketId, t.bettor, t.ticketMint, t.ticketAccount);
                const after = await provider.connection.getBalance(t.bettor.publicKey);
                totalPaid += Math.max(0, after - before);
                if (!isVoided && !isWinner) {
                  assert.fail("aposta perdedora não deveria conseguir resgatar");
                }
              } catch (e: any) {
                if (isVoided || isWinner) throw e; // essas tinham que ter conseguido resgatar
                assert.equal(errCode(e), "LosingBet");
              }
            }

            if (!isVoided) {
              // nunca pode sair mais do vault do que o snapshot do pote total na resolução.
              assert.isAtMost(totalPaid, Number(resolved.payoutPool.toString()));
            }

            // depois de todo mundo resgatar, só deve sobrar poeira de truncamento (< nº de outcomes)
            // além do buffer de rent — nada de saldo "vazado" ou perdido.
            const leftover = await vaultUsable(market);
            assert.isBelow(leftover, 3, `sobrou ${leftover} lamports não explicados no vault`);
          }
        ),
        { numRuns: 8 }
      );
    });
  });
});
