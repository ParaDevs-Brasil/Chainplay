# Audit Log — Integração backend↔contrato (oddies-bet)

> Consolidação de docs/security-review.md (achados #5-7) e docs/logs-erros-inconsistencias.md
> (20 ocorrências) em formato de auditoria acionável: comportamento atual, problema,
> proposta de melhoria e código sugerido por achado.
>
> **Atualização 2026-07-13 — correções aplicadas.** Os achados de **segurança** (IDOR #1
> runs, #2 penalty, #3 survivor) e os de **maior severidade** de logs/erros foram
> implementados e verificados (tsc do server e do client limpos + smoke test ao vivo do
> fluxo de IDOR contra o server local). Status por achado no quadro abaixo. O código
> sugerido em cada entrada permanece como referência do que foi feito; onde a
> implementação divergiu do diff original (ex.: passar `UserRecord` inteiro em vez do
> cast de `userId`), o código real seguiu a "nota de implementação" da própria entrada.
>
> ### Status das correções (2026-07-13)
>
> | Achado | Status | Observação |
> |---|---|---|
> | #1 IDOR runs | ✅ Corrigido | `requireSession` + `assertRunOwner` + `userId` no `RunRecord`; wallet vem da sessão |
> | #2 IDOR penalty | ✅ Corrigido | `requireSession` + `assertSessionOwner` + `userId` no `SessionRecord` |
> | #3 IDOR survivor | ✅ Corrigido | `requireSession`; wallet do pick vem da sessão, não do body |
> | #4 segredos no console (subscribe) | ✅ Corrigido | JWT/token mascarados; aponta pro arquivo em disco |
> | #5 HttpError 4xx não logada | ✅ Corrigido | `errorHandler` loga 4xx como `warn`, 5xx como `error` |
> | #6/#7 RPC de saldo engolida | ✅ Corrigido | `/auth/me` loga `console.warn` como `fundWelcome` |
> | #8 client sem console.error | ✅ Corrigido | `console.error/warn` com prefixo por módulo em todos os catches |
> | #9 catch vazio (SIWS) | ✅ Corrigido | `console.warn` antes de seguir |
> | #11 err.message bruto no 500 | ✅ Corrigido | 500 devolve mensagem genérica; detalhe só no log |
> | #12 parse de wallet sem try/catch | ✅ Corrigido | `listTickets` relança `HttpError(400)` |
> | #13 erro de domínio → 400 cego | ✅ Corrigido *(2026-07-14)* | toda camada de domínio lança `HttpError` com o status certo; o que não é `HttpError` vira 500 genérico em vez de 400 com mensagem interna — ver "Reverificação e fechamento" abaixo |
> | #14 status 409/429 | ✅ Corrigido | `chain/runs.ts` lança `HttpError(409/429)` direto |
> | #15 markets sem requireChain | ✅ Corrigido | `requireChain` aplicado em `markets.routes.ts` |
> | #16 rotas sem asyncHandler | ✅ Corrigido | `/wallet/nonce`, `/wallet/:wallet`, `/:id` envoltos |
> | #21 3 helpers de fetch no client | ✅ Corrigido | helper único em `client/src/chain/http.ts` |
> | #23 validação de input em runs | ✅ Corrigido | `target`/`stakeLamports` validados como inteiro na borda |
> | #10 logger estruturado | ⏳ Adiado | prefixo por módulo já padronizado; logger central fica pra depois |
> | #17/#18/#19/#20/#22 dívidas de consistência | ⏳ Adiado | renome de campos e pacote de tipos/PDA compartilhado — sem risco funcional, fora do escopo desta rodada |
>
> ### Reverificação e fechamento (2026-07-14)
>
> Os 16 achados marcados ✅ acima foram **auditados um a um contra o código** e confirmados
> implementados; os três IDORs foram verificados **ao vivo** contra o server local (terceiro
> autenticado recebe `403`, sem sessão recebe `401`, dono legítimo `200`) e a regressão está
> na suíte `e2e:full` (**30 ✅ / 0 ❌** contra a devnet real).
>
> Nesta mesma rodada, **#13 saiu de "Parcial" para ✅** e três problemas que a auditoria
> original não tinha alcançado foram corrigidos:
>
> | Achado | Status | Correção |
> |---|---|---|
> | #13 erro de domínio → 400 cego | ✅ **Corrigido** (era Parcial) | Toda camada de domínio (`runs`, `penalty`, `survivor`, `stats`, `quiz`, `arcade`, `markets`, `house`, `custodial`) lança `HttpError` com o status semântico (400/403/404/409/429/503). As rotas deixaram de reembrulhar cegamente: o que não é `HttpError` sobe e vira **500 genérico** no `errorHandler`. Fecha o resíduo do #11 — antes, um erro de infra (ex.: falha de decode do Anchor) vazava a mensagem interna crua dentro de um `400`. |
> | *(novo)* Build quebrado em instalação limpa | ✅ Corrigido | `import { BN } from "@coral-xyz/anchor"` não resolve em Node ESM (o dist CJS não expõe o named export) — o server não subia num clone novo. Passou a importar de `bn.js` direto. No client, `@types/react@19` entrava por dependência transitiva e quebrava o `tsc`; fixado em 18 via `overrides`. |
> | *(novo)* IDL do TxLINE em caminho errado | ✅ Corrigido | `src/txline/auth.ts` procurava os IDLs em `src/idl/` em vez de `idl/` — sem eles o oráculo não ativava e **nenhum mercado 1X2 era criado**. |
>
> As mudanças de **contrato** desta rodada (identidade NFT por jogo: `allowed_games`,
> `place_bet(.., game_id)`, `mint_game_badge`, `update_game_collection`) e os achados
> adversariais novos (#8, #9, #10) estão em **`docs/security-review.md` § 4** e a mecânica
> completa em **`docs/nft-identidade-por-jogo.md`**.
>
> O texto original de cada achado abaixo foi preservado como registro histórico da
> análise.
>
> Data: 2026-07-12 · Branch: feature/contract
>
> **Atualização 2026-07-12 (2ª passada):** nova busca de segurança sobre os 4 mini games
> adicionados nos commits `9331c1f`/`8f67b16`/`9450715` (Penalty Predictor, Survivor, Quiz,
> Arcade demo) encontrou o mesmo padrão de IDOR replicado no Penalty Predictor (achado #2,
> Alta — dinheiro real) e no Survivor (achado #3, Baixa — sem prêmio real). Um terceiro
> candidato (Quiz/Arcade demo) foi investigado e descartado como falso-positivo: sem via de
> descoberta do UUID e sem qualquer fundo envolvido.

> **Nota de reverificação:** todo `arquivo:linha` abaixo foi conferido linha a linha contra
> o código atual (pós-commit `8f67b16`, "4 novos mini games", que reescreveu
> `client/src/StakedHilo.tsx` e deslocou `client/src/Markets.tsx`). Onde a citação original
> dos docs-fonte não batia mais, o número foi corrigido e isso está marcado explicitamente
> na entrada com **"linha corrigida"**. As demais citações foram confirmadas inalteradas.

---

### 1. IDOR em `/api/runs/:id/guess`, `/:id/cashout` e `GET /api/runs/wallet/:wallet` — *(Achado #5, segurança)*
**Arquivo:** `server/src/http/routes/runs.routes.ts:53-55` (wallet), `:63-76` (guess), `:78-87` (cashout)
**Categoria:** Segurança
**Severidade:** Alta

**Comportamento atual:**
Nenhuma das três rotas usa `requireSession` — diferente de `custodial.routes.ts`, que aplica
`requireChain, requireSession` a todas as suas rotas de uma vez (`custodial.routes.ts:10`):

```ts
runsRoutes.get("/wallet/:wallet", (req, res) => {
  res.json({ runs: listRunsByWallet(req.params.wallet) });
});

runsRoutes.post(
  "/:id/guess",
  asyncHandler(async (req, res) => {
    const dir = req.body?.dir;
    if (dir !== "higher" && dir !== "lower") {
      throw new HttpError(400, "dir deve ser higher|lower");
    }
    try {
      res.json(await guessRun(req.params.id, dir));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);

runsRoutes.post(
  "/:id/cashout",
  asyncHandler(async (req, res) => {
    try {
      res.json(await cashoutRun(req.params.id));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);
```

`guessRun`/`cashoutRun` (`server/src/chain/runs.ts:362`, `:410`) recebem só o `id` da run —
não há parâmetro de usuário, nem comparação com o dono. `listRunsByWallet`
(`server/src/chain/runs.ts:569-573`) também não checa sessão, e devolve `id` da run ativa e
o valor da carta atual já revelado (`current.value` em `runView`, `runs.ts:204-206`) para
qualquer chamador que souber a wallet.

**Problema / vulnerabilidade:**
A wallet pública não é segredo em um dApp Solana — aparece em qualquer explorer, em
transações passadas, em compartilhamentos sociais. Um atacante que só conhece a wallet da
vítima consegue: (1) descobrir o `id` da run ativa via `GET /wallet/:wallet` sem se
autenticar; (2) usar esse `id` para chamar `guess` em nome da vítima, decidindo a jogada por
ela; ou (3) forçar `cashout` prematuro, travando o resultado antes que a vítima decida. O
`finalOutcome` fixado nessas chamadas é liquidado on-chain via `settleRuns()` →
`resolveMarket()` (`runs.ts:496-567`) — o dano é financeiro real (o payout da vítima é
decidido por um terceiro), não apenas de UI.

**Proposta de melhoria:**
Aplicar `requireSession` nas três rotas (e também em `POST /`, que cria a run — sem isso a
checagem de dono nas outras rotas fica sem base, já que hoje qualquer um pode criar uma run
"em nome" de qualquer wallet só passando a string no body). Amarrar `RunRecord` ao `userId`
da sessão que criou a run (não só à string `wallet` do body) e validar posse em
`guessRun`/`cashoutRun`/`listRunsByWallet` antes de qualquer leitura ou escrita, reusando o
padrão `requireSession` + `AuthedRequest` que `custodial.routes.ts` já usa.

**Código sugerido:**

`server/src/http/middleware.ts` já expõe o necessário (`requireSession`, `AuthedRequest`) —
não precisa mudar. O diff fica em `runs.routes.ts` e `chain/runs.ts`:

```diff
--- a/server/src/http/routes/runs.routes.ts
+++ b/server/src/http/routes/runs.routes.ts
@@
-import { HttpError, asyncHandler } from "../errors.js";
-import { requireChain } from "../middleware.js";
+import { HttpError, asyncHandler } from "../errors.js";
+import { requireChain, requireSession, type AuthedRequest } from "../middleware.js";
+import { userAddress } from "../../auth/store.js";

 runsRoutes.post(
   "/",
   requireChain,
+  requireSession,
   asyncHandler(async (req, res) => {
-    const { wallet, target, stakeLamports, mode } = req.body ?? {};
-    if (typeof wallet !== "string" || !wallet) {
-      throw new HttpError(400, "wallet obrigatória");
-    }
+    const { user } = req as AuthedRequest;
+    const { target, stakeLamports, mode } = req.body ?? {};
+    // wallet vem da sessão, não do body — impede criar run "em nome" de outra wallet
+    const wallet = userAddress(user);
     try {
       res.json(
         await createRun(
+          user.id,
           wallet,
           Number(target),
           Number(stakeLamports),
           mode === "infinite" ? "infinite" : "target"
         )
       );
     } catch (err) {
       throw new HttpError(400, (err as Error).message);
     }
   })
 );

-runsRoutes.get("/wallet/:wallet", (req, res) => {
-  res.json({ runs: listRunsByWallet(req.params.wallet) });
-});
+runsRoutes.get("/wallet/:wallet", requireSession, (req, res) => {
+  const { user } = req as AuthedRequest;
+  if (userAddress(user) !== req.params.wallet) {
+    throw new HttpError(403, "só é possível listar as próprias runs");
+  }
+  res.json({ runs: listRunsByWallet(req.params.wallet) });
+});

 runsRoutes.post(
   "/:id/guess",
+  requireSession,
   asyncHandler(async (req, res) => {
+    const { user } = req as AuthedRequest;
     const dir = req.body?.dir;
     if (dir !== "higher" && dir !== "lower") {
       throw new HttpError(400, "dir deve ser higher|lower");
     }
     try {
-      res.json(await guessRun(req.params.id, dir));
+      res.json(await guessRun(req.params.id, dir, user.id));
     } catch (err) {
+      if (err instanceof HttpError) throw err;
       throw new HttpError(400, (err as Error).message);
     }
   })
 );

 runsRoutes.post(
   "/:id/cashout",
+  requireSession,
   asyncHandler(async (req, res) => {
+    const { user } = req as AuthedRequest;
     try {
-      res.json(await cashoutRun(req.params.id));
+      res.json(await cashoutRun(req.params.id, user.id));
     } catch (err) {
+      if (err instanceof HttpError) throw err;
       throw new HttpError(400, (err as Error).message);
     }
   })
 );
```

```diff
--- a/server/src/chain/runs.ts
+++ b/server/src/chain/runs.ts
@@
+import { HttpError } from "../http/errors.js";
+import { userAddress, type UserRecord } from "../auth/store.js";
+
 export interface RunRecord {
   id: string;
   wallet: string;
+  /** dono da sessão que criou a run — ausente só em runs persistidas antes desta
+   *  migração; nesse caso o fallback abaixo compara pela wallet. */
+  userId?: string;
   marketId: string;
   marketPdaB58: string;
   ...
 }
+
+/** Garante que quem chama guess/cashout é o dono da run. Runs antigas sem
+ *  `userId` caem no fallback por wallet — remover o fallback depois que o
+ *  store não tiver mais nenhuma run pré-migração ativa. */
+function assertOwner(run: RunRecord, user: UserRecord) {
+  const owns = run.userId ? run.userId === user.id : run.wallet === userAddress(user);
+  if (!owns) throw new HttpError(403, "essa run não pertence a esta sessão");
+}

 export async function createRun(
+  userId: string,
   wallet: string,
   target: number,
   stakeLamports: number,
   mode: RunMode = "target"
 ) {
   ...
   const run: RunRecord = {
     id: crypto.randomUUID(),
+    userId,
     wallet,
     ...
   };
   ...
 }

-export async function guessRun(id: string, dir: "higher" | "lower") {
+export async function guessRun(id: string, dir: "higher" | "lower", userId: string) {
   const run = getRun(id);
   if (!run) throw new Error("run não encontrada");
+  assertOwner(run, { id: userId } as UserRecord); // ver nota abaixo sobre assinatura
   if (run.status === "awaiting_bet") await ensureBetPlaced(run);
   ...
 }

-export async function cashoutRun(id: string) {
+export async function cashoutRun(id: string, userId: string) {
   const run = getRun(id);
   if (!run) throw new Error("run não encontrada");
+  assertOwner(run, { id: userId } as UserRecord);
   if (run.status !== "playing" && run.status !== "awaiting_bet") {
   ...
 }
```

*Nota de implementação:* passar o `UserRecord` completo (não só `userId`) de
`runs.routes.ts` até `guessRun`/`cashoutRun` é mais limpo do que o cast acima — o cast serve
só para deixar o diff pequeno aqui. Na implementação real, troque a assinatura para receber
`user: UserRecord` e chame `assertOwner(run, user)` diretamente.

---

### 2. IDOR no Penalty Predictor — mesmo padrão do achado #1, replicado em jogo novo com dinheiro real — *(achado novo, revisão de 2026-07-12 sobre os mini games)*
**Arquivo:** `server/src/http/routes/arcade.routes.ts:79-81` (wallet), `:83-87` (get), `:89-98` (shot), `:100-107` (answer)
**Categoria:** Segurança
**Severidade:** Alta

**Comportamento atual:**
```ts
arcadeRoutes.get("/penalty/sessions/:wallet", (req, res) => {
  res.json({ sessions: listSessionsByWallet(req.params.wallet) });
});

arcadeRoutes.get("/penalty/session/:id", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) throw new HttpError(404, "sessão não encontrada");
  res.json(sessionView(s));
});

arcadeRoutes.post(
  "/penalty/session/:id/shot",
  asyncHandler(async (req, res) => {
    try {
      res.json(await nextShot(req.params.id));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);

arcadeRoutes.post("/penalty/session/:id/answer", (req, res) => {
  const { choice, name } = req.body ?? {};
  try {
    res.json(answerShot(req.params.id, Number(choice), name));
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
});
```
Nenhuma das quatro rotas usa `requireSession`. `nextShot`/`answerShot`
(`server/src/games/penaltySession.ts:171,202`) recebem só o `id` da sessão — nenhuma
comparação contra `SessionRecord.wallet`.

**Problema / vulnerabilidade:**
É o mesmo padrão do achado #1 (IDOR em runs), reintroduzido do zero no jogo "Penalty
Predictor valendo SOL". `GET /penalty/sessions/:wallet` vaza o `id` da sessão ativa a partir
da wallet pública da vítima, sem autenticação. A sessão só existe depois de um stake real
confirmado on-chain (`createSession`, `penaltySession.ts:87-141`, mínimo 0.001 SOL) — não é
demo grátis. Um atacante que descobre o `id` chama `.../shot` e `.../answer` repetidamente
com respostas erradas; `recordShot` (`penaltySession.ts:163-168`) e `finishIfDecided`
(`:147-160`) fixam `status = "lost"` / `finalOutcome = HOUSE_LOSE` antes que a vítima consiga
jogar sua própria rodada — depois disso as chamadas legítimas da vítima falham com "nenhum
pênalti em aberto". O cron `settlePenaltySessions()` (`:230-261`) liquida esse outcome
on-chain via `settleHouseMarket()` → `resolveMarket()` (`server/src/chain/house.ts:114-149`)
— o stake real da vítima é perdido para a house. Dano financeiro direto, idêntico em
mecânica ao achado #1.

**Proposta de melhoria:**
Aplicar exatamente a mesma correção do achado #1: `requireSession` em todas as rotas de
`/penalty/*` (inclusive `POST /penalty/session`, que hoje também aceita `wallet` livre do
body), amarrar `SessionRecord` ao `userId` da sessão, e validar posse em
`nextShot`/`answerShot`/`getSession`/`listSessionsByWallet` antes de ler ou escrever.

**Código sugerido:**
```diff
--- a/server/src/http/routes/arcade.routes.ts
+++ b/server/src/http/routes/arcade.routes.ts
@@
-import { getChain } from "../../chain/client.js";
-import { HttpError, asyncHandler } from "../errors.js";
+import { getChain } from "../../chain/client.js";
+import { HttpError, asyncHandler } from "../errors.js";
+import { requireSession, type AuthedRequest } from "../middleware.js";
+import { userAddress } from "../../auth/store.js";

 arcadeRoutes.post(
   "/penalty/session",
+  requireSession,
   asyncHandler(async (req, res) => {
-    const { wallet, target, stakeLamports } = req.body ?? {};
+    const { user } = req as AuthedRequest;
+    const { target, stakeLamports } = req.body ?? {};
+    const wallet = userAddress(user);
     try {
-      res.json(await createSession(String(wallet ?? ""), Number(target), Number(stakeLamports)));
+      res.json(await createSession(user.id, wallet, Number(target), Number(stakeLamports)));
     } catch (err) {
       throw new HttpError(400, (err as Error).message);
     }
   })
 );

-arcadeRoutes.get("/penalty/sessions/:wallet", (req, res) => {
-  res.json({ sessions: listSessionsByWallet(req.params.wallet) });
-});
+arcadeRoutes.get("/penalty/sessions/:wallet", requireSession, (req, res) => {
+  const { user } = req as AuthedRequest;
+  if (userAddress(user) !== req.params.wallet) {
+    throw new HttpError(403, "só é possível listar as próprias sessões");
+  }
+  res.json({ sessions: listSessionsByWallet(req.params.wallet) });
+});

 arcadeRoutes.post(
   "/penalty/session/:id/shot",
+  requireSession,
   asyncHandler(async (req, res) => {
+    const { user } = req as AuthedRequest;
     try {
-      res.json(await nextShot(req.params.id));
+      res.json(await nextShot(req.params.id, user.id));
     } catch (err) {
+      if (err instanceof HttpError) throw err;
       throw new HttpError(400, (err as Error).message);
     }
   })
 );

-arcadeRoutes.post("/penalty/session/:id/answer", (req, res) => {
+arcadeRoutes.post("/penalty/session/:id/answer", requireSession, (req, res) => {
+  const { user } = req as AuthedRequest;
   const { choice, name } = req.body ?? {};
   try {
-    res.json(answerShot(req.params.id, Number(choice), name));
+    res.json(answerShot(req.params.id, Number(choice), user.id, name));
   } catch (err) {
+    if (err instanceof HttpError) throw err;
     throw new HttpError(400, (err as Error).message);
   }
 });
```
```diff
--- a/server/src/games/penaltySession.ts
+++ b/server/src/games/penaltySession.ts
@@
+import { HttpError } from "../http/errors.js";
+
 export interface SessionRecord {
   id: string;
   wallet: string;
+  userId?: string;
   marketId: string;
   ...
 }
+
+function assertOwner(s: SessionRecord, userId: string) {
+  if (s.userId && s.userId !== userId) {
+    throw new HttpError(403, "essa sessão não pertence a esta conta");
+  }
+}

-export async function createSession(wallet: string, target: number, stakeLamports: number) {
+export async function createSession(
+  userId: string,
+  wallet: string,
+  target: number,
+  stakeLamports: number
+) {
   ...
   const session: SessionRecord = {
     id: crypto.randomUUID(),
+    userId,
     wallet,
     ...
   };
   ...
 }

-export async function nextShot(id: string) {
+export async function nextShot(id: string, userId: string) {
   const s = getSession(id);
   if (!s) throw new Error("sessão não encontrada");
+  assertOwner(s, userId);
   ...
 }

-export function answerShot(id: string, choice: number, name?: string) {
+export function answerShot(id: string, choice: number, userId: string, name?: string) {
   const s = getSession(id);
   if (!s) throw new Error("sessão não encontrada");
+  assertOwner(s, userId);
   ...
 }
```
*Nota de implementação:* igual ao achado #1, `userId` opcional em `SessionRecord` cobre
sessões pré-migração (fallback: sem `userId` gravado, `assertOwner` deixa passar) —
remover o fallback depois que não houver mais sessão antiga ativa no store.

---

### 3. IDOR no Survivor — pick forjável de outra wallet (sem dinheiro real) — *(achado novo, revisão de 2026-07-12 sobre os mini games)*
**Arquivo:** `server/src/http/routes/survivor.routes.ts:19-29`
**Categoria:** Segurança
**Severidade:** Baixa

**Comportamento atual:**
```ts
survivorRoutes.post(
  "/pick",
  asyncHandler(async (req, res) => {
    const { wallet, marketId, outcome, name } = req.body ?? {};
    try {
      res.json(await makePick(wallet, String(marketId ?? ""), Number(outcome), name));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);
```
`makePick` (`server/src/games/survivor.ts:67-105`) valida formato de `outcome` e regras de
jogo (1 pick por rodada, mercado aberto, não eliminado) mas nunca checa que quem chama a rota
controla a `wallet` informada.

**Problema / vulnerabilidade:**
Um atacante que conhece a wallet pública da vítima e um `marketId` aberto (via
`GET /survivor/markets`, público) pode chamar `POST /pick` em nome dela — forjando um
`outcome` diferente do que ela apostou de fato on-chain, ou simplesmente consumindo o "1 pick
por rodada" para bloqueá-la. **Verificado que não há prêmio/payout real atrelado ao status
`survived`/`eliminated`** — é só estado de leaderboard/temporada em `survivor.json`; a aposta
real em SOL é assinada à parte pelo client via `place_bet` on-chain e não é afetada por este
endpoint. Por isso a severidade é Baixa (corrupção de estado cosmético), não Média/Alta como
os achados #1/#2 — mas ainda vale corrigir antes de qualquer prêmio real ser associado ao
Survivor.

**Proposta de melhoria:**
Exigir `requireSession` em `POST /pick` e derivar `wallet` da sessão autenticada em vez do
body, mesmo padrão dos achados #1/#2.

**Código sugerido:**
```diff
--- a/server/src/http/routes/survivor.routes.ts
+++ b/server/src/http/routes/survivor.routes.ts
@@
-import { HttpError, asyncHandler } from "../errors.js";
+import { HttpError, asyncHandler } from "../errors.js";
+import { requireSession, type AuthedRequest } from "../middleware.js";
+import { userAddress } from "../../auth/store.js";

 survivorRoutes.post(
   "/pick",
+  requireSession,
   asyncHandler(async (req, res) => {
-    const { wallet, marketId, outcome, name } = req.body ?? {};
+    const { user } = req as AuthedRequest;
+    const { marketId, outcome, name } = req.body ?? {};
+    const wallet = userAddress(user);
     try {
       res.json(await makePick(wallet, String(marketId ?? ""), Number(outcome), name));
     } catch (err) {
       throw new HttpError(400, (err as Error).message);
     }
   })
 );
```

---

## Logs — *(Achados #1-7 de docs/logs-erros-inconsistencias.md)*

### 4. Segredos completos impressos no console — *(Achado #1, logs)*
**Arquivo:** `server/src/scripts/subscribe.ts:13-14`
**Categoria:** Logs
**Severidade:** Média

**Comportamento atual:**
```ts
console.log(`  TXLINE_JWT=${creds.jwt}`);
console.log(`  TXLINE_API_TOKEN=${creds.apiToken}`);
```

**Problema / vulnerabilidade:**
Script manual (`npm run subscribe`), mas imprime credenciais de longa duração (JWT válido
por ~30 dias) inteiras no terminal — ficam no scrollback do shell, em logs de CI se o script
for automatizado por engano, ou em screen-share/screenshot de onboarding. É o mesmo hábito
que, se copiado para um contexto logado (ex.: um cron chamando este script), viraria
vazamento persistente.

**Proposta de melhoria:**
Truncar o valor impresso (mostrar só os primeiros/últimos caracteres) e orientar o usuário a
copiar do arquivo de credenciais salvo em disco, não do console.

**Código sugerido:**
```diff
-console.log(`  TXLINE_JWT=${creds.jwt}`);
-console.log(`  TXLINE_API_TOKEN=${creds.apiToken}`);
+const mask = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
+console.log(`  TXLINE_JWT=${mask(creds.jwt)}`);
+console.log(`  TXLINE_API_TOKEN=${mask(creds.apiToken)}`);
+console.log(`\nValores completos salvos em ${CREDS_PATH} — copie de lá, não deste log.`);
```

---

### 5. `HttpError` nunca é logada no servidor — *(Achado #2, logs)*
**Arquivo:** `server/src/http/errors.ts:15-27`
**Categoria:** Logs
**Severidade:** Média

**Comportamento atual:**
```ts
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[http] ${req.method} ${req.path}: ${message}`);
  res.status(500).json({ error: message });
}
```

**Problema / vulnerabilidade:**
Só o ramo 500 loga. Login falho (401), run inválida (400/403), rate-limit estourado (429) —
tudo isso é devolvido ao cliente mas fica invisível no log do servidor. Em produção, isso
significa não ter como responder "quantas pessoas bateram no rate limit hoje" ou "por que a
sessão de tal usuário está caindo" sem reproduzir o problema.

**Proposta de melhoria:**
Logar todo `HttpError` também, com nível proporcional ao status (4xx como `warn`, 5xx como
`error`), preservando o contrato de resposta ao cliente.

**Código sugerido:**
```diff
 export function errorHandler(
   err: unknown,
   req: Request,
   res: Response,
   _next: NextFunction
 ) {
   if (err instanceof HttpError) {
+    const level = err.status >= 500 ? "error" : "warn";
+    console[level](`[http] ${req.method} ${req.path} → ${err.status}: ${err.message}`);
     res.status(err.status).json({ error: err.message });
     return;
   }
   const message = err instanceof Error ? err.message : String(err);
   console.error(`[http] ${req.method} ${req.path}: ${message}`);
   res.status(500).json({ error: message });
 }
```

---

### 6. Falha de RPC em `/api/auth/me` engolida sem log — *(Achado #3, logs)*
**Arquivo:** `server/src/http/routes/auth.routes.ts:61-66`
**Categoria:** Logs
**Severidade:** Baixa

**Comportamento atual:**
```ts
if (chain) {
  try {
    balance = await chain.connection.getBalance(publicKeyOf(user));
  } catch {
    /* RPC fora: devolve sem saldo */
  }
}
```

**Problema / vulnerabilidade:**
Se o RPC da devnet estiver instável, todo usuário passa a ver saldo `null` sem nenhum rastro
no servidor de que isso está acontecendo nem com que frequência — dificulta distinguir "RPC
degradado" de "bug no client" ao investigar reclamações de saldo sumido.

**Proposta de melhoria:**
Logar a falha com `console.warn`, seguindo o mesmo padrão já usado em `fundWelcome`
(achado #7 desta seção, `auth/store.ts:102-104`).

**Código sugerido:**
```diff
   try {
     balance = await chain.connection.getBalance(publicKeyOf(user));
-  } catch {
-    /* RPC fora: devolve sem saldo */
+  } catch (err) {
+    console.warn(`[auth] falha ao consultar saldo de ${userAddress(user).slice(0, 6)}…: ${(err as Error).message}`);
   }
```

---

### 7. Critério de log inconsistente para o mesmo tipo de falha — *(Achado #4, logs)*
**Arquivo:** `server/src/auth/store.ts:85-105` (comparar com `server/src/http/routes/auth.routes.ts:61-66`, achado anterior)
**Categoria:** Logs
**Severidade:** Baixa

**Comportamento atual:**
```ts
async function fundWelcome(user: UserRecord) {
  const chain = getChain();
  if (!chain || !user.secretKey) return;
  try {
    ...
    await sendAndConfirmTransaction(chain.connection, tx, [chain.authority]);
    console.log(
      `[auth] wallet custodial ${userAddress(user).slice(0, 6)}… fundeada com bônus devnet`
    );
  } catch (err) {
    console.warn(`[auth] falha no bônus de boas-vindas: ${(err as Error).message}`);
  }
}
```

**Problema / vulnerabilidade:**
Falha de RPC ao mover fundos (`fundWelcome`) é logada com `console.warn`; a falha
equivalente ao consultar saldo (`/api/auth/me`, achado #6 acima) é engolida em silêncio no
mesmo módulo (`auth/store.ts` + `auth.routes.ts`, que importam um do outro). Não há critério
documentado de quando logar — fica ao gosto de quem escreveu cada trecho.

**Proposta de melhoria:**
Aplicar a correção do achado #6 (log em `auth.routes.ts:61-66`) resolve a inconsistência
diretamente — os dois pontos equivalentes passam a logar do mesmo jeito. Ver diff no achado
#6.

**Código sugerido:**
Mesmo diff do achado #6 acima; sem mudança adicional necessária em `store.ts`.

---

### 8. Client nunca loga erro no console do browser — *(Achado #5, logs)*
**Arquivo:** `client/src/Markets.tsx:54,86`; `client/src/StakedHilo.tsx:121,145,171-173,200-203,215-218,261-263,280-282,294-296`; `client/src/WalletPage.tsx:52,71`; `client/src/chain/account.tsx:172,184`
**Categoria:** Logs
**Severidade:** Média

**Comportamento atual (exemplo representativo, `StakedHilo.tsx:261-263`):**
```ts
} catch (e) {
  setError(String((e as Error).message));
}
```

Esse padrão se repete em praticamente todo `catch` do client — nenhum deles chama
`console.error`/`console.warn`; o erro só vira `setError(...)` para a UI. O único
`console.*` de todo `client/src` continua sendo `client/src/chain/wallet.tsx:320`
(`console.warn("[wallet-adapter]", ...)`, no handler de erro do wallet-adapter).

**Nota de reverificação:** o commit `8f67b16` reescreveu `StakedHilo.tsx` como componente de
dois modos (target/infinite) e deslocou todas as linhas citadas no doc original
(`128,155,170,216,227,241`) — os catches ainda existem, mas em posições diferentes (listadas
acima). `Markets.tsx` também deslocou de `53,85` para `54,86` (uma linha de diferença, por
causa de um comentário adicionado). `WalletPage.tsx:52,71` e `account.tsx:172,184`
permanecem exatamente onde estavam.

**Problema / vulnerabilidade:**
Quando algo falha de um jeito que a mensagem de erro não explica bem (erro de rede, exceção
não tratada dentro de uma promise, resposta inesperada), o stacktrace se perde — não aparece
nada no console do browser para depurar. Isso empurra todo debugging de bug relatado por
usuário para "reproduzir localmente e torcer", em vez de pedir o console do usuário.

**Proposta de melhoria:**
Adicionar `console.error` em todo `catch` que hoje só faz `setError`, com um prefixo por
módulo (ex.: `[hilo]`, `[markets]`, `[wallet]`) — consistente com o padrão que o server já
usa.

**Código sugerido:**
```diff
   } catch (e) {
+    console.error("[hilo] guess falhou:", e);
     setError(String((e as Error).message));
   }
