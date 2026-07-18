# Identidade on-chain por jogo — mecânica das NFTs

> Estado: **implementado e verificado na devnet** (2026-07-14).
> Programa `F4xhKysY8SrNwfqLZxyuJrZCWW8KPVbTjZWb4HHtD4ZA` (mesmo ID de sempre — todos os
> deploys desta rodada foram *upgrade in-place*, nenhum endereço mudou).

## O que é

Cada mini game tem uma **Collection NFT Metaplex própria** ("identidade do jogo"). Tudo que
o jogador emite jogando aquele jogo entra nessa coleção como membro **verificado** — a arte
e o nome do jogo aparecem na carteira e nos explorers.

Existem dois tipos de NFT:

| Tipo | Quando é emitido | Quem paga o rent | Vida útil |
|---|---|---|---|
| **Ticket de aposta** | a cada `place_bet` (jogos com dinheiro real) | o apostador | **queimado no `claim`** (ver "Decisão em aberto") |
| **Badge do jogo** | `mint_game_badge`, para jogos sem aposta on-chain | a authority (server) | permanente; 1 por wallet por jogo |

Hoje só o **Live Challenge** usa badge (é o único jogo sem aposta on-chain). Os outros seis
emitem a identidade junto do ticket da aposta.

## Registro dos jogos

`GAME_COUNT = 7` no contrato; o registro canônico vive em `server/src/chain/client.ts`
(`GAMES`) e é espelhado no client (`client/src/chain/oddies.ts`).

| game_id | Jogo | Coleção (mint, devnet) |
|---|---|---|
| 0 | Hi-Lo | `8dPx2kP8zLgSan7Hq4wdPat9qaHroyPLZagyoFJvNexP` |
| 1 | Infinite Hi-Lo | `8HRucvgcHZnyVMaqL39eBupZVtmG8ZZeZy5VmXgS9qdK` |
| 2 | Penalty Predictor | `6YFfwk2SpztsBHKyfCvG6nEUKiuCZqYqHdW69CJ8vNmD` |
| 3 | Survivor | `6ssr4ZtFoUkdZiwV9z6dELFf8aVcCDvRXydHew6RYGrY` |
| 4 | Guess the Stats | `3Xm7r9nuPbNQuBGZu74HVg6V1jmTMYXhNT3KwdJTKeCU` |
| 5 | Guess the Team | `Gzcg85vdcQsTJPEf8D1fMhyYLaFV6XGmQ6EQwfGhqVNq` |
| 6 | Live Challenge | `H351bVT1NTTjUL8vNpBHYMSp5ndwHgfaTHDtTR81U8Hu` |

`GAME_NONE = 255` = sem identidade (mercados demo/genéricos).

## Por que o `game_id` vai na **aposta**, não só no mercado

A primeira versão (commit `02855a2`) amarrava a coleção ao **mercado**: o ticket herdava o
`market.game_id`. Isso quebra quando **dois jogos compartilham o mesmo mercado** — que é
exatamente o caso do **Survivor**, cujo pick é uma aposta no mercado 1X2 do **Guess the
Team**. Resultado: o ticket do Survivor saía com a arte do Guess the Team.

Modelo atual (implementado):

- `Market.allowed_games: u8` — **bitmask** dos jogos que podem apostar naquele mercado
  (bit N = `game_id` N). O mercado 1X2 abre com `{team, survivor}` habilitados.
- `place_bet(outcome, amount, game_id)` — **a aposta declara o jogo**. O contrato exige que
  o bit esteja ligado no `allowed_games` (senão `GameNotAllowed`) e verifica o ticket na
  coleção **daquele** jogo. O `game_id` fica gravado em `Bet.game_id`.

Assim um mesmo mercado serve vários jogos, cada aposta carrega a identidade correta, e não
há como emitir a NFT de um jogo que o mercado não habilita.

### Garantias de integridade

1. **Contrato** — `game_id` fora do `allowed_games` → `GameNotAllowed`. Contas de coleção
   ausentes com `game_id` declarado → `MissingGameCollection`. Coleção que não bate com o
   jogo → `GameMismatch`.
2. **Borda da API** — `gameId` desconhecido → `400`; jogo não habilitado no mercado → `403`
   (falha antes de gastar transação, em vez de deixar o revert virar 500 genérico).
3. **Autoridade da coleção** — a update/mint authority de toda coleção é a PDA
   `collection_authority`; nenhuma chave externa pode verificar itens nela.

