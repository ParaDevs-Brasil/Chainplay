import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  statValue,
  type GameData,
  type GameMatch,
  type StatCategory,
} from "./types";

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

export default function App() {
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
    return <div className="shell center">Carregando partidas…</div>;
  }
  if (phase === "error") {
    return (
      <div className="shell center">
        <p>Não foi possível carregar as partidas.</p>
        <p className="dim">{error}</p>
        <button onClick={() => location.reload()}>Tentar de novo</button>
      </div>
    );
  }

  const current = matches[round];
  const next = matches[round + 1];
  const category = categories[round + 1] ?? "goals";
  const currentValue = statValue(current, category);
  const nextValue = next ? statValue(next, category) : 0;
  const totalRounds = matches.length - 1;

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
    const text =
      `⚽ Hi-Lo Stats · Copa 2026\n` +
      `🔥 Sequência: ${streak} | 🏆 Recorde: ${best}\n` +
      `Sobrevivi a ${round + 1} de ${totalRounds} rodadas. Consegue mais?`;
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
      ? `dados TxLINE · ${data.network}`
      : "dados simulados (TxLINE offline)";

  return (
    <div className="shell">
      <header>
        <h1>⚽ Hi-Lo <span className="accent">Stats</span></h1>
        <p className="tagline">Copa 2026 · a próxima partida vem MAIOR ou menor?</p>
        <span className={`badge ${data?.source}`}>{sourceBadge}</span>
      </header>

      <div className="scoreboard">
        <div>
          <span className="label">Rodada</span>
          <strong>{round + 1}/{totalRounds}</strong>
        </div>
        <div>
          <span className="label">Sequência</span>
          <strong>🔥 {streak}</strong>
        </div>
        <div>
          <span className="label">Recorde</span>
          <strong>🏆 {best}</strong>
        </div>
      </div>

      <div className="category">
        <span className="icon">{CATEGORY_ICONS[category]}</span>
        {CATEGORY_LABELS[category]}
      </div>

      <div className="cards">
        <MatchCard match={current} value={currentValue} revealed label="Última partida" />
        <div className="vs">
          {phase === "playing" ? (
            <div className="guess-buttons">
              <button className="hi" onClick={() => guess("higher")}>
                ⬆ MAIOR
              </button>
              <button className="lo" onClick={() => guess("lower")}>
                ⬇ MENOR
              </button>
            </div>
          ) : (
            <ResultBanner result={lastResult} guess={lastGuess} />
          )}
        </div>
        <MatchCard
          match={next}
          value={nextValue}
          revealed={phase !== "playing"}
          label="Próxima partida"
        />
      </div>

      {phase === "reveal" && (
        <button className="primary" onClick={nextRound}>
          {lastResult?.correct ? "Próxima rodada →" : "Ver resultado"}
        </button>
      )}

      {(phase === "gameover" || phase === "won") && (
        <div className="endgame">
          <h2>{phase === "won" ? "🏆 Você zerou os 104 jogos!" : "💀 Fim de jogo!"}</h2>
          <p>
            Sequência final: <strong>{streak}</strong> · Acertos:{" "}
            <strong>{score}</strong> de <strong>{round + 1}</strong> rodadas
          </p>
          <div className="endgame-actions">
            <button className="primary" onClick={share}>
              {copied ? "✓ Copiado!" : "📣 Compartilhar placar"}
            </button>
            <button onClick={restart}>↻ Jogar de novo</button>
          </div>
        </div>
      )}

      <footer>
        Dados de partidas via{" "}
        <a href="https://txline.txodds.com" target="_blank" rel="noreferrer">
          TxLINE
        </a>{" "}
        (TxODDS) com ancoragem na Solana
      </footer>
    </div>
  );
}

function MatchCard({
  match,
  value,
  revealed,
  label,
}: {
  match?: GameMatch;
  value: number;
  revealed: boolean;
  label: string;
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
      {revealed && (
        <div className="scoreline">
          {match.stats.goals[0]} × {match.stats.goals[1]}
        </div>
      )}
    </div>
  );
}

function ResultBanner({
  result,
  guess,
}: {
  result: RoundResult | null;
  guess: Guess | null;
}) {
  if (!result) return null;
  if (result.push) return <div className="result push">🤝 Empatou — mantém a sequência!</div>;
  return result.correct ? (
    <div className="result ok">✅ Acertou{guess === "higher" ? " (maior)" : " (menor)"}!</div>
  ) : (
    <div className="result bad">❌ Errou!</div>
  );
}
