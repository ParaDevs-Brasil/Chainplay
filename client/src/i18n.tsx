import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { StatCategory } from "./types";

export type Lang = "pt" | "en";

/* ---------- dicionário PT (referência de tipo) ---------- */

const pt = {
  docTitle: "Hi-Lo · Copa 2026",
  nav: {
    how: "Como funciona",
    minigames: "Minigames",
    signup: "Signup",
    tech: "Tecnologia",
    vision: "Visão",
    faq: "FAQ",
    play: "Play Now",
    home: "Início",
    howToPlay: "Como jogar",
    ranking: "Ranking",
    history: "Histórico",
    games: "Jogos",
    wallet: "Carteira",
    soon: "em breve",
    menuAria: "Abrir menu de navegação",
    backToGames: "Voltar aos jogos",
  },

  ticker: [
    { match: "Brasil 2×1 Argentina", stat: "🚩 11 escanteios", kind: "corner" },
    { match: "França 0×0 Japão", stat: "🟨 3 amarelos", kind: "card" },
    { match: "EUA 3×2 México", stat: "⚽ 5 gols", kind: "goal" },
    { match: "Espanha 1×1 Alemanha", stat: "🕐 54% posse", kind: "poss" },
    { match: "Marrocos 2×0 Croácia", stat: "🚩 7 escanteios", kind: "corner" },
    { match: "Inglaterra 4×1 Gana", stat: "⚽ 5 gols", kind: "goal" },
    { match: "Portugal 2×2 Uruguai", stat: "🟨 6 amarelos", kind: "card" },
    { match: "Senegal 1×0 Polônia", stat: "🕐 48% posse", kind: "poss" },
  ],

  hero: {
    badge: "Copa 2026 · dados ao vivo TxLINE · Solana",
    heroLine1: "O jogo começa",
    heroLine2: "no gramado.",
    heroLine3: "a batalha",
    heroLine4: "continua aqui.",
    heroSub:
      "Minigames, previsões e desafios conectados a partidas e estatísticas reais da Copa do Mundo.",
    heroCtaStart: "Começar a jogar",
    heroCtaExplore: "Explorar Minigames",
    titlePre: "A próxima partida vem",
    titleHigher: "MAIOR",
    titleOr: "ou",
    titleLower: "menor",
    titlePost: "?",
    lead:
      "O jogo de palpites com estatísticas reais da Copa do Mundo 2026, verificáveis on-chain. Uma pergunta por rodada, 104 jogos, uma sequência para defender.",
    ctaPlay: "⚽ Jogar agora — é grátis",
    ctaHow: "Como funciona ↓",
    statGames: "jogos da Copa",
    statCats: "categorias de stats",
    statPerRound: "por rodada",
    statSignups: "cadastros exigidos",
    statFree: "grátis de verdade",
    statChain: "verificação Solana",
  },

  showcase: {
    title: "Cada partida. Um novo jeito de vencer.",
    sub: "Pare de assistir. Comece a competir. A ChainPlay transforma partidas e estatísticas reais no seu próximo desafio.",
    games: [
      {
        title: "Infinite Hi-Lo",
        tagline: "Solo · Sequência infinita",
        description:
          "Uma evolução do Hi-Lo tradicional que alterna automaticamente diferentes tipos de estatísticas, como gols, escanteios, posse de bola, cartões, finalizações e faltas. Essa variação impede que as partidas se tornem repetitivas e aumenta a dificuldade conforme a sequência cresce. O jogador deve manter o maior número possível de acertos consecutivos para alcançar posições de destaque no ranking global.",
      },
      {
        title: "1X2 Markets",
        tagline: "Multiplayer · Pote on-chain",
        description:
          "O jogo multiplayer on-chain do ChainPlay onde você aposta no resultado de partidas reais da Copa do Mundo de 2026. Diferente das apostas com odds fixas, todas as apostas entram em um único pote compartilhado, e o prêmio é dividido proporcionalmente entre quem acertar o resultado. As porcentagens exibidas representam como a comunidade está distribuindo suas apostas em tempo real.",
      },
      {
        title: "Penalty Predictor",
        tagline: "Ao vivo · Momentos de pênalti",
        description:
          "Sempre que uma cobrança de pênalti acontecer durante a Copa, o jogador terá poucos segundos para prever se a cobrança será convertida ou defendida. Após a conclusão da jogada, a API confirma o resultado e a pontuação é distribuída automaticamente. Sequências de acertos aumentam multiplicadores de pontos e desbloqueiam recompensas especiais. O modo transforma momentos decisivos da partida em desafios rápidos e emocionantes.",
      },
    ],
  },

  advantages: {
    title: "Feito para o jogador, não para a casa.",
    items: [
      {
        n: "1",
        title: "Justo por Design",
        text: "Regras, taxas e prêmios ficam claros antes de você entrar.",
      },
      {
        n: "2",
        title: "Modos de Jogo Personalizados",
        text: "Crie bolões, ligas e formatos com as suas próprias regras.",
      },
      {
        n: "3",
        title: "Sem Vantagem da Casa",
        text: "Jogue contra o seu grupo, não contra a plataforma.",
      },
      {
        n: "4",
        title: "Social por Natureza",
        text: "Convide amigos, desafie rivais e acompanhe a ação juntos.",
      },
    ],
  },

  getStarted: {
    title: "Comece em 3 passos",
    soon: "em breve",
    steps: [
      { label: "1. Conecte sua carteira" },
      { label: "2. Faça seu palpite" },
      { label: "3. Resgate suas recompensas" },
    ],
  },

  arena: {
    kicker: "// arena ao vivo",
    h2pre: "O jogo no centro de",
    h2accent: "tudo",
    lead:
      "Uma rodada de exemplo rolando no centro, dados reais dos lados. É assim que a arquibancada digital se parece.",
    leftTitle: "📊 Últimos resultados",
    catNow: "Categoria em destaque",
    catNowValue: "🚩 Escanteios",
    avgTime: "Tempo médio por rodada",
    avgTimeValue: "< 5s",
    totalMatches: "Partidas na campanha",
    rightTitle: "🏆 Ranking",
    preview: "preview",
    rankRows: [
      { name: "rafa.sol", streak: 12 },
      { name: "copa_fan26", streak: 9 },
      { name: "hilo_pro", streak: 7 },
    ],
    yourStreak: "🔥 Seu recorde",
    yourStreakUnit: "acertos seguidos",
    online: "Jogadores online",
    liveFeed: "🟢 Agora na arena",
    feedItems: [
      "acertou 3 seguidas em Gols",
      "bateu o recorde pessoal: 11",
      "começou uma run nova",
      "acertou MENOR em Escanteios",
    ],
  },

  teaser: {
    title: "Aquecimento — jogue agora",
    lastMatch: "Última partida",
    nextMatch: "Próxima partida",
    higher: "⬆ MAIOR",
    lower: "⬇ MENOR",
    feedbackIdle: "Toque em MAIOR ou MENOR para palpitar",
    feedbackOk: "✓ Acertou! Próxima rodada…",
    feedbackBad: "✗ Errou! No jogo real, a run acabaria aqui.",
    doneStreak: (n: number) => `Sequência de ${n} no aquecimento!`,
    doneZero: "O aquecimento acabou rápido…",
    doneNote:
      "Isso foi só uma amostra. No jogo de verdade são 104 partidas com dados reais.",
    doneCta: "Jogar a versão completa →",
    rounds: [
      {
        prev: { teams: "Brasil vs Argentina", value: 11 },
        next: { teams: "França vs Japão", value: 8 },
        cat: "🚩 Escanteios",
      },
      {
        prev: { teams: "França vs Japão", value: 2 },
        next: { teams: "EUA vs México", value: 5 },
        cat: "⚽ Gols",
      },
      {
        prev: { teams: "EUA vs México", value: 4 },
        next: { teams: "Espanha vs Alemanha", value: 6 },
        cat: "🟨 Cartões amarelos",
      },
    ],
  },

  demo: {
    title: "Rodada de exemplo — assista",
    lastMatch: "Última partida",
    nextMatch: "Próxima partida",
    higher: "⬆ MAIOR",
    lower: "⬇ MENOR",
    pickHigher: "MAIOR ⬆",
    pickLower: "MENOR ⬇",
    rounds: [
      {
        cat: "🚩 Escanteios",
        unit: "escanteios",
        prevTeams: "Brasil vs Argentina",
        prev: 11,
        nextTeams: "França vs Japão",
        next: 8,
        pick: "lower" as const,
      },
      {
        cat: "⚽ Gols",
        unit: "gols",
        prevTeams: "França vs Japão",
        prev: 2,
        nextTeams: "EUA vs México",
        next: 5,
        pick: "higher" as const,
      },
      {
        cat: "🟨 Cartões amarelos",
        unit: "cartões",
        prevTeams: "EUA vs México",
        prev: 6,
        nextTeams: "Espanha vs Alemanha",
        next: 3,
        pick: "lower" as const,
      },
    ],
    captionLook: (prev: number, unit: string): ReactNode => (
      <>
        <b>Passo 1</b> — veja a última partida: <b>{prev} {unit}</b>
      </>
    ),
    captionPress: (pick: string): ReactNode => (
      <>
        <b>Passo 2</b> — palpite: a próxima vem <b>{pick}</b>
      </>
    ),
    captionReveal: (next: number, unit: string, streak: number): ReactNode => (
      <>
        <b>Passo 3</b> — foram <b>{next} {unit}</b>: acertou! 🔥 sobe para{" "}
        <b>{streak}</b>
      </>
    ),
    captionDone: (streak: number): ReactNode => (
      <>
        🔥 Sequência de <b>{streak}</b>! No jogo real, você segue até errar.
      </>
    ),
  },

  how: {
    kicker: "// gameplay",
    h2pre: "Como funciona",
    h2accent: "em 3 passos",
    lead:
      "Pensado para o torcedor comum: se você entende “maior ou menor”, você já sabe jogar.",
    steps: [
      {
        n: "01",
        icon: "📊",
        title: "Veja a última partida",
        text: "Mostramos uma estatística real do jogo anterior da Copa: gols, escanteios, cartões ou posse de bola — direto do feed TxLINE.",
      },
      {
        n: "02",
        icon: "🎯",
        title: "Palpite: maior ou menor?",
        text: "A próxima partida terá um número MAIOR ⬆ ou MENOR ⬇? Uma pergunta, um toque, zero fricção.",
      },
      {
        n: "03",
        icon: "🔥",
        title: "Monte sua sequência",
        text: "Cada acerto aumenta a streak. Errou, acabou — compartilhe o placar em um toque e desafie os amigos.",
      },
    ],
  },

  why: {
    kicker: "// por quê",
    h2pre: "Por que o",
    h2accent: "Hi-Lo",
    h2post: "?",
    lead:
      "Dados que antes só os grandes operadores tinham, transformados num jogo que qualquer torcedor abre no intervalo.",
    features: [
      {
        icon: "⛓️",
        title: "Dados verificáveis on-chain",
        text: "Estatísticas via TxLINE (TxODDS) com ancoragem criptográfica na Solana. Qualquer um pode auditar — nada de números inventados.",
      },
      {
        icon: "🏆",
        title: "104 jogos da Copa 2026",
        text: "Da fase de grupos à final: a campanha inteira vira tabuleiro. A cada rodada real, novo conteúdo — o jogo cresce com o torneio.",
      },
      {
        icon: "🔁",
        title: "Rejogável ao infinito",
        text: "Categorias sorteadas a cada run com seed determinística. Seu recorde fica salvo — sempre há uma sequência maior para buscar.",
      },
      {
        icon: "📱",
        title: "Feito para a arquibancada",
        text: "Zero cadastro, zero instalação, zero jargão. Abre no navegador do celular e roda em segundos — no intervalo do jogo.",
      },
      {
        icon: "⚡",
        title: "Tempo real de verdade",
        text: "O feed TxLINE atualiza as estatísticas conforme a bola rola. O tabuleiro de hoje não é o mesmo de ontem.",
      },
      {
        icon: "🤝",
        title: "Viral por natureza",
        text: "O placar compartilhável transforma cada derrota em convite: “fiz 7 seguidas, duvido você passar”.",
      },
    ],
  },

  tech: {
    kicker: "// arquitetura",
    h2pre: "Do gramado à sua tela,",
    h2accent: "com prova on-chain",
    lead:
      "Cada estatística percorre um pipeline auditável: feed TxLINE, autenticação on-chain na Solana e entrega em tempo real.",
    pipeline: [
      {
        n: "1",
        title: "TxLINE Feed",
        sub: "TxODDS · schema normalizado",
        text: "Estatísticas ao vivo dos 104 jogos: gols, escanteios, cartões e posse, num único JSON para todas as competições.",
      },
      {
        n: "2",
        title: "Solana Devnet",
        sub: "programa txoracle",
        text: "Assinatura do free tier via transação subscribe on-chain — o acesso aos dados é provado criptograficamente.",
      },
      {
        n: "3",
        title: "Backend Node",
        sub: "normalização + cache",
        text: "Decodifica o encoding (period·1000 + stat_key), monta as rodadas e serve o jogo com fallback resiliente.",
      },
      {
        n: "4",
        title: "Você joga",
        sub: "React · zero fricção",
        text: "Interface instantânea no navegador. Palpite, reveal animado, streak e share — tudo em menos de 5 segundos por rodada.",
      },
    ],
  },

  roadmap: {
    kicker: "// visão de produto",
    h2pre: "Começa na Copa.",
    h2accent: "Não termina nela.",
    lead:
      "O Hi-Lo é a porta de entrada de um modelo de jogos casuais sobre dados esportivos verificáveis.",
    items: [
      {
        tag: "Agora",
        title: "Free to play",
        text: "Aquisição viral via placar compartilhável durante a Copa 2026 — o maior evento de audiência do planeta.",
        live: true,
      },
      {
        tag: "Fase 2",
        title: "Ligas privadas",
        text: "Bolões entre amigos com leaderboard ao vivo. Modelo freemium: liga básica grátis, personalização paga.",
        live: false,
      },
      {
        tag: "Fase 3",
        title: "Streaks on-chain",
        text: "Recordes mintados como colecionáveis na Solana e torneios patrocinados com premiação em stablecoin.",
        live: false,
      },
      {
        tag: "Sempre",
        title: "Além da Copa",
        text: "O schema único da TxLINE permite escalar o mesmo jogo para ligas nacionais, Champions e qualquer esporte do feed.",
        live: false,
      },
    ],
  },

  nots: {
    kicker: "// sem pegadinha",
    h2pre: "O que o Hi-Lo",
    h2accent: "não",
    h2post: "é",
    lead: "Jogo gratuito de entretenimento sobre dados reais. Nada além disso.",
    items: [
      "Apostas com dinheiro real",
      "Cadastro ou e-mail",
      "Carteira cripto obrigatória",
      "Pay-to-win",
      "Instalação de app",
      "Letras miúdas",
    ],
  },

  faq: {
    kicker: "// dúvidas rápidas",
    h2pre: "Perguntas",
    h2accent: "frequentes",
    lead: "O essencial antes de dar o primeiro palpite.",
    items: [
      {
        q: "Do I need to deposit to start making predictions?",
        a: "Yes. To place your predictions and earn real rewards, you must connect your crypto wallet (Solana) and have a balance available on the platform.",
      },
      {
        q: "Where do the data and market results come from?",
        a: "From the TxLINE (TxODDS) feed. All market resolutions are settled via on-chain transactions on the Solana blockchain, ensuring 100% public, auditable, and tamper-proof results.",
      },
      {
        q: "What happens if my prediction is incorrect?",
        a: "If your prediction is wrong, the funds allocated to that position are lost. However, you can open new positions and join other active markets instantly.",
      },
    ],
  },

  cta: {
    badge: "A Copa está rolando",
    h2: "Pronto para testar seu faro de futebol?",
    lead: "Sem cadastro, sem instalação. Um clique e a bola rola.",
    btn: "Começar a jogar →",
  },

  footer: {
    slogan1: "The game starts on the field.",
    slogan2: "The battle continues here.",
    resources: "Resources",
    products: "Products",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    responsible: "Responsible Gaming",
    disclosures: "Disclosures",
    brand: "Brand",
    minigames: "Minigames",
    howItWorks: "How It Works",
    discord: "Discord",
    x: "X",
  },

  game: {
    loading: "Carregando partidas…",
    errorTitle: "Não foi possível carregar as partidas.",
    retry: "Tentar de novo",
    back: "← início",
    tagline: "Copa 2026 · a próxima partida vem MAIOR ou menor?",
    sourceTx: (network: string) => `dados TxLINE · ${network}`,
    sourceMock: "dados simulados (TxLINE offline)",
    round: "Rodada",
    streak: "Sequência",
    best: "Recorde",
    helpTitle: "💡 Como jogar",
    helpClose: "✕ fechar",
    helpCloseAria: "Fechar ajuda",
    helpSteps: [
      "Veja a última partida",
      "Palpite MAIOR ou MENOR",
      "Acompanhe a revelação",
      "Aumente sua sequência",
    ],
    helpCta: "Entendi, bora jogar! ⚽",
    questionTitle: (label: string): ReactNode => (
      <>
        {label}: vem <span className="accent">MAIOR</span> ou{" "}
        <span className="muted-strike">menor</span>?
      </>
    ),
    pendingPick: "🎯 Palpite pendente",
    progressOf: (pct: number) => `${pct}% da campanha`,
    newRecord: "🏆 Novo recorde!",
    categoryQuestion: (value: number, unit: string): ReactNode => (
      <>
        A próxima partida terá mais ou menos que <b className="mono">{value}</b>{" "}
        {unit}?
      </>
    ),
    lastMatch: "Última partida",
    nextMatch: "Próxima partida",
    higher: "⬆ MAIOR",
    lower: "⬇ MENOR",
    moreThan: (v: number) => `mais que ${v}`,
    lessThan: (v: number) => `menos que ${v}`,
    nextRound: "Próxima rodada →",
    seeResult: "Ver resultado",
    wonTitle: "🏆 Você zerou os 104 jogos!",
    lostTitle: "💀 Fim de jogo!",
    summary: (streak: number, score: number, rounds: number): ReactNode => (
      <>
        Sequência final: <strong>{streak}</strong> · Acertos:{" "}
        <strong>{score}</strong> de <strong>{rounds}</strong> rodadas
      </>
    ),
    shareBtn: "📣 Compartilhar placar",
    copied: "✓ Copiado!",
    playAgain: "↻ Jogar de novo",
    shareText: (streak: number, best: number, played: number, total: number) =>
      `⚽ Hi-Lo · Copa 2026\n` +
      `🔥 Sequência: ${streak} | 🏆 Recorde: ${best}\n` +
      `Sobrevivi a ${played} de ${total} rodadas. Consegue mais?`,
    scoreline: (h: number, a: number) => `placar: ${h} × ${a}`,
    hiddenHint: "qual será o número?",
    successWords: [
      "⚽ GOOOL!",
      "Acertou!",
      "Boa!",
      "Mandou bem!",
      "Perfeito!",
      "Sensacional!",
      "Monstro!",
    ],
    streakMilestone: (n: number) =>
      n >= 15 ? `⚡ IMPARÁVEL! ${n} seguidas!` : `🔥 ${n} seguidas!`,
    resultPush: "🤝 Deu igual!",
    resultPushNote: "Empate não conta ponto, mas a sequência continua.",
    resultOk: "✅ Acertou!",
    resultOkNote: (wentHigher: boolean) =>
      `Veio ${wentHigher ? "maior" : "menor"}, como você palpitou.`,
    resultBad: "❌ Errou!",
    resultBadNote: (guessHigher: boolean, next: number, unit: string) =>
      `Você palpitou ${guessHigher ? "maior" : "menor"}, mas foram ${next} ${unit}.`,
    gameFooter: (
      <>
        Dados de partidas via{" "}
        <a href="https://txline.txodds.com" target="_blank" rel="noreferrer">
          TxLINE
        </a>{" "}
        (TxODDS) com ancoragem na Solana
      </>
    ) as ReactNode,
    categoryLabels: {
      goals: "Gols na partida",
      corners: "Escanteios na partida",
      yellowCards: "Cartões amarelos",
      possession: "Posse de bola do mandante (%)",
    } as Record<StatCategory, string>,
    categoryUnits: {
      goals: "gols",
      corners: "escanteios",
      yellowCards: "cartões amarelos",
      possession: "% de posse",
    } as Record<StatCategory, string>,
  },

  hub: {
    docTitle: "Jogos · ChainPlay",
    title: "Escolha seu jogo",
    sub: "Palpites com dados reais da Copa 2026 — jogue grátis ou valendo SOL na devnet.",
    play: "Jogar →",
    playStaked: "💰 Valendo SOL",
    building: "em construção",
    soonTag: "Em breve",
    comingSoon: "🔒 Em breve",
    phaseLabel: (n: number) => `fase ${n}`,
    carouselTitle: "Escolha um Minigame",
    carouselSub: "Previsões em tempo real",
    mascotQuote: "Escolha um minigame e teste sua sorte. Bora?",
    prevAria: "jogos anteriores",
    nextAria: "próximos jogos",
    liveTicker: "AO VIVO",
    games: {
      hilo: {
        name: "Hi-Lo",
        desc: "A próxima partida vem MAIOR ou menor? Defenda sua sequência pelos 104 jogos da Copa.",
      },
      markets1x2: {
        name: "Mercados 1X2",
        desc: "Casa, empate ou fora? Aposte no pote comunitário — quem acerta divide tudo, proporcional ao stake.",
      },
      infiniteHilo: {
        name: "Infinite Hi-Lo",
        desc: "Categorias rotativas, multiplicador crescente e a decisão de ouro: seguir ou sacar?",
      },
      guessStats: {
        name: "Guess the Stats",
        desc: "Preveja os números finais da partida antes do apito inicial. Quanto mais perto, mais pontos.",
      },
      survivor: {
        name: "Survivor",
        desc: "Um palpite por rodada. Um erro e você está fora. Quantos sobrevivem até a final?",
      },
      penalty: {
        name: "Penalty Predictor",
        desc: "Pênalti na Copa: você tem segundos pra cravar. Gol ou defesa?",
      },
      liveChallenge: {
        name: "Live Challenge",
        desc: "Desafios relâmpago durante a partida: próximo gol, próximo escanteio, cartão nos próximos minutos.",
      },
      guessTeam: {
        name: "Guess the Team",
        desc: "Só as estatísticas na mesa. Você descobre qual seleção jogou?",
      },
    },
  },

  auth: {
    title: "Entre para jogar valendo SOL",
    withWallet: "🔗 Conectar wallet",
    asGuest: "Entrar como convidado (devnet)",
    logout: "sair",
    working: "Entrando…",
    googleSetupHint:
      "Login com Google: defina GOOGLE_CLIENT_ID no server/.env e VITE_GOOGLE_CLIENT_ID no client/.env (OAuth Client ID do Google Cloud, origem http://localhost:5173).",
    noWalletHint:
      "Sem extensão de wallet? Use o Google ou o modo convidado — criamos uma conta custodial de devnet pra você.",
    apiOfflineHint:
      "API fora do ar — login social/convidado indisponível. Conecte sua wallet (web3 connect): as apostas vão direto pra chain. Pra reativar tudo, suba o server: cd server && npm run dev.",
    custodialBadge: (name: string) => `conta custodial · ${name}`,
    custodialBalance: (sol: string) => `saldo: ${sol}`,
    custodialFund: (addr: string) =>
      `Pra recarregar, mande SOL de devnet para ${addr} (faucet.solana.com).`,
  },

  staked: {
    docTitle: "Hi-Lo Valendo SOL · ChainPlay",
    title: "Hi-Lo · valendo SOL",
    sub: "Escolha a meta de acertos, aposte na devnet e a casa paga se você bater. A sequência é gerada no servidor — ninguém vê o próximo número.",
    chooseTarget: "Meta de acertos seguidos",
    oddsX: (x: string) => `paga ${x}×`,
    stakeLabel: "Sua aposta",
    potential: "Prêmio se bater a meta",
    start: "🎲 Criar run apostada",
    creating: "Criando mercado on-chain…",
    connectFirst: "Conecte a wallet pra jogar valendo SOL.",
    connect: "Conectar wallet",
    connecting: "Conectando…",
    betTitle: "Run criada! Agora assine a aposta",
    betNote: (min: number) =>
      `Você tem ${min} min pra assinar antes do mercado fechar. A taxa de 10% vai pra plataforma; o resto entra no vault do mercado.`,
    signBet: (sol: string) => `✍️ Apostar ${sol}`,
    signing: "Aguardando assinatura…",
    confirming: "Confirmando on-chain…",
    betExpired: "A janela de aposta expirou. Crie outra run.",
    progressLabel: (n: number, target: number) => `acertos ${n} de ${target}`,
    cashout: "🏳️ Desistir da run",
    wonTitle: "🏆 Meta batida!",
    wonSub: (sol: string) => `A casa te deve ${sol}. Aguardando a liquidação on-chain…`,
    settling: "liquidando o mercado on-chain…",
    claimBtn: (sol: string) => `💰 Resgatar ${sol}`,
    claiming: "Resgatando…",
    claimedMsg: "Prêmio na sua wallet! 🎉",
    lostTitle: "💀 Fim da run!",
    lostSub: "O stake fica com a casa. Bora de novo?",
    expiredTitle: "⌛ Run expirada",
    playAgain: "↻ Nova run",
    seeWallet: "Ver meus tickets →",
    error: "Algo deu errado",
    devnetNote: "SOL de devnet — sem valor real. Pegue no faucet.solana.com.",
    bettingAs: (name: string) => `Apostando como ${name}`,
    balanceLabel: "saldo",
    insufficient: (stake: string) =>
      `Saldo insuficiente pra apostar ${stake} — pegue SOL de devnet no faucet.solana.com.`,
  },

  markets: {
    docTitle: "Mercados 1X2 · ChainPlay",
    title: "Mercados da Copa",
    sub: "Aposte no resultado (casa · empate · fora). O pote é dividido entre quem acertar, proporcional ao stake — as odds emergem da comunidade.",
    locksIn: "fecha em",
    closed: "apostas encerradas",
    resolvedTag: "resolvido",
    voidedTag: "anulado (reembolso)",
    demoTag: "demo",
    draw: "Empate",
    inPool: "no pote",
    stakeLabel: "Stake",
    betBtn: "Apostar",
    betting: "Assinando…",
    betOk: "✅ Aposta feita! O ticket-NFT está na sua carteira.",
    empty: "Nenhum mercado aberto agora — o servidor cria novos automaticamente.",
    loading: "Buscando mercados on-chain…",
    connectFirst: "Conecte a wallet pra apostar.",
    connect: "Conectar wallet",
    refresh: "↻ Atualizar",
    yourPick: "seu palpite",
    error: "Falha na aposta",
    serverOffline:
      "Servidor da API fora do ar — rode `npm run dev` na pasta server/ e recarregue.",
  },

  walletPage: {
    docTitle: "Carteira · ChainPlay",
    title: "Seus tickets",
    sub: "Cada aposta vira um ticket-NFT na sua wallet. Quem segura o ticket resgata o prêmio.",
    connect: "Conectar wallet",
    connecting: "Conectando…",
    disconnect: "Desconectar",
    noWallet: "Nenhuma wallet Solana encontrada. Instale Phantom, Backpack ou Solflare.",
    connectFirst: "Conecte sua wallet para ver seus tickets.",
    loading: "Buscando seus tickets on-chain…",
    empty: "Nenhum ticket ainda. Jogue um modo valendo SOL para ganhar o primeiro!",
    claim: "Resgatar prêmio",
    claiming: "Resgatando…",
    claimed: "✓ Resgatado",
    statusOpen: "em aberto",
    statusClaimable: "💰 pra resgatar",
    statusLost: "não foi dessa vez",
    statusClaimed: "resgatado",
    stake: "aposta",
    payout: "prêmio",
    estPayout: "prêmio estimado",
    outcomeLabel: (n: number) => `palpite #${n + 1}`,
    kindRun: "Run Hi-Lo",
    kindMarket: "Mercado",
    refresh: "↻ Atualizar",
    claimError: "Falha no resgate",
    onchainOff: "Servidor sem modo on-chain ativo no momento.",
  },

  infinite: {
    docTitle: "Infinite Hi-Lo · ChainPlay",
    title: "Infinite Hi-Lo · valendo SOL",
    sub: "Sem meta fixa: cada acerto sobe um degrau na escada de prêmio. Saque quando quiser — ou arrisque tudo até o topo.",
    ladderLabel: "Escada de prêmio",
    rung: (n: number, x: string) => `${n}✓ · ${x}×`,
    capNote: (n: number, x: string) =>
      `Topo da escada: ${n} acertos seguidos pagam ${x}× direto do mercado on-chain.`,
    start: "🎲 Começar run infinita",
    cashoutBtn: (sol: string) => `💰 CASH OUT ${sol}`,
    cashoutHint: "sacar encerra a run e garante o prêmio agora",
    nextRung: (sol: string) => `próximo degrau vale ${sol}`,
    multiplier: "multiplicador",
    cashedTitle: "💰 Saque garantido!",
    cashedSub: (sol: string) =>
      `Você sacou ${sol}. O lucro já saiu da casa pra sua wallet; o stake volta resgatando o ticket abaixo.`,
    claimStake: (sol: string) => `🎫 Resgatar o stake (${sol})`,
    wonTitle: "🏔️ TOPO DA ESCADA!",
    forfeitZero: "🏳️ Desistir (sem acertos ainda, sem saque)",
  },

  statsGame: {
    docTitle: "Guess the Stats · ChainPlay",
    title: "Guess the Stats",
    sub: "Crave os números finais da partida antes do lock. Quanto mais perto do placar real, mais pontos no ranking.",
    locksIn: "fecha em",
    fields: {
      goals: "Gols na partida",
      corners: "Escanteios",
      yellowCards: "Cartões amarelos",
      possession: "Posse do mandante (%)",
    },
    submit: "📊 Cravar palpite",
    submitting: "Enviando…",
    registered: "✅ Palpite registrado! O resultado sai em instantes.",
    already: "você já palpitou nessa partida",
    myGuesses: "Seus raios-X",
    guessCol: "palpite",
    actualCol: "real",
    ptsCol: "pts",
    totalScore: (n: number) => `${n}/100 pontos`,
    waiting: "aguardando o resultado…",
    empty: "Nenhuma partida aberta agora — novas entram sozinhas em instantes.",
    loading: "Buscando partidas…",
    connectFirst: "Conecte-se pra entrar no ranking (grátis).",
  },

  survivorGame: {
    docTitle: "Survivor · ChainPlay",
    title: "Survivor",
    sub: "Um pick por rodada, valendo SOL no mercado 1X2. Errou um — está fora da temporada. Até onde você sobrevive?",
    aliveBadge: "🛡️ vivo",
    deadBadge: "💀 eliminado",
    survivedRounds: (n: number) => `${n} rodada(s) sobrevivida(s)`,
    onlyRemain: (alive: number, total: number) =>
      `só restam ${alive} de ${total} jogadores vivos`,
    pickCta: "Fazer meu pick da rodada",
    pickNote:
      "O pick é uma aposta parimutuel real: assine o place_bet e o registro vale pra temporada.",
    picking: "Assinando pick…",
    picked: "✅ Pick da rodada registrado — sobreviva!",
    eliminated:
      "Você foi eliminado nesta temporada. Modo espectador: acompanhe o ranking abaixo.",
    myPicks: "Seus picks",
    resultPending: "em jogo",
    resultSurvived: "sobreviveu",
    resultEliminated: "eliminado",
    resultVoid: "anulado (devolvido)",
    empty: "Nenhum mercado aberto pra pick agora — volte perto do próximo jogo.",
    loading: "Buscando mercados…",
    connectFirst: "Conecte a wallet pra entrar na temporada.",
  },

  arcade: {
    penalty: {
      docTitle: "Penalty Predictor · ChainPlay",
      title: "Penalty Predictor",
      sub: "Pênalti assinalado! Você tem segundos pra cravar: gol ou defesa? Acertos seguidos multiplicam os pontos.",
      event: (home: string, away: string, min: number) =>
        `⚠️ Pênalti para ${home} aos ${min}′ contra ${away}!`,
      optA: "⚽ GOL",
      optB: "🧤 DEFESA",
      start: "🥅 Simular próximo pênalti",
    },
    live: {
      docTitle: "Live Challenge · ChainPlay",
      title: "Live Challenge",
      sub: "Desafios relâmpago da partida: gol, escanteio ou cartão nos próximos minutos? Responda antes do tempo acabar.",
      event: (home: string, away: string, min: number) =>
        `${home} × ${away} · ${min}′ em andamento`,
      optA: "✅ SIM",
      optB: "❌ NÃO",
      start: "⚡ Próximo desafio",
    },
    questions: {
      penalty: "O batedor converte?",
      nextGoal: "Sai gol nos próximos 10 minutos?",
      corner: "Tem escanteio nos próximos 5 minutos?",
      card: "Alguém leva cartão nos próximos 10 minutos?",
    },
    rewardChip: (n: number) => `+${n} pts`,
    hit: (n: number) => `ACERTOU! +${n} pontos`,
    miss: "Errou!",
    tooLate: "⌛ Tempo esgotado!",
    streakChip: (n: number) => `🔥 sequência ${n}`,
    next: "Próximo →",
    demoNote:
      "Modo demo: eventos simulados com probabilidades reais — o feed ao vivo da TxLINE entra nesta mesma tela.",
    connectFirst: "Conecte-se pra pontuar no ranking (grátis).",
    badgeHint: "Acerte um desafio e resgate a NFT de identidade do jogo — grátis.",
    badgeClaim: "Resgatar NFT do jogo",
    badgeClaiming: "Emitindo NFT…",
    badgeOwned: "NFT do jogo na sua carteira ✓",
  },

  quiz: {
    docTitle: "Guess the Team · ChainPlay",
    title: "Guess the Team",
    sub: "Só as estatísticas na mesa: 5 rodadas pra descobrir qual seleção jogou. Resposta certa só existe no servidor.",
    start: "🕵️ Começar quiz",
    roundLabel: (n: number, total: number) => `rodada ${n} de ${total}`,
    clues: {
      stage: "Fase",
      goalsFor: "Gols marcados",
      goalsAgainst: "Gols sofridos",
      corners: "Escanteios",
      yellowCards: "Cartões amarelos",
      possession: "Posse de bola",
    },
    whoPlayed: "Quem jogou assim?",
    hit: (n: number) => `ACERTOU! +${n} pontos`,
    missWas: (team: string) => `Era ${team}!`,
    vsWas: (opp: string) => `(contra ${opp})`,
    finalScore: (n: number) => `Pontuação final: ${n}`,
    playAgain: "↻ Jogar de novo",
    next: "Próxima rodada →",
    tooLate: "⌛ Tempo esgotado!",
    connectFirst: "Conecte-se pra pontuar no ranking (grátis).",
  },

  lb: {
    title: "🏆 Ranking",
    empty: "Ninguém pontuou ainda — seja o primeiro!",
    points: "pts",
    plays: "jogadas",
    you: "você",
  },

  howto: {
    title: "📖 Como jogar",
    profitLabel: "De onde vem o prêmio",
    staked: {
      steps: [
        "Escolha a meta de acertos seguidos (3 a 20) e quanto quer apostar — as odds sobem com a meta.",
        "Assine a aposta na sua wallet: ela vira um ticket-NFT e o SOL entra no vault do mercado on-chain.",
        "Palpite se a próxima partida tem MAIS ou MENOS que a atual (gols, escanteios, cartões, posse). Empate não quebra a sequência.",
        "Bateu a meta? O mercado liquida on-chain e você resgata o prêmio com o ticket.",
      ],
      profit:
        "A casa fundeia o prêmio antes de você apostar (odds fixas, ex.: meta 10 paga 6×). Perdeu ou desistiu, o stake fica com a casa — é a margem embutida nas odds.",
    },
    infinite: {
      steps: [
        "Escolha só o stake — sem meta: cada acerto sobe um degrau na escada (1,2× até 28×).",
        "Assine a aposta (ticket-NFT no mercado on-chain, igual ao Hi-Lo apostado).",
        "A cada acerto decida: CASH OUT garante o valor do degrau atual, ou siga pro próximo e arrisque tudo.",
        "Errou sem sacar = perdeu o stake. Chegou ao 12º degrau = 28× direto do mercado.",
      ],
      profit:
        "Sacando no meio, o mercado é anulado (o ticket devolve seu stake) e a casa paga o lucro do degrau na hora. As odds pagam menos que o justo estatístico — essa é a margem da casa.",
    },
    markets: {
      steps: [
        "Escolha um jogo futuro da Copa e o stake.",
        "Aposte em casa, empate ou fora — a aposta vira ticket-NFT e o SOL entra no pote comunitário.",
        "As % mostram onde a comunidade está apostando (as odds emergem do pote).",
        "Após o jogo, quem acertou divide o pote proporcional ao stake — resgate na Carteira.",
      ],
      profit:
        "Modelo parimutuel: o prêmio sai do pote dos perdedores. A plataforma fica com a taxa de 10% de cada aposta.",
    },
    stats: {
      steps: [
        "Antes do lock, crave os números finais: gols, escanteios, cartões e posse.",
        "Pontos por proximidade (máx 100) alimentam o ranking — de graça.",
        "Quer valer SOL? Aposte na faixa de gols totais (0–1 / 2–3 / 4+) do mercado parimutuel da partida.",
        "No reveal, veja o raio-X palpite × real; acertou a faixa, divida o pote e resgate na Carteira.",
      ],
      profit:
        "A camada de pontos é grátis. Na aposta em faixas, o prêmio sai do pote de quem errou; a plataforma fica com a taxa de 10%.",
    },
    survivor: {
      steps: [
        "Uma rodada = um pick: escolha UM jogo e crave casa, empate ou fora.",
        "O pick é uma aposta real no mercado 1X2 (assine o place_bet — ticket-NFT na carteira).",
        "Acertou, sobrevive e avança; jogo anulado devolve o stake e não conta.",
        "Errou UM pick — eliminado da temporada. Quem sobreviver mais rodadas lidera o ranking.",
      ],
      profit:
        "Cada pick certo também paga como aposta 1X2 normal (divide o pote). A plataforma fica com a taxa de 10% de cada pick.",
    },
    penalty: {
      steps: [
        "Modo grátis: pênalti simulado, 8 segundos pra cravar GOL ou DEFESA — defesa é rara e vale mais pontos; acertos seguidos multiplicam.",
        "Valendo SOL: escolha a meta (6, 7 ou 8 acertos em 8 pênaltis) e o stake, e assine a aposta.",
        "Responda os 8 pênaltis dentro do timer — estourou o tempo, conta como erro.",
        "Bateu a meta? O mercado liquida on-chain e você resgata o prêmio com o ticket.",
      ],
      profit:
        "A casa fundeia o prêmio antes (6/8 paga 1,3× · 7/8 paga 2,2× · 8/8 paga 7×) e lucra a margem sobre o justo estatístico + o stake das sessões perdidas.",
    },
    live: {
      steps: [
        "Peça o próximo desafio: gol, escanteio ou cartão nos próximos minutos da partida.",
        "Responda SIM ou NÃO antes do timer estourar — estourou, conta como erro e a sequência zera.",
        "Acertos seguidos multiplicam os pontos no ranking.",
        "Acertou ao menos um desafio? Resgate a NFT de identidade do jogo — grátis, emitida pelo servidor.",
      ],
      profit:
        "Modo 100% grátis: sem aposta, sem stake. A NFT do jogo é um colecionável de identidade — não dá direito a prêmio.",
    },
    quiz: {
      steps: [
        "São 5 rodadas: em cada uma, o raio-X estatístico de uma seleção numa partida real da Copa.",
        "Você tem 25 segundos e 4 opções — descubra quem jogou assim.",
        "Acerto vale 20 pontos + bônus de sequência; a resposta certa só existe no servidor.",
        "Feche as 5 rodadas e dispute o ranking do jogo.",
      ],
      profit:
        "Modo 100% grátis: sem aposta, sem stake — só pontos e ranking. A versão valendo SOL vem depois, sobre o motor de runs.",
    },
  },

  statsBet: {
    title: "💰 Valendo SOL: faixa de gols totais",
    buckets: ["0–1 gols", "2–3 gols", "4+ gols"],
    betOk: "✅ Aposta na faixa feita! Ticket-NFT na sua carteira.",
    connectFirst: "Conecte a wallet pra apostar nas faixas.",
  },

  penaltySession: {
    freeTab: "🎮 Grátis (ranking)",
    stakedTab: "💰 Valendo SOL",
    chooseTarget: "Meta de acertos nos 8 pênaltis",
    targetLabel: (n: number) => `${n} de 8`,
    start: "🥅 Criar sessão apostada",
    creating: "Criando mercado on-chain…",
    progress: (shots: number, total: number, hits: number) =>
      `pênalti ${Math.min(shots + 1, total)} de ${total} · ${hits} acerto(s)`,
    needed: (n: number) => `faltam ${n} pra meta`,
    wonTitle: "🏆 Meta batida!",
    lostTitle: "💀 Meta perdida!",
    lostSub: "O stake fica com a casa. Bora de novo?",
    resume: "Sessão em andamento retomada.",
  },

  liveSession: {
    freeTab: "🎮 Grátis (ranking)",
    stakedTab: "💰 Valendo SOL",
    chooseTarget: "Meta de acertos nos 8 desafios",
    targetLabel: (n: number) => `${n} de 8`,
    start: "⚡ Criar sessão apostada",
    creating: "Criando mercado on-chain…",
    progress: (hits: number, total: number, target: number, rounds: number) =>
      `desafio ${Math.min(rounds + 1, total)} de ${total} · ${hits} acerto(s) · faltam ${Math.max(0, target - hits)}`,
    wonTitle: "🏆 Meta batida!",
    lostTitle: "💀 Meta perdida!",
    nftNote: "cada sessão emite a NFT de identidade do Live Challenge na sua carteira.",
    question: "Vai acontecer nos próximos minutos?",
  },

  teamSession: {
    freeTab: "🎮 Grátis (ranking)",
    stakedTab: "💰 Valendo SOL",
    chooseTarget: "Meta de acertos nas 5 rodadas",
    targetLabel: (n: number) => `${n} de 5`,
    start: "🕵️ Criar sessão apostada",
    creating: "Criando mercado on-chain…",
    progress: (hits: number, total: number, target: number, rounds: number) =>
      `rodada ${Math.min(rounds + 1, total)} de ${total} · ${hits} acerto(s) · faltam ${Math.max(0, target - hits)}`,
    wonTitle: "🏆 Meta batida!",
    lostTitle: "💀 Meta perdida!",
    nftNote: "cada sessão emite a NFT de identidade do Guess the Team na sua carteira.",
    whoPlayed: "Quem jogou assim?",
    wasTeam: (team: string, opp: string) => `Era ${team} (contra ${opp})!`,
  },
};