```
(repetir com o prefixo apropriado em cada um dos pontos listados acima)

---

### 9. Catch vazio sem rastro algum — *(Achado #6, logs)*
**Arquivo:** `client/src/chain/account.tsx:157-159`
**Categoria:** Logs
**Severidade:** Baixa

**Comportamento atual:**
```ts
try {
  const challenge = await api("/api/auth/wallet/nonce", { address });
  const signature = await sign(new TextEncoder().encode(challenge.message));
  const info = await api("/api/auth/wallet/verify", {
    address,
    signature: btoa(String.fromCharCode(...signature)),
  });
  if (!cancelled) adoptSession(info);
} catch {
  // recusa do usuário ou API sem suporte — segue sem sessão de backend
}
```
*(linha corrigida: doc original citava `156-159`; o `catch` está em `157`, um comentário a
menos que na versão anterior do arquivo.)*

**Problema / vulnerabilidade:**
Recusa de assinatura pelo usuário (fluxo esperado) e erro 500 real da API (bug) caem no
mesmo `catch` vazio — ficam indistinguíveis. Como esse é o fluxo de Sign-In With Solana
automático (dispara ao conectar a wallet), um erro real aqui silenciosamente deixa o usuário
sem sessão de backend, sem nenhuma pista do motivo.

**Proposta de melhoria:**
Logar o erro com `console.warn` antes de seguir — não precisa virar `setError` (o fluxo é
best-effort por design), só precisa deixar de ser invisível.

**Código sugerido:**
```diff
   if (!cancelled) adoptSession(info);
