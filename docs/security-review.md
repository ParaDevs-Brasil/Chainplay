# Revisão de segurança — ChainPlay / oddies-bet

> Executada em 2026-07-11 sobre `program/programs/oddies-bet/src/lib.rs` (deployado em devnet
> como `F4xhKysY8SrNwfqLZxyuJrZCWW8KPVbTjZWb4HHtD4ZA`) e sobre a API do `server/`.
> Metodologia: scanner de 6 padrões de vulnerabilidade Solana (Trail of Bits), revisão manual
> do modelo econômico/estado, suíte Anchor (26 testes, incl. fuzzing com fast-check) e suíte
> E2E da API contra a devnet real (25 asserções — `npm run e2e:full`).
>
> **Atualização 2026-07-14 — ver seção 4** (mudanças no contrato para a identidade NFT por
> jogo e achados novos da rodada de testes adversariais). O program ID não mudou: todos os
> deploys foram *upgrade in-place*.

## 1. Contrato — scanner de padrões Solana

| # | Padrão | Severidade | Resultado |
|---|---|---|---|
| 1 | Arbitrary CPI (program ID controlado pelo usuário) | CRÍTICO | ✅ **Não afetado.** Todas as CPIs usam contas tipadas `Program<'info, System>` / `Program<'info, Token>` — o Anchor valida o program ID. Nenhum `invoke()` cru. |
| 2 | PDA sem bump canônico | CRÍTICO | ✅ **Não afetado.** `config`, `market`, `vault` e `bet` usam `seeds`+`bump` do Anchor; bumps canônicos gravados no estado na criação (`ctx.bumps`) e reusados (`bump = market.bump` etc.). Assinaturas de PDA (`transfer_from_vault`, mint do ticket) usam os bumps armazenados. |
| 3 | Falta de ownership check | ALTO | ✅ **Não afetado.** Todas as contas de dados são `Account<'info, T>` (owner + discriminator validados). As três `UncheckedAccount` são só a `team_wallet`, sempre amarrada: `address = config.team_wallet` (PlaceBet), `has_one = team_wallet` (WithdrawHouse), e no Initialize é input da própria authority. |
| 4 | Falta de signer check | CRÍTICO | ✅ **Não afetado.** Toda operação administrativa exige `Signer` + `has_one = authority` contra a config. `initialize` é travado na **upgrade authority do programa** via constraint de `program_data` (impede front-run de inicialização — coberto por teste). `bettor`/`claimer` são Signers. |
| 5 | Sysvar spoofado (pré-1.8.1) | ALTO | ✅ **N/A.** Único sysvar é `Sysvar<'info, Rent>` tipado; toolchain atual. |
| 6 | Instruction introspection insegura | MÉDIO | ✅ **N/A.** Não usa introspection. |

### Revisão econômica / de estado (manual)

- **Double-claim**: impossível — `bet.claimed` + ticket-NFT queimado no claim (testado on-chain: segundo claim falha).
- **Solvência HouseBacked**: `place_bet` recalcula o pior caso (`max` das liabilities) e exige cobertura do vault **incluindo** o stake que está entrando; fuzz de 26 casos confirma que a casa nunca aceita risco além do vault.
- **`withdraw_house` não rouba apostador**: bloqueado enquanto `outstanding` > 0; só saca o excedente e só para a `team_wallet` da config.
- **Aritmética**: `checked_add/sub`, produtos em `u128` antes da divisão; fee com piso e `net > 0` exigido.
- **Janela de resolução**: `resolve_after_ts > close_ts` on-chain impede resolução antes do fim real (testado).
- **Ticket-NFT**: mint authority congelada em `None` após supply 1 — ninguém minta tickets extras.

### Apontamentos (aceitáveis para v1, revisar antes de mainnet)

1. **Oráculo centralizado (por design)** — `resolve_market` depende de 1 chave. Mitigação já planejada em `keys_contract.md`: migrar `config.authority` para multisig (Squads) via `update_config` e transferir a upgrade authority.
2. **Fundos não resgatados ficam presos** — em mercados `Voided`, o que ninguém reclamar fica no vault para sempre (não é roubável, mas não é recuperável). Considerar instrução de expiração/varredura pós-prazo numa v2.
3. **Sem instrução de `close`** — contas `Market`/`Bet` nunca devolvem rent. Custo operacional, não risco.
4. **Poeira de arredondamento parimutuel** — sobras de divisão inteira ficam no vault e são sacáveis pela casa via `withdraw_house`. Comportamento esperado; documentado.

