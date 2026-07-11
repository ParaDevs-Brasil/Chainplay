# Plano de desenvolvimento — Mini games do ChainPlay × contrato `oddies_bet`

> Baseado na análise de: `README.md` (7 jogos), `keys_contract.md` + `program/programs/oddies-bet/src/lib.rs`
> (contrato deployado em devnet: `F4xhKysY8SrNwfqLZxyuJrZCWW8KPVbTjZWb4HHtD4ZA`),
> `server/` (TxLINE + mock, sem integração on-chain ainda) e `client/` (Hi-Lo free-to-play já pronto e polido).

---

## 1. Estado atual

| Camada | O que existe | O que falta |
|---|---|---|
| **Contrato** | Mercados `Parimutuel` (pote dividido) e `HouseBacked` (odds fixas), ticket-NFT por aposta, `resolve`/`cancel`/`claim`/`withdraw_house`, taxa 10% pra team wallet. Deployado e inicializado em devnet. IDL copiado pra `server/idl`. | Nada — o contrato cobre os dois padrões de que os jogos precisam. |
| **Server** | Express com `/api/game/status` e `/api/game/matches` (TxLINE → cache → mock de 104 jogos). Deps do Anchor já instaladas. | Serviço on-chain: criar/resolver mercados como authority, expor mercados abertos, tickets por wallet, leaderboards. |
| **Client** | Hi-Lo completo (fases, suspense, sfx, confetti, i18n pt/en, recorde local, share). Hash routing `#/` e `#/jogar`. | Wallet adapter, telas dos demais jogos, hub de jogos, claim center. |

## 2. Como cada jogo se conecta ao contrato

O contrato oferece **dois padrões**, e todos os 7 jogos se encaixam em um deles (ou numa combinação):

### Padrão A — Mercado parimutuel por fixture (multiplayer)
Backend (authority) cria um `Market::Parimutuel` por partida/estatística com 2–8 outcomes,
`close_ts` = kickoff, `resolve_after_ts` = kickoff + ~2h30. Jogadores dão `place_bet`
(recebem ticket-NFT), backend dá `resolve_market` com o resultado da TxLINE, vencedores dão `claim`
e dividem o pote proporcionalmente. Sem vencedores ou jogo cancelado → `Voided`, todos recuperam o stake.

### Padrão B — Mercado house-backed por "run" (singleplayer)
Para jogos de skill individual (Hi-Lo, Guess the Team): o backend cria um `Market::HouseBacked`
**por sessão de jogo**, com 2 outcomes (`0 = jogador bate a meta`, `1 = não bate`) e odds fixas
crescentes conforme a meta escolhida (ex.: streak 5 → 2.0x, streak 10 → 4.5x, streak 20 → 12x).
Fluxo: jogador escolhe meta e stake → backend `create_market` (close_ts = agora+2min,
resolve_after_ts = agora+3min) + `fund_house` cobrindo o pior caso → jogador `place_bet` →
joga a run (validada no server, não no browser) → backend `resolve_market` → jogador `claim` se venceu.
A margem da casa fica embutida nas odds; `withdraw_house` recolhe o lucro de runs perdidas.

**Regra de ouro anti-fraude:** em qualquer modo com stake, a sequência de perguntas/respostas
é gerada e validada **no server** (seed secreta por run, respostas conferidas contra os dados
da TxLINE no backend). O client nunca conhece o próximo valor antes de palpitar.

### Mapa jogo → contrato

| Jogo | Padrão | Outcomes | Observações |
|---|---|---|---|
| **Hi-Lo** | B (staked run) + free-to-play atual | 2 (bateu a meta / não) | Já temos o jogo; adicionamos o modo apostado por cima. |
| **Infinite Hi-Lo** | B | 2, com odds por faixa de streak alcançada, ou "cash-out ladder" (encerrar a run cristaliza a meta atingida) | Variante: categorias rotativas e dificuldade progressiva. |
| **Guess the Stats** | A | Estatística bucketizada em 3–8 faixas (ex.: escanteios totais: `0–7 / 8–10 / 11+`) | Pontuação por proximidade fica off-chain (leaderboard); o mercado on-chain usa faixas discretas. 1 mercado por fixture×stat. |
| **Survivor** | A (meta-jogo) | Cada pick da rodada = aposta real no mercado 1X2 da partida | "Estar vivo" = nunca ter uma aposta perdedora; o backend deriva o estado dos eventos `BetPlaced`/`MarketResolved` on-chain. Prêmio = os próprios claims + ranking. Pool de premiação dedicado fica pra v2 do contrato. |
| **Penalty Predictor** | A ou B | 2 (converte / defende) | Mercado relâmpago com `close_ts` de segundos, criado quando o evento de pênalti chega no feed. Exige feed ao vivo — fallback com pênaltis simulados no demo. |
| **Live Challenge** *(em construção)* | A | 2–3 (próximo gol / próximo escanteio / cartão em X min) | Mesmo motor do Penalty (mercados relâmpago); fica pra depois. |
| **Guess the Team** *(em construção)* | B | 2 (acertou N de M / não) | Quiz validado no server; modo free com ranking primeiro. |

