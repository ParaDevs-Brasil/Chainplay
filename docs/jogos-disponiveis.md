# Jogos do ChainPlay

O ChainPlay é uma plataforma de minigames de futebol conectados a partidas e
estatísticas reais da Copa do Mundo, com apostas on-chain em Solana (devnet).
Cada aposta vira um **ticket-NFT** na wallet do jogador — quem tem o ticket
resgata o prêmio depois que o mercado resolve.

O hub de jogos (`#/jogos`) lista 8 minigames no roadmap (ver
[`plano-minigames.md`](./plano-minigames.md) para o plano completo de
entrega). Deste catálogo, **3 já estão disponíveis para jogar**:

| Jogo | Rota | Fase |
|---|---|---|
| [Infinite Hi-Lo](#1-infinite-hi-lo) | `#/hilo-infinito` | 1 |
| [1X2 Markets](#2-1x2-markets) | `#/mercados` | 2 |
| [Penalty Predictor](#3-penalty-predictor) | `#/penalty` | 4 |

Os demais (Hi-Lo apostado, Guess the Stats, Survivor, Live Challenge, Guess
the Team) aparecem no hub com a etiqueta **"em breve"** — a lógica de jogo e
o desenho on-chain já estão mapeados no plano, mas as telas ainda não foram
construídas ou ligadas ao contrato.

---

## 1. Infinite Hi-Lo

**"Sem meta fixa: cada acerto sobe um degrau na escada de prêmio."**

Evolução do clássico Hi-Lo: em vez de comparar sempre o mesmo número, a cada
rodada o jogo sorteia uma **categoria diferente** entre gols, escanteios,
posse de bola e cartões amarelos, e pergunta se o próximo valor vai ser
**maior ou menor** que o da partida anterior.

- **Como jogar**: escolhe só o stake (0,002 / 0,005 / 0,01 SOL) — não tem
  meta pra travar. A cada acerto, o multiplicador sobe um degrau numa
  escada de 12 níveis, de 1,2× até 28×.
- **A decisão em cada acerto**: continuar arriscando pro próximo degrau ou
  apertar **CASH OUT** e garantir o valor atual. Empate (push) não quebra a
  sequência.
- **Errar sem sacar** = perde o stake. **Chegar ao 12º degrau** = 28×
  pago direto pelo mercado on-chain.
- **On-chain**: mercado *house-backed* criado por sessão (`Market::HouseBacked`),
  2 outcomes (bateu a meta / não). A sequência de partidas é gerada e
  validada **no servidor** — o cliente nunca sabe o próximo valor antes de
  o jogador palpitar, evitando fraude. Sacar no meio da run anula o
  mercado (o ticket devolve o stake) e a casa paga o lucro do degrau na
  hora. As odds pagam abaixo do valor estatístico justo — essa margem é o
  lucro da casa.

## 2. 1X2 Markets

**"Aposte no resultado — casa, empate ou fora."**

Mercado parimutuel clássico sobre o resultado de partidas futuras da Copa:
o pote é dividido entre quem acerta, proporcional ao stake apostado —
não tem "casa" fixando as odds, elas emergem da própria comunidade.

- **Como jogar**: escolhe uma partida com apostas abertas, o stake (0,01 /
  0,05 / 0,1 SOL) e um lado — casa (1), empate (X) ou fora (2). A aposta
  vira ticket-NFT e o SOL entra no pote comunitário daquele lado.
- **Odds ao vivo**: a % mostrada em cada lado é derivada do pote atual
  (`(pote total + seu stake) / (pote do lado + seu stake)`) — sobe conforme
  mais gente aposta no mesmo lado, desce se um lado fica popular demais.
- **Depois do jogo**: quem acertou o resultado divide o pote total
  proporcional ao que apostou; o resgate acontece na Carteira (`#/carteira`).
  Jogo cancelado ou sem vencedores → mercado anulado, todo mundo recupera
  o stake.
- **On-chain**: mercado `Market::Parimutuel` por fixture, criado pelo
  backend (authority) com 3 outcomes. A taxa da plataforma é **10%** de
  cada aposta, descontada do pote antes da divisão entre vencedores.

## 3. Penalty Predictor

**"Pênalti na Copa: você tem segundos pra chutar o palpite. Gol ou defesa?"**

Modo relâmpago: sempre que um pênalti é batido, o jogador tem uma janela
curta pra prever o resultado antes da cobrança acontecer.

- **Modo livre**: pênalti simulado, **8 segundos** pra escolher GOL ou
  DEFESA — defesas são raras e valem mais pontos; acertos consecutivos
  multiplicam a pontuação. É o modo padrão pra treinar/rankear sem stake.
- **Modo apostado**: escolhe uma meta de acertos sobre uma série de 8
  cobranças (6, 7 ou 8 de 8) e um stake; assina a aposta e responde as
  8 cobranças dentro do timer — estourar o tempo conta como erro.
  Bater a meta libera o resgate do prêmio; a casa paga **1,3×** (6/8),
  **2,2×** (7/8) ou **7×** (8/8) direto do mercado on-chain ao acertar.
- **On-chain**: mercado relâmpago (Padrão A ou B, dependendo do modo) com
  `close_ts` de poucos segundos — pensado pra rodar sobre o feed ao vivo da
  TxLINE em produção; o modo demo usa pênaltis simulados no lugar do feed
  real. A casa financia o prêmio adiantado e recupera a margem sobre o
  valor justo, mais o stake das sessões perdidas.

---

## Como as apostas funcionam por baixo dos panos

Os 3 jogos disponíveis cobrem os dois padrões de mercado do contrato
`oddies_bet` (devnet):

- **Parimutuel** (1X2 Markets): pote comunitário dividido entre vencedores,
  proporcional ao stake — a "casa" não arrisca capital, só cobra a taxa de
  10%.
- **House-backed** (Infinite Hi-Lo, Penalty Predictor apostado): odds fixas
  definidas pela casa, que financia o prêmio adiantado e embute sua margem
  nas odds — como uma casa de apostas tradicional, mas liquidado on-chain.

Em qualquer modo com stake, a sequência de perguntas/respostas é gerada e
validada **no servidor**, nunca no navegador — é a regra de ouro
anti-fraude do projeto. Toda aposta gera um ticket-NFT, e resgatar o
prêmio (ou o reembolso, se o mercado for anulado) é sempre feito na
Carteira (`#/carteira`) usando esse ticket.
