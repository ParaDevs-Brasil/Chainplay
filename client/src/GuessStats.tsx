import { useCallback, useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useLang } from "./i18n";
import { LoginPanel, useAccount, useAccountCta } from "./chain/account";
import { formatSol } from "./chain/oddies";
import HowTo from "./components/HowTo";
import Leaderboard from "./components/Leaderboard";
import { celebrateCorrect } from "./celebration";
import { playSfx } from "./sfx";
import { teamFlag } from "./flags";

/* Guess the Stats (camada de pontos): crave os números finais antes do lock;
   o server guarda o resultado secreto e liquida por proximidade (máx 100). */

interface PredictMatch {
  id: string;
  home: string;
  away: string;
  stage?: string;
  locksAt: number;
  secondsToLock: number;
  /** mercado parimutuel de faixas de gols (null = só camada de pontos) */
  marketId: string | null;
  pools: number[];
  totalPool: number;
  poolPct: number[];
}

const BET_PRESETS = [0.01, 0.05, 0.1];

interface MyPrediction {
  id: string;
  home: string;
  away: string;
  guess: StatGuess;
  score: number | null;
  breakdown: Partial<Record<keyof StatGuess, number>> | null;
  actual: StatGuess | null;
}

interface StatGuess {
  goals: number;
  corners: number;
  yellowCards: number;
  possession: number;
}

const FIELDS: Array<{ key: keyof StatGuess; min: number; max: number; step: number }> = [
  { key: "goals", min: 0, max: 15, step: 1 },
  { key: "corners", min: 0, max: 30, step: 1 },
  { key: "yellowCards", min: 0, max: 15, step: 1 },
  { key: "possession", min: 20, max: 80, step: 1 },
];