## 2. Server / API

### Corrigido nesta revisão

| Achado | Severidade | Correção |
|---|---|---|
| **Drenagem da authority via `POST /api/runs`**: cada run cria mercado + fund_house com SOL da authority (rent não-recuperável ~0.004 SOL); spam anônimo drenaria a carteira. | **ALTO** | 1 run ativa por wallet + teto global de 10 runs/5min + validação de pubkey (`runs.ts`). Runs abandonadas são resolvidas e têm a liquidez reciclada pelo cron (`withdraw_house`). Verificado ao vivo. |
| **`keys_contract.md` (seed phrases!) e `program/keys/` fora do `.gitignore`** — risco de commit acidental de segredos. | **ALTO** | Adicionados ao `.gitignore` da raiz. ⚠️ **Recomendação extra**: como as seeds da devnet já circularam em texto plano, rotacionar antes de qualquer uso em mainnet (nunca reutilizar essas seeds). |
| **Reativação TxLINE em loop** (airdrop + tx a cada ciclo do cron, 429 no faucet) | BAIXO | Cooldown de 10 min entre tentativas (`markets.ts`). |

### Validado por teste (suíte `e2e:full`, seção B)

- A sequência secreta das runs **nunca** sai pela API (`rounds` e valores futuros ausentes de todas as respostas) — o cliente não tem como prever o próximo número.
- Gate on-chain: `guess` só funciona depois do `place_bet` confirmado no mercado da run.
- Runs encerradas não aceitam mais palpites (sem replay).
- Inputs inválidos (meta, stake fracionário, stake acima do teto da casa, dir desconhecida) → 400.

### Apontamentos abertos (para as próximas fases)

1. ~~**Autorização das runs por UUID** — quem tiver o id da run pode dar palpites nela. UUIDv4 (122 bits) é impraticável de adivinhar e não vaza em endpoint público~~ — **correção (2026-07-12): a suposição acima estava errada, ver achado #5 abaixo.** `GET /api/runs/wallet/:wallet` vaza o `id` (e o valor da carta atual) sem autenticação, tornando o UUID descobrível a partir da wallet pública da vítima.
2. **CORS aberto** (`app.use(cors())`) — ok para hackathon; restringir origem em produção.
3. **Sem TLS/secrets management** — `.data/` guarda credenciais e a wallet do server em disco plano; para produção, usar secret manager.
4. **Rate limit é em memória** — reinicia com o processo; para produção, mover para armazenamento compartilhado.

### Achado confirmado — revisão de 2026-07-12 (camada de integração backend↔contrato)

| # | Achado | Severidade | Status |
|---|---|---|---|
| 5 | **IDOR em `/api/runs/:id/guess`, `/api/runs/:id/cashout` e `GET /api/runs/wallet/:wallet`** — nenhuma das três exigia `requireSession` (diferente de `custodial.routes.ts`, que aplica `requireChain, requireSession` a todas as rotas). `GET /api/runs/wallet/:wallet` devolvia `id` da run ativa e o valor da carta atual já revelado sem autenticação; `guessRun`/`cashoutRun` (`server/src/chain/runs.ts`) não comparavam o chamador contra o dono da run. Um atacante que só conhece a wallet pública da vítima (não é segredo em dApp Solana) conseguia descobrir o `id` e decidir a jogada ou forçar cashout prematuro em nome dela. O `finalOutcome` definido nessas rotas é liquidado on-chain via `settleRuns()` → `resolveMarket()` — dano financeiro real, não apenas de UI. | **ALTO** | ✅ **Corrigido (2026-07-13)** |
| 6 | **IDOR no Penalty Predictor** (`server/src/http/routes/arcade.routes.ts:79-107`) — mesmo padrão do achado #5, replicado no jogo novo "Penalty valendo SOL". `GET /penalty/sessions/:wallet` vazava o `id` da sessão a partir da wallet pública sem auth; `POST /penalty/session/:id/shot` e `/answer` deixavam qualquer um decidir os chutes de outra sessão — `nextShot`/`answerShot` (`server/src/games/penaltySession.ts`) não comparavam o chamador contra `SessionRecord.wallet`. Confirmado que a sessão só existe após stake real confirmado on-chain e que o `finalOutcome` forjado é liquidado de verdade via `settlePenaltySessions()` → `settleHouseMarket()` → `resolveMarket()` — dano financeiro real idêntico ao #5. | **ALTO** | ✅ **Corrigido (2026-07-13)** |
| 7 | **IDOR no Survivor** (`server/src/http/routes/survivor.routes.ts:19-29`) — `POST /pick` aceitava `wallet`/`outcome` livres do body sem `requireSession`; `makePick` (`server/src/games/survivor.ts:67-105`) não validava posse da wallet, permitindo forjar ou bloquear ("1 pick por rodada") o pick de outra pessoa. Verificado que **não há prêmio/payout real** atrelado ao status `survived`/`eliminated` (é só estado de leaderboard/temporada em `survivor.json`) — impacto de corrupção de estado cosmético, não perda financeira. | **BAIXO** | ✅ **Corrigido (2026-07-13)** |

