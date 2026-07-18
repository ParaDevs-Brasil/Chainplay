# Raio-X: logs, tratamento de erros e inconsistências

> Levantamento em 2026-07-12 sobre a camada de integração backend↔contrato
> (`server/src/chain/*`, `server/src/http/*`, `client/src/chain/*` e telas de jogo).
> Não é revisão de segurança — foco em observabilidade, debugging e consistência
> de padrões entre módulos. Achados com `arquivo:linha`, sem correção aplicada.

## 1. Logs

| # | Local | Achado |
|---|---|---|
| 1 | `server/src/scripts/subscribe.ts:13-14` | Imprime `TXLINE_JWT` e `TXLINE_API_TOKEN` completos no console — script manual, mas é um hábito perigoso se copiado para outro contexto. |
| 2 | `server/src/http/errors.ts:21-27` | `HttpError` (400/401/403/404/429/501/503) nunca é logada no servidor — só o `else` (500) chama `console.error`. Login falho, run inválida, rate-limit: tudo invisível no log. |
| 3 | `server/src/http/routes/auth.routes.ts:62-66` | `catch { /* RPC fora: devolve sem saldo */ }` em `/api/auth/me` — falha de RPC ao buscar saldo não é logada em lugar nenhum. |
| 4 | `server/src/auth/store.ts:102-104` | O mesmo tipo de falha (RPC ao consultar/mover fundos) **é** logada via `console.warn` em `fundWelcome` — inconsistência de critério entre pontos equivalentes do mesmo módulo. |
| 5 | `client/src/Markets.tsx:53,85`; `StakedHilo.tsx:128,155,170,216,227,241`; `WalletPage.tsx:52,71`; `chain/account.tsx:172,184` | Nenhum `catch` do client faz `console.error`/`warn` — o erro só vira `setError(...)` pra UI. Único `console.*` de todo `client/src` é `chain/wallet.tsx:320`. Stacktrace se perde, nada aparece no console do browser pra depurar. |
| 6 | `client/src/chain/account.tsx:156-159` | `catch { // recusa do usuário ou API sem suporte }` — vazio. Recusa de assinatura e erro 500 da API ficam indistinguíveis, sem rastro algum. |
| 7 | `server/src/chain/markets.ts`, `runs.ts`, `realtime/liveHub.ts`, `auth/store.ts`, `txline/auth.ts` | Não existe logger estruturado — cada módulo usa `console.log/warn/error` cru com prefixo manual (`[auth]`, `[chain]`, `[markets]`, `[runs]`, `[live]`, `[txline]`). Sem nível configurável, sem destino centralizável, sem correlação de request. |

## 2. Tratamento de erros

| # | Local | Achado |
|---|---|---|
| 8 | `server/src/http/errors.ts:25-27` | Erro que não é `HttpError` devolve `err.message` bruto ao cliente com status 500 — pode vazar mensagem interna de RPC/Anchor (erro de simulação de transação) direto no browser. |
| 9 | `server/src/chain/tickets.ts:45` (via `server/src/http/routes/tickets.routes.ts:8-14`) | `new PublicKey(wallet)` sem try/catch — wallet inválida na URL vira exceção genérica → 500 com mensagem crua do `@solana/web3.js`. Compare com `server/src/auth/wallet.ts:38-47` e `server/src/chain/runs.ts:174-178`, que protegem o mesmo parse e devolvem `HttpError(400, ...)`. Mesma operação, dois comportamentos. |
| 10 | `server/src/http/routes/custodial.routes.ts:25-30,42-49` e `runs.routes.ts:38,71,83` | Qualquer erro de domínio — inclusive falha de RPC/timeout/simulação on-chain — vira `HttpError(400, err.message)` cegamente. Um RPC fora do ar chega ao cliente como "bad request", confundindo debugging e UX. |
| 11 | `runs.routes.ts:38` vs `server/src/chain/runs.ts:187,191` | "você já tem uma run ativa" (deveria ser 409) e "limite de novas runs atingido" (deveria ser 429) chegam como 400 genérico — enquanto `server/src/auth/guest.ts:19,26` usa 403/429 corretamente para o mesmo tipo de erro. |
| 12 | `server/src/http/routes/markets.routes.ts` (sem `requireChain`) vs `tickets.routes.ts:10` e `runs.routes.ts:32` (com `requireChain`) | `chain/markets.ts:335-343` e `chain/tickets.ts:44` já tratam `chain === null` graciosamente (dado vazio). Mas `requireChain` intercepta antes em tickets/runs e devolve 503, enquanto markets deixa o fallback interno responder 200 vazio — mesma condição (authority ausente), respostas opostas conforme a rota. |
| 13 | `auth.routes.ts:43-45` (`/wallet/nonce`) e `runs.routes.ts:53,57` (`/wallet/:wallet`, `/:id`) | Não usam `asyncHandler`, diferente das rotas irmãs no mesmo arquivo. Só funciona hoje porque os handlers são síncronos — padrão frágil: se alguém tornar async por engano, o erro desaparece sem resposta ao cliente. |

