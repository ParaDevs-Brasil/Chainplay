import { useEffect, useRef, useState } from "react";
import { useLang } from "./i18n";
import { celebrateCorrect } from "./celebration";
import Navbar from "./Navbar";
import PlayerAdvantageSection from "./PlayerAdvantageSection";
import HowItWorksSection from "./HowItWorksSection";
import { CircularTestimonials } from "@/components/ui/circular-testimonials";
import heroCharacter from "./assets/chameleon1.png";
import chainplayLogo from "./assets/chainplay-logo.png";
import infiniteHiloArt from "./assets/games/infinite-hilo.jpeg";
import markets1x2Art from "./assets/games/1x2-markets.png";
import penaltyPredictorArt from "./assets/games/penalty-predictor.jpeg";

/* artes dos jogos exibidos no carrossel do showcase, na mesma ordem do array
   showcase.games do i18n (Infinite Hi-Lo, 1X2 Markets, Penalty Predictor). */
const SHOWCASE_IMAGES = [infiniteHiloArt, markets1x2Art, penaltyPredictorArt];

/* ---------- teaser jogável do hero ---------- */

function HeroTeaser() {
  const { t } = useLang();
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<"ok" | "bad" | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const rounds = t.teaser.rounds;
  const r = rounds[round];

  function guess(dir: "higher" | "lower") {
    if (revealed || done) return;
    const correct =
      dir === "higher" ? r.next.value > r.prev.value : r.next.value < r.prev.value;
    setRevealed(true);
    setResult(correct ? "ok" : "bad");
    if (correct) {
      setStreak((s) => s + 1);
      celebrateCorrect(streak + 1);
    }
    timer.current = window.setTimeout(() => {
      if (!correct || round === rounds.length - 1) {
        setDone(true);
      } else {
        setRound(round + 1);
        setRevealed(false);
        setResult(null);
      }
    }, 1400);
  }

  if (done) {
    return (
      <div className="hero-teaser teaser-done">
        <span className="teaser-done-emoji">{streak > 0 ? "🔥" : "😅"}</span>
        <strong>
          {streak > 0 ? t.teaser.doneStreak(streak) : t.teaser.doneZero}
        </strong>
        <p>{t.teaser.doneNote}</p>
        <a className="btn primary" href="#/jogar">
          {t.teaser.doneCta}
        </a>
      </div>
    );
  }

  return (
    <div className="hero-teaser">
      <div className="teaser-head">
        <span className="teaser-title">
          <span className="live-dot" /> {t.teaser.title}
        </span>
        <span className="teaser-streak mono">🔥 {streak}</span>
      </div>

      <div className="teaser-cat">{r.cat}</div>

      <div className="hero-preview">
        <div className="preview-card">
          <span className="preview-label">{t.teaser.lastMatch}</span>
          <span className="preview-teams">{r.prev.teams}</span>
          <span className="preview-value mono">{r.prev.value}</span>
        </div>

        <div className="preview-vs">
          <button
            className="pill-btn hi"
            onClick={() => guess("higher")}
            disabled={revealed}
          >
            {t.teaser.higher}
          </button>
          <button
            className="pill-btn lo"
            onClick={() => guess("lower")}
            disabled={revealed}
          >
            {t.teaser.lower}
          </button>
        </div>

        <div className={`preview-card ${revealed ? "" : "dashed"}`}>
          <span className="preview-label">{t.teaser.nextMatch}</span>
          <span className="preview-teams">{r.next.teams}</span>
          <span
            className={`preview-value mono ${
              revealed ? (result === "ok" ? "flip-ok" : "flip-bad") : "accent"
            }`}
          >
            {revealed ? r.next.value : "?"}
          </span>
        </div>
      </div>

      <div className={`teaser-feedback ${result ?? ""}`}>
        {result === "ok" && t.teaser.feedbackOk}
        {result === "bad" && t.teaser.feedbackBad}
        {!result && t.teaser.feedbackIdle}
      </div>
    </div>
  );
}

/* ---------- demo automática didática ---------- */

type DemoStage = "look" | "press" | "reveal" | "done";