-} catch {
-  // recusa do usuário ou API sem suporte — segue sem sessão de backend
+} catch (e) {
+  // recusa do usuário ou API sem suporte — segue sem sessão de backend
+  console.warn("[account] SIWS automático não completou:", e);
 }
```

---

### 10. Sem logger estruturado no server — *(Achado #7, logs)*
**Arquivo:** `server/src/chain/markets.ts`, `server/src/chain/runs.ts`, `server/src/realtime/liveHub.ts`, `server/src/auth/store.ts`, `server/src/txline/auth.ts`
**Categoria:** Logs
**Severidade:** Média

**Comportamento atual:**
Confirmado ainda presente — cada módulo usa `console.log/warn/error` cru com prefixo manual:
```
server/src/realtime/liveHub.ts:30:  wss.on("error", (err) => console.error(`[live] ${err.message}`));
server/src/txline/auth.ts:152:  console.log(`[txline] transação de assinatura: ${txSig}`);
server/src/auth/store.ts:103:    console.warn(`[auth] falha no bônus de boas-vindas: ${(err as Error).message}`);
server/src/chain/runs.ts:564:      console.warn(`[runs] falha liquidando run ${run.id.slice(0, 8)}: ${(err as Error).message}`);
server/src/chain/markets.ts:195:      console.warn(`[markets] falha cancelando demo ${rec.marketId}: ${(err as Error).message}`);
```

**Problema / vulnerabilidade:**
Sem nível configurável (não dá pra silenciar `debug` em produção sem editar código), sem
destino centralizável (não dá pra mandar pra um agregador sem trocar todo `console.*`), sem
correlação de request (um erro em `runs.ts` não tem como ser linkado à requisição HTTP que o
causou).

**Proposta de melhoria:**
Introduzir um logger mínimo (`server/src/logger.ts`) que formalize o padrão de prefixo já
usado informalmente, com nível configurável por env var. Não precisa de dependência externa
para o escopo atual.

**Código sugerido:**
```ts
// server/src/logger.ts (novo arquivo)
type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Level[] = ["debug", "info", "warn", "error"];
const MIN_LEVEL = (process.env.LOG_LEVEL as Level) ?? "info";