**Correção aplicada (#5, #6, #7):** as três superfícies passaram a exigir `requireSession`. A wallet dona da run/sessão/pick agora vem **da sessão autenticada** (`userAddress(user)`), não da string do body — impede criar recurso "em nome" de terceiros. `RunRecord`/`SessionRecord` ganharam campo `userId` gravado na criação; `assertRunOwner`/`assertSessionOwner` validam posse (com fallback por wallet só para registros pré-migração) antes de qualquer leitura/escrita em `guess`/`cashout`/`shot`/`answer`/`GET`. O client (`StakedHilo.tsx`, `Arcade.tsx`, `Survivor.tsx`) envia o Bearer da sessão via `account.token`. **Verificado ao vivo** contra o server local: terceiro autenticado recebe `403` em list/GET/guess/cashout/shot; sem sessão recebe `401`; dono legítimo segue `200`. Regressão adicionada à suíte `e2e-full.ts` (seção B).

Ver detalhamento (comportamento original e diff) em `docs/audit-log-integracao.md`.

## 3. Evidências

- `program/`: `bash scripts/test-local.sh` → **26 passing** (fluxos multiplayer/singleplayer/cancelamento, controle de acesso com impostor em todas as instruções, fuzzing de invariantes com fast-check). Requer `anchor build` atualizado — os artefatos de `target/` estavam defasados em relação ao fonte e foram regenerados (IDL novo é idêntico ao `server/idl/oddies_bet.json` usado em produção).
- `server/`: `npm run e2e:full` → **25 ✅ / 0 ❌** contra a devnet real, incluindo o ciclo completo aposta → vitória → liquidação pelo cron → claim pago → double-claim bloqueado.

## 4. Rodada de 2026-07-14 — identidade NFT por jogo

Mudanças no contrato (upgrade in-place, mesmo program ID) e no server para dar a cada jogo
uma Collection NFT própria. Mecânica completa em **`docs/nft-identidade-por-jogo.md`**;
aqui ficam só as implicações de segurança.

### Mudanças no contrato

| Mudança | Por quê | Implicação de segurança |
|---|---|---|
| `Market.allowed_games: u8` (bitmask) + `place_bet(.., game_id)` | um mesmo mercado serve mais de um jogo (o pick do Survivor é uma aposta no mercado 1X2 do Guess the Team) — a coleção do ticket não podia ser herdada do mercado | **Nova superfície fechada**: o `game_id` da aposta é validado contra o `allowed_games` (`GameNotAllowed`), e as contas de coleção contra o jogo declarado (`GameMismatch`/`MissingGameCollection`). Não há como emitir NFT de um jogo que o mercado não habilita. `create_market` exige que o bit do jogo principal esteja no mask e que `GAME_NONE` venha com mask 0. |
| `mint_game_badge(game_id)` | jogos sem aposta on-chain (Live Challenge) não tinham como ter identidade | Exige `has_one = authority` na config (só o server emite) e paga o rent com a authority. **O dedupe (1 badge por wallet/jogo, em `.data/badges.json`) é controle de fundos**, não só de produto: sem ele, farmar badges drenaria a carteira do server. Badge não dá direito a payout — não toca vault nem `Bet`. |
| `update_game_collection(game_id, ..)` | metadata das coleções apontava para `localhost` — arte invisível para terceiros | Só a authority; a update authority das coleções segue sendo a PDA `collection_authority` (nenhuma chave externa verifica itens). Não altera membros já verificados. |
| `Box<Account<..>>` em `PlaceBet` e `MintGameBadge` | — | **Correção de bug de memória**: o frame de `try_accounts` de `PlaceBet` passava de 4096 bytes (`Stack offset of 4104 exceeded max offset of 4096`), o que é comportamento indefinido. Em runtime, a devnet rejeitava toda aposta com um `ConstraintMut` fantasma na conta `bettor` — a transação estava correta. Compila sem nenhum aviso de stack agora. |

### Achados novos (rodada de testes adversariais, 2026-07-14)

| # | Achado | Severidade | Status |
|---|---|---|---|
| 8 | **`gameId` desconhecido emitia ticket sem identidade** — `POST /api/custodial/place-bet` com `gameId: 99` retornava 200: o server degradava para `GAME_NONE` e a aposta saía sem NFT nenhuma. Não é forja (não dá para emitir na coleção de outro jogo), mas fura silenciosamente a promessa "toda aposta vira NFT" e o jogador perde o colecionável sem saber. | Baixa | ✅ **Corrigido** — `gameId` fora do registro → `400`. Regressão no `e2e:games`. |
| 9 | **Jogo não habilitado no mercado devolvia 500** — o contrato bloqueava corretamente (`GameNotAllowed`), mas o revert subia como "erro interno" genérico: gastava transação e escondia a causa. | Baixa (UX/observabilidade) | ✅ **Corrigido** — validação de `allowed_games` na borda (server e client) → `403` claro antes de assinar. Regressão no `e2e:games`. |
| 10 | **NFT do vencedor é queimada no `claim`** — o `token::burn` do ticket (defesa contra resgate duplo, redundante com `bet.claimed`) faz com que **quem ganha perca o colecionável e quem perde fique com ele**. | — (decisão de produto) | ⏳ **Em aberto** — 3 opções avaliadas em `docs/nft-identidade-por-jogo.md`. |

### Achados operacionais corrigidos na mesma rodada

- **Custo por aposta subiu com o ticket-NFT** (≈ 0.0117 SOL, dos quais 0.0056 é rent da metadata Metaplex). O bônus de boas-vindas de 0.03 SOL só cobria **2 apostas** — o jogador travava no meio da sessão com falha de saldo mascarada como erro interno. Subiu para 0.15 SOL (≈ 12 apostas).
- **PDAs de mercado colidindo entre versões do programa**: `market_id = fixture_id` fazia o `create_market` bater em contas do layout anterior ("conta já existe") — o fixture ficava sem mercado para sempre. `market_id` de fixture agora tem epoch de versão (`FIXTURE_MARKET_EPOCH`), bumpado a cada mudança no layout de `Market`.
- **Uma conta `Bet` do layout antigo derrubava a listagem inteira de tickets** (`bet.all()` falhava no decode). Agora as contas são decodificadas uma a uma e as obsoletas ignoradas.

### Evidências desta rodada

- `npm run verify:collections` → **10 ✅ / 0 ❌** (devnet): coleção existe, ticket é membro **verificado**, `place_bet` sem contas de coleção bloqueado, `game_id` fora do mask → `GameNotAllowed`, badge verificado.
- `npm run e2e:games` (novo) → **40 ✅ / 0 ❌**: joga os **7 jogos** via HTTP (as mesmas requisições do browser) e confere **na chain** que cada NFT que cai na carteira é membro verificado da coleção certa — incluindo as duas tentativas de forja acima.
- `npm run e2e:full` → **30 ✅ / 0 ❌**.
- ⚠️ **Pendente**: a suíte Anchor local não foi executada nesta rodada (os testes novos de `allowed_games` estão escritos em `program/tests/oddies-bet.ts`, mas o `solana-test-validator` não subiu no ambiente). O caminho de **wallet externa** (Phantom/Solflare) foi tipado e revisado, mas só o caminho custodial foi exercitado de ponta a ponta.