function AutoDemo() {
  const { t } = useLang();
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<DemoStage>("look");
  const [streak, setStreak] = useState(0);
  const [running, setRunning] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const rounds = t.demo.rounds;

  // só anima quando o bloco está visível na tela
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setRunning(e.isIntersecting),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const durations: Record<DemoStage, number> = {
      look: 1400,
      press: 800,
      reveal: 1700,
      done: 2400,
    };
    const timeout = window.setTimeout(() => {
      if (stage === "look") {
        setStage("press");
      } else if (stage === "press") {
        setStreak((s) => s + 1);
        setStage("reveal");
      } else if (stage === "reveal") {
        if (i === rounds.length - 1) {
          setStage("done");
        } else {
          setI(i + 1);
          setStage("look");
        }
      } else {
        setI(0);
        setStreak(0);
        setStage("look");
      }
    }, durations[stage]);
    return () => window.clearTimeout(timeout);
  }, [stage, i, running, rounds.length]);

  const r = rounds[i];
  const revealed = stage === "reveal" || stage === "done";
  const pickLabel = r.pick === "higher" ? t.demo.pickHigher : t.demo.pickLower;

  const caption =
    stage === "look"
      ? t.demo.captionLook(r.prev, r.unit)
      : stage === "press"
      ? t.demo.captionPress(pickLabel)
      : stage === "reveal"
      ? t.demo.captionReveal(r.next, r.unit, streak)
      : t.demo.captionDone(streak);

  return (
    <div className="demo-board" ref={boardRef} aria-hidden="true">
      <div className="teaser-head">
        <span className="teaser-title">
          <span className="live-dot" /> {t.demo.title}
        </span>
        <span className="teaser-streak mono">🔥 {streak}</span>
      </div>

      <div className="teaser-cat">{r.cat}</div>

      <div className="hero-preview">
        <div className="preview-card">
          <span className="preview-label">{t.demo.lastMatch}</span>
          <span className="preview-teams">{r.prevTeams}</span>
          <span className="preview-value mono">{r.prev}</span>
        </div>

        <div className="preview-vs">
          <span
            className={`pill-btn static hi ${
              stage !== "look" && r.pick === "higher" ? "demo-press" : ""
            } ${stage !== "look" && r.pick !== "higher" ? "demo-dim" : ""}`}
          >
            {t.demo.higher}
            {r.pick === "higher" && stage === "press" && (
              <span className="demo-cursor">👆</span>
            )}
          </span>
          <span
            className={`pill-btn static lo ${
              stage !== "look" && r.pick === "lower" ? "demo-press" : ""
            } ${stage !== "look" && r.pick !== "lower" ? "demo-dim" : ""}`}
          >
            {t.demo.lower}
            {r.pick === "lower" && stage === "press" && (
              <span className="demo-cursor">👆</span>
            )}
          </span>
        </div>

        <div className={`preview-card ${revealed ? "" : "dashed"}`}>
          <span className="preview-label">{t.demo.nextMatch}</span>
          <span className="preview-teams">{r.nextTeams}</span>
          <span
            className={`preview-value mono ${revealed ? "flip-ok" : "accent"}`}
          >
            {revealed ? r.next : "?"}
          </span>
        </div>
      </div>

      <div className="demo-caption" key={`${i}-${stage}`}>
        {caption}
      </div>
    </div>
  );
}

/* ---------- contador animado ---------- */

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1100;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          // ease-out cúbico para desacelerar no final
          setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);

  return (
    <strong ref={ref}>
      {val}
      {suffix}
    </strong>
  );
}

/* ---------- reveal on scroll ---------- */

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ---------- painéis laterais da arena ---------- */

