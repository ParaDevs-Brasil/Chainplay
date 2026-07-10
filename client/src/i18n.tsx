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
    tech: "Tecnologia",
    vision: "Visão",
    faq: "FAQ",
    play: "Jogar agora",
    home: "Início",
    howToPlay: "Como jogar",
    ranking: "Ranking",
    history: "Histórico",
    soon: "em breve",
    menuAria: "Abrir menu de navegação",
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
        q: "Precisa pagar ou cadastrar alguma coisa?",
        a: "Não. O jogo é 100% gratuito, roda direto no navegador e não pede e-mail, carteira cripto nem instalação de app.",
      },
      {
        q: "De onde vêm as estatísticas?",
        a: "Do feed TxLINE (TxODDS), com acesso provado por transação on-chain na Solana. Qualquer pessoa pode auditar os dados — nada é inventado.",
      },
      {
        q: "O que acontece quando eu erro?",
        a: "A run acaba na hora. Você pode compartilhar o placar em um toque e recomeçar — as categorias são sorteadas de novo a cada partida, então nenhuma run é igual à outra.",
      },
      {
        q: "Isso é aposta?",
        a: "Não. É um jogo de entretenimento sem dinheiro real, sem odds e sem prêmios em dinheiro. Só você, os dados e a sua sequência.",
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
    blurb:
      "Jogo de palpites com estatísticas reais da Copa 2026, dados TxLINE e verificação na Solana.",
    product: "Produto",
    play: "Jogar",
    how: "Como funciona",
    vision: "Visão",
    faq: "FAQ",
    techCol: "Tecnologia",
    architecture: "Arquitetura",
    github: "Código no GitHub",
    note: "Hackathon TxODDS × Solana · Copa 2026 — jogo gratuito de entretenimento; não envolve apostas com dinheiro real.",
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
};

export type Dict = typeof pt;

/* ---------- dicionário EN ---------- */

const en: Dict = {
  docTitle: "Hi-Lo · World Cup 2026",
  nav: {
    how: "How it works",
    tech: "Technology",
    vision: "Vision",
    faq: "FAQ",
    play: "Play now",
    home: "Home",
    howToPlay: "How to play",
    ranking: "Leaderboard",
    history: "History",
    soon: "soon",
    menuAria: "Open navigation menu",
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
        q: "Do I have to pay or sign up for anything?",
        a: "No. The game is 100% free, runs right in the browser and asks for no e-mail, crypto wallet or app install.",
      },
      {
        q: "Where do the stats come from?",
        a: "From the TxLINE feed (TxODDS), with access proven by an on-chain transaction on Solana. Anyone can audit the data — nothing is made up.",
      },
      {
        q: "What happens when I miss?",
        a: "The run ends right there. You can share your score in one tap and start over — categories are drawn again every run, so no two runs are the same.",
      },
      {
        q: "Is this betting?",
        a: "No. It's an entertainment game with no real money, no odds and no cash prizes. Just you, the data and your streak.",
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
    blurb:
      "A guessing game built on real World Cup 2026 stats, TxLINE data and Solana verification.",
    product: "Product",
    play: "Play",
    how: "How it works",
    vision: "Vision",
    faq: "FAQ",
    techCol: "Technology",
    architecture: "Architecture",
    github: "Code on GitHub",
    note: "TxODDS × Solana Hackathon · World Cup 2026 — free entertainment game; no real-money betting involved.",
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
  const saved = localStorage.getItem("hilo-lang");
  if (saved === "pt" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
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