## 3. Fundação técnica (Fase 0 — pré-requisito de tudo)

1. **`server/src/chain/`** — serviço on-chain com o Anchor:
   - Carrega a authority (`WALLET_SECRET` / keys da devnet), `Program` a partir de `server/idl/oddies_bet.json`.
   - `marketMaker`: cron que cria mercados parimutuel 1X2 por fixture da Copa (T-24h do kickoff) e mercados de stats bucketizadas; grava o mapeamento `market_id ↔ fixture/stat/buckets` em `server/.data`.
   - `resolver`: cron que detecta `finished` na TxLINE e chama `resolve_market` (ou `cancel_market` para adiadas).
   - `runService`: cria/resolve mercados house-backed por run (Hi-Lo/quiz), com seed secreta e validação server-side.
   - Endpoints: `GET /api/markets` (abertos, com % por outcome derivado dos `pools[]` e countdown de lock), `GET /api/tickets/:wallet` (Bets + estado, o que dá pra `claim`), `POST /api/runs` (inicia run apostada), `POST /api/runs/:id/guess`, `POST /api/runs/:id/cashout`.
2. **`client/src/wallet/`** — wallet adapter (Phantom/Backpack/Solflare) + helper Anchor para `place_bet` e `claim` (o mint do ticket é um keypair gerado no client, como o teste do programa já faz).
3. **`client/src/components/`** — extrair de `Game.tsx` os blocos reutilizáveis: `GameShell` (navbar+help modal), `Scoreboard`, `MatchCard`, `RollingValue`, `ResultBanner`, celebração/sfx. Todos os jogos novos usam a mesma linguagem visual e "juice" do Hi-Lo atual.
4. **Hub de jogos** — rotas hash `#/jogos`, `#/hilo`, `#/hilo-infinito`, `#/stats`, `#/survivor`, `#/penalty`; Landing ganha a grade de jogos com badge "em breve" para os dois em construção.
5. **Claim Center** (`#/carteira`) — lista os tickets-NFT da wallet, status (aberto/ganhou/perdeu/void) e botão de resgate. É o que torna o on-chain *visível* e recompensador.

## 4. Fases de entrega dos jogos

### Fase 1 — Hi-Lo apostado + Infinite Hi-Lo (motor: Padrão B)
*É o caminho mais curto: o jogo já existe e é o mais polido.*
- **Hi-Lo staked**: na tela inicial o jogador escolhe **meta de streak** (5/10/15/20, odds crescentes visíveis como cards de risco) e **stake**. Corrida contra a própria meta; barra de progresso vira "escada de prêmio". Server gera a sequência de partidas/categorias com seed secreta.
- **Infinite Hi-Lo**: sem meta fixa — a cada acerto o multiplicador sobe e aparece o botão **CASH OUT** pulsando (tensão risco×ganância, o coração do game design aqui). Categorias rotacionam automaticamente (gols → escanteios → posse → cartões → finalizações) e a partir da streak 10 entram "rodadas turbo" com timer de 10s.
- Level design da dificuldade: primeiras 3 rodadas usam categorias de alta variância percebida mas estatisticamente "fáceis" (gols), depois mistura; pushes (empate) não quebram a run — mantém a regra atual que já é justa e legível.
- Juice: manter roll de suspense, confetti escalonado por streak, sfx; adicionar tela de "quase!" quando perde a 1 do prêmio (compartilhável).

### Fase 2 — Guess the Stats (motor: Padrão A)
- Tela por partida futura: sliders/steppers para palpitar gols totais, escanteios, cartões e posse **antes do kickoff**; countdown de lock bem visível (padrão WeLikeSports já mapeado em `docs/welikesports-funcionalidades.md`).
- Duas camadas: **pontos por proximidade** (off-chain, alimenta o leaderboard diário/semanal — de graça, funil de aquisição) e **aposta opcional** nas faixas bucketizadas (parimutuel on-chain, com % de consenso da comunidade por faixa lido dos `pools[]` — prova social ao vivo).
- Feedback pós-jogo: card "seu raio-X da partida" comparando palpite × real, com precisão % por stat.

### Fase 3 — Survivor (meta-jogo sobre os mercados 1X2)
- Antes de cada rodada da Copa o jogador escolhe 1 pick (vencedor/empate) — que é uma aposta parimutuel real no mercado 1X2 da partida.
- Errou uma → **eliminado** da temporada (animação de "morte súbita", ranking de sobreviventes com contagem regressiva de vivos, "só restam 87 de 2.400").
- Design de retenção: e-mail/push "você ainda não fez seu pick da rodada" (padrão MISSED do WeLikeSports), badge de rodadas sobrevividas, modo espectador pós-eliminação.
- Backend deriva vida/morte dos eventos on-chain — zero estado de confiança fora da chain para o dinheiro; só o ranking é off-chain.

