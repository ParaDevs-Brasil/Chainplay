/**
 * E2E de browser: injeta uma wallet Phantom falsa (que assina de verdade com
 * um keypair de teste da devnet) e dirige o frontend inteiro:
 *   Hi-Lo apostado: conectar → criar run → assinar place_bet → jogar → fim
 *   Mercados 1X2:   apostar num outcome e ver o pool refletir
 *
 * Pré-requisitos: server em :3001, vite em :5173, /tmp/test-wallet.json fundeada.
 *   node client/e2e/browser-e2e.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

// tweetnacl do server: assina o SIWS (ed25519) fora do browser
const nacl = createRequire(new URL("../../server/package.json", import.meta.url))("tweetnacl");

const SECRET = JSON.parse(readFileSync("/tmp/test-wallet.json", "utf8"));
const BASE = process.env.BASE_URL || "http://localhost:5173";

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce", // pula a animação de suspense: reveal instantâneo
});

// assinatura de mensagem (SIWS) feita aqui no Node — o provider falso chama via
// binding. Sem signMessage a sessão de backend não nasce e as rotas de jogo
// protegidas (pós-auditoria de IDOR) respondem 401.
await ctx.exposeFunction("__e2eSignMessage", (msgB64) => {
  const sig = nacl.sign.detached(Buffer.from(msgB64, "base64"), Uint8Array.from(SECRET));
  return Buffer.from(sig).toString("base64");
});

// wallet falsa: mesma interface do Phantom, assinando com o keypair de teste.
// Usa as classes do web3 que o main.tsx expõe em dev (window.__cp).
await ctx.addInitScript(`
  const SECRET = ${JSON.stringify(SECRET)};
  const provider = {
    isPhantom: true,
    publicKey: null,
    _kp: null,
    _ensure() {
      if (!this._kp) {
        this._kp = window.__cp.Keypair.fromSecretKey(Uint8Array.from(SECRET));
        this.publicKey = this._kp.publicKey;
      }
    },
    async connect() { this._ensure(); return { publicKey: this.publicKey }; },
    async disconnect() { this.publicKey = null; },
    async signTransaction(tx) { this._ensure(); tx.partialSign(this._kp); return tx; },
    async signMessage(message) {
      this._ensure();
      const b64 = btoa(String.fromCharCode(...message));
      const sigB64 = await window.__e2eSignMessage(b64);
      return { signature: Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0)) };
    },
    async signAllTransactions(txs) {
      this._ensure();
      txs.forEach((t) => t.partialSign(this._kp));
      return txs;
    },
    on() {},
    off() {},
    removeListener() {},
    removeAllListeners() {},
    get isConnected() { return this.publicKey !== null; },
  };
  window.phantom = { solana: provider };
  window.isPhantomInstalled = true;
`);

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));

// ---------------------------------------------------------------------------
console.log("\n1. Hi-Lo apostado — ciclo completo no browser");
// ---------------------------------------------------------------------------
await page.goto(`${BASE}/#/hilo-apostado`, { waitUntil: "networkidle" });

// conectar: abre o modal do web3 connect e escolhe Phantom
await page.getByRole("button", { name: /conectar wallet/i }).first().click();
await page.locator(".wallet-adapter-modal-list").waitFor({ timeout: 10_000 });
await page.locator(".wallet-adapter-modal-list button", { hasText: "Phantom" }).click();
await page.waitForTimeout(1000);
const chip = await page.locator(".topbar .btn").first().textContent();
check("wallet conectada (endereço na navbar)", /…/.test(chip ?? ""), chip ?? "");

// meta 3 + stake 0.01 → criar run
await page.locator(".target-card", { hasText: "3" }).first().click();
await page.locator(".stake-chip", { hasText: "0.01" }).click();
await page.getByRole("button", { name: /criar run/i }).click();
// o painel "Como jogar" (recolhido) também contém "assine a aposta" — o botão
// de assinar é o sinal inequívoco de que a run foi criada
await page.getByRole("button", { name: /✍️ apostar/i }).waitFor({ timeout: 60_000 });
check("run criada (mercado house-backed on-chain)", true);

// assinar o place_bet
await page.getByRole("button", { name: /✍️ apostar/i }).click();
await page.locator(".guess-buttons").waitFor({ timeout: 90_000 });
check("place_bet assinado e confirmado — jogo liberado", true);

// joga até o fim (meta 3; com pushes pode levar mais cliques)
let endState = null;
for (let i = 0; i < 12 && !endState; i++) {
  const btn = page.locator(".guess-buttons .hi");
  if (!(await btn.isEnabled().catch(() => false))) break;
  await btn.click();
  await page.waitForTimeout(1800); // server + estado
  const h2 = await page.locator(".endgame h2").textContent().catch(() => null);
  if (h2) endState = h2;
}
check(
  "run terminou com tela de resultado",
  endState !== null && /meta batida|fim da run/i.test(endState ?? ""),
  endState ?? "sem tela final"
);
const won = /meta batida/i.test(endState ?? "");
console.log(`  → resultado da run: ${won ? "VITÓRIA 🏆" : "derrota"}`);

if (won) {
  // espera o cron liquidar e resgata pelo próprio frontend
  console.log("  aguardando liquidação on-chain (até 4min)…");
  const claimBtn = page.getByRole("button", { name: /resgatar/i });
  await claimBtn.waitFor({ timeout: 300_000 });
  check("mercado liquidado — botão de claim apareceu", true);
  await claimBtn.click();
  await page.getByText(/prêmio na sua wallet/i).waitFor({ timeout: 90_000 });
  check("claim pago pelo frontend", true);
}
await page.screenshot({ path: "/tmp/e2e-staked-final.png" });

// ---------------------------------------------------------------------------
console.log("\n2. Mercados 1X2 — aposta parimutuel no browser");
// ---------------------------------------------------------------------------
await page.goto(`${BASE}/#/mercados`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const openCard = page
  .locator(".market-card", { has: page.locator(".outcome-btn:enabled") })
  .first();
const hasOpen = (await openCard.count()) > 0;
check("mercado 1X2 aberto disponível", hasOpen);

if (hasOpen) {
  const before = await openCard.locator(".market-foot").textContent();
  await openCard.locator(".outcome-btn:enabled").first().click();
  await page.getByText(/aposta feita/i).waitFor({ timeout: 90_000 });
  check("aposta parimutuel confirmada no frontend", true);
  await page.waitForTimeout(1000);
  const after = await openCard.locator(".market-foot").textContent();
  check("pote do mercado aumentou", before !== after, `${before} → ${after}`);
}
await page.screenshot({ path: "/tmp/e2e-mercados-final.png" });

// ---------------------------------------------------------------------------
console.log("\n3. Carteira — tickets da wallet de teste aparecem");
// ---------------------------------------------------------------------------
await page.goto(`${BASE}/#/carteira`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /conectar wallet/i }).first().click().catch(() => {});
await page.waitForTimeout(4000);
const tickets = await page.locator(".ticket-card").count();
check("tickets listados no claim center", tickets >= 1, `${tickets} tickets`);
await page.screenshot({ path: "/tmp/e2e-carteira-final.png" });

console.log(`\nresultado: ${passed} ✅ · ${failed} ❌`);
await browser.close();
process.exit(failed ? 1 : 0);