export type Dict = typeof pt;

/* ---------- dicionário EN ---------- */

const en: Dict = {
  docTitle: "Hi-Lo · World Cup 2026",
  nav: {
    how: "How it works",
    minigames: "Minigames",
    signup: "Signup",
    tech: "Technology",
    vision: "Vision",
    faq: "FAQ",
    play: "Play Now",
    home: "Home",
    howToPlay: "How to play",
    ranking: "Leaderboard",
    history: "History",
    games: "Games",
    wallet: "Wallet",
    soon: "soon",
    menuAria: "Open navigation menu",
    backToGames: "Back to games",
  },

  ticker: [
    { match: "Brazil 2×1 Argentina", stat: "🚩 11 corners", kind: "corner" },
    { match: "France 0×0 Japan", stat: "🟨 3 yellows", kind: "card" },
    { match: "USA 3×2 Mexico", stat: "⚽ 5 goals", kind: "goal" },
    { match: "Spain 1×1 Germany", stat: "🕐 54% possession", kind: "poss" },
    { match: "Morocco 2×0 Croatia", stat: "🚩 7 corners", kind: "corner" },
    { match: "England 4×1 Ghana", stat: "⚽ 5 goals", kind: "goal" },
    { match: "Portugal 2×2 Uruguay", stat: "🟨 6 yellows", kind: "card" },
    { match: "Senegal 1×0 Poland", stat: "🕐 48% possession", kind: "poss" },
  ],

  hero: {
    badge: "World Cup 2026 · live TxLINE data · Solana",
    heroLine1: "The game starts on",
    heroLine2: "the field.",
    heroLine3: "the battle",
    heroLine4: "continues here.",
    heroSub:
      "Minigames, predictions and challenges connected to real World Cup matches and stats.",
    heroCtaStart: "Start Playing",
    heroCtaExplore: "Explore Minigames",
    titlePre: "Will the next match go",
    titleHigher: "HIGHER",
    titleOr: "or",
    titleLower: "lower",
    titlePost: "?",
    lead:
      "The guessing game built on real World Cup 2026 stats, verifiable on-chain. One question per round, 104 matches, one streak to defend.",
    ctaPlay: "⚽ Play now — it's free",
    ctaHow: "How it works ↓",
    statGames: "World Cup matches",
    statCats: "stat categories",
    statPerRound: "per round",
    statSignups: "sign-ups required",
    statFree: "actually free",
    statChain: "Solana verification",
  },

  showcase: {
    title: "Every match. A new way to win.",
    sub: "Stop watching. Start competing. ChainPlay turns real matches and stats into your next challenge.",
    games: [
      {
        title: "Infinite Hi-Lo",
        tagline: "Solo · Endless streak",
        description:
          "An evolution of classic Hi-Lo that automatically rotates between different stats — goals, corners, possession, cards, shots and fouls. It keeps rounds from feeling repetitive and ramps up the difficulty as your streak grows. Keep as many correct calls in a row as you can to climb the global leaderboard.",
      },
      {
        title: "1X2 Markets",
        tagline: "Multiplayer · On-chain pool",
        description:
          "ChainPlay's on-chain multiplayer game where you bet on the outcome of real 2026 World Cup matches. Unlike fixed-odds betting, every stake goes into a single shared pool, split proportionally among everyone who calls the result right. The live percentages show how the community is spreading its bets in real time.",
      },
      {
        title: "Penalty Predictor",
        tagline: "Live · Penalty moments",
        description:
          "Whenever a penalty is taken during the World Cup, you get a few seconds to predict whether it's scored or saved. Once the play ends, the API confirms the result and points are paid out automatically. Streaks raise your score multipliers and unlock special rewards, turning the match's decisive moments into fast, thrilling challenges.",
      },
    ],
  },

  advantages: {
    title: "Built for players, not the house.",
    items: [
      {
        n: "1",
        title: "Fair by Design",
        text: "Rules, fees, and rewards are clear before you join.",
      },
      {
        n: "2",
        title: "Custom Game Modes",
        text: "Create pools, leagues, and formats with your own rules.",
      },
      {
        n: "3",
        title: "No House Edge",
        text: "Play against your group, not against the platform.",
      },
      {
        n: "4",
        title: "Social by Nature",
        text: "Invite friends, challenge rivals, and follow the action together.",
      },
    ],
  },

  getStarted: {
    title: "Get started in 3 steps",
    soon: "coming soon",
    steps: [
      { label: "1. Connect your wallet" },
      { label: "2. Make your pick" },
      { label: "3. Claim your rewards" },
    ],
  },

  arena: {
    kicker: "// live arena",
    h2pre: "The game at the center of",
    h2accent: "everything",
    lead:
      "An example round playing in the middle, real data on the sides. This is what the digital stands look like.",
    leftTitle: "📊 Latest results",
    catNow: "Featured category",
    catNowValue: "🚩 Corners",
    avgTime: "Average time per round",
    avgTimeValue: "< 5s",
    totalMatches: "Matches in the campaign",
    rightTitle: "🏆 Leaderboard",
    preview: "preview",
    rankRows: [
      { name: "rafa.sol", streak: 12 },
      { name: "copa_fan26", streak: 9 },
      { name: "hilo_pro", streak: 7 },
    ],
    yourStreak: "🔥 Your record",
    yourStreakUnit: "correct in a row",
    online: "Players online",
    liveFeed: "🟢 Now in the arena",
    feedItems: [
      "got 3 in a row on Goals",
      "beat their personal record: 11",
      "started a fresh run",
      "nailed LOWER on Corners",
    ],
  },

  teaser: {
    title: "Warm-up — play now",
    lastMatch: "Last match",
    nextMatch: "Next match",
    higher: "⬆ HIGHER",
    lower: "⬇ LOWER",
    feedbackIdle: "Tap HIGHER or LOWER to guess",
    feedbackOk: "✓ Correct! Next round…",
    feedbackBad: "✗ Wrong! In the real game, the run would end here.",
    doneStreak: (n: number) => `Streak of ${n} in the warm-up!`,
    doneZero: "The warm-up ended quickly…",
    doneNote:
      "That was just a taste. The real game has 104 matches with real data.",
    doneCta: "Play the full version →",
    rounds: [
      {
        prev: { teams: "Brazil vs Argentina", value: 11 },
        next: { teams: "France vs Japan", value: 8 },
        cat: "🚩 Corners",
      },
      {
        prev: { teams: "France vs Japan", value: 2 },
        next: { teams: "USA vs Mexico", value: 5 },
        cat: "⚽ Goals",
      },
      {
        prev: { teams: "USA vs Mexico", value: 4 },
        next: { teams: "Spain vs Germany", value: 6 },
        cat: "🟨 Yellow cards",
      },
    ],
  },

  demo: {
    title: "Example round — watch",
    lastMatch: "Last match",
    nextMatch: "Next match",
    higher: "⬆ HIGHER",
    lower: "⬇ LOWER",
    pickHigher: "HIGHER ⬆",
    pickLower: "LOWER ⬇",
    rounds: [
      {
        cat: "🚩 Corners",
        unit: "corners",
        prevTeams: "Brazil vs Argentina",
        prev: 11,
        nextTeams: "France vs Japan",
        next: 8,
        pick: "lower" as const,
      },
      {
        cat: "⚽ Goals",
        unit: "goals",
        prevTeams: "France vs Japan",
        prev: 2,
        nextTeams: "USA vs Mexico",
        next: 5,
        pick: "higher" as const,
      },
      {
        cat: "🟨 Yellow cards",
        unit: "cards",
        prevTeams: "USA vs Mexico",
        prev: 6,
        nextTeams: "Spain vs Germany",
        next: 3,
        pick: "lower" as const,
      },
    ],
    captionLook: (prev, unit) => (
      <>
        <b>Step 1</b> — check the last match: <b>{prev} {unit}</b>
      </>
    ),
    captionPress: (pick) => (
      <>
        <b>Step 2</b> — guess: the next one goes <b>{pick}</b>
      </>
    ),
    captionReveal: (next, unit, streak) => (
      <>
        <b>Step 3</b> — it was <b>{next} {unit}</b>: correct! 🔥 rises to{" "}
        <b>{streak}</b>
      </>
    ),
    captionDone: (streak) => (
      <>
        🔥 Streak of <b>{streak}</b>! In the real game you keep going until you
        miss.
      </>
    ),
  },

  how: {
    kicker: "// gameplay",
    h2pre: "How it works",
    h2accent: "in 3 steps",
    lead:
      "Designed for the everyday fan: if you understand “higher or lower”, you already know how to play.",
    steps: [
      {
        n: "01",
        icon: "📊",
        title: "Check the last match",
        text: "We show a real stat from the previous World Cup match: goals, corners, cards or possession — straight from the TxLINE feed.",
      },
      {
        n: "02",
        icon: "🎯",
        title: "Guess: higher or lower?",
        text: "Will the next match have a HIGHER ⬆ or LOWER ⬇ number? One question, one tap, zero friction.",
      },
      {
        n: "03",
        icon: "🔥",
        title: "Build your streak",
        text: "Every correct guess grows the streak. Miss one and it's over — share your score in one tap and challenge your friends.",
      },
    ],
  },

  why: {
    kicker: "// why",
    h2pre: "Why",
    h2accent: "Hi-Lo",
    h2post: "?",
    lead:
      "Data that only big operators used to have, turned into a game any fan can open at half-time.",
    features: [
      {
        icon: "⛓️",
        title: "Verifiable on-chain data",
        text: "Stats via TxLINE (TxODDS) with cryptographic anchoring on Solana. Anyone can audit — no made-up numbers.",
      },
      {
        icon: "🏆",
        title: "All 104 World Cup 2026 matches",
        text: "From group stage to the final: the whole campaign becomes the board. Every real round brings new content — the game grows with the tournament.",
      },
      {
        icon: "🔁",
        title: "Endlessly replayable",
        text: "Categories are drawn every run with a deterministic seed. Your record is saved — there's always a longer streak to chase.",
      },
      {
        icon: "📱",
        title: "Built for the stands",
        text: "Zero sign-up, zero install, zero jargon. Opens in your phone browser and runs in seconds — during half-time.",
      },
      {
        icon: "⚡",
        title: "Actually real-time",
        text: "The TxLINE feed updates stats as the ball rolls. Today's board isn't the same as yesterday's.",
      },
      {
        icon: "🤝",
        title: "Viral by nature",
        text: "The shareable score turns every defeat into an invitation: “I got 7 in a row, bet you can't beat it”.",
      },
    ],
  },

  tech: {
    kicker: "// architecture",
    h2pre: "From the pitch to your screen,",
    h2accent: "with on-chain proof",
    lead:
      "Every stat travels an auditable pipeline: TxLINE feed, on-chain authentication on Solana and real-time delivery.",
    pipeline: [
      {
        n: "1",
        title: "TxLINE Feed",
        sub: "TxODDS · normalized schema",
        text: "Live stats for all 104 matches: goals, corners, cards and possession, in a single JSON for every competition.",
      },
      {
        n: "2",
        title: "Solana Devnet",
        sub: "txoracle program",
        text: "Free-tier signup via an on-chain subscribe transaction — data access is cryptographically proven.",
      },
      {
        n: "3",
        title: "Node Backend",
        sub: "normalization + cache",
        text: "Decodes the encoding (period·1000 + stat_key), builds the rounds and serves the game with a resilient fallback.",
      },
      {
        n: "4",
        title: "You play",
        sub: "React · zero friction",
        text: "Instant interface in the browser. Guess, animated reveal, streak and share — all in under 5 seconds per round.",
      },
    ],
  },

  roadmap: {
    kicker: "// product vision",
    h2pre: "It starts at the World Cup.",
    h2accent: "It doesn't end there.",
    lead:
      "Hi-Lo is the entry point of a casual-games model built on verifiable sports data.",
    items: [
      {
        tag: "Now",
        title: "Free to play",
        text: "Viral acquisition through the shareable score during World Cup 2026 — the biggest audience event on the planet.",
        live: true,
      },
      {
        tag: "Phase 2",
        title: "Private leagues",
        text: "Prediction pools with friends and a live leaderboard. Freemium model: basic league free, customization paid.",
        live: false,
      },
      {
        tag: "Phase 3",
        title: "On-chain streaks",
        text: "Records minted as collectibles on Solana and sponsored tournaments with stablecoin prizes.",
        live: false,
      },
      {
        tag: "Always",
        title: "Beyond the Cup",
        text: "TxLINE's single schema lets the same game scale to national leagues, the Champions League and any sport on the feed.",
        live: false,
      },
    ],
  },

  nots: {
    kicker: "// no tricks",
    h2pre: "What Hi-Lo is",
    h2accent: "not",
    h2post: "",
    lead: "A free entertainment game built on real data. Nothing more than that.",
    items: [
      "Real-money betting",
      "Sign-up or e-mail",
      "Mandatory crypto wallet",
      "Pay-to-win",
      "App install",
      "Fine print",
    ],
  },

  faq: {
    kicker: "// quick answers",
    h2pre: "Frequently asked",
    h2accent: "questions",
    lead: "The essentials before your first guess.",
    items: [
      {
        q: "Do I need to deposit to start making predictions?",
        a: "Yes. To place your predictions and earn real rewards, you must connect your crypto wallet (Solana) and have a balance available on the platform.",
      },
      {
        q: "Where do the data and market results come from?",
        a: "From the TxLINE (TxODDS) feed. All market resolutions are settled via on-chain transactions on the Solana blockchain, ensuring 100% public, auditable, and tamper-proof results.",
      },
      {
        q: "What happens if my prediction is incorrect?",
        a: "If your prediction is wrong, the funds allocated to that position are lost. However, you can open new positions and join other active markets instantly.",
      },
    ],
  },

  cta: {
    badge: "The World Cup is on",
    h2: "Ready to test your football instincts?",
    lead: "No sign-up, no install. One click and the ball rolls.",
    btn: "Start playing →",
  },

  footer: {
    slogan1: "The game starts on the field.",
    slogan2: "The battle continues here.",
    resources: "Resources",
    products: "Products",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    responsible: "Responsible Gaming",
    disclosures: "Disclosures",
    brand: "Brand",
    minigames: "Minigames",
    howItWorks: "How It Works",
    discord: "Discord",
    x: "X",
  },

  game: {
    loading: "Loading matches…",
    errorTitle: "Couldn't load the matches.",
    retry: "Try again",
    back: "← home",
    tagline: "World Cup 2026 · will the next match go HIGHER or lower?",
    sourceTx: (network: string) => `TxLINE data · ${network}`,
    sourceMock: "simulated data (TxLINE offline)",
    round: "Round",
    streak: "Streak",
    best: "Record",
    helpTitle: "💡 How to play",
    helpClose: "✕ close",
    helpCloseAria: "Close help",
    helpSteps: [
      "Check the last match",
      "Guess HIGHER or LOWER",
      "Watch the reveal",
      "Grow your streak",
    ],
    helpCta: "Got it, let's play! ⚽",
    questionTitle: (label: string): ReactNode => (
      <>
        {label}: going <span className="accent">HIGHER</span> or{" "}
        <span className="muted-strike">lower</span>?
      </>
    ),
    pendingPick: "🎯 Pick pending",
    progressOf: (pct) => `${pct}% of the campaign`,
    newRecord: "🏆 New record!",
    categoryQuestion: (value, unit) => (
      <>
        Will the next match have more or less than{" "}
        <b className="mono">{value}</b> {unit}?
      </>
    ),
    lastMatch: "Last match",
    nextMatch: "Next match",
    higher: "⬆ HIGHER",
    lower: "⬇ LOWER",
    moreThan: (v: number) => `more than ${v}`,
    lessThan: (v: number) => `less than ${v}`,
    nextRound: "Next round →",
    seeResult: "See result",
    wonTitle: "🏆 You cleared all 104 matches!",
    lostTitle: "💀 Game over!",
    summary: (streak, score, rounds) => (
      <>
        Final streak: <strong>{streak}</strong> · Correct:{" "}
        <strong>{score}</strong> of <strong>{rounds}</strong> rounds
      </>
    ),
    shareBtn: "📣 Share score",
    copied: "✓ Copied!",
    playAgain: "↻ Play again",
    shareText: (streak, best, played, total) =>
      `⚽ Hi-Lo · World Cup 2026\n` +
      `🔥 Streak: ${streak} | 🏆 Record: ${best}\n` +
      `I survived ${played} of ${total} rounds. Can you do better?`,
    scoreline: (h, a) => `score: ${h} × ${a}`,
    hiddenHint: "what will the number be?",
    successWords: [
      "⚽ GOAL!",
      "Correct!",
      "Nice!",
      "Great!",
      "Perfect!",
      "Awesome!",
      "Incredible!",
    ],
    streakMilestone: (n: number) =>
      n >= 15 ? `⚡ UNSTOPPABLE! ${n}-streak!` : `🔥 ${n}-streak!`,
    resultPush: "🤝 It's a tie!",
    resultPushNote: "Ties don't score, but the streak continues.",
    resultOk: "✅ Correct!",
    resultOkNote: (wentHigher) =>
      `It went ${wentHigher ? "higher" : "lower"}, just as you guessed.`,
    resultBad: "❌ Wrong!",
    resultBadNote: (guessHigher, next, unit) =>
      `You guessed ${guessHigher ? "higher" : "lower"}, but it was ${next} ${unit}.`,
    gameFooter: (
      <>
        Match data via{" "}
        <a href="https://txline.txodds.com" target="_blank" rel="noreferrer">
          TxLINE
        </a>{" "}
        (TxODDS) anchored on Solana
      </>
    ),
    categoryLabels: {
      goals: "Goals in the match",
      corners: "Corners in the match",
      yellowCards: "Yellow cards",
      possession: "Home team possession (%)",
    },
    categoryUnits: {
      goals: "goals",
      corners: "corners",
      yellowCards: "yellow cards",
      possession: "% possession",
    },
  },

  hub: {
    docTitle: "Games · ChainPlay",
    title: "Pick your game",
    sub: "Predictions on real World Cup 2026 data — play for free or stake SOL on devnet.",
    play: "Play →",
    playStaked: "💰 Stake SOL",
    building: "under construction",
    soonTag: "Soon",
    comingSoon: "🔒 Coming soon",
    phaseLabel: (n: number) => `phase ${n}`,
    carouselTitle: "Pick a Minigame",
    carouselSub: "Real-time predictions",
    mascotQuote: "Pick a minigame and test your luck. Let's go?",
    prevAria: "previous games",
    nextAria: "next games",
    liveTicker: "LIVE",
    games: {
      hilo: {
        name: "Hi-Lo",
        desc: "Will the next match be HIGHER or lower? Defend your streak across all 104 World Cup games.",
      },
      markets1x2: {
        name: "1X2 Markets",
        desc: "Home, draw or away? Bet into the community pot — winners split it all, proportional to stake.",
      },
      infiniteHilo: {
        name: "Infinite Hi-Lo",
        desc: "Rotating categories, a growing multiplier and the golden question: ride on or cash out?",
      },
      guessStats: {
        name: "Guess the Stats",
        desc: "Predict the final numbers before kickoff. The closer you get, the more you score.",
      },
      survivor: {
        name: "Survivor",
        desc: "One pick per round. One mistake and you're out. How many survive until the final?",
      },
      penalty: {
        name: "Penalty Predictor",
        desc: "Penalty in the World Cup: you have seconds to call it. Goal or save?",
      },
      liveChallenge: {
        name: "Live Challenge",
        desc: "Flash challenges during the match: next goal, next corner, a card in the next minutes.",
      },
      guessTeam: {
        name: "Guess the Team",
        desc: "Only the stats on the table. Can you tell which team played?",
      },
    },
  },

  auth: {
    title: "Sign in to play for SOL",
    withWallet: "🔗 Connect wallet",
    asGuest: "Continue as guest (devnet)",
    logout: "logout",
    working: "Signing in…",
    googleSetupHint:
      "Google login: set GOOGLE_CLIENT_ID in server/.env and VITE_GOOGLE_CLIENT_ID in client/.env (Google Cloud OAuth Client ID, origin http://localhost:5173).",
    noWalletHint:
      "No wallet extension? Use Google or guest mode — we create a devnet custodial account for you.",
    apiOfflineHint:
      "API is down — social/guest login unavailable. Connect your wallet (web3 connect): bets go straight on-chain. To restore everything, start the server: cd server && npm run dev.",
    custodialBadge: (name: string) => `custodial account · ${name}`,
    custodialBalance: (sol: string) => `balance: ${sol}`,
    custodialFund: (addr: string) =>
      `To top up, send devnet SOL to ${addr} (faucet.solana.com).`,
  },

  staked: {
    docTitle: "Staked Hi-Lo · ChainPlay",
    title: "Hi-Lo · staked in SOL",
    sub: "Pick your streak target, stake on devnet and the house pays if you hit it. The sequence is generated server-side — nobody sees the next number.",
    chooseTarget: "Streak target",
    oddsX: (x: string) => `pays ${x}×`,
    stakeLabel: "Your stake",
    potential: "Payout if you hit the target",
    start: "🎲 Create staked run",
    creating: "Creating on-chain market…",
    connectFirst: "Connect your wallet to play for SOL.",
    connect: "Connect wallet",
    connecting: "Connecting…",
    betTitle: "Run created! Now sign your bet",
    betNote: (min: number) =>
      `You have ${min} min to sign before the market locks. The 10% fee goes to the platform; the rest funds the market vault.`,
    signBet: (sol: string) => `✍️ Bet ${sol}`,
    signing: "Waiting for signature…",
    confirming: "Confirming on-chain…",
    betExpired: "The betting window expired. Create another run.",
    progressLabel: (n: number, target: number) => `hits ${n} of ${target}`,
    cashout: "🏳️ Forfeit run",
    wonTitle: "🏆 Target hit!",
    wonSub: (sol: string) => `The house owes you ${sol}. Waiting for on-chain settlement…`,
    settling: "settling the market on-chain…",
    claimBtn: (sol: string) => `💰 Claim ${sol}`,
    claiming: "Claiming…",
    claimedMsg: "Prize in your wallet! 🎉",
    lostTitle: "💀 Run over!",
    lostSub: "The stake stays with the house. Run it back?",
    expiredTitle: "⌛ Run expired",
    playAgain: "↻ New run",
    seeWallet: "See my tickets →",
    error: "Something went wrong",
    devnetNote: "Devnet SOL — no real value. Grab some at faucet.solana.com.",
    bettingAs: (name: string) => `Betting as ${name}`,
    balanceLabel: "balance",
    insufficient: (stake: string) =>
      `Not enough balance to stake ${stake} — grab devnet SOL at faucet.solana.com.`,
  },

  markets: {
    docTitle: "1X2 Markets · ChainPlay",
    title: "World Cup markets",
    sub: "Bet on the result (home · draw · away). The pot is split among winners, proportional to stake — odds emerge from the crowd.",
    locksIn: "locks in",
    closed: "betting closed",
    resolvedTag: "resolved",
    voidedTag: "voided (refund)",
    demoTag: "demo",
    draw: "Draw",
    inPool: "in the pot",
    stakeLabel: "Stake",
    betBtn: "Bet",
    betting: "Signing…",
    betOk: "✅ Bet placed! The ticket-NFT is in your wallet.",
    empty: "No open markets right now — the server creates new ones automatically.",
    loading: "Fetching on-chain markets…",
    connectFirst: "Connect your wallet to bet.",
    connect: "Connect wallet",
    refresh: "↻ Refresh",
    yourPick: "your pick",
    error: "Bet failed",
    serverOffline:
      "API server is down — run `npm run dev` inside server/ and reload.",
  },

  walletPage: {
    docTitle: "Wallet · ChainPlay",
    title: "Your tickets",
    sub: "Every bet becomes a ticket-NFT in your wallet. Whoever holds the ticket claims the prize.",
    connect: "Connect wallet",
    connecting: "Connecting…",
    disconnect: "Disconnect",
    noWallet: "No Solana wallet found. Install Phantom, Backpack or Solflare.",
    connectFirst: "Connect your wallet to see your tickets.",
    loading: "Fetching your tickets on-chain…",
    empty: "No tickets yet. Play a staked mode to earn your first one!",
    claim: "Claim prize",
    claiming: "Claiming…",
    claimed: "✓ Claimed",
    statusOpen: "open",
    statusClaimable: "💰 ready to claim",
    statusLost: "not this time",
    statusClaimed: "claimed",
    stake: "stake",
    payout: "payout",
    estPayout: "estimated payout",
    outcomeLabel: (n: number) => `pick #${n + 1}`,
    kindRun: "Hi-Lo Run",
    kindMarket: "Market",
    refresh: "↻ Refresh",
    claimError: "Claim failed",
    onchainOff: "Server is running without on-chain mode right now.",
  },

  infinite: {
    docTitle: "Infinite Hi-Lo · ChainPlay",
    title: "Infinite Hi-Lo · staked",
    sub: "No fixed target: every hit climbs a rung on the prize ladder. Cash out any time — or risk it all to the top.",
    ladderLabel: "Prize ladder",
    rung: (n: number, x: string) => `${n}✓ · ${x}×`,
    capNote: (n: number, x: string) =>
      `Top of the ladder: ${n} hits in a row pay ${x}× straight from the on-chain market.`,
    start: "🎲 Start infinite run",
    cashoutBtn: (sol: string) => `💰 CASH OUT ${sol}`,
    cashoutHint: "cashing out ends the run and locks your prize now",
    nextRung: (sol: string) => `next rung is worth ${sol}`,
    multiplier: "multiplier",
    cashedTitle: "💰 Cashed out!",
    cashedSub: (sol: string) =>
      `You secured ${sol}. The profit already left the house to your wallet; reclaim your stake with the ticket below.`,
    claimStake: (sol: string) => `🎫 Reclaim stake (${sol})`,
    wonTitle: "🏔️ TOP OF THE LADDER!",
    forfeitZero: "🏳️ Give up (no hits yet, nothing to cash out)",
  },

  statsGame: {
    docTitle: "Guess the Stats · ChainPlay",
    title: "Guess the Stats",
    sub: "Call the final numbers before lock. The closer to the real stats, the more ranking points.",
    locksIn: "locks in",
    fields: {
      goals: "Goals in the match",
      corners: "Corners",
      yellowCards: "Yellow cards",
      possession: "Home possession (%)",
    },
    submit: "📊 Lock my call",
    submitting: "Sending…",
    registered: "✅ Prediction in! Results reveal shortly.",
    already: "you already predicted this match",
    myGuesses: "Your match X-rays",
    guessCol: "your call",
    actualCol: "actual",
    ptsCol: "pts",
    totalScore: (n: number) => `${n}/100 points`,
    waiting: "waiting for the result…",
    empty: "No matches open right now — new ones roll in automatically.",
    loading: "Fetching matches…",
    connectFirst: "Sign in to join the leaderboard (free).",
  },

  survivorGame: {
    docTitle: "Survivor · ChainPlay",
    title: "Survivor",
    sub: "One pick per round, staked on the 1X2 market. One miss — you're out for the season. How long can you survive?",
    aliveBadge: "🛡️ alive",
    deadBadge: "💀 eliminated",
    survivedRounds: (n: number) => `${n} round(s) survived`,
    onlyRemain: (alive: number, total: number) =>
      `only ${alive} of ${total} players still alive`,
    pickCta: "Make my pick for this round",
    pickNote:
      "A pick is a real parimutuel bet: sign the place_bet and it counts for the season.",
    picking: "Signing pick…",
    picked: "✅ Round pick locked — survive!",
    eliminated:
      "You were eliminated this season. Spectator mode: follow the ranking below.",
    myPicks: "Your picks",
    resultPending: "in play",
    resultSurvived: "survived",
    resultEliminated: "eliminated",
    resultVoid: "voided (refunded)",
    empty: "No markets open for picks right now — come back near the next match.",
    loading: "Fetching markets…",
    connectFirst: "Connect your wallet to join the season.",
  },

  arcade: {
    penalty: {
      docTitle: "Penalty Predictor · ChainPlay",
      title: "Penalty Predictor",
      sub: "Penalty awarded! You have seconds to call it: goal or save? Consecutive hits multiply your points.",
      event: (home: string, away: string, min: number) =>
        `⚠️ Penalty for ${home} at ${min}′ against ${away}!`,
      optA: "⚽ GOAL",
      optB: "🧤 SAVE",
      start: "🥅 Simulate next penalty",
    },
    live: {
      docTitle: "Live Challenge · ChainPlay",
      title: "Live Challenge",
      sub: "Flash challenges from the match: goal, corner or card in the next minutes? Answer before time runs out.",
      event: (home: string, away: string, min: number) =>
        `${home} × ${away} · ${min}′ in play`,
      optA: "✅ YES",
      optB: "❌ NO",
      start: "⚡ Next challenge",
    },
    questions: {
      penalty: "Does the taker convert?",
      nextGoal: "A goal in the next 10 minutes?",
      corner: "A corner in the next 5 minutes?",
      card: "A card in the next 10 minutes?",
    },
    rewardChip: (n: number) => `+${n} pts`,
    hit: (n: number) => `NAILED IT! +${n} points`,
    miss: "Missed!",
    tooLate: "⌛ Time's up!",
    streakChip: (n: number) => `🔥 streak ${n}`,
    next: "Next →",
    demoNote:
      "Demo mode: simulated events with realistic probabilities — the TxLINE live feed plugs into this same screen.",
    connectFirst: "Sign in to score on the leaderboard (free).",
    badgeHint: "Hit a challenge and claim the game's identity NFT — free.",
    badgeClaim: "Claim game NFT",
    badgeClaiming: "Minting NFT…",
    badgeOwned: "Game NFT in your wallet ✓",
  },

  quiz: {
    docTitle: "Guess the Team · ChainPlay",
    title: "Guess the Team",
    sub: "Only the stats on the table: 5 rounds to figure out which national team played. The answer lives server-side only.",
    start: "🕵️ Start quiz",
    roundLabel: (n: number, total: number) => `round ${n} of ${total}`,
    clues: {
      stage: "Stage",
      goalsFor: "Goals scored",
      goalsAgainst: "Goals conceded",
      corners: "Corners",
      yellowCards: "Yellow cards",
      possession: "Possession",
    },
    whoPlayed: "Who played like this?",
    hit: (n: number) => `NAILED IT! +${n} points`,
    missWas: (team: string) => `It was ${team}!`,
    vsWas: (opp: string) => `(against ${opp})`,
    finalScore: (n: number) => `Final score: ${n}`,
    playAgain: "↻ Play again",
    next: "Next round →",
    tooLate: "⌛ Time's up!",
    connectFirst: "Sign in to score on the leaderboard (free).",
  },

  lb: {
    title: "🏆 Leaderboard",
    empty: "Nobody scored yet — be the first!",
    points: "pts",
    plays: "plays",
    you: "you",
  },

  howto: {
    title: "📖 How to play",
    profitLabel: "Where the prize comes from",
    staked: {
      steps: [
        "Pick a streak target (3 to 20) and your stake — odds grow with the target.",
        "Sign the bet in your wallet: it becomes a ticket-NFT and the SOL goes into the on-chain market vault.",
        "Guess if the next match has MORE or LESS than the current one (goals, corners, cards, possession). Ties don't break your streak.",
        "Hit the target? The market settles on-chain and you claim the prize with your ticket.",
      ],
      profit:
        "The house funds the prize before you bet (fixed odds, e.g. target 10 pays 6×). Lose or give up and the stake stays with the house — that's the margin built into the odds.",
    },
    infinite: {
      steps: [
        "Choose only the stake — no target: every hit climbs a rung on the ladder (1.2× up to 28×).",
        "Sign the bet (ticket-NFT on the on-chain market, same as staked Hi-Lo).",
        "After every hit decide: CASH OUT locks the current rung, or push to the next and risk it all.",
        "Miss before cashing out = stake lost. Reach rung 12 = 28× straight from the market.",
      ],
      profit:
        "Cashing out mid-ladder voids the market (the ticket refunds your stake) and the house pays the rung profit instantly. Odds pay below the statistical fair value — that's the house margin.",
    },
    markets: {
      steps: [
        "Pick an upcoming World Cup match and your stake.",
        "Bet home, draw or away — the bet becomes a ticket-NFT and the SOL joins the community pool.",
        "The % show where the community is betting (odds emerge from the pool).",
        "After the match, winners split the pool pro-rata — claim in your Wallet.",
      ],
      profit:
        "Parimutuel model: prizes come from the losers' pool. The platform keeps a 10% fee per bet.",
    },
    stats: {
      steps: [
        "Before lock, call the final numbers: goals, corners, cards and possession.",
        "Proximity points (max 100) feed the leaderboard — for free.",
        "Want SOL on it? Bet on the total-goals bucket (0–1 / 2–3 / 4+) of the match's parimutuel market.",
        "At reveal, check your call × actual X-ray; hit the bucket, split the pool and claim in your Wallet.",
      ],
      profit:
        "The points layer is free. On bucket bets the prize comes from the losing buckets; the platform keeps the 10% fee.",
    },
    survivor: {
      steps: [
        "One round = one pick: choose ONE match and call home, draw or away.",
        "The pick is a real bet on the 1X2 market (sign the place_bet — ticket-NFT in your wallet).",
        "Correct pick survives and advances; voided matches refund and don't count.",
        "Miss ONE pick — eliminated for the season. Most rounds survived leads the ranking.",
      ],
      profit:
        "Each correct pick also pays as a normal 1X2 bet (splits the pool). The platform keeps the 10% fee per pick.",
    },
    penalty: {
      steps: [
        "Free mode: simulated penalty, 8 seconds to call GOAL or SAVE — saves are rare and worth more; consecutive hits multiply.",
        "Staked: choose the target (6, 7 or 8 hits out of 8 penalties) and stake, and sign the bet.",
        "Answer all 8 penalties within the timer — running out counts as a miss.",
        "Hit the target? The market settles on-chain and you claim the prize with your ticket.",
      ],
      profit:
        "The house funds the prize upfront (6/8 pays 1.3× · 7/8 pays 2.2× · 8/8 pays 7×) and earns the margin over fair value plus the stake of lost sessions.",
    },
    live: {
      steps: [
        "Request the next challenge: goal, corner or card in the next minutes of the match.",
        "Answer YES or NO before the timer runs out — too late counts as a miss and resets the streak.",
        "Consecutive hits multiply your leaderboard points.",
        "Hit at least one challenge? Claim the game's identity NFT — free, minted by the server.",
      ],
      profit:
        "Fully free mode: no bet, no stake. The game NFT is an identity collectible — it grants no prize.",
    },
    quiz: {
      steps: [
        "5 rounds: each shows the statistical X-ray of a national team in a real World Cup match.",
        "You have 25 seconds and 4 options — figure out who played like that.",
        "A hit is worth 20 points + streak bonus; the right answer only exists on the server.",
        "Finish all 5 rounds and climb the game leaderboard.",
      ],
      profit:
        "Fully free mode: no bet, no stake — just points and ranking. The SOL-staked version comes later, on top of the runs engine.",
    },
  },

  statsBet: {
    title: "💰 Staked: total goals bucket",
    buckets: ["0–1 goals", "2–3 goals", "4+ goals"],
    betOk: "✅ Bucket bet placed! Ticket-NFT in your wallet.",
    connectFirst: "Connect your wallet to bet on buckets.",
  },

  penaltySession: {
    freeTab: "🎮 Free (ranking)",
    stakedTab: "💰 Staked",
    chooseTarget: "Hit target across the 8 penalties",
    targetLabel: (n: number) => `${n} of 8`,
    start: "🥅 Create staked session",
    creating: "Creating on-chain market…",
    progress: (shots: number, total: number, hits: number) =>
      `penalty ${Math.min(shots + 1, total)} of ${total} · ${hits} hit(s)`,
    needed: (n: number) => `${n} to go for the target`,
    wonTitle: "🏆 Target hit!",
    lostTitle: "💀 Target missed!",
    lostSub: "The stake stays with the house. Run it back?",
    resume: "Ongoing session resumed.",
  },

  liveSession: {
    freeTab: "🎮 Free (ranking)",
    stakedTab: "💰 Staked",
    chooseTarget: "Hit target across the 8 challenges",
    targetLabel: (n: number) => `${n} of 8`,
    start: "⚡ Create staked session",
    creating: "Creating on-chain market…",
    progress: (hits: number, total: number, target: number, rounds: number) =>
      `challenge ${Math.min(rounds + 1, total)} of ${total} · ${hits} hit(s) · ${Math.max(0, target - hits)} to go`,
    wonTitle: "🏆 Target hit!",
    lostTitle: "💀 Target missed!",
    nftNote: "each session mints the Live Challenge identity NFT to your wallet.",
    question: "Will it happen in the next minutes?",
  },

  teamSession: {
    freeTab: "🎮 Free (ranking)",
    stakedTab: "💰 Staked",
    chooseTarget: "Hit target across the 5 rounds",
    targetLabel: (n: number) => `${n} of 5`,
    start: "🕵️ Create staked session",
    creating: "Creating on-chain market…",
    progress: (hits: number, total: number, target: number, rounds: number) =>
      `round ${Math.min(rounds + 1, total)} of ${total} · ${hits} hit(s) · ${Math.max(0, target - hits)} to go`,
    wonTitle: "🏆 Target hit!",
    lostTitle: "💀 Target missed!",
    nftNote: "each session mints the Guess the Team identity NFT to your wallet.",
    whoPlayed: "Who played like this?",
    wasTeam: (team: string, opp: string) => `It was ${team} (vs ${opp})!`,
  },
};

const dictionaries: Record<Lang, Dict> = { pt, en };

/* ---------- contexto ---------- */

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const LangContext = createContext<LangContextValue>({
  lang: "pt",
  setLang: () => {},
  t: pt,
});

function initialLang(): Lang {
  // idioma fixado em inglês (seletor de idioma removido da UI)
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // mantém o documento coerente com o idioma escolhido (leitores de tela,
  // tradutores automáticos e título da aba)
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    document.title = dictionaries[lang].docTitle;
  }, [lang]);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("hilo-lang", l);
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: dictionaries[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle mono" role="group" aria-label="Idioma / Language">
      <button
        className={lang === "pt" ? "on" : ""}
        onClick={() => setLang("pt")}
        aria-pressed={lang === "pt"}
      >
        PT
      </button>
      <span className="lang-sep">/</span>
      <button
        className={lang === "en" ? "on" : ""}
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
    </div>
  );
}