function ArenaLeftPanel() {
  const { t } = useLang();
  return (
    <aside className="side-panel">
      <div className="panel-block">
        <span className="panel-title">{t.arena.leftTitle}</span>
        <ul className="panel-results">
          {t.ticker.slice(0, 4).map((item) => (
            <li key={item.match}>
              <span className="panel-match">{item.match}</span>
              <span className={`ticker-chip mono k-${item.kind}`}>
                {item.stat}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel-block">
        <span className="panel-label">{t.arena.catNow}</span>
        <strong className="panel-value">{t.arena.catNowValue}</strong>
      </div>
      <div className="panel-block">
        <span className="panel-label">{t.arena.avgTime}</span>
        <strong className="panel-value mono">{t.arena.avgTimeValue}</strong>
      </div>
      <div className="panel-block">
        <span className="panel-label">{t.arena.totalMatches}</span>
        <strong className="panel-value mono">104</strong>
      </div>
    </aside>
  );
}

/* contagem "ao vivo" que flutua de leve para dar sensação de movimento */
function OnlineNow() {
  const [n, setN] = useState(() => 1180 + Math.floor(Math.random() * 160));
  useEffect(() => {
    const id = window.setInterval(
      () => setN((v) => v + Math.floor(Math.random() * 35) - 15),
      4000
    );
    return () => window.clearInterval(id);
  }, []);
  return <strong className="panel-value mono">{n.toLocaleString()}</strong>;
}

function ArenaRightPanel() {
  const { t } = useLang();
  const best = Number(localStorage.getItem("hilo-best") ?? 0);
  return (
    <aside className="side-panel">
      <div className="panel-block">
        <span className="panel-title">
          {t.arena.rightTitle}
          <small className="panel-chip mono">{t.arena.preview}</small>
        </span>
        <ol className="panel-rank">
          {t.arena.rankRows.map((r, i) => (
            <li key={r.name}>
              <span className="rank-pos mono">{i + 1}</span>
              <span className="rank-name">{r.name}</span>
              <span className="rank-streak mono">🔥 {r.streak}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="panel-block">
        <span className="panel-label">{t.arena.yourStreak}</span>
        <strong className="panel-value mono">{best}</strong>
        <span className="panel-sub">{t.arena.yourStreakUnit}</span>
      </div>
      <div className="panel-block">
        <span className="panel-label">
          <span className="live-dot" /> {t.arena.online}
        </span>
        <OnlineNow />
      </div>
      <div className="panel-block">
        <span className="panel-label">{t.arena.liveFeed}</span>
        <ul className="panel-feed">
          {t.arena.feedItems.slice(0, 3).map((f, i) => (
            <li key={i}>
              <span className="rank-name mono">
                {t.arena.rankRows[i % t.arena.rankRows.length].name}
              </span>{" "}
              {f}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/* ---------- página ---------- */

export default function Landing() {
  const { t } = useLang();
  useReveal();

  return (
    <div className="landing">
      <Navbar
        links={[
          { label: t.nav.minigames, href: "#minigames" },
          { label: t.nav.how, href: "#get-started" },
        ]}
        secondaryCta={{ label: t.nav.signup, href: "#/jogos" }}
        cta={{ label: t.nav.play, href: "#/jogos" }}
      />

      {/* display: contents preserva o layout flex de .landing */}
      <main className="landing-main">

      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <h1 className="hero-title">
              <span className="hero-title-line">{t.hero.heroLine1}</span>
              <span className="hero-title-line">{t.hero.heroLine2}</span>
              <span className="hero-title-line accent">{t.hero.heroLine3}</span>
              <span className="hero-title-line accent">{t.hero.heroLine4}</span>
            </h1>
            <p className="hero-sub">{t.hero.heroSub}</p>
            <div className="hero-actions">
              <a className="btn primary big" href="#/jogos">
                {t.hero.heroCtaStart}
              </a>
              <a className="btn ghost big" href="#como-funciona">
                {t.hero.heroCtaExplore}
              </a>
            </div>
          </div>

          <div className="hero-stage">
            <div className="hero-figure">
              {/* heroMedia: placeholder temporário para imagem/GIF em produção.
                  Para usar o asset real, troque este bloco por
                  <img className="hero-media-img" src={heroMedia} alt="..." />
                  ou defina background-image em .hero-media. */}
              <div
                className="hero-media"
                role="img"
                aria-label="Prévia do minigame (em breve)"
              >
                <span className="hero-media-hint mono">GIF / imagem em breve</span>
              </div>

              {/* heroCharacter: mascote camaleão sobreposto à borda do card */}
              <img
                className="hero-character"
                src={heroCharacter}
                alt="ChainPlay — mascote camaleão"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="showcase reveal" id="minigames">
        <h2 className="showcase-title">{t.showcase.title}</h2>
        <p className="showcase-sub">{t.showcase.sub}</p>
        <div className="showcase-testimonials">
          <CircularTestimonials
            testimonials={t.showcase.games.map((game, i) => ({
              quote: game.description,
              name: game.title,
              designation: game.tagline,
              src: SHOWCASE_IMAGES[i % SHOWCASE_IMAGES.length],
            }))}
            autoplay={true}
            colors={{
              name: "#ffffff",
              designation: "#c6f04e",
              testimony: "#d6d6d6",
              arrowBackground: "#1f1f1f",
              arrowForeground: "#c6f04e",
              arrowHoverBackground: "#c6f04e",
            }}
            fontSizes={{
              name: "1.6rem",
              designation: "0.95rem",
              quote: "1.05rem",
            }}
          />
        </div>
      </section>

      <PlayerAdvantageSection />

      <HowItWorksSection />

      <section className="section reveal" id="faq">
        <span className="section-kicker mono">{t.faq.kicker}</span>
        <h2>
          {t.faq.h2pre} <span className="accent">{t.faq.h2accent}</span>
        </h2>
        <p className="section-lead">{t.faq.lead}</p>
        <div className="faq-list">
          {t.faq.items.map((f) => (
            <details className="faq-item" key={f.q}>
              <summary>
                {f.q}
                <span className="faq-chevron" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      </main>

      <footer className="landing-footer">
        <div className="footer-inner">
          {/* coluna esquerda: logo + slogan + botões sociais */}
          <div className="footer-brand">
            <a className="logo footer-logo" href="#/" aria-label="ChainPlay">
              <img src={chainplayLogo} alt="ChainPlay" className="logo-img" />
            </a>
            <p className="footer-slogan">
              <span className="footer-slogan-1">{t.footer.slogan1}</span>
              <span className="footer-slogan-2">{t.footer.slogan2}</span>
            </p>
            <div className="footer-socials">
              {/* href="#" temporário — trocar pelos links reais de Discord/X */}
              <a className="footer-social" href="#" aria-label={t.footer.discord}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.2.36-.43.845-.59 1.23a18.27 18.27 0 0 0-5.59 0A12.6 12.6 0 0 0 9.11 3a19.7 19.7 0 0 0-4.435 1.37C1.87 8.59 1.11 12.7 1.49 16.76a19.9 19.9 0 0 0 6.06 3.08c.49-.67.926-1.38 1.3-2.13-.714-.27-1.4-.6-2.045-.99.171-.126.34-.257.5-.39a14.2 14.2 0 0 0 12.19 0c.163.14.331.27.5.39-.646.39-1.333.72-2.048.99.374.75.81 1.46 1.3 2.13a19.86 19.86 0 0 0 6.062-3.08c.446-4.71-.762-8.79-3.19-12.39ZM8.68 14.27c-1.183 0-2.156-1.09-2.156-2.42 0-1.33.95-2.42 2.156-2.42 1.21 0 2.18 1.1 2.157 2.42 0 1.33-.952 2.42-2.157 2.42Zm6.64 0c-1.184 0-2.156-1.09-2.156-2.42 0-1.33.95-2.42 2.156-2.42 1.21 0 2.18 1.1 2.157 2.42 0 1.33-.947 2.42-2.157 2.42Z"
                  />
                </svg>
              </a>
              <a className="footer-social" href="#" aria-label={t.footer.x}>
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
                  />
                </svg>
              </a>
            </div>
          </div>

          {/* coluna Resources */}
          <nav className="footer-col" aria-label={t.footer.resources}>
            <strong className="footer-heading">{t.footer.resources}</strong>
            {/* href="#" temporário — apontar para as páginas legais quando existirem */}
            <a href="#">{t.footer.terms}</a>
            <a href="#">{t.footer.privacy}</a>
            <a href="#">{t.footer.responsible}</a>
            <a href="#">{t.footer.disclosures}</a>
            <a href="#">{t.footer.brand}</a>
          </nav>

          {/* coluna Products */}
          <nav className="footer-col" aria-label={t.footer.products}>
            <strong className="footer-heading">{t.footer.products}</strong>
            <a href="#minigames">{t.footer.minigames}</a>
            <a href="#get-started">{t.footer.howItWorks}</a>
          </nav>
        </div>
      </footer>

      {/* ticker fixo estilo ESPN: resultados rolando no rodapé da janela */}
      <div className="ticker ticker-bar" aria-hidden="true">
        <div className="ticker-track">
          {[...t.ticker, ...t.ticker].map((item, i) => (
            <span className="ticker-item" key={i}>
              <span className="ticker-match">{item.match}</span>
              <span className={`ticker-chip mono k-${item.kind}`}>
                {item.stat}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
