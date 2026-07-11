# Mapeamento de funcionalidades — WeLikeSports (welikesports.com)

> Levantamento feito em 2026-07-11 navegando o site real (home, /pools, /play, /faq,
> /me e o contest World Cup 2026 Pick'em). Serve de referência para desenhar a lógica
> do nosso backend.

## O que é o produto

Plataforma de **bolões esportivos (sports pools) com amigos/comunidades**: o jogador
entra em contests públicos ou privados, faz palpites, acompanha standings ao vivo e
recebe prêmios do pool. Slogan: *"The premier platform for sports pools and
predictions"*. **O dinheiro roda em USDC na Solana** — mesma stack que a nossa.

## Navegação e páginas

| Rota | Conteúdo |
|---|---|
| `/home` | Dashboard do jogador: picks pendentes, saldo da wallet, entries ativas, atalhos |
| `/pools` e `/play` | Catálogo de contests: featured (World Cup 2026) + tipos de jogo |
| `/contest/{tipo}/{uuid}` | Página de um contest (ex.: `pickem-play/6391f122-...`) |
| `/me` | Perfil (auth-gated → redireciona para `/login?redirect=%2Fme`) |
| `/login` | Google OAuth ou e-mail ("Continue with Google" / "Continue with email") |
| `/faq`, `/terms`, `/privacy`, `/responsible-gaming`, `/disclosures`, `/brand` | Institucional |

Extra de UX: banner "Continue on mobile" com QR code para retomar a sessão no celular.

## Autenticação e conta

- Cadastro/login com **Google ou e-mail** (sem seed phrase — wallet é custodial).
- Perfil (`/me`) guarda o endereço da wallet do usuário na Solana.

## Wallet e dinheiro

- Saldo interno chamado **SportsCoin**, exibido em USD (`$0.00`) no dashboard.
- Depósito: **USDC na rede Solana**, enviado para o endereço da wallet WeLikeSports
  do usuário (mostrado no perfil), ou via fluxo de depósito no app.
- O FAQ alerta explicitamente: USDC *na Solana*, não em Ethereum/Base/Arbitrum.
- Modelo: wallet custodial por usuário; buy-in dos contests debita desse saldo
  ("buy in once and your wallet is ready for anything next").

## Tipos de contest (catálogo em /pools)

Disponível hoje: **Pick'em** (featured World Cup 2026). Marcados como "SOON":
Flash Pools, Survivor, Golf Shootout, Brackets, Calcutta, Custom Games, Squares, Props.

Como funcionam (segundo o FAQ):

- **Survivor** — escolhe 1 time por semana; ganhou avança, perdeu está fora.
  Suporta **buybacks** (recomprar a entry até uma semana-limite definida pelo criador).
  Demo interativa na home ("all eight Loop-D stages": pre-game, live scoreboard,
  next-week prompt...).
- **Calcutta** — leilão de times antes do torneio; ganha conforme os times comprados
  avançam.
- **Brackets** — chaveamento de torneio com regras de pontuação.
- **Pick'em** — palpites por rodada/matchday (o formato do World Cup 2026).
- **Custom Games** — regras livres (bolão de escritório, temporada de golfe etc.).

## Ciclo de vida de uma aposta (conceitos-chave)

- **Entry**: submissão individual num contest. Um jogador pode ter **múltiplas
  entries** no mesmo contest (máximo configurável pelo criador); cada entry tem
  picks, status e resultado próprios.
- **Deadlines/locks**: cada contest define deadline de inscrição e de picks. Picks
  editáveis **até o lock** (ex.: kickoff); depois, imutáveis. Pick não feito =
  **MISSED** (pontua zero) — a home cobra o jogador ("You forgot to make picks...").
- **Estados de um pick** no Pick'em: `OPEN → PICKED → LOCKED → MISSED`.
- **Resolução**: vencedores conforme regra do contest; prêmios distribuídos pela
  **payout structure** exibida antes de entrar (winner-take-all, top N, split entre
  sobreviventes).

## Contest featured: World Cup 2026 Pick'em (visto ao vivo)

- Free to enter · Top 5 win prizes · Up to $5,000.
- **Today's Card**: lista de matchdays (Jun 11 → Jul 14), cada dia com N partidas e
  contadores `picked/missed/to play`.
- Cada partida = mercado **"Regulation Time Moneyline"** com 3 outcomes (🇳🇴 Norway /
  🤝 Draw / 🏴 England) e **percentuais de consenso da comunidade** (24% / 25% / 52%).
- Countdown de lock por partida ("LOCKS IN 1h 19m"), kickoff com timezone.
- **Standings**: leaderboard único combinando *tournament card* (campeão + Golden
  Boot), *daily picks* e *streak bonuses* — colunas: Rank, Player, Champion, Golden
  Boot, Streak, Points. Visível só para quem entrou.

## Fluxo do criador/comissário ("For Commissioners")

- "Run your own league": criar pool privado "em menos de 1 minuto".
- Wizard: escolher tipo → configurar regras, **entry fee**, deadline, privacidade e
  **payout structure** → revisar → lançar → **compartilhar invite link**.
- Contests privados só entram por link (não aparecem no catálogo público).
- Criador controla: fee, payouts, múltiplas entries por jogador (e o máximo),
  buybacks no Survivor (e a semana-limite).
- Regras "core" travam depois que jogadores entram / o contest começa.

## Suporte e compliance

- Suporte via Discord e e-mail (support@welikesports.com).
- Páginas legais: Terms, Privacy, **Responsible Gaming**, Disclosures — sinal de que
  tratam o produto como jogo com dinheiro real (algo a considerar no nosso).

---

## Tradução para o nosso backend (ChainPlay)

O paralelo com o que já temos e o que falta construir no `server/`:

| Conceito deles | Nosso equivalente | Status |
|---|---|---|
| Contest Pick'em (moneyline 1X2 por partida) | `Market` parimutuel do `oddies_bet` (3 outcomes) | Contrato pronto; falta o server criar mercados por fixture |
| Entry / pick | `Bet` + ticket-NFT | Pronto no contrato |
| Lock no kickoff | `close_ts` do market | Pronto |
| Resolução pós-jogo | `resolve_market` chamado pelo server via TxLINE | Falta implementar o cron |
| Payout structure | `claim` proporcional (parimutuel) ou odds fixas (house-backed) | Pronto |
| Wallet custodial + USDC | Hoje somos SOL não-custodial (wallet do usuário assina) | Decisão de produto |
| Ligas privadas com invite link | Não temos | Backlog (dá pra fazer off-chain no server) |
| Leaderboard com streak | Não temos | Backlog off-chain |
| % de consenso da comunidade por outcome | Derivável dos `pools[]` do market on-chain | Fácil de expor via API |
| Múltiplas entries | Já natural: 1 ticket-NFT por aposta | Pronto |
| Auth Google/e-mail | Não temos (só wallet) | Decisão de produto |

Funcionalidades deles que dão vantagem imediata e são baratas no nosso server:
**(1)** endpoint de mercados abertos com countdown de lock e % por outcome (lendo os
markets on-chain), **(2)** cron `create_market` por fixture + `resolve_market` quando
`finished`, **(3)** "meus tickets" por wallet (scan das Bets/NFTs), **(4)** leaderboard
off-chain agregando claims.
