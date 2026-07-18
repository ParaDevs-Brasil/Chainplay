import { useEffect, useRef } from "react";
import Navbar from "./Navbar";
import { useLang } from "./i18n";

interface GameEntry {
  id: keyof ReturnType<typeof useLang>["t"]["hub"]["games"];
  /** arte vertical do jogo (public/imgs) usada como capa do card no carrossel */
  art?: string;
  /** emoji de fallback quando não há arte dedicada */
  icon: string;
  href?: string;
  /** segundo modo jogável (ex.: valendo SOL) */
  hrefStaked?: string;
  /** marca o jogo como "em breve": card fica esmaecido, com tag e sem clique */
  soon?: boolean;
  /** fase do roadmap (docs/plano-minigames.md) — sem href = ainda não jogável */
  phase: number;
}

// Ordem do carrossel = ordem de entrega do plano: o jogável vem primeiro.
const GAMES: GameEntry[] = [
  { id: "infiniteHilo", icon: "♾️", art: "/imgs/4332d254-f3f2-451d-b5a3-5f1fb6df21a1.jpeg", href: "#/hilo-infinito", phase: 1 },
  { id: "markets1x2", icon: "🏟️", art: "/imgs/1x2.png", href: "#/mercados", phase: 2 },
  { id: "penalty", icon: "🥅", art: "/imgs/014b4183-2f88-408c-9b03-7495670a06e3.jpeg", href: "#/penalty", phase: 4 },
  { id: "hilo", icon: "🎯", art: "/imgs/hi-lo.png", href: "#/jogar", hrefStaked: "#/hilo-apostado", phase: 1, soon: true },
  { id: "survivor", icon: "🛡️", art: "/imgs/472effd8-6c3f-47b5-8515-f43fd2289a62.jpeg", href: "#/survivor", phase: 3, soon: true },
  { id: "guessStats", icon: "📊", art: "/imgs/5d0fa936-fb1d-4961-b284-4dd2c0353bf7.png", href: "#/stats", phase: 2, soon: true },
  { id: "liveChallenge", icon: "⚡", art: "/imgs/game-live.jpg", href: "#/live", phase: 5, soon: true },
  { id: "guessTeam", icon: "🕵️", art: "/imgs/1fa81539-5fe0-447d-8671-13aaa0d8c75c.jpeg", href: "#/team", phase: 5, soon: true },
];

export default function GamesHub() {
  const { t } = useLang();
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = t.hub.docTitle;
  }, [t]);

  function scroll(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    // rola ~85% da largura visível (aprox. 1–2 cards)
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <div className="game-page hub-page">
      <Navbar
        links={[
          { label: t.nav.home, href: "#/" },
          { label: t.nav.games, href: "#/jogos", active: true },
          { label: t.nav.wallet, href: "#/carteira" },
          { label: t.nav.ranking, soon: true },
        ]}
        cta={{ label: t.nav.wallet, href: "#/carteira" }}
      />

      <div className="shell hub-shell">
        {/* topo: vídeo em destaque, de ponta a ponta */}
        <section className="hub-hero">
          <div className="pred-panel">
            <span className="pred-badge mono">
              <i className="pred-dot" /> {t.hub.liveTicker}
            </span>
            <video
              className="pred-video"
              src="/videos/videodemo.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          </div>
        </section>

        {/* cabeçalho da seção + navegação do carrossel */}
        <header className="carousel-head">
          <div>
            <h2 className="carousel-title">{t.hub.carouselTitle}</h2>
            <p className="carousel-sub">{t.hub.carouselSub}</p>
          </div>
          <div className="carousel-nav">
            <button className="carousel-arrow" aria-label={t.hub.prevAria} onClick={() => scroll(-1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button className="carousel-arrow" aria-label={t.hub.nextAria} onClick={() => scroll(1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </header>

        {/* carrossel horizontal de cards */}
        <div className="carousel-track" ref={trackRef}>
          {GAMES.map((g) => {
            const info = t.hub.games[g.id];
            const playable = Boolean(g.href) && !g.soon;
            const inner = (
              <>
                {g.art ? (
                  <img className="game-card-art" src={g.art} alt={info.name} loading="lazy" />
                ) : (
                  <div className="game-card-fallback" aria-hidden="true">
                    {g.icon}
                  </div>
                )}
                <div className="game-card-overlay">
                  <div className="game-card-top">
                    <span className="badge mono">{t.hub.phaseLabel(g.phase)}</span>
                    {g.soon ? (
                      <span className="soon-tag mono">{t.hub.soonTag}</span>
                    ) : (
                      g.hrefStaked && <span className="stake-pill mono">{t.hub.playStaked}</span>
                    )}
                  </div>
                  <div className="game-card-bottom">
                    <strong className="game-card-name">{info.name}</strong>
                    <p className="game-card-desc">{info.desc}</p>
                    <span className={`game-card-cta ${playable ? "" : "is-soon"}`}>
                      {g.soon ? t.hub.comingSoon : playable ? t.hub.play : t.hub.building}
                    </span>
                  </div>
                </div>
              </>
            );
            return playable ? (
              <a key={g.id} className="game-card" href={g.href}>
                {inner}
              </a>
            ) : (
              <div
                key={g.id}
                className="game-card is-soon"
                aria-disabled="true"
                title={t.hub.soonTag}
              >
                {inner}
              </div>
            );
          })}
        </div>

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}
