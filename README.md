# ChainPlay

Plataforma de minigames de futebol com apostas on-chain em Solana, construída sobre
dados reais da Copa do Mundo fornecidos pela **API da TxLINE**. Cada palpite vira uma
transação verificável na blockchain e cada aposta gera um **ticket-NFT** que dá direito
ao prêmio.

Este documento reúne o resumo técnico do projeto para fins de submissão do hackathon:
ideia principal, destaques técnicos e de negócio, os endpoints da TxLINE utilizados e o
feedback da nossa equipe sobre a experiência de integração com a API.

---

## 1. Ideia principal

O ChainPlay transforma estatísticas ao vivo da Copa do Mundo em minigames rápidos e
apostáveis: o jogador palpita sobre gols, escanteios, cartões, posse de bola ou o
resultado de uma partida, e o servidor confere o palpite contra os dados reais vindos
da TxLINE. Toda aposta é resolvida por um contrato inteligente próprio na Solana
(`oddies_bet`, devnet), que custodia os fundos, define o vencedor a partir do dado
fornecido pelo backend (oráculo) e paga o prêmio sem intervenção manual.

A combinação de **dados esportivos verificáveis (TxLINE)** + **liquidação on-chain
(Solana)** é o núcleo do produto: o jogador não precisa confiar na plataforma para
saber se o resultado do palpite foi apurado corretamente — o dado vem de um provedor
terceiro e o pagamento é público e auditável na chain.

Três jogos já estão jogáveis (hub em `#/jogos`):

| Jogo | O que é | Rota |
|---|---|---|
| **Infinite Hi-Lo** | Compara estatísticas (gols, escanteios, posse, cartões) de partida em partida — maior ou menor — subindo uma escada de multiplicador a cada acerto, com cash-out a qualquer momento. | `#/hilo-infinito` |
| **1X2 Markets** | Aposta parimutuel no resultado (casa/empate/fora) de partidas futuras da Copa; o pote é dividido entre quem acerta. | `#/mercados` |
| **Penalty Predictor** | Modo relâmpago: prever gol ou defesa em cobranças de pênalti, com timer curto e multiplicadores por sequência de acertos. | `#/penalty` |

Outros quatro (Hi-Lo apostado, Guess the Stats, Survivor, Live Challenge, Guess the
Team) estão mapeados e em construção — detalhes em [`docs/jogos-disponiveis.md`](docs/jogos-disponiveis.md)
e no plano completo em [`docs/plano-minigames.md`](docs/plano-minigames.md).

---

## 2. Destaques técnicos

- **Contrato Solana próprio (`oddies_bet`, Anchor)** — programa deployado em devnet
  que implementa dois padrões de mercado: `Parimutuel` (pote comunitário dividido
  entre vencedores, casa sem risco, só cobra 10% de taxa) e `HouseBacked` (odds
  fixas, a casa banca o prêmio com liquidez própria). Detalhes em
  [`program/README.md`](program/README.md).
- **Ticket-NFT por aposta** — cada palpite minta um SPL token (supply 1, autoridade
  de mint revogada) na wallet do jogador; quem segura o token resgata o prêmio, e ele
  é queimado no resgate (impossível resgatar duas vezes). Cada jogo tem sua própria
  Collection NFT (`game_id`/`allowed_games`), então os tickets carregam a identidade
  visual do jogo em que foram ganhos.
- **Regra de ouro anti-fraude**: em qualquer modo com stake, a sequência de
  perguntas/respostas é gerada e validada **no servidor**, nunca no navegador — o
  cliente jamais sabe o próximo valor antes de o jogador palpitar. Verificado por
  testes automatizados (a sequência secreta nunca aparece na API).
- **Oráculo de dados**: o backend consome a TxLINE, faz cache local (TTL de 5 min) e
  faz fallback para dados mock quando a API está indisponível, para o produto nunca
  ficar fora do ar por uma falha externa.