## 3. Inconsistências

| # | Local | Achado |
|---|---|---|
| 14 | `MarketRecord.pda` (`markets.ts:32`) vs `RunRecord.marketPdaB58`/exposto como `marketPda` em `runView` (`runs.ts:59,149`) vs `TicketView.market` (`tickets.ts:22`) | Três nomes de campo diferentes pro mesmo conceito (PDA do mercado em base58). |
| 15 | `auth/store.ts:72-74,183` (`address`/`userAddress()`) vs `runs.routes.ts:34,53` e `tickets.routes.ts:9`, `StakedHilo.tsx:149` (`wallet: account.address`) | "wallet" e "address" usados alternadamente pro mesmo dado conforme o módulo. |
| 16 | `server/src/chain/client.ts:78-97` vs `client/src/chain/oddies.ts:34-53` | `configPda`/`marketPda`/`vaultPda`/`betPda` reimplementados de forma idêntica nos dois lados (server e client) sem pacote compartilhado — mudança de seeds no programa exige edição manual sincronizada por convenção, não por tipo. |
| 17 | `server/src/chain/tickets.ts:19-35` (`TicketView`) vs `client/src/WalletPage.tsx:9-23`; `markets.ts:312-318` (`MarketView`) vs `client/src/Markets.tsx:10-23` | Interfaces redefinidas de forma independente nos dois lados — risco de drift silencioso (campo renomeado/removido de um lado sem erro de compilação no outro). |
| 18 | `client/src/chain/account.tsx:57-69` (helper `api()`) vs `StakedHilo.tsx:53-62` (helper quase idêntico duplicado) vs `Markets.tsx:44-50` e `WalletPage.tsx:46-49` (`fetch` cru com checagem própria) | Três convenções distintas de chamada HTTP e tratamento de erro no client pro mesmo tipo de operação. |
| 19 | `tickets.routes.ts:12` → `{ tickets: [...] }`; `runs.routes.ts:54` → `{ runs: [...] }`; `markets.routes.ts:11` → `{ markets: [...], programId }` vs `custodial.routes.ts:26,44` (`CustodialBetResult`/`{signature}` crus) e `runs.routes.ts:39,71,82` (`runView(run)` cru) | Sem regra clara de quando a resposta vem envelopada em objeto nomeado vs. crua. |
| 20 | `custodial.routes.ts:17-24` (valida `Number.isInteger` e sinal de `outcome`/`lamports`) vs `runs.routes.ts:34-37` (só valida `wallet`; `target`/`stakeLamports` só passam por `Number(...)` sem checar `NaN`/inteiro na rota) | Validação de input com rigor diferente entre rotas irmãs — em runs, a validação real fica implícita dentro de `chain/runs.ts:194-209`. |

## Sugestão de priorização

1. **#8, #9, #10** — padronizar erro de domínio: nunca vazar `err.message` bruto de chamada on-chain/RPC ao cliente; mapear para mensagens genéricas + log interno com detalhe.
2. **#2, #6, #7** — introduzir logger mínimo (nível + prefixo por módulo já existe informalmente, só falta padronizar) e garantir que todo `catch` vazio pelo menos loga antes de seguir.
3. **#11, #12** — alinhar status HTTP (409/429/503) entre rotas irmãs (`runs`, `markets`, `tickets`, `custodial`, `guest`).
4. **#14–#17** — considerar extrair um pacote/arquivo único de tipos e cálculo de PDA compartilhado entre `server` e `client` (hoje sincronizados só por convenção).
5. **#5, #18, #19, #20** — menor prioridade: padronizar helper de fetch no client e shape de resposta HTTP no server.
