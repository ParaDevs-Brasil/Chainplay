const STEPS = [
  {
    n: "01",
    icon: "📊",
    title: "Veja a última partida",
    text: "Mostramos uma estatística real do jogo anterior da Copa: gols, escanteios, cartões ou posse de bola.",
  },
  {
    n: "02",
    icon: "🎯",
    title: "Palpite: maior ou menor?",
    text: "A próxima partida terá um número MAIOR ⬆ ou MENOR ⬇? Você tem um toque para decidir.",
  },
  {
    n: "03",
    icon: "🔥",
    title: "Monte sua sequência",
    text: "Cada acerto aumenta a sequência. Errou, acabou — compartilhe o placar e desafie os amigos.",
  },
];

const FEATURES = [
  {
    icon: "⛓️",
    title: "Dados verificáveis on-chain",
    text: "Estatísticas via TxLINE (TxODDS) com ancoragem criptográfica na Solana. Nada de números inventados.",
  },
  {
    icon: "🏆",
    title: "104 jogos da Copa 2026",
    text: "Da fase de grupos à final: a campanha inteira vira tabuleiro. Zere se for capaz.",
  },
  {
    icon: "🔁",
    title: "Rejogável ao infinito",
    text: "A cada rodada as categorias mudam. Seu recorde fica salvo — sempre há uma sequência maior para buscar.",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <nav className="topbar">
        <span className="logo">
          ⚽ Hi-Lo <span className="accent">Stats</span>
        </span>
        <a className="btn primary small" href="#/jogar">
          Jogar agora
        </a>
      </nav>

      <section className="hero">
        <span className="badge">Copa 2026 · dados TxLINE · Solana</span>
        <h1>
          A próxima partida vem{" "}
          <span className="accent">MAIOR</span> ou <span className="muted-strike">menor</span>?
        </h1>
        <p className="lead">
          O jogo de palpites com estatísticas reais da Copa do Mundo 2026.
          Uma pergunta por rodada, 104 jogos, uma sequência para defender.
        </p>
        <div className="hero-actions">
          <a className="btn primary big" href="#/jogar">
            ⚽ Jogar agora — é grátis
          </a>
          <a className="btn ghost big" href="#como-funciona">
            Como funciona ↓
          </a>
        </div>

        <div className="hero-preview" aria-hidden="true">
          <div className="preview-card">
            <span className="preview-label">Última partida</span>
            <span className="preview-teams">Brasil vs Argentina</span>
            <span className="preview-value mono">11</span>
            <span className="preview-cat">🚩 Escanteios</span>
          </div>
          <div className="preview-vs">
            <span className="pill hi">⬆ MAIOR</span>
            <span className="pill lo">⬇ MENOR</span>
          </div>
          <div className="preview-card dashed">
            <span className="preview-label">Próxima partida</span>
            <span className="preview-teams">França vs Japão</span>
            <span className="preview-value mono accent">?</span>
            <span className="preview-cat">🚩 Escanteios</span>
          </div>
        </div>

        <div className="stats-strip mono">
          <div>
            <strong>104</strong>
            <span>jogos da Copa</span>
          </div>
          <div>
            <strong>4</strong>
            <span>categorias de stats</span>
          </div>
          <div>
            <strong>60s</strong>
            <span>delay dos dados</span>
          </div>
          <div>
            <strong>∞</strong>
            <span>replays</span>
          </div>
        </div>
      </section>

      <section className="section" id="como-funciona">
        <h2>
          Como funciona <span className="accent">em 3 passos</span>
        </h2>
        <div className="grid-3">
          {STEPS.map((s) => (
            <article className="feature-card" key={s.n}>
              <span className="step-n mono">{s.n}</span>
              <span className="feature-icon">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>
          Por que o <span className="accent">Hi-Lo Stats</span>?
        </h2>
        <div className="grid-3">
          {FEATURES.map((f) => (
            <article className="feature-card" key={f.title}>
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-final">
        <h2>Pronto para testar seu faro de futebol?</h2>
        <p className="lead">Sem cadastro, sem instalação. Um clique e a bola rola.</p>
        <a className="btn primary big" href="#/jogar">
          Começar a jogar →
        </a>
      </section>

      <footer className="landing-footer">
        Dados de partidas via{" "}
        <a href="https://txline.txodds.com" target="_blank" rel="noreferrer">
          TxLINE
        </a>{" "}
        (TxODDS) com ancoragem na Solana · Hackathon Copa 2026
      </footer>
    </div>
  );
}
