import { useEffect, useRef, useState } from "react";
import { LangToggle, useLang } from "./i18n";

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
    if (correct) setStreak((s) => s + 1);
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

/* ---------- página ---------- */

export default function Landing() {
  const { t } = useLang();
  useReveal();

  return (
    <div className="landing">
      <nav className="topbar">
        <a className="logo" href="#/" aria-label="Hi-Lo">
          Hi-<span className="accent">Lo</span>
        </a>
        <div className="topbar-links">
          <a href="#como-funciona">{t.nav.how}</a>
          <a href="#tecnologia">{t.nav.tech}</a>
          <a href="#roadmap">{t.nav.vision}</a>
        </div>
        <div className="topbar-actions">
          <LangToggle />
          <a className="btn primary small" href="#/jogar">
            {t.nav.play}
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <span className="badge">
          <span className="live-dot" /> {t.hero.badge}
        </span>
        <h1>
          {t.hero.titlePre} <span className="accent">{t.hero.titleHigher}</span>{" "}
          {t.hero.titleOr}{" "}
          <span className="muted-strike">{t.hero.titleLower}</span>
          {t.hero.titlePost}
        </h1>
        <p className="lead">{t.hero.lead}</p>
        <div className="hero-actions">
          <a className="btn primary big" href="#/jogar">
            {t.hero.ctaPlay}
          </a>
          <a className="btn ghost big" href="#como-funciona">
            {t.hero.ctaHow}
          </a>
        </div>

        <HeroTeaser />

        <div className="stats-strip mono">
          <div>
            <CountUp to={104} />
            <span>{t.hero.statGames}</span>
          </div>
          <div>
            <CountUp to={4} />
            <span>{t.hero.statCats}</span>
          </div>
          <div>
            <strong>&lt;5s</strong>
            <span>{t.hero.statPerRound}</span>
          </div>
          <div>
            <strong>0</strong>
            <span>{t.hero.statSignups}</span>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
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

      <section className="section reveal" id="como-funciona">
        <span className="section-kicker mono">{t.how.kicker}</span>
        <h2>
          {t.how.h2pre} <span className="accent">{t.how.h2accent}</span>
        </h2>
        <p className="section-lead">{t.how.lead}</p>
        <div className="grid-3">
          {t.how.steps.map((s) => (
            <article className="feature-card" key={s.n}>
              <span className="step-n mono">{s.n}</span>
              <span className="feature-icon">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
        <AutoDemo />
      </section>

      <section className="section reveal">
        <span className="section-kicker mono">{t.why.kicker}</span>
        <h2>
          {t.why.h2pre} <span className="accent">{t.why.h2accent}</span>
          {t.why.h2post}
        </h2>
        <p className="section-lead">{t.why.lead}</p>
        <div className="grid-3">
          {t.why.features.map((f) => (
            <article className="feature-card" key={f.icon}>
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section reveal" id="tecnologia">
        <span className="section-kicker mono">{t.tech.kicker}</span>
        <h2>
          {t.tech.h2pre} <span className="accent">{t.tech.h2accent}</span>
        </h2>
        <p className="section-lead">{t.tech.lead}</p>
        <div className="pipeline">
          {t.tech.pipeline.map((p, i) => (
            <article className="pipe-card" key={p.n}>
              <div className="pipe-head">
                <span className="pipe-n mono">{p.n}</span>
                <div>
                  <h3>{p.title}</h3>
                  <span className="pipe-sub mono">{p.sub}</span>
                </div>
              </div>
              <p>{p.text}</p>
              {i < t.tech.pipeline.length - 1 && (
                <span className="pipe-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </article>
          ))}
        </div>
        <div className="tech-badges mono">
          <span>TxLINE API</span>
          <span>Solana devnet</span>
          <span>txoracle</span>
          <span>Node.js</span>
          <span>React + Vite</span>
        </div>
      </section>

      <section className="section reveal" id="roadmap">
        <span className="section-kicker mono">{t.roadmap.kicker}</span>
        <h2>
          {t.roadmap.h2pre} <span className="accent">{t.roadmap.h2accent}</span>
        </h2>
        <p className="section-lead">{t.roadmap.lead}</p>
        <div className="roadmap">
          {t.roadmap.items.map((r) => (
            <article className={`road-card ${r.live ? "live" : ""}`} key={r.title}>
              <span className={`road-tag mono ${r.live ? "live" : ""}`}>
                {r.live && <span className="live-dot" />}
                {r.tag}
              </span>
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <span className="section-kicker mono">{t.nots.kicker}</span>
        <h2>
          {t.nots.h2pre} <span className="accent">{t.nots.h2accent}</span>
          {t.nots.h2post && <> {t.nots.h2post}</>}
        </h2>
        <p className="section-lead">{t.nots.lead}</p>
        <div className="not-grid">
          {t.nots.items.map((n) => (
            <div className="not-card" key={n}>
              <span className="not-x mono">×</span>
              {n}
            </div>
          ))}
        </div>
      </section>

      <section className="cta-final reveal">
        <span className="badge">
          <span className="live-dot" /> {t.cta.badge}
        </span>
        <h2>{t.cta.h2}</h2>
        <p className="lead">{t.cta.lead}</p>
        <a className="btn primary big" href="#/jogar">
          {t.cta.btn}
        </a>
      </section>

      <footer className="landing-footer">
        <div className="footer-grid">
          <div className="footer-col">
            <a className="logo" href="#/" aria-label="Hi-Lo">
              Hi-<span className="accent">Lo</span>
            </a>
            <p>{t.footer.blurb}</p>
          </div>
          <div className="footer-col">
            <strong>{t.footer.product}</strong>
            <a href="#/jogar">{t.footer.play}</a>
            <a href="#como-funciona">{t.footer.how}</a>
            <a href="#roadmap">{t.footer.vision}</a>
          </div>
          <div className="footer-col">
            <strong>{t.footer.techCol}</strong>
            <a href="https://txline.txodds.com" target="_blank" rel="noreferrer">
              TxLINE (TxODDS)
            </a>
            <a href="https://solana.com" target="_blank" rel="noreferrer">
              Solana
            </a>
            <a href="#tecnologia">{t.footer.architecture}</a>
          </div>
        </div>
        <div className="footer-note">{t.footer.note}</div>
      </footer>
    </div>
  );
}