- **Tempo real via WebSocket** (`/ws/live`): o servidor faz poll da TxLINE (45s) e só
  propaga os deltas (partidas que mudaram) para os clientes conectados — sem clients
  ouvindo, não há poll, economizando cota da API.
- **Autenticação sem fricção**: login social (Google) com custódia de wallet no
  servidor, sem exigir extensão de carteira para experimentar o produto; wallet
  adapters (Phantom, Solflare, Backpack) entram para quem quer jogar com fundos
  próprios.
- **Auditoria de segurança própria**: revisão sistemática de IDOR, tratamento de
  erros e logging aplicada ao backend (ver [`docs/security-review.md`](docs/security-review.md) e
  [`docs/audit-log-integracao.md`](docs/audit-log-integracao.md)), com correções
  verificadas ao vivo contra o server local e a suíte `e2e:full` rodando contra a
  devnet real (30/30 ✅).

## 3. Destaques de negócio

- **Dado real de Copa do Mundo como diferencial**: em vez de RNG interno, todo
  resultado é ancorado em estatísticas reais da competição via TxLINE — o produto
  vende "jogo de skill/previsão sobre esporte real", não uma loteria disfarçada.
- **Dois motores de monetização no mesmo contrato**: parimutuel (receita = taxa fixa
  de 10%, zero risco de casa) para os modos sociais/multiplayer, e house-backed
  (margem embutida nas odds) para os modos singleplayer de skill — cobrindo tanto
  jogadores que quer apostar contra a comunidade quanto os que preferem odds fixas.
- **Ativo colecionável embutido na aposta**: o ticket-NFT não é só um comprovante —
  é transferível e vendável, e carrega a "marca" do jogo (Collection NFT por jogo),
  abrindo espaço para secundário e para badges/conquistas por jogo.
- **Baixa barreira de entrada**: modos demo sem stake para conhecer o jogo antes
  de arriscar fundos, e stakes pequenos (a partir de 0,002 SOL) nos modos apostados.

---

## 4. Endpoints da TxLINE utilizados

Toda a integração vive em [`server/src/txline/`](server/src/txline). São quatro
chamadas à API da TxLINE, cobrindo o ciclo completo de ativação e consumo de dados:

| Método | Endpoint | Uso | Onde |
|---|---|---|---|
| `POST` | `/auth/guest/start` | Inicia uma sessão de convidado e retorna o JWT usado nas chamadas seguintes. | [`txline/auth.ts`](server/src/txline/auth.ts) |
| `POST` | `/api/token/activate` | Ativa o token de API da TxLINE a partir da assinatura on-chain (`txSig`) do plano free tier e de uma assinatura da wallet (`walletSignature`), vinculando a conta TxLINE à identidade Solana da plataforma. | [`txline/auth.ts`](server/src/txline/auth.ts) |
| `GET` | `/api/fixtures/snapshot` | Lista o snapshot de partidas (fixtures) disponíveis, opcionalmente filtrado por `competitionId`. Usado para descobrir os jogos da Copa do Mundo e seus horários. | [`txline/data.ts`](server/src/txline/data.ts) |
| `GET` | `/api/scores/snapshot/:fixtureId` | Retorna o snapshot de placar/estatísticas de uma partida específica (gols, escanteios, cartões, posse de bola, estado do jogo). É a fonte de verdade usada para decidir vitória/derrota nos jogos e para resolver os mercados on-chain. | [`txline/data.ts`](server/src/txline/data.ts) |

**Autenticação** em toda chamada autenticada: header `Authorization: Bearer <jwt>` +
header `X-Api-Token: <apiToken>` (ver `createClient` em `txline/data.ts`).