export function createLogger(scope: string) {
  const enabled = (l: Level) => LEVELS.indexOf(l) >= LEVELS.indexOf(MIN_LEVEL);
  return {
    debug: (msg: string, ...a: unknown[]) => enabled("debug") && console.debug(`[${scope}] ${msg}`, ...a),
    info: (msg: string, ...a: unknown[]) => enabled("info") && console.log(`[${scope}] ${msg}`, ...a),
    warn: (msg: string, ...a: unknown[]) => enabled("warn") && console.warn(`[${scope}] ${msg}`, ...a),
    error: (msg: string, ...a: unknown[]) => enabled("error") && console.error(`[${scope}] ${msg}`, ...a),
  };
}
```
```diff
// server/src/chain/runs.ts
+import { createLogger } from "../logger.js";
+const log = createLogger("runs");
...
-    console.warn(`[runs] falha liquidando run ${run.id.slice(0, 8)}: ${(err as Error).message}`);
+    log.warn(`falha liquidando run ${run.id.slice(0, 8)}: ${(err as Error).message}`);
```

---

## Tratamento de erros — *(Achados #8-13 de docs/logs-erros-inconsistencias.md)*

### 11. Mensagem de erro interna vazada ao cliente no 500 — *(Achado #8, tratamento de erros)*
**Arquivo:** `server/src/http/errors.ts:25-27`
**Categoria:** Tratamento de erros
**Severidade:** Alta

**Comportamento atual:**
```ts
const message = err instanceof Error ? err.message : String(err);
console.error(`[http] ${req.method} ${req.path}: ${message}`);
res.status(500).json({ error: message });
```

**Problema / vulnerabilidade:**
Todo erro que não é `HttpError` (ex.: exceção de simulação de transação Anchor, erro de
conexão RPC, exceção não tratada de uma lib) devolve `err.message` bruto ao browser com
status 500. Mensagens de simulação Anchor/Solana costumam incluir detalhes internos (nomes
de contas, program logs, endereços de PDA) que não deveriam vazar para o cliente — é
superfície de reconhecimento de graça para quem estiver sondando a API.

**Proposta de melhoria:**
Devolver uma mensagem genérica ao cliente e manter o detalhe completo só no log do servidor
(já corrigido pelo `console.error` existente).

**Código sugerido:**
```diff
   const message = err instanceof Error ? err.message : String(err);
   console.error(`[http] ${req.method} ${req.path}: ${message}`);
