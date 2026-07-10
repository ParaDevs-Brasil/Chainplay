import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_ICONS,
  statValue,
  type GameData,
  type GameMatch,
  type StatCategory,
} from "./types";
import { useLang, type Dict } from "./i18n";
import Navbar from "./Navbar";
import { teamFlag } from "./flags";
import {
  celebrateCorrect,
  celebrateWin,
  prefersReducedMotion,
} from "./celebration";
import { playSfx } from "./sfx";

type Guess = "higher" | "lower";
// "rolling" é a janela de suspense entre o palpite e a revelação do número
type Phase =
  | "loading"
  | "error"
  | "playing"
  | "rolling"
  | "reveal"
  | "gameover"
  | "won";

interface RoundResult {
  correct: boolean;
  push: boolean;
}

interface PendingOutcome {
  correct: boolean;
  push: boolean;
  newStreak: number;
  record: boolean;
}

const ROLL_DURATION = 1000;

// gerador determinístico por seed para a sequência de categorias ser
// reproduzível dentro de uma mesma run
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function Game() {
  const { t } = useLang();
  const [data, setData] = useState<GameData | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [lastGuess, setLastGuess] = useState<Guess | null>(null);
  const [best, setBest] = useState(() =>
    Number(localStorage.getItem("hilo-best") ?? 0)
  );
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isRecord, setIsRecord] = useState(false);
  const [showHelp, setShowHelp] = useState(
    () => localStorage.getItem("hilo-help") !== "off"
  );
  const pending = useRef<PendingOutcome | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(revealTimer.current), []);

  function dismissHelp() {
    setShowHelp(false);
    localStorage.setItem("hilo-help", "off");
  }

  // fecha o modal de ajuda com Esc
  useEffect(() => {
    if (!showHelp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelp]);

  useEffect(() => {
    fetch("/api/game/matches")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: GameData) => {
        if (!d.matches || d.matches.length < 2) {
          throw new Error("Poucas partidas disponíveis");
        }
        setData(d);
        setPhase("playing");
      })
      .catch((e) => {
        setError(String(e.message ?? e));
        setPhase("error");
      });
  }, []);

  const matches: GameMatch[] = data?.matches ?? [];

  const categories: StatCategory[] = useMemo(() => {
    if (!matches.length) return [];
    const available: StatCategory[] = ["goals", "corners", "yellowCards"];
    if (matches.every((m) => m.stats.possession)) available.push("possession");
    const rand = mulberry32(seed);
    return matches.map(
      () => available[Math.floor(rand() * available.length)]
    );
  }, [matches, seed]);

  if (phase === "loading") {
    return <div className="shell center">{t.game.loading}</div>;
  }
  if (phase === "error") {
    return (
      <div className="shell center">
        <p>{t.game.errorTitle}</p>
        <p className="dim">{error}</p>
        <button onClick={() => location.reload()}>{t.game.retry}</button>
      </div>
    );
  }

  const current = matches[round];
  const next = matches[round + 1];
  const category = categories[round + 1] ?? "goals";
  const currentValue = statValue(current, category);
  const nextValue = next ? statValue(next, category) : 0;
  const totalRounds = matches.length - 1;
  const unit = t.game.categoryUnits[category];
  const progress = Math.round(((round + 1) / totalRounds) * 100);
  const revealed = phase !== "playing" && phase !== "rolling";

  function finishReveal() {
    const p = pending.current;
    if (!p) return;
    setLastResult({ correct: p.correct, push: p.push });
    if (p.correct) {
      setStreak(p.newStreak);
      setScore((s) => s + (p.push ? 0 : 1));
      if (p.record) {
        setBest(p.newStreak);
        localStorage.setItem("hilo-best", String(p.newStreak));
      }
      if (!p.push) {
        setIsRecord(p.record);
        setSuccessMsg(
          p.record
            ? t.game.newRecord
            : p.newStreak >= 10
            ? t.game.streakMilestone(p.newStreak)
            : t.game.successWords[
                Math.floor(Math.random() * t.game.successWords.length)
              ]
        );
        celebrateCorrect(p.newStreak);
        playSfx(p.record ? "record" : "correct");
      } else {
        setSuccessMsg(null);
        playSfx("push");
      }
    } else {
      setSuccessMsg(null);
      setIsRecord(false);
      playSfx("wrong");
    }
    setPhase("reveal");
  }

  function guess(g: Guess) {
    if (phase !== "playing" || !next) return;
    playSfx("click");
    const push = nextValue === currentValue;
    const correct =
      push || (g === "higher" ? nextValue > currentValue : nextValue < currentValue);
    const newStreak = correct && !push ? streak + 1 : streak;
    pending.current = {
      correct,
      push,
      newStreak,
      record: correct && !push && newStreak > best,
    };
    setLastGuess(g);
    if (prefersReducedMotion()) {
      // sem suspense animado: revela direto
      finishReveal();
      return;
    }
    setPhase("rolling");
    revealTimer.current = window.setTimeout(finishReveal, ROLL_DURATION);
  }

  function nextRound() {
    if (!lastResult?.correct) {
      setPhase("gameover");
      return;
    }
    if (round + 2 >= matches.length) {
      setPhase("won");
      celebrateWin();
      playSfx("win");
      return;
    }
    setRound((r) => r + 1);
    setLastResult(null);
    setLastGuess(null);
    setSuccessMsg(null);
    setIsRecord(false);
    pending.current = null;
    setPhase("playing");
  }

  function restart() {
    setSeed(Date.now() % 100000);
    setRound(0);
    setStreak(0);
    setScore(0);
    setLastResult(null);
    setLastGuess(null);
    setSuccessMsg(null);
    setIsRecord(false);
    pending.current = null;
    setPhase("playing");
  }

  async function share() {
    const text = t.game.shareText(streak, best, round + 1, totalRounds);
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* usuário cancelou */
    }
  }

  const sourceBadge =
    data?.source === "txline"
      ? t.game.sourceTx(data.network ?? "devnet")
      : t.game.sourceMock;

  const nextCardState =
    phase === "reveal" && lastResult
      ? lastResult.correct
        ? "flash-ok"
        : "flash-bad"
      : "";

  return (
    <div className="game-page">
      <Navbar
        links={[
          { label: t.nav.home, href: "#/" },
          { label: t.nav.howToPlay, onClick: () => setShowHelp(true) },
          { label: t.nav.ranking, soon: true },
          { label: t.nav.history, soon: true },
        ]}
        cta={{ label: t.game.playAgain, onClick: restart }}
      />

      <div className="shell">
      {/* pergunta principal em primeiro: a decisão é o protagonista da tela */}
      <header className="game-hero">
        <span className={`badge ${data?.source}`}>{sourceBadge}</span>
        <h1 className="game-question">
          <span className="game-cat-icon" aria-hidden="true">
            {CATEGORY_ICONS[category]}
          </span>{" "}
          {t.game.questionTitle(t.game.categoryLabels[category])}
        </h1>
        <p className="game-sub">{t.game.categoryQuestion(currentValue, unit)}</p>
      </header>

      <div className="cards">
        <MatchCard
          match={current}
          value={currentValue}
          revealed
          label={t.game.lastMatch}
          unit={unit}
          t={t}
        />
        <div className="vs">
          {phase === "playing" || phase === "rolling" ? (
            <div className="guess-buttons">
              <button
                className={`hi ${
                  phase === "rolling"
                    ? lastGuess === "higher"
                      ? "picked"
                      : "dim"
                    : ""
                }`}
                disabled={phase === "rolling"}
                onClick={() => guess("higher")}
              >
                {t.game.higher}
                <small>{t.game.moreThan(currentValue)}</small>
              </button>
              <button
                className={`lo ${
                  phase === "rolling"
                    ? lastGuess === "lower"
                      ? "picked"
                      : "dim"
                    : ""
                }`}
                disabled={phase === "rolling"}
                onClick={() => guess("lower")}
              >
                {t.game.lower}
                <small>{t.game.lessThan(currentValue)}</small>
              </button>
            </div>
          ) : (
            <ResultBanner
              result={lastResult}
              guess={lastGuess}
              current={currentValue}
              next={nextValue}
              unit={unit}
              t={t}
            />
          )}
        </div>
        <MatchCard
          match={next}
          value={nextValue}
          revealed={revealed}
          rolling={phase === "rolling"}
          rollMax={currentValue}
          label={t.game.nextMatch}
          unit={unit}
          t={t}
          stateClass={nextCardState}
        />
      </div>

      {phase === "reveal" && lastResult?.correct && !lastResult.push && successMsg && (
        <div
          className={`success-float ${isRecord || streak >= 5 ? "gold" : ""}`}
          key={round}
          aria-hidden="true"
        >
          {successMsg}
        </div>
      )}

      {phase === "reveal" && (
        <button className="primary" onClick={nextRound}>
          {lastResult?.correct ? t.game.nextRound : t.game.seeResult}
        </button>
      )}

      {(phase === "gameover" || phase === "won") && (
        <div className="endgame">
          <h2>{phase === "won" ? t.game.wonTitle : t.game.lostTitle}</h2>
          <p>{t.game.summary(streak, score, round + 1)}</p>
          <div className="endgame-actions">
            <button className="primary" onClick={share}>
              {copied ? t.game.copied : t.game.shareBtn}
            </button>
            <button onClick={restart}>{t.game.playAgain}</button>
          </div>
        </div>
      )}

      {/* status do jogador: rodada, sequência e recorde */}
      <div className="scoreboard">
        <div>
          <span className="label">{t.game.round}</span>
          <strong className="stat-pop" key={`r${round}`}>
            {round + 1}/{totalRounds}
          </strong>
        </div>
        <div className="streak-cell">
          <span className="label">{t.game.streak}</span>
          <strong className="stat-pop" key={`s${streak}`}>🔥 {streak}</strong>
          {phase === "reveal" && lastResult?.correct && !lastResult.push && (
            <span className="streak-plus mono" key={`p${round}`} aria-hidden="true">
              +1
            </span>
          )}
        </div>
        <div>
          <span className="label">{t.game.best}</span>
          <strong
            className={`stat-pop ${isRecord && revealed ? "record-glow" : ""}`}
            key={`b${best}`}
          >
            🏆 {best}
          </strong>
        </div>
      </div>

      <div
        className="progress-wrap"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.game.round}
      >
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-label mono">{t.game.progressOf(progress)}</span>
      </div>

      <footer>{t.game.gameFooter}</footer>
      </div>

      {showHelp && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={dismissHelp}
        >
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="help-head">
              <strong id="help-title">{t.game.helpTitle}</strong>
              <button
                className="help-close"
                onClick={dismissHelp}
                aria-label={t.game.helpCloseAria}
              >
                {t.game.helpClose}
              </button>
            </div>
            <ol className="help-steps">
              {t.game.helpSteps.map((step, i) => (
                <li key={step}>
                  <span className="step-dot mono">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <button className="primary help-cta" onClick={dismissHelp}>
              {t.game.helpCta}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* número girando durante o suspense do reveal */
function RollingValue({ max }: { max: number }) {
  const [n, setN] = useState(() => Math.floor(Math.random() * (max + 6)));
  useEffect(() => {
    const id = window.setInterval(
      () => setN(Math.floor(Math.random() * (max + 6))),
      70
    );
    return () => window.clearInterval(id);
  }, [max]);
  return <span className="rolling">{n}</span>;
}

function MatchCard({
  match,
  value,
  revealed,
  rolling = false,
  rollMax = 10,
  label,
  unit,
  t,
  stateClass = "",
}: {
  match?: GameMatch;
  value: number;
  revealed: boolean;
  rolling?: boolean;
  rollMax?: number;
  label: string;
  unit: string;
  t: Dict;
  stateClass?: string;
}) {
  if (!match) return <div className="card" />;
  return (
    <div
      className={`card ${revealed ? "revealed" : "hidden-value"} ${
        stateClass === "flash-bad" ? "wrong-shake" : ""
      }`}
    >
      <span className="card-label">{label}</span>
      {match.stage && <span className="stage">{match.stage}</span>}
      <div className="teams">
        <span className="team">
          <span className="flag" aria-hidden="true">
            {teamFlag(match.home)}
          </span>
          {match.home}
        </span>
        <em>vs</em>
        <span className="team">
          <span className="flag" aria-hidden="true">
            {teamFlag(match.away)}
          </span>
          {match.away}
        </span>
      </div>
      <div className={`value ${revealed ? stateClass : ""}`}>
        {revealed ? value : rolling ? <RollingValue max={rollMax} /> : "?"}
      </div>
      <div className="value-unit">{unit}</div>
      {revealed ? (
        <div className="scoreline">
          {t.game.scoreline(match.stats.goals[0], match.stats.goals[1])}
        </div>
      ) : rolling ? (
        <div className="scoreline dim-hint">{t.game.hiddenHint}</div>
      ) : (
        <span className="pending-chip">{t.game.pendingPick}</span>
      )}
    </div>
  );
}

function ResultBanner({
  result,
  guess,
  current,
  next,
  unit,
  t,
}: {
  result: RoundResult | null;
  guess: Guess | null;
  current: number;
  next: number;
  unit: string;
  t: Dict;
}) {
  if (!result) return null;
  const cmp = next > current ? ">" : next < current ? "<" : "=";
  const detail = (
    <span className="result-detail mono">
      {next} {cmp} {current}
    </span>
  );
  if (result.push) {
    return (
      <div className="result push">
        {t.game.resultPush} {detail}
        <small>{t.game.resultPushNote}</small>
      </div>
    );
  }
  return result.correct ? (
    <div className="result ok">
      {t.game.resultOk} {detail}
      <small>{t.game.resultOkNote(cmp === ">")}</small>
    </div>
  ) : (
    <div className="result bad">
      {t.game.resultBad} {detail}
      <small>{t.game.resultBadNote(guess === "higher", next, unit)}</small>
    </div>
  );
}
