import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_ICONS,
  statValue,
  type GameData,
  type GameMatch,
  type StatCategory,
} from "./types";
import { LangToggle, useLang, type Dict } from "./i18n";

type Guess = "higher" | "lower";
type Phase = "loading" | "error" | "playing" | "reveal" | "gameover" | "won";

interface RoundResult {
  correct: boolean;
  push: boolean;
}

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
  const [showHelp, setShowHelp] = useState(
    () => localStorage.getItem("hilo-help") !== "off"
  );

  function dismissHelp() {
    setShowHelp(false);
    localStorage.setItem("hilo-help", "off");
  }

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

  function guess(g: Guess) {
    if (phase !== "playing" || !next) return;
    const push = nextValue === currentValue;
    const correct =
      push || (g === "higher" ? nextValue > currentValue : nextValue < currentValue);
    setLastGuess(g);
    setLastResult({ correct, push });
    if (correct) {
      const newStreak = push ? streak : streak + 1;
      setStreak(newStreak);
      setScore((s) => s + (push ? 0 : 1));
      if (newStreak > best) {
        setBest(newStreak);
        localStorage.setItem("hilo-best", String(newStreak));
      }
    }
    setPhase("reveal");
  }

  function nextRound() {
    if (!lastResult?.correct) {
      setPhase("gameover");
      return;
    }
    if (round + 2 >= matches.length) {
      setPhase("won");
      return;
    }
    setRound((r) => r + 1);
    setLastResult(null);
    setLastGuess(null);
    setPhase("playing");
  }

  function restart() {
    setSeed(Date.now() % 100000);
    setRound(0);
    setStreak(0);
    setScore(0);
    setLastResult(null);
    setLastGuess(null);
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

  return (
    <div className="shell">
      <header>
        <div className="game-topline">
          <a className="back-link" href="#/">{t.game.back}</a>
          <LangToggle />
        </div>
        <h1 className="logo-heading">Hi-<span className="accent">Lo</span></h1>
        <p className="tagline">{t.game.tagline}</p>
        <span className={`badge ${data?.source}`}>{sourceBadge}</span>
      </header>

      <div className="scoreboard">
        <div>
          <span className="label">{t.game.round}</span>
          <strong>{round + 1}/{totalRounds}</strong>
        </div>
        <div>
          <span className="label">{t.game.streak}</span>
          <strong>🔥 {streak}</strong>
        </div>
        <div>
          <span className="label">{t.game.best}</span>
          <strong>🏆 {best}</strong>
        </div>
      </div>

      {showHelp && (
        <aside className="help-box">
          <div className="help-head">
            <strong>{t.game.helpTitle}</strong>
            <button
              className="help-close"
              onClick={dismissHelp}
              aria-label={t.game.helpCloseAria}
            >
              {t.game.helpClose}
            </button>
          </div>
          <ol>
            {t.game.helpItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </aside>
      )}

      <div className="category">
        <span className="icon">{CATEGORY_ICONS[category]}</span>
        <div className="category-text">
          <strong>{t.game.categoryLabels[category]}</strong>
          <span className="category-question">
            {t.game.categoryQuestion(currentValue, unit)}
          </span>
        </div>
      </div>

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
          {phase === "playing" ? (
            <div className="guess-buttons">
              <button className="hi" onClick={() => guess("higher")}>
                {t.game.higher}
                <small>{t.game.moreThan(currentValue)}</small>
              </button>
              <button className="lo" onClick={() => guess("lower")}>
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
          revealed={phase !== "playing"}
          label={t.game.nextMatch}
          unit={unit}
          t={t}
        />
      </div>

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

      <footer>{t.game.gameFooter}</footer>
    </div>
  );
}

function MatchCard({
  match,
  value,
  revealed,
  label,
  unit,
  t,
}: {
  match?: GameMatch;
  value: number;
  revealed: boolean;
  label: string;
  unit: string;
  t: Dict;
}) {
  if (!match) return <div className="card" />;
  return (
    <div className={`card ${revealed ? "revealed" : "hidden-value"}`}>
      <span className="card-label">{label}</span>
      {match.stage && <span className="stage">{match.stage}</span>}
      <div className="teams">
        <span>{match.home}</span>
        <em>vs</em>
        <span>{match.away}</span>
      </div>
      <div className="value">{revealed ? value : "?"}</div>
      <div className="value-unit">{unit}</div>
      {revealed ? (
        <div className="scoreline">
          {t.game.scoreline(match.stats.goals[0], match.stats.goals[1])}
        </div>
      ) : (
        <div className="scoreline dim-hint">{t.game.hiddenHint}</div>
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
