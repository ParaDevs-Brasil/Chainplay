import { useEffect } from "react";
import Navbar from "./Navbar";
import { useLang } from "./i18n";

interface GameEntry {
  id: keyof ReturnType<typeof useLang>["t"]["hub"]["games"];
  icon: string;
  href?: string;
  /** fase do roadmap (docs/plano-minigames.md) — sem href = ainda não jogável */
  phase: number;
}

// Ordem do grid = ordem de entrega do plano: o jogável vem primeiro.
const GAMES: GameEntry[] = [
  { id: "hilo", icon: "🎯", href: "#/jogar", phase: 1 },
  { id: "infiniteHilo", icon: "♾️", phase: 1 },
  { id: "guessStats", icon: "📊", phase: 2 },
  { id: "survivor", icon: "🛡️", phase: 3 },
  { id: "penalty", icon: "🥅", phase: 4 },
  { id: "liveChallenge", icon: "⚡", phase: 5 },
  { id: "guessTeam", icon: "🕵️", phase: 5 },
];

export default function GamesHub() {
  const { t } = useLang();

  useEffect(() => {
    document.title = t.hub.docTitle;
  }, [t]);

  return (
    <div className="game-page">
      <Navbar
        links={[
          { label: t.nav.home, href: "#/" },
          { label: t.nav.games, href: "#/jogos", active: true },
          { label: t.nav.wallet, href: "#/carteira" },
          { label: t.nav.ranking, soon: true },
        ]}
        cta={{ label: t.nav.play, href: "#/jogar" }}
      />

      <div className="shell">
        <header className="game-hero">
          <h1 className="game-question">{t.hub.title}</h1>
          <p className="game-sub">{t.hub.sub}</p>
        </header>

        <div className="hub-grid">
          {GAMES.map((g) => {
            const info = t.hub.games[g.id];
            const playable = Boolean(g.href);
            return (
              <div key={g.id} className={`card hub-card ${playable ? "" : "hub-soon"}`}>
                <div className="hub-icon" aria-hidden="true">
                  {g.icon}
                </div>
                <div className="hub-head">
                  <strong>{info.name}</strong>
                  <span className="badge mono">{t.hub.phaseLabel(g.phase)}</span>
                </div>
                <p className="hub-desc">{info.desc}</p>
                {playable ? (
                  <a className="btn primary small" href={g.href}>
                    {t.hub.play}
                  </a>
                ) : (
                  <span className="pending-chip">{t.hub.building}</span>
                )}
              </div>
            );
          })}
        </div>

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}
