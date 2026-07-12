import cors from "cors";
import express from "express";
import { NETWORK, PORT } from "./config.js";
import { getGameData } from "./gameService.js";
import { loadCachedCredentials } from "./txlineAuth.js";
import { CHAIN_RPC_URL, getChain, PROGRAM_ID } from "./chain/client.js";
import { listMarkets, settleFixtureMarkets, syncMarkets } from "./chain/markets.js";
import {
  cashoutRun,
  createRun,
  guessRun,
  listRunsByWallet,
  MIN_STAKE_LAMPORTS,
  RUN_ODDS_BPS,
  runView,
  getRun,
  settleRuns,
} from "./chain/runs.js";
import { listTickets } from "./chain/tickets.js";
import {
  loginAsGuest,
  loginWithGoogle,
  logout,
  sessionUser,
  userAddress,
  userKeypair,
} from "./auth.js";
import { custodialClaim, custodialPlaceBet } from "./chain/custodial.js";

const app = express();
app.use(cors());
app.use(express.json());

const chainEnabled = () => Boolean(getChain());

function requireChain(res: express.Response): boolean {
  if (!chainEnabled()) {
    res.status(503).json({
      error:
        "on-chain desativado: configure AUTHORITY_KEYPAIR(_PATH) ou coloque a keypair em program/keys/devnet-deploy-wallet.json",
    });
    return false;
  }
  return true;
}

app.get("/api/game/status", (_req, res) => {
  const creds = loadCachedCredentials();
  res.json({
    network: NETWORK,
    txlineActivated: Boolean(creds),
    wallet: creds?.wallet ?? null,
    txSig: creds?.txSig ?? null,
    chain: {
      enabled: chainEnabled(),
      programId: PROGRAM_ID.toBase58(),
      rpcUrl: CHAIN_RPC_URL,
    },
  });
});

app.get("/api/game/matches", async (_req, res) => {
  try {
    const data = await getGameData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Login social (Google) e convidado — contas com wallet custodial de devnet
// ---------------------------------------------------------------------------

app.get("/api/auth/config", (_req, res) => {
  res.json({
    googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
    guestEnabled: process.env.ALLOW_GUEST !== "0",
  });
});

app.post("/api/auth/google", async (req, res) => {
  try {
    const credential = req.body?.credential;
    if (typeof credential !== "string" || !credential) {
      return res.status(400).json({ error: "credential (ID token do Google) obrigatório" });
    }
    res.json(await loginWithGoogle(credential));
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

app.post("/api/auth/guest", async (_req, res) => {
  try {
    res.json(await loginAsGuest());
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: "sessão inválida" });
  let balance: number | null = null;
  const chain = getChain();
  if (chain) {
    try {
      balance = await chain.connection.getBalance(userKeypair(user).publicKey);
    } catch {
      /* RPC fora: devolve sem saldo */
    }
  }
  res.json({
    address: userAddress(user),
    provider: user.provider,
    name: user.name ?? null,
    email: user.email ?? null,
    balance,
  });
});

app.post("/api/auth/logout", (req, res) => {
  logout(req);
  res.json({ ok: true });
});

// Apostas assinadas pelo server com a wallet custodial da sessão
app.post("/api/custodial/place-bet", async (req, res) => {
  if (!requireChain(res)) return;
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: "faça login primeiro" });
  try {
    const { marketId, outcome, lamports } = req.body ?? {};
    if (typeof marketId !== "string" || !Number.isInteger(outcome) || !Number.isInteger(lamports) || lamports <= 0) {
      return res.status(400).json({ error: "marketId, outcome e lamports (inteiro > 0) obrigatórios" });
    }
    res.json(await custodialPlaceBet(userKeypair(user), marketId, outcome, lamports));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/custodial/claim", async (req, res) => {
  if (!requireChain(res)) return;
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: "faça login primeiro" });
  try {
    const { market, ticketMint, ticketAccount } = req.body ?? {};
    if (![market, ticketMint, ticketAccount].every((v) => typeof v === "string" && v)) {
      return res.status(400).json({ error: "market, ticketMint e ticketAccount obrigatórios" });
    }
    res.json({
      signature: await custodialClaim(userKeypair(user), market, ticketMint, ticketAccount),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Mercados parimutuel (multiplayer)
// ---------------------------------------------------------------------------

app.get("/api/markets", async (_req, res) => {
  try {
    res.json({ programId: PROGRAM_ID.toBase58(), markets: await listMarkets() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Tickets (Claim Center)
// ---------------------------------------------------------------------------

app.get("/api/tickets/:wallet", async (req, res) => {
  if (!requireChain(res)) return;
  try {
    res.json({ tickets: await listTickets(req.params.wallet) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Runs house-backed (Hi-Lo apostado)
// ---------------------------------------------------------------------------

app.get("/api/runs/config", (_req, res) => {
  res.json({
    enabled: chainEnabled(),
    odds: RUN_ODDS_BPS,
    minStakeLamports: MIN_STAKE_LAMPORTS,
  });
});

app.post("/api/runs", async (req, res) => {
  if (!requireChain(res)) return;
  try {
    const { wallet, target, stakeLamports } = req.body ?? {};
    if (typeof wallet !== "string" || !wallet) throw new Error("wallet obrigatória");
    res.json(await createRun(wallet, Number(target), Number(stakeLamports)));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/runs/:id", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: "run não encontrada" });
  res.json(runView(run));
});

app.post("/api/runs/:id/guess", async (req, res) => {
  try {
    const dir = req.body?.dir;
    if (dir !== "higher" && dir !== "lower") throw new Error("dir deve ser higher|lower");
    res.json(await guessRun(req.params.id, dir));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/runs/:id/cashout", async (req, res) => {
  try {
    res.json(await cashoutRun(req.params.id));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/runs/wallet/:wallet", (req, res) => {
  res.json({ runs: listRunsByWallet(req.params.wallet) });
});

// ---------------------------------------------------------------------------
// Crons on-chain (só no server standalone — na Vercel não há processo residente)
// ---------------------------------------------------------------------------

const SYNC_INTERVAL_MS = 60_000;
const SETTLE_INTERVAL_MS = 15_000;

function startCrons() {
  if (process.env.VERCEL || !chainEnabled()) return;
  let syncing = false;
  let settling = false;
  setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      await syncMarkets();
    } finally {
      syncing = false;
    }
  }, SYNC_INTERVAL_MS);
  setInterval(async () => {
    if (settling) return;
    settling = true;
    try {
      await settleRuns();
      await settleFixtureMarkets();
    } finally {
      settling = false;
    }
  }, SETTLE_INTERVAL_MS);
  // primeira sincronização logo na subida
  syncMarkets().catch((e) => console.warn(`[markets] sync inicial: ${e.message}`));
}

app.listen(PORT, () => {
  console.log(`ChainPlay server em http://localhost:${PORT} (rede TxLINE: ${NETWORK})`);
  startCrons();
});