## Instruções novas no contrato

- **`place_bet(outcome, amount, game_id)`** — ganhou o terceiro argumento (ver acima).
- **`mint_game_badge(game_id)`** — emite um NFT (mint próprio, supply 1) membro verificado
  da coleção do jogo, direto para a wallet do jogador. A authority co-assina (autoriza e
  paga o rent) — é o que permite dar identidade a jogos **sem aposta on-chain**. Não dá
  direito a prêmio nenhum: é identidade/colecionável, não recibo de aposta.
- **`update_game_collection(game_id, name, symbol, uri)`** — atualiza a identidade da
  coleção (PDA + metadata Metaplex) sem recriá-la. Foi o que permitiu migrar o metadata de
  `localhost` para um host público sem perder as coleções nem os membros já verificados.

## Emissão do badge (regra de negócio)

`server/src/chain/badges.ts` + rotas `GET /nft/badge/:game` e `POST /nft/badge/:game/claim`
(ambas exigem sessão):

- **Elegibilidade**: hoje, Live Challenge com ≥ 1 acerto no leaderboard.
- **Dedupe**: 1 badge por wallet por jogo, persistido em `.data/badges.json`. Além de
  produto, isso é **proteção de fundos**: quem paga o rent é a authority, então farmear
  badges drenaria a carteira do server.
- Sem coleção deployada → `503`; sem elegibilidade → `403`; já emitido → `409`.

## Hospedagem da arte (metadata)

O metadata Metaplex precisa de uma URL pública — com `PUBLIC_BASE_URL=localhost` a arte não
aparece para ninguém além de quem roda o server na própria máquina.

Hoje as 7 coleções apontam para `raw.githubusercontent.com` **pinado por SHA de commit**
(URL imutável: não quebra nem se a branch for deletada). O par arte + metadata vive em
`server/assets/nft/<slug>.png|json`.

Para migrar para um domínio próprio (ex.: deploy da Vercel):

```bash
NFT_METADATA_BASE_URL=https://api.chainplay.app/nft npm run update:collections
```

O script (`server/src/scripts/update-collections.ts`) chama `update_game_collection` em cada
jogo e é idempotente (pula o que já aponta pro host certo).

## Custo por aposta — e o impacto no bônus de boas-vindas

O ticket-NFT **não é de graça**: a metadata Metaplex sozinha custa 0.0056 SOL de rent.

| Item | SOL |
|---|---|
| conta `Bet` | 0.00153 |
| mint do ticket | 0.00146 |
| token account | 0.00204 |
| **metadata Metaplex** | **0.00562** |
| stake mínimo | 0.00100 |
| **total por aposta** | **≈ 0.0117** |

O bônus de boas-vindas era 0.03 SOL → dava para **2 apostas**, e o jogador travava no meio
da sessão com erro de saldo. Subiu para **0.15 SOL** (≈ 12 apostas) em
`server/src/auth/store.ts`. Vale monitorar o caixa da authority: o bônus sai dela.

## ⚠️ Decisão em aberto — o NFT do vencedor é queimado

`claim` faz `token::burn` do ticket (lib.rs, "Queima o ticket"). Efeito colateral da
identidade-por-ticket: **quem perde fica com a NFT do jogo; quem ganha perde o
colecionável** ao resgatar o prêmio. Verificado ao vivo (após o claim, a carteira fica sem
o ticket).

Opções:

- **(a) Badge separado (recomendado)** — na primeira aposta de cada jogo, emitir também um
  badge permanente via `mint_game_badge` (instrução já existe e está testada). O ticket
  segue sendo o recibo queimável; o badge é o colecionável. Custo: mais rent por jogador.
- **(b) Não queimar** — `bet.claimed` já bloqueia o resgate duplo sozinho; o burn é
  redundância. Preserva o troféu, mas um ticket já resgatado poderia ser revendido para
  quem não checar o `claimed`.
- **(c) Manter como está** — o ticket é efêmero por design.

## Como verificar

```bash
npm run verify:collections   # 10 checks on-chain (devnet): coleção, ticket verificado,
                             # GameNotAllowed, badge verificado
npm run e2e:games            # cenário real: joga os 7 jogos via HTTP e confere na chain
                             # que cada NFT é membro verificado da coleção certa
```

Última execução (2026-07-14): `verify:collections` **10 ✅ / 0 ❌** · `e2e:games`
**40 ✅ / 0 ❌** · `e2e:full` **30 ✅ / 0 ❌**.