-  res.status(500).json({ error: message });
+  res.status(500).json({ error: "erro interno — tente novamente em instantes" });
```

---

### 12. Parse de wallet sem try/catch em `tickets.routes.ts` — *(Achado #9, tratamento de erros)*
**Arquivo:** `server/src/chain/tickets.ts:45` (via `server/src/http/routes/tickets.routes.ts:8-14`)
**Categoria:** Tratamento de erros
**Severidade:** Média

**Comportamento atual:**
```ts
// tickets.ts:42-45
export async function listTickets(wallet: string): Promise<TicketView[]> {
  const chain = getChain();
  if (!chain) return [];
  const owner = new PublicKey(wallet);
```
```ts
// tickets.routes.ts:8-14
ticketsRoutes.get(
  "/:wallet",
  requireChain,
  asyncHandler(async (req, res) => {
    res.json({ tickets: await listTickets(req.params.wallet) });
  })
);
```

**Problema / vulnerabilidade:**
Uma wallet inválida na URL (`GET /api/tickets/abc`) faz `new PublicKey("abc")` lançar uma
exceção genérica do `@solana/web3.js`, que sobe crua até o `errorHandler` e vira 500 com
mensagem interna da lib — em vez de um 400 claro. Compare com `server/src/auth/wallet.ts:38-47`
(`parseAddress`) e `server/src/chain/runs.ts:225-229`, que protegem exatamente o mesmo parse
e devolvem `HttpError(400, ...)`. Mesma operação, três comportamentos diferentes no mesmo
backend — e este é o único dos três que ainda vaza um 500.

*(linha corrigida: o doc original citava `runs.ts:174-178` como o exemplo "protegido" —
esse trecho hoje está em `runs.ts:225-229`, dentro de `createRun`.)*

**Proposta de melhoria:**
Envolver o parse com o mesmo padrão de `wallet.ts`/`runs.ts`: `try/catch` que relança como
`HttpError(400, ...)`.

**Código sugerido:**
```diff
 export async function listTickets(wallet: string): Promise<TicketView[]> {
   const chain = getChain();
   if (!chain) return [];
-  const owner = new PublicKey(wallet);
+  let owner: PublicKey;
+  try {
+    owner = new PublicKey(wallet);
+  } catch {
+    throw new HttpError(400, "wallet inválida");
+  }
```
(requer importar `HttpError` de `../http/errors.js` em `tickets.ts`, que hoje não o faz)

---

### 13. Erro de domínio vira 400 cegamente, mesmo quando é falha de infraestrutura — *(Achado #10, tratamento de erros)*
**Arquivo:** `server/src/http/routes/runs.routes.ts:38-49,70-75,81-86`
**Categoria:** Tratamento de erros
**Severidade:** Média

**Comportamento atual:**
```ts
runsRoutes.post(
  "/:id/guess",
  asyncHandler(async (req, res) => {
    ...
    try {
      res.json(await guessRun(req.params.id, dir));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  })
);
```

**Problema / vulnerabilidade:**
Qualquer erro dentro de `guessRun`/`cashoutRun`/`createRun` — inclusive falha de RPC,
timeout de rede, ou erro de simulação on-chain — é embrulhado cegamente em
`HttpError(400, ...)`. Um RPC fora do ar chega ao cliente como "bad request" (erro do
usuário), quando na verdade é uma falha temporária de infraestrutura — confunde debugging
(o time olha o input do usuário, não o RPC) e também a UX (o jogador acha que fez algo
errado). Note que `custodial.routes.ts` já resolve parte disso checando
`if (err instanceof HttpError) throw err;` antes de embrulhar (`custodial.routes.ts:28,47`)
— `runs.routes.ts` não replica esse cuidado.

**Proposta de melhoria:**
Replicar o padrão de `custodial.routes.ts` (não sobrescrever `HttpError`s já lançados) e
usar 502/503 para erros que vêm claramente de RPC/rede, mantendo 400 só para erro de
validação/regra de negócio real.

**Código sugerido:**
```diff
     try {
       res.json(await guessRun(req.params.id, dir));
     } catch (err) {
+      if (err instanceof HttpError) throw err;
+      if (isRpcError(err)) throw new HttpError(502, "falha de conexão com a rede — tente de novo");
       throw new HttpError(400, (err as Error).message);
     }
```
```ts
// server/src/http/errors.ts — helper novo
export function isRpcError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|ECONNRESET|fetch failed|429|Too Many Requests/i.test(msg);
}
```

---

### 14. Status HTTP genérico onde já existe convenção melhor no mesmo backend — *(Achado #11, tratamento de erros)*
**Arquivo:** `server/src/http/routes/runs.routes.ts:38-49` (POST /) vs `server/src/chain/runs.ts:243,247` vs `server/src/auth/guest.ts:19,26`
**Categoria:** Tratamento de erros
**Severidade:** Baixa

**Comportamento atual:**
```ts
// runs.ts:243,247 (linha corrigida — doc original citava 187,191)
throw new Error("você já tem uma run ativa — termine-a antes de abrir outra");
...
throw new Error("limite de novas runs atingido — tente de novo em alguns minutos");
```
Ambos sobem por `runs.routes.ts:47-49` e viram `HttpError(400, ...)` — status genérico.
Compare com `server/src/auth/guest.ts:19,26`, no mesmo backend:
```ts
throw new HttpError(403, "modo convidado desativado");
...
throw new HttpError(429, "limite de contas convidadas — tente mais tarde");
```

**Problema / vulnerabilidade:**
"Você já tem uma run ativa" é um conflito de estado (409), e "limite de runs atingido" é
rate-limit (429) — mas ambos chegam ao cliente como 400 genérico, enquanto o mesmo tipo de
situação em `guest.ts` já usa os códigos corretos. Um client (ou monitoramento) que trate
status HTTP de forma semântica (retry automático em 429, mensagem diferente em 409) não
consegue diferenciar esses casos vindos de `runs`.

**Proposta de melhoria:**
Fazer `chain/runs.ts` lançar `HttpError` diretamente com o status certo (409/429), em vez de
`Error` genérico reembrulhado como 400 na rota.

**Código sugerido:**
```diff
+import { HttpError } from "../http/errors.js";
...
   if (s.runs.some(...)) {
-    throw new Error("você já tem uma run ativa — termine-a antes de abrir outra");
+    throw new HttpError(409, "você já tem uma run ativa — termine-a antes de abrir outra");
   }
   const recentRuns = s.runs.filter((r) => Date.now() - r.createdAt < RUN_WINDOW_MS);
   if (recentRuns.length >= MAX_RUNS_PER_WINDOW) {
-    throw new Error("limite de novas runs atingido — tente de novo em alguns minutos");
+    throw new HttpError(429, "limite de novas runs atingido — tente de novo em alguns minutos");
   }
```
```diff
// runs.routes.ts — não reembrulhar se já for HttpError (ver achado #13 desta lista)
     } catch (err) {
+      if (err instanceof HttpError) throw err;
       throw new HttpError(400, (err as Error).message);
     }
```

---

### 15. Mesma condição (`chain === null`), respostas opostas conforme a rota — *(Achado #12, tratamento de erros)*
**Arquivo:** `server/src/http/routes/markets.routes.ts:8-13` (sem `requireChain`) vs `server/src/http/routes/tickets.routes.ts:10` e `runs.routes.ts:32` (com `requireChain`)
**Categoria:** Tratamento de erros
**Severidade:** Baixa

**Comportamento atual:**
```ts
// markets.routes.ts — sem requireChain
marketsRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ programId: PROGRAM_ID.toBase58(), markets: await listMarkets() });
  })
);
```
`chain/markets.ts:335-343` já trata `chain === null` graciosamente (devolve array vazio).
Mas `tickets.routes.ts:10` e `runs.routes.ts:32` aplicam `requireChain`, que intercepta
antes e devolve 503 na mesma condição (`middleware.ts:19-29`).

**Problema / vulnerabilidade:**
Authority ausente (mesma causa-raiz) produz 200 com `{ markets: [] }` em `/api/markets` e
503 em `/api/tickets/:wallet` e `/api/runs/*`. Um client que trata 503 como "on-chain
desativado, mostra aviso" nunca vê esse aviso na tela de mercados — só uma lista vazia,
indistinguível de "não há jogos agora".

**Proposta de melhoria:**
Escolher um padrão único: ou `markets.routes.ts` também usa `requireChain` (503 explícito),
ou as outras rotas passam a devolver dado vazio como `markets` já faz. Dado que `/api/markets`
é chamada no carregamento inicial da home e uma lista vazia é uma UX aceitável, a opção mais
simples é levar `tickets`/`runs` para o mesmo comportamento — mas isso muda semântica de
erro esperada pelo client hoje, então a alternativa mais segura e menor é aplicar
`requireChain` em `markets.routes.ts` também, alinhando com as demais.

**Código sugerido:**
```diff
+import { requireChain } from "../middleware.js";
...
 marketsRoutes.get(
   "/",
+  requireChain,
   asyncHandler(async (_req, res) => {
     res.json({ programId: PROGRAM_ID.toBase58(), markets: await listMarkets() });
   })
 );
```

---

### 16. Rotas irmãs sem `asyncHandler` — padrão frágil se alguém tornar async por engano — *(Achado #13, tratamento de erros)*
**Arquivo:** `server/src/http/routes/auth.routes.ts:43-45` (`/wallet/nonce`) e `server/src/http/routes/runs.routes.ts:53-55,57-61` (`/wallet/:wallet`, `/:id`)
**Categoria:** Tratamento de erros
**Severidade:** Baixa

**Comportamento atual:**
```ts
// auth.routes.ts:43-45
authRoutes.post("/wallet/nonce", (req, res) => {
  res.json(walletChallenge(req.body?.address));
});
```
```ts
// runs.routes.ts:53-55, 57-61
runsRoutes.get("/wallet/:wallet", (req, res) => {
  res.json({ runs: listRunsByWallet(req.params.wallet) });
});

runsRoutes.get("/:id", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) throw new HttpError(404, "run não encontrada");
  res.json(runView(run));
});
```

**Problema / vulnerabilidade:**
Essas rotas não usam `asyncHandler`, diferente das rotas irmãs no mesmo arquivo (ex.:
`POST /wallet/verify` logo abaixo, em `auth.routes.ts:47-52`). Hoje funciona porque os
handlers são síncronos — mas é um padrão frágil: se alguém tornar um desses handlers
`async` (por exemplo, para adicionar uma checagem de sessão que faz uma leitura assíncrona —
como o próprio achado #1 desta lista de auditoria propõe fazer em `/wallet/:wallet`), uma
rejeição de Promise não tratada não chama `next(err)` e o Express nunca responde — a
requisição trava sem erro nenhum no cliente nem no log.

**Proposta de melhoria:**
Envolver essas rotas em `asyncHandler` preventivamente, mesmo sendo síncronas hoje — custo
zero, remove a armadilha para o futuro (aliás, é pré-requisito direto para o fix do achado
#1 de segurança, que torna `/wallet/:wallet` assíncrona por causa do `requireSession`).

**Código sugerido:**
```diff
-authRoutes.post("/wallet/nonce", (req, res) => {
-  res.json(walletChallenge(req.body?.address));
-});
+authRoutes.post(
+  "/wallet/nonce",
+  asyncHandler(async (req, res) => {
+    res.json(walletChallenge(req.body?.address));
+  })
+);
```
(mesmo padrão para `runs.routes.ts:53-55` e `:57-61`)

---

## Inconsistências — *(Achados #14-20 de docs/logs-erros-inconsistencias.md)*

### 17. Três nomes de campo diferentes para o mesmo conceito (PDA do mercado) — *(Achado #14, inconsistência)*
**Arquivo:** `server/src/chain/markets.ts:32` (`MarketRecord.pda`) vs `server/src/chain/runs.ts:89,189` (`RunRecord.marketPdaB58` / exposto como `marketPda`) vs `server/src/chain/tickets.ts:22` (`TicketView.market`)
**Categoria:** Inconsistência
**Severidade:** Baixa

**Comportamento atual:**
```ts
// markets.ts:32
pda: string;

// runs.ts:89 (campo interno) — linha corrigida, doc original citava :59
marketPdaB58: string;
// runs.ts:189 (exposto na view pública) — linha corrigida, doc original citava :149
marketPda: run.marketPdaB58,

// tickets.ts:22
market: string;
```

**Problema / vulnerabilidade:**
`pda`, `marketPdaB58`/`marketPda` e `market` referem-se ao mesmo tipo de valor (endereço
base58 da PDA do mercado). Quem lê o client sem contexto do server não tem como saber, só
pelo nome do campo, que `TicketView.market` e `RunRecord.marketPda` guardam a mesma coisa
que `MarketRecord.pda` — aumenta a chance de um dev montar uma comparação errada entre eles
ou duplicar lógica que já existe.

**Proposta de melhoria:**
Padronizar em um nome único (ex.: `marketPda`) nas três interfaces, documentando a convenção
uma vez.

**Código sugerido:**
```diff
// markets.ts
 export interface MarketRecord {
   marketId: string;
-  pda: string;
+  marketPda: string;

// runs.ts
 export interface RunRecord {
-  marketPdaB58: string;
+  marketPda: string;

// tickets.ts
 export interface TicketView {
   ticketMint: string;
   ticketAccount: string;
-  market: string;
+  marketPda: string;
```
(requer atualizar os poucos usos internos de cada campo — baixo risco, são só renames)

---

### 18. "wallet" e "address" usados alternadamente para o mesmo dado — *(Achado #15, inconsistência)*
**Arquivo:** `server/src/auth/store.ts:72-74,183` (`userAddress()`/`address`) vs `server/src/http/routes/runs.routes.ts:34,53` e `tickets.routes.ts:9` vs `client/src/StakedHilo.tsx:193`
**Categoria:** Inconsistência
**Severidade:** Baixa

**Comportamento atual:**
```ts
// auth/store.ts:72-74
export function userAddress(user: UserRecord): string {
  return user.secretKey ? userKeypair(user).publicKey.toBase58() : user.subject;
}
// auth/store.ts:183
address: userAddress(user),
```
```ts
// runs.routes.ts:34
const { wallet, target, stakeLamports, mode } = req.body ?? {};
// runs.routes.ts:53
runsRoutes.get("/wallet/:wallet", ...)
// tickets.routes.ts:9
"/:wallet",
```
```ts
// client/src/StakedHilo.tsx:193 (linha corrigida — doc original citava :149,
// que hoje é só o cleanup de um useEffect, não o uso do campo)
wallet: account.address,
```

**Problema / vulnerabilidade:**
O módulo de auth usa `address`/`userAddress()`; as rotas de `runs`/`tickets` usam `wallet`;
o client lê `account.address` e o envia como `wallet` no body. Funciona, mas exige que quem
mexe em qualquer um desses pontos saiba de cor que são sinônimos — não há erro de compilação
se alguém confundir os dois em uma interface nova.

**Proposta de melhoria:**
Padronizar em `wallet` (é o termo mais específico do domínio — "address" é genérico demais e
já colide com endereço de conta de token) em toda a API pública; manter `address` só como
detalhe interno de `auth/store.ts` se preferirem não tocar nesse módulo.

**Código sugerido:**
```diff
// auth/store.ts — nome público da função exportada
-export function userAddress(user: UserRecord): string {
+export function userWallet(user: UserRecord): string {
   return user.secretKey ? userKeypair(user).publicKey.toBase58() : user.subject;
 }
...
 export function sessionInfo(user: UserRecord, token: string): SessionInfo {
   return {
     token,
-    address: userAddress(user),
+    wallet: userWallet(user),
```
(requer atualizar o tipo `SessionInfo` e os poucos call sites — todos já mapeados nesta
entrada)

---

### 19. Derivação de PDA duplicada entre server e client sem tipo compartilhado — *(Achado #16, inconsistência)*
**Arquivo:** `server/src/chain/client.ts:78-97` vs `client/src/chain/oddies.ts:34-53`
**Categoria:** Inconsistência
**Severidade:** Média

**Comportamento atual:**
```ts
// server/src/chain/client.ts:78-97
export const configPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
export const marketPda = (marketId: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];
export const vaultPda = (market: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], PROGRAM_ID)[0];
export const betPda = (market: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  )[0];
```
```ts
// client/src/chain/oddies.ts:34-53 — idêntico, código-fonte duplicado
export const configPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
export const marketPda = (marketId: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];
// ... vaultPda e betPda idênticos
```

**Problema / vulnerabilidade:**
Se as seeds do programa Anchor mudarem (ex.: adicionar um byte de versão na seed de
`market`), é preciso lembrar de editar os dois arquivos manualmente — não há erro de
compilação nem de teste que force a sincronização. Um mismatch silencioso faria o client
calcular uma PDA errada e a transação falhar on-chain com um erro de conta genérico, difícil
de linkar à causa raiz.

**Proposta de melhoria:**
Extrair a derivação de PDA para um pacote/arquivo único, publicado localmente via workspace
(ex.: `packages/pda/`) e importado tanto pelo `server` (Node/CommonJS ou ESM) quanto pelo
`client` (bundler). Escopo do hackathon pode adiar isso, mas vale documentar como dívida
técnica explícita.

**Código sugerido:**
```ts
// packages/pda/src/index.ts (novo pacote compartilhado)
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export function makePdaHelpers(programId: PublicKey) {
  const configPda = () =>
    PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
  const marketPda = (marketId: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
      programId
    )[0];
  const vaultPda = (market: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], programId)[0];
  const betPda = (market: PublicKey, mint: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), market.toBuffer(), mint.toBuffer()],
      programId
    )[0];
  return { configPda, marketPda, vaultPda, betPda };
}
```
```diff
// server/src/chain/client.ts e client/src/chain/oddies.ts
-export const configPda = () => ...
-export const marketPda = (marketId: BN) => ...
-export const vaultPda = (market: PublicKey) => ...
-export const betPda = (market: PublicKey, mint: PublicKey) => ...
+import { makePdaHelpers } from "@oddies-bet/pda";
+export const { configPda, marketPda, vaultPda, betPda } = makePdaHelpers(PROGRAM_ID);
```

---

### 20. Interfaces redefinidas de forma independente nos dois lados — *(Achado #17, inconsistência)*
**Arquivo:** `server/src/chain/tickets.ts:19-35` (`TicketView`) vs `client/src/WalletPage.tsx:9-23`; `server/src/chain/markets.ts:312-318` (`MarketView`) vs `client/src/Markets.tsx:11-24` *(linha corrigida — doc original citava `10-23`)*
**Categoria:** Inconsistência
**Severidade:** Média

**Comportamento atual (par confirmado idêntico campo a campo hoje):**
```ts
// server: tickets.ts:19-35
export interface TicketView {
  ticketMint: string;
  ticketAccount: string;
  market: string;
  marketId: string;
  outcome: number;
  stakeNet: number;
  status: TicketStatus;
  payout: number;
  marketState: "open" | "resolved" | "voided";
  winningOutcome: number | null;
  kind: "parimutuel" | "houseBacked";
  label: string | null;
  closeTs: number;
}
```
```ts
// client: WalletPage.tsx:9-23 — cópia manual do shape acima
interface TicketView {
  ticketMint: string;
  ticketAccount: string;
  market: string;
  marketId: string;
  outcome: number;
  stakeNet: number;
  status: "open" | "claimable" | "lost" | "claimed";
  payout: number;
  marketState: "open" | "resolved" | "voided";
  winningOutcome: number | null;
  kind: "parimutuel" | "houseBacked";
  label: string | null;
  closeTs: number;
}
```

**Problema / vulnerabilidade:**
Nada garante que os dois shapes continuem batendo. Se um campo for renomeado ou removido no
server, o client não quebra a compilação — só quebra em runtime, com `undefined` silencioso
em algum lugar da tela (ex.: `ti.marketState` virando `ti.state`), o que é bem mais difícil
de rastrear que um erro de tipo em build.

**Proposta de melhoria:**
Gerar os tipos do client a partir dos tipos do server (ou de um pacote de tipos
compartilhado, como no achado #16), eliminando a cópia manual.

**Código sugerido:**
```ts
// packages/api-types/src/index.ts (novo pacote compartilhado, ou re-export simples
// se server e client já estiverem no mesmo workspace/monorepo)
export type { TicketView, TicketStatus } from "../../server/src/chain/tickets.js";
export type { MarketView } from "../../server/src/chain/markets.js";
```
```diff
// client/src/WalletPage.tsx
-interface TicketView {
-  ticketMint: string;
-  ...
-}
+import type { TicketView } from "@oddies-bet/api-types";
```
*(alternativa mais leve para o escopo do hackathon: um script de CI que falha se os dois
arquivos divergirem em campos, sem exigir um pacote novo)*

---

### 21. Três convenções distintas de chamada HTTP no client — *(Achado #18, inconsistência)*
**Arquivo:** `client/src/chain/account.tsx:57-69` (helper `api()`) vs `client/src/StakedHilo.tsx:63-72` (helper quase idêntico duplicado) vs `client/src/Markets.tsx:44-51` e `client/src/WalletPage.tsx:46-49` (`fetch` cru com checagem própria)
**Categoria:** Inconsistência
**Severidade:** Baixa

**Comportamento atual:**
```ts
// account.tsx:57-69
async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(path, {
    method: body !== undefined ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}
```
```ts
// StakedHilo.tsx:63-72 — quase igual, mas sem parâmetro token e sem .catch no res.json()
// (linha corrigida — doc original citava :53-62, deslocado pelo commit 8f67b16)
async function api(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}
```
```ts
// Markets.tsx:44-51 — fetch cru, checagem própria (inclusive checando content-type,
// que os outros dois não fazem)
const res = await fetch("/api/markets");
if (!res.ok || !res.headers.get("content-type")?.includes("json")) {
  throw new Error(t.markets.serverOffline);
}
const json = await res.json();
```

**Problema / vulnerabilidade:**
Três implementações do "mesmo" helper, cada uma com uma pequena diferença de robustez (só
`account.tsx` protege contra corpo de resposta não-JSON; só `Markets.tsx` checa
`content-type`; `StakedHilo.tsx` não aceita `token`, então não dá pra reusá-lo em uma chamada
autenticada sem duplicar de novo). Bugs corrigidos em um lugar não se propagam para os
outros dois.

**Proposta de melhoria:**
Extrair o helper de `account.tsx` (o mais robusto dos três) para um módulo compartilhado
(`client/src/chain/http.ts`) e importar nos três arquivos, eliminando as duas cópias.

**Código sugerido:**
```ts
// client/src/chain/http.ts (novo arquivo)
export async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(path, {
    method: body !== undefined ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.headers.get("content-type")?.includes("json")) {
    throw new Error("resposta inesperada do servidor");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}
```
```diff
// client/src/StakedHilo.tsx
-async function api(path: string, body?: unknown) {
-  const res = await fetch(path, { ... });
-  ...
-}
+import { api } from "./chain/http";

// client/src/Markets.tsx
-const res = await fetch("/api/markets");
-if (!res.ok || !res.headers.get("content-type")?.includes("json")) {
-  throw new Error(t.markets.serverOffline);
-}
-const json = await res.json();
+import { api } from "./chain/http";
+const json = await api("/api/markets");
```

---

### 22. Sem regra clara de envelope de resposta HTTP — *(Achado #19, inconsistência)*
**Arquivo:** `server/src/http/routes/tickets.routes.ts:12`, `runs.routes.ts:39,54,71,82`, `markets.routes.ts:11` vs `custodial.routes.ts:26,44`
**Categoria:** Inconsistência
**Severidade:** Baixa

**Comportamento atual:**
```ts
// envelopado em objeto nomeado:
res.json({ tickets: await listTickets(req.params.wallet) });        // tickets.routes.ts:12
res.json({ runs: listRunsByWallet(req.params.wallet) });            // runs.routes.ts:54
res.json({ programId: PROGRAM_ID.toBase58(), markets: await listMarkets() }); // markets.routes.ts:11

// cru, sem envelope:
res.json(await custodialPlaceBet(userKeypair(user), marketId, outcome, lamports)); // custodial.routes.ts:26
res.json({ signature: await custodialClaim(...) });                                // custodial.routes.ts:44 (este É envelopado)
res.json(await createRun(...));   // runs.routes.ts:39 — cru
res.json(await guessRun(...));    // runs.routes.ts:71 — cru
res.json(await cashoutRun(...));  // runs.routes.ts:82 — cru
```

**Problema / vulnerabilidade:**
Não há regra visível de quando a resposta vem embrulhada em `{ nome: [...] }` (listas) vs.
crua (recurso único). Isso por si só é uma convenção razoável (lista → nomeada, recurso →
cru) — mas `custodial.routes.ts:26` quebra até essa regra implícita: devolve o resultado de
`custodialPlaceBet` cru, enquanto `custodialClaim` ao lado devolve `{ signature }`. Um
integrador (ou o próprio time, montando um client novo) não tem como prever o shape sem
checar a rota específica.

**Proposta de melhoria:**
Formalizar a regra (lista → `{ chave: [...] }`, recurso único → objeto cru) e ajustar o único
outlier (`custodial.routes.ts:26`) para segui-la, documentando isso perto do router principal.

**Código sugerido:**
```diff
// custodial.routes.ts — alinhar place-bet ao padrão "recurso único, cru" que já vale
// para createRun/guessRun/cashoutRun (o retorno de custodialPlaceBet já é um objeto
// PlacedBet coerente, então isso já está correto — o outlier real é comparar com
// custodialClaim, que resulta num objeto de campo único; padronizar esse:
-res.json({
-  signature: await custodialClaim(userKeypair(user), market, ticketMint, ticketAccount),
-});
+res.json(await custodialClaim(userKeypair(user), market, ticketMint, ticketAccount).then((signature) => ({ signature, ok: true } as const)));
```
*(o ajuste real de shape é uma decisão de produto/API design — o ponto de auditoria é
formalizar e documentar a regra, não necessariamente esta direção específica de mudança)*

---

### 23. Rigor de validação de input diferente entre rotas irmãs — *(Achado #20, inconsistência)*
**Arquivo:** `server/src/http/routes/custodial.routes.ts:17-24` vs `server/src/http/routes/runs.routes.ts:34-37` (validação real fica em `server/src/chain/runs.ts:255-260`)
**Categoria:** Inconsistência
**Severidade:** Média

**Comportamento atual:**
```ts
// custodial.routes.ts:17-24 — valida tipo e formato na própria rota
if (
  typeof marketId !== "string" ||
  !Number.isInteger(outcome) ||
  !Number.isInteger(lamports) ||
  lamports <= 0
) {
  throw new HttpError(400, "marketId, outcome e lamports (inteiro > 0) obrigatórios");
}
```
```ts
// runs.routes.ts:34-37 — só valida wallet; target/stakeLamports passam por
// Number(...) sem checar NaN/inteiro na própria rota
const { wallet, target, stakeLamports, mode } = req.body ?? {};
if (typeof wallet !== "string" || !wallet) {
  throw new HttpError(400, "wallet obrigatória");
}
...
res.json(await createRun(wallet, Number(target), Number(stakeLamports), ...));
```
```ts
// chain/runs.ts:255-260 — validação real, implícita, longe da rota
// (linha corrigida — doc original citava :194-209)
if (!oddsBps) {
  throw new Error(`meta inválida: escolha entre ${Object.keys(RUN_ODDS_BPS).join(", ")}`);
}
if (!Number.isInteger(stakeLamports) || stakeLamports < MIN_STAKE_LAMPORTS) {
  throw new Error(`stake mínimo: ${MIN_STAKE_LAMPORTS} lamports`);
}
```

**Problema / vulnerabilidade:**
`custodial.routes.ts` rejeita input malformado na borda da API, com mensagem clara e 400
explícito. `runs.routes.ts` deixa `Number(target)`/`Number(stakeLamports)` passarem qualquer
coisa (`Number("abc")` → `NaN`, `Number([])` → `0`) até dentro de `createRun`, que só
descobre o problema depois de já ter calculado `oddsBps`/`payout` — a validação "real"
acontece tarde e em um arquivo diferente de onde o erro é percebido, tornando o comportamento
para input malformado dependente de onde na cadeia de cálculo o `NaN` se propaga (risco de
um `NaN` escapar para uma chamada on-chain antes de ser pego, em vez de ser rejeitado na
borda).

**Proposta de melhoria:**
Validar `target`/`stakeLamports` como inteiros na própria rota, igual ao padrão já
estabelecido em `custodial.routes.ts`, falhando cedo com 400 explícito antes de qualquer
cálculo.

**Código sugerido:**
```diff
 runsRoutes.post(
   "/",
   requireChain,
   asyncHandler(async (req, res) => {
     const { wallet, target, stakeLamports, mode } = req.body ?? {};
     if (typeof wallet !== "string" || !wallet) {
       throw new HttpError(400, "wallet obrigatória");
     }
+    if (!Number.isInteger(target) || target <= 0) {
+      throw new HttpError(400, "target deve ser um inteiro positivo");
+    }
+    if (!Number.isInteger(stakeLamports) || stakeLamports <= 0) {
+      throw new HttpError(400, "stakeLamports deve ser um inteiro positivo");
+    }
     try {
       res.json(
         await createRun(
           wallet,
-          Number(target),
-          Number(stakeLamports),
+          target,
+          stakeLamports,
           mode === "infinite" ? "infinite" : "target"
         )
       );
```

---

## Resumo executivo

| # | Achado | Categoria | Severidade | Arquivo |
|---|---|---|---|---|
| 1 | IDOR em guess/cashout/wallet de runs (sem `requireSession`) | Segurança | **Alta** | `server/src/http/routes/runs.routes.ts:53-87` |
| 2 | IDOR no Penalty Predictor (mesmo padrão, dinheiro real) | Segurança | **Alta** | `server/src/http/routes/arcade.routes.ts:79-107` |
| 11 | `err.message` bruto vazado ao cliente no 500 | Tratamento de erros | **Alta** | `server/src/http/errors.ts:25-27` |
| 8 | Client nunca loga erro no console do browser | Logs | Média | `client/src/StakedHilo.tsx` (vários), `Markets.tsx`, `WalletPage.tsx`, `account.tsx` |
| 10 | Sem logger estruturado no server | Logs | Média | `server/src/chain/*.ts`, `realtime/liveHub.ts`, `auth/store.ts`, `txline/auth.ts` |
| 5 | `HttpError` (4xx) nunca é logada no servidor | Logs | Média | `server/src/http/errors.ts:15-27` |
| 4 | Segredos completos impressos no console | Logs | Média | `server/src/scripts/subscribe.ts:13-14` |
| 12 | Parse de wallet sem try/catch (500 em vez de 400) | Tratamento de erros | Média | `server/src/chain/tickets.ts:45` |
| 13 | Erro de domínio vira 400 cegamente (mesmo se for falha de RPC) | Tratamento de erros | Média | `server/src/http/routes/runs.routes.ts:38-49,70-75,81-86` |
| 19 | PDA re-derivada de forma idêntica em server e client, sem tipo compartilhado | Inconsistência | Média | `server/src/chain/client.ts:78-97`, `client/src/chain/oddies.ts:34-53` |
| 20 | Interfaces (`TicketView`, `MarketView`) redefinidas independentemente | Inconsistência | Média | `server/src/chain/tickets.ts:19-35`, `client/src/WalletPage.tsx:9-23`, `server/src/chain/markets.ts:312-318`, `client/src/Markets.tsx:11-24` |
| 23 | Validação de input com rigor diferente entre rotas irmãs | Inconsistência | Média | `server/src/http/routes/runs.routes.ts:34-37` vs `custodial.routes.ts:17-24` |
| 3 | IDOR no Survivor (pick forjável, sem prêmio real atrelado) | Segurança | Baixa | `server/src/http/routes/survivor.routes.ts:19-29` |
| 6 | Falha de RPC em `/api/auth/me` engolida sem log | Logs | Baixa | `server/src/http/routes/auth.routes.ts:61-66` |
| 7 | Critério de log inconsistente para a mesma falha no mesmo módulo | Logs | Baixa | `server/src/auth/store.ts:85-105` |
| 9 | Catch vazio sem rastro (recusa de assinatura vs erro real indistinguíveis) | Logs | Baixa | `client/src/chain/account.tsx:157-159` |
| 14 | Status HTTP genérico (400) onde já existe convenção melhor (409/429) | Tratamento de erros | Baixa | `server/src/chain/runs.ts:243,247` |
| 15 | Mesma condição (`chain === null`), respostas opostas conforme a rota | Tratamento de erros | Baixa | `server/src/http/routes/markets.routes.ts:8-13` |
| 16 | Rotas irmãs sem `asyncHandler` — padrão frágil | Tratamento de erros | Baixa | `server/src/http/routes/auth.routes.ts:43-45`, `runs.routes.ts:53-61` |
| 17 | Três nomes de campo diferentes para a mesma PDA de mercado | Inconsistência | Baixa | `server/src/chain/markets.ts:32`, `runs.ts:89,189`, `tickets.ts:22` |
| 18 | "wallet" e "address" usados alternadamente para o mesmo dado | Inconsistência | Baixa | `server/src/auth/store.ts:72-74,183`, `runs.routes.ts:34,53`, `client/src/StakedHilo.tsx:193` |
| 21 | Três convenções distintas de chamada HTTP no client | Inconsistência | Baixa | `client/src/chain/account.tsx:57-69`, `StakedHilo.tsx:63-72`, `Markets.tsx:44-51`, `WalletPage.tsx:46-49` |
| 22 | Sem regra clara de envelope de resposta HTTP | Inconsistência | Baixa | `tickets.routes.ts:12`, `runs.routes.ts:39,54,71,82`, `markets.routes.ts:11`, `custodial.routes.ts:26,44` |