export default function GuessStats() {
  const { t } = useLang();
  const account = useAccount();
  const accountCta = useAccountCta();

  const [matches, setMatches] = useState<PredictMatch[]>([]);
  const [mine, setMine] = useState<MyPrediction[]>([]);
  const [guesses, setGuesses] = useState<Record<string, StatGuess>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [betSol, setBetSol] = useState(BET_PRESETS[0]);
  const [betting, setBetting] = useState<string | null>(null); // `${matchId}:${bucket}`
  const [betPlaced, setBetPlaced] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [lbKey, setLbKey] = useState(0);

  useEffect(() => {
    document.title = t.statsGame.docTitle;
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/matches");
      if (!res.ok) throw new Error(t.markets.serverOffline);
      const json = await res.json();
      setMatches(json.matches ?? []);
      setError("");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
    if (account.address) {
      try {
        const res = await fetch(`/api/stats/mine/${account.address}`);
        const json = await res.json();
        setMine(json.predictions ?? []);
        setLbKey((k) => k + 1);
      } catch {
        /* servidor fora: a lista principal já mostra o erro */
      }
    }
  }, [t, account.address]);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 10_000);
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  function guessFor(id: string): StatGuess {
    return guesses[id] ?? { goals: 2, corners: 9, yellowCards: 3, possession: 50 };
  }

  function setField(id: string, key: keyof StatGuess, value: number) {
    setGuesses((g) => ({ ...g, [id]: { ...guessFor(id), [key]: value } }));
  }

  async function submit(m: PredictMatch) {
    if (!account.address) return;
    setBusy(m.id);
    setError("");
    try {
      const res = await fetch("/api/stats/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: account.address,
          name: account.displayName ?? undefined,
          matchId: m.id,
          guess: guessFor(m.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSent((s) => ({ ...s, [m.id]: true }));
      celebrateCorrect(3);
      playSfx("correct");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function betBucket(m: PredictMatch, bucket: number) {
    if (!account.address || !m.marketId) return;
    setBetting(`${m.id}:${bucket}`);
    setError("");
    try {
      await account.placeBet(m.marketId, bucket, Math.round(betSol * 1e9));
      setBetPlaced((p) => ({ ...p, [m.id]: bucket }));
      celebrateCorrect(3);
      playSfx("correct");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBetting(null);
    }
  }

  function countdown(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.max(0, secs % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const open = matches.filter((m) => m.locksAt > now);

  return (
    <div className="game-page">
      <Navbar
        links={[
          { label: t.nav.home, href: "#/" },
          { label: t.nav.games, href: "#/jogos" },
          { label: t.nav.wallet, href: "#/carteira" },
        ]}
        cta={
          accountCta ?? {
            label: account.busy ? t.staked.connecting : t.staked.connect,
            onClick: () => account.connectWallet(),
          }
        }
      />

      <div className="shell">
        <header className="game-hero">
          <h1 className="game-question">{t.statsGame.title}</h1>
          <p className="game-sub">{t.statsGame.sub}</p>
        </header>

        <HowTo steps={t.howto.stats.steps} profit={t.howto.stats.profit} />

        {error && <p className="dim center run-error">⚠️ {error}</p>}
        {!account.address && <LoginPanel note={t.statsGame.connectFirst} />}

        {account.address && (
          <div className="stake-row center-row">
            <span className="staked-label-inline">{t.markets.stakeLabel}:</span>
            {BET_PRESETS.map((s) => (
              <button
                key={s}
                className={`stake-chip mono ${betSol === s ? "selected" : ""}`}
                onClick={() => setBetSol(s)}
              >
                {s} SOL
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="dim center">{t.statsGame.loading}</p>
        ) : !open.length ? (
          <div className="endgame">
            <p>{t.statsGame.empty}</p>
          </div>
        ) : (
          <div className="market-list">
            {open.map((m) => {
              const g = guessFor(m.id);
              const done = sent[m.id];
              return (
                <div key={m.id} className="card market-card">
                  <div className="market-head">
                    <strong>
                      <span aria-hidden="true">{teamFlag(m.home)}</span> {m.home}{" "}
                      <em>vs</em> {m.away}{" "}
                      <span aria-hidden="true">{teamFlag(m.away)}</span>
                    </strong>
                    <span className="badge mono">
                      {t.statsGame.locksIn} {countdown(m.locksAt - now)}
                    </span>
                  </div>

                  {done ? (
                    <p className="dim market-ok">{t.statsGame.registered}</p>
                  ) : (
                    <>
                      <div className="stat-steppers">
                        {FIELDS.map(({ key, min, max }) => (
                          <label key={key} className="stat-stepper">
                            <span>{t.statsGame.fields[key]}</span>
                            <div className="stepper mono">
                              <button
                                aria-label="-"
                                onClick={() =>
                                  setField(m.id, key, Math.max(min, g[key] - 1))
                                }
                              >
                                −
                              </button>
                              <b>{g[key]}</b>
                              <button
                                aria-label="+"
                                onClick={() =>
                                  setField(m.id, key, Math.min(max, g[key] + 1))
                                }
                              >
                                +
                              </button>
                            </div>
                          </label>
                        ))}
                      </div>
                      <button
                        className="primary staked-cta"
                        disabled={!account.address || busy === m.id}
                        onClick={() => submit(m)}
                      >
                        {busy === m.id ? t.statsGame.submitting : t.statsGame.submit}
                      </button>
                    </>
                  )}

                  {/* aposta on-chain na faixa de gols totais (parimutuel) */}
                  {m.marketId && (
                    <>
                      <p className="staked-label bucket-label">{t.statsBet.title}</p>
                      {betPlaced[m.id] !== undefined ? (
                        <p className="dim market-ok">{t.statsBet.betOk}</p>
                      ) : (
                        <div className="outcome-row">
                          {t.statsBet.buckets.map((label, i) => (
                            <button
                              key={i}
                              className="outcome-btn"
                              disabled={!account.address || betting !== null}
                              onClick={() => betBucket(m, i)}
                            >
                              <span className="outcome-name">{label}</span>
                              <span className="outcome-pct mono">{m.poolPct[i]}%</span>
                              <small className="mono">{formatSol(m.pools[i], 4)}</small>
                              {betting === `${m.id}:${i}` && (
                                <small>{t.markets.betting}</small>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* raio-X: palpite × real dos já liquidados */}
        {mine.length > 0 && (
          <>
            <h2 className="staked-label">{t.statsGame.myGuesses}</h2>
            <div className="market-list">
              {mine.map((p) => (
                <div key={p.id} className="card market-card">
                  <div className="market-head">
                    <strong>
                      {p.home} <em>vs</em> {p.away}
                    </strong>
                    <span className="badge mono">
                      {p.score == null
                        ? t.statsGame.waiting
                        : t.statsGame.totalScore(p.score)}
                    </span>
                  </div>
                  {p.actual && (
                    <div className="xray mono">
                      <span className="xray-head">
                        <i />
                        <em>{t.statsGame.guessCol}</em>
                        <em>{t.statsGame.actualCol}</em>
                        <em>{t.statsGame.ptsCol}</em>
                      </span>
                      {FIELDS.map(({ key }) => (
                        <span key={key} className="xray-row">
                          <i>{t.statsGame.fields[key]}</i>
                          <b>{p.guess[key]}</b>
                          <b>{p.actual![key]}</b>
                          <b className="xray-pts">+{p.breakdown?.[key] ?? 0}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <Leaderboard url="/api/stats/leaderboard" you={account.address} refreshKey={lbKey} />

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}