**Fluxo de ativação** (`npm run subscribe`, ou automático no primeiro cache-miss do
servidor): a plataforma assina o plano free tier do serviço da TxLINE **on-chain**
(instrução `subscribe` do programa `txoracle` da própria TxLINE, devnet/mainnet),
depois troca a assinatura on-chain (`txSig`) por um JWT (`/auth/guest/start`) e por um
token de API (`/api/token/activate`), assinando a mensagem `txSig:leagues:jwt` com a
wallet Solana da plataforma. As credenciais resultantes são cacheadas por até 26 dias
(ver `MAX_AGE_MS` em `txline/auth.ts`) e podem ser injetadas via variáveis de ambiente
(`TXLINE_JWT`, `TXLINE_API_TOKEN`) em ambientes read-only (Vercel).

---

## 5. Feedback sobre a experiência com a API da TxLINE

**O que mais gostamos:**

- **O modelo de assinatura on-chain é coerente com o resto do produto.** Pagar/ativar
  o acesso à API assinando uma transação na própria Solana (em vez de um cartão de
  crédito ou chave manual num painel) encaixou naturalmente num projeto que já é
  100% on-chain — não precisamos sair do ecossistema Solana para contratar o dado.
- **O free tier é generoso o suficiente para prototipar e validar o produto inteiro**
  sem custo, incluindo o fluxo de tempo real (mesmo que com delay de 60s no tier
  gratuito), o que foi essencial num hackathon.
- **Os snapshots de fixtures e scores são simples de consumir**: dois endpoints REST
  cobrem tudo que os sete jogos do roadmap precisam (calendário + placar/estatísticas
  por partida), sem exigir modelagem complexa no nosso lado.

**Onde tivemos dificuldade:**

- **Descoberta da API foi o maior atrito**: documentação sobre o fluxo completo de
  ativação (assinatura on-chain → troca por JWT → troca por token de API →
  assinatura de mensagem com a wallet) não estava centralizada num único lugar;
  reconstruímos o fluxo lendo o IDL do programa `txoracle` e testando empiricamente
  contra o ambiente de devnet.
- **Encoding das estatísticas no snapshot de scores não é auto-descritivo**: as
  chaves do payload de `scores/snapshot` são números (`period * 1000 + base_key`, ex.
  `1`/`2` = gols P1/P2, `7`/`8` = escanteios) sem um schema público que mapeie esses
  códigos — teve que ser feito por tentativa e erro comparando o snapshot com o placar
  real das partidas até fechar o mapeamento usado em `extractStats` (`txline/data.ts`).
- **Delay do free tier em devnet exige desenho defensivo**: com o tier gratuito
  entregando dados com ~60s de atraso e, ocasionalmente, degradado, tivemos que
  desenhar cache + fallback para dados mock desde o início (`games/matches.ts`) para
  o produto continuar demonstrável mesmo se a TxLINE ficasse indisponível durante uma
  demo ao vivo — algo que só um SLA/tier pago resolveria de fato.
- **Reativação em loop no free tier** gerou rate-limit (`429`) do faucet de devnet
  quando o cron de renovação de credenciais rodava com frequência maior que o
  necessário; resolvido com um cooldown de 15 min entre tentativas de ativação no
  nosso lado (ver achado registrado em [`docs/security-review.md`](docs/security-review.md)).

No geral, a API da TxLINE cumpriu bem o papel de oráculo de dados esportivos
verificáveis para o projeto — o principal ganho de produtividade viria de uma
documentação mais explícita do fluxo de ativação on-chain e do schema de estatísticas
do endpoint de scores.

---

## 6. Estrutura do repositório

```
client/    # frontend React + Vite (jogos, wallet, hub)
server/    # backend Express (TxLINE, contrato Solana, WebSocket)
program/   # contrato Anchor `oddies_bet` (Solana)
NFTs/      # arte e metadata das collections dos tickets
docs/      # planejamento, auditoria de segurança e documentação de apoio
```

Para rodar localmente: `npm run setup` seguido de `npm run dev` (sobe client e server
em paralelo). Detalhes de configuração de rede/credenciais em
[`server/src/config.ts`](server/src/config.ts).