### Fase 4 — Penalty Predictor (mercados relâmpago)
- Quando o feed acusa pênalti: modal de tela cheia com timer de 8s, dois botões gigantes (⚽ GOL / 🧤 DEFESA), stake pré-configurado ("aposta rápida" de 0.01/0.05/0.1 SOL definida antes).
- Multiplicador de sequência off-chain (acertos consecutivos de pênaltis → bônus de pontos no ranking) + aposta on-chain house-backed 2-outcomes.
- **Risco**: depende da latência/granularidade do feed da TxLINE para eventos de pênalti. Mitigação: modo demo com pênaltis simulados do dataset mock (mesma UX) e validação do feed real como spike técnico logo no início da fase.

### Fase 5 — Live Challenge e Guess the Team (os "em construção")
- **Live Challenge** reusa 100% do motor de mercados relâmpago da Fase 4 (próximo escanteio, cartão nos próximos 10min).
- **Guess the Team** reusa o motor de runs da Fase 1 (quiz server-side, modo free com ranking primeiro, staked depois).

### Transversal (roda em paralelo desde a Fase 1)
- Leaderboards (diário/semanal/torneio) por jogo e global, agregando pontos off-chain + volume/lucro on-chain.
- i18n pt/en de tudo (estrutura do `i18n.tsx` já comporta).
- Acessibilidade: manter `prefers-reduced-motion`, foco/aria dos modais (padrão já existente no Hi-Lo).
- Nota de jogo responsável + limites de stake por run (aprendizado do mapeamento do WeLikeSports).

## 5. Princípios de game design que amarram tudo

1. **Uma decisão protagonista por tela** (como o Hi-Lo atual): nunca mais de uma pergunta ativa.
2. **Antecipação → revelação → celebração**: todo palpite passa por janela de suspense (roll), reveal com flash ok/bad e celebração escalonada. Reusar `celebration.ts`/`sfx.ts` em todos os jogos.
3. **Risco legível**: odds, multiplicador e "o que eu perco/ganho" sempre visíveis antes do clique; on-chain aparece como *ticket colecionável*, não como jargão cripto.
4. **Curva de sessão curta**: 1 run de Hi-Lo ≤ 3min, 1 formulário de Guess the Stats ≤ 90s, pênalti ≤ 10s. Retenção vem do ritmo do torneio (104 partidas = 104 "níveis" naturais do level design).
5. **Free-first**: todo jogo tem modo grátis com ranking (aquisição) e o stake é opt-in por cima — o contrato entra como camada de recompensa, não como barreira.

## 6. Status de execução

**Fase 0 — entregue e validada em devnet (2026-07-11).** O que existe agora:

- `server/src/chain/` — `client.ts` (authority + Anchor + PDAs), `markets.ts` (marketMaker
  cria mercados 1X2 por fixture com fallback de mercados demo; resolver liquida pelo placar
  da TxLINE), `runs.ts` (runs house-backed com seed secreta, validação server-side, gate
  on-chain do place_bet e reciclagem de liquidez via withdraw_house), `tickets.ts`
  (tickets por wallet cruzando NFTs × contas Bet).
- Endpoints: `GET /api/markets`, `GET /api/tickets/:wallet`, `GET /api/runs/config`,
  `POST /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/guess`, `POST /api/runs/:id/cashout`,
  `GET /api/runs/wallet/:wallet`. Crons: sync 60s / settle 15s (só fora da Vercel).
- Client: `chain/wallet.tsx` (Phantom/Backpack/Solflare), `chain/oddies.ts` (`placeBet`/`claim`
  com ticket-NFT), hub `#/jogos`, Claim Center `#/carteira`, componentes compartilhados em
  `components/MatchCard.tsx`, i18n pt/en completo.
- Validação: `npm run e2e:run` no server executa o ciclo aposta → run → resolução → claim
  contra a devnet real. A authority precisa estar em `program/keys/devnet-deploy-wallet.json`
  (recuperável pela seed do `keys_contract.md`).

**Próximo passo: Fase 1** — UI do Hi-Lo apostado (tela de meta/stake consumindo
`/api/runs/config`, fluxo place_bet → jogar → claim) e o Infinite Hi-Lo com cash-out ladder.

## 7. Ordem de execução sugerida (dependências)

```
Fase 0 (fundação on-chain + componentes)  ← bloqueia todas
 ├─ Fase 1 Hi-Lo staked + Infinite        ← só depende do runService
 ├─ Fase 2 Guess the Stats                ← depende do marketMaker/resolver
 │   └─ Fase 3 Survivor                   ← reusa mercados 1X2 da Fase 2
 └─ Fase 4 Penalty (spike do feed antes)  ← mercados relâmpago
     └─ Fase 5 Live Challenge / Guess the Team
```

Riscos principais: (1) latência do feed TxLINE para os modos ao vivo — validar cedo com o spike da Fase 4; (2) custo/UX de 1 mercado house-backed por run — na devnet é ok (~rent de 2 contas), pra mainnet considerar v2 do contrato com "sessão" reutilizável; (3) faucet da devnet pros testes do time — a wallet de deploy tem ~1.27 SOL, recarregar antes das demos.
