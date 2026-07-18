import { useEffect, useRef, useState } from "react";
import BackBar from "./BackBar";
import { useLang } from "./i18n";
import { LoginPanel, useAccount, useAccountCta } from "./chain/account";
import { api } from "./chain/http";
import { formatSol, type PlacedBet } from "./chain/oddies";
import Leaderboard from "./components/Leaderboard";
import StakedSession from "./components/StakedSession";
import { celebrateCorrect, celebrateWin } from "./celebration";
import { playSfx } from "./sfx";
import { teamFlag } from "./flags";

/* Motor arcade dos eventos relâmpago: Penalty Predictor (e, com a mesma UI,
   o Live Challenge quando sair de "em construção").
   - aba Grátis: evento simulado, pontos + ranking;
   - aba Valendo SOL (só penalty): sessão house-backed de 8 pênaltis com meta
     de acertos — um place_bet assinado, prêmio com odds fixas via claim. */

type ArcadeGame = "penalty" | "live";

interface ArcadeEvent {
  id: string;
  game: ArcadeGame;
  home: string;
  away: string;
  kind: "penalty" | "nextGoal" | "corner" | "card";
  minute: number;
  expiresAt: number; // epoch ms
  reward: [number, number];
  streak: number;
}

interface Outcome {
  correct: boolean;
  late: boolean;
  secret: number;
  points: number;
  streak: number;
}

export default function Arcade({ game }: { game: ArcadeGame }) {
  const { t } = useLang();
  const account = useAccount();
  const accountCta = useAccountCta();
  const texts = game === "penalty" ? t.arcade.penalty : t.arcade.live;
  const sess = game === "penalty" ? t.penaltySession : t.liveSession;
  const [tab, setTab] = useState<"free" | "staked">("free");

  const [event, setEvent] = useState<ArcadeEvent | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leftMs, setLeftMs] = useState(0);
  const [totalMs, setTotalMs] = useState(1);
  const [lbKey, setLbKey] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.title = texts.docTitle;
  }, [texts]);

  useEffect(() => () => window.clearInterval(timer.current), []);

  // countdown do evento: barra de tensão + auto-timeout
  useEffect(() => {
    if (!event || outcome) return;
    const id = window.setInterval(() => {
      const left = event.expiresAt - Date.now();
      setLeftMs(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(id);
        answer(-1); // estourou: registra como erro e zera a sequência
      }
    }, 100);
    timer.current = id;
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, outcome]);

  async function next() {
    if (!account.address) return;
    setBusy(true);
    setError("");
    setOutcome(null);
    try {
      const res = await fetch(`/api/arcade/${game}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: account.address }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setEvent(json);
      const total = json.expiresAt - Date.now();
      setTotalMs(Math.max(1, total));
      setLeftMs(Math.max(0, total));
      playSfx("click");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function answer(choice: number) {
    if (!event || outcome) return;
    window.clearInterval(timer.current);
    try {
      const res = await fetch(`/api/arcade/${game}/answer/${event.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, name: account.displayName ?? undefined }),
      });
      const json: Outcome = await res.json();
      if (!res.ok) throw new Error((json as any).error ?? `HTTP ${res.status}`);
      setOutcome(json);
      setLbKey((k) => k + 1);
      if (json.correct) {
        if (json.streak >= 3) celebrateWin();
        else celebrateCorrect(json.streak);
        playSfx(json.streak >= 3 ? "win" : "correct");
      } else {
        playSfx("wrong");
      }
    } catch (e) {
      setError(String((e as Error).message));
      setEvent(null);
    }
  }

  const pct = Math.round((leftMs / totalMs) * 100);

  return (
    <div className={`game-page arcade-page ${game === "penalty" ? "penalty-page" : ""}`}>
      <BackBar
        action={
          accountCta ?? {
            label: account.busy ? t.staked.connecting : t.staked.connect,
            onClick: () => account.connectWallet(),
          }
        }
      />

      <div className="shell">
        <header className={`game-hero ${game === "penalty" ? "hilo-hero" : ""}`}>
          {game === "penalty" ? (
            <>
              <span className="hilo-hero-badge">{t.hiloUi.heroBadge}</span>
              <h1 className="hilo-display">
                <span>{t.arcadeUi.penaltyTitleA}</span>
                <span className="accent">{t.arcadeUi.penaltyTitleB}</span>
              </h1>
            </>
          ) : (
            <h1 className="game-question">{texts.title}</h1>
          )}
          <p className="game-sub">{texts.sub}</p>
        </header>

        {/* o loop do jogo como trilho conectado, com os cantos ◀ ▶ ecoando
            os botões reais do palpite */}
        <ol className="mkt-flow">
          <li>
            <span className="mkt-flow-glyph">🥅</span>
            <span className="mkt-flow-label">{t.arcadeUi.flow[0]}</span>
          </li>
          <li>
            <span className="mkt-flow-glyph">
              <span className="mkt-mini-tag mono">◀</span>
              <span className="mkt-mini-tag mono">▶</span>
            </span>
            <span className="mkt-flow-label">{t.arcadeUi.flow[1]}</span>
          </li>
          <li>
            <span className="mkt-flow-glyph">⏱</span>
            <span className="mkt-flow-label">{t.arcadeUi.flow[2]}</span>
          </li>
          <li>
            <span className="mkt-flow-glyph">🔥</span>
            <span className="mkt-flow-label">{t.arcadeUi.flow[3]}</span>
          </li>
        </ol>

        {error && <p className="dim center run-error">⚠️ {error}</p>}
        {!account.address && <LoginPanel note={t.arcade.connectFirst} />}

        {/* penalty e live têm os dois modos (grátis + valendo SOL) */}
        {account.address && (
          <div className="stake-row center-row arcade-tabs">
            <button
              className={`stake-chip ${tab === "free" ? "selected" : ""}`}
              onClick={() => setTab("free")}
            >
              {sess.freeTab}
            </button>
            <button
              className={`stake-chip ${tab === "staked" ? "selected" : ""}`}
              onClick={() => setTab("staked")}
            >
              {sess.stakedTab}
            </button>
          </div>
        )}

        {tab === "staked" && game === "penalty" && account.address && <StakedPenalty />}

        {tab === "staked" && game === "live" && account.address && (
          <StakedSession
            apiBase="/api/arcade/live"
            labels={{
              chooseTarget: t.liveSession.chooseTarget,
              targetLabel: t.liveSession.targetLabel,
              start: t.liveSession.start,
              creating: t.liveSession.creating,
              wonTitle: t.liveSession.wonTitle,
              lostTitle: t.liveSession.lostTitle,
              progress: t.liveSession.progress,
              nftNote: t.liveSession.nftNote,
            }}
            renderChallenge={({ event, outcome, answer, next, timerPct }) =>
              event && !outcome ? (
                <>
                  <p className="arcade-event">
                    <span aria-hidden="true">{teamFlag(event.home)}</span>{" "}
                    {t.arcade.live.event(event.home, event.away, event.minute)}{" "}
                    <span aria-hidden="true">{teamFlag(event.away)}</span>
                  </p>
                  <h2 className="arcade-question">{t.arcade.questions[event.kind as "nextGoal"]}</h2>
                  <div
                    className={`arcade-timer ${timerPct < 35 ? "urgent" : ""}`}
                    role="timer"
                  >
                    <div className="arcade-timer-fill" style={{ width: `${timerPct}%` }} />
                  </div>
                  <div className="guess-buttons arcade-buttons">
                    <button className="hi" onClick={() => answer(0)}>
                      {t.arcade.live.optA}
                    </button>
                    <button className="lo" onClick={() => answer(1)}>
                      {t.arcade.live.optB}
                    </button>
                  </div>
                </>
              ) : (
                <div className="arcade-result">
                  {outcome && (
                    <p className={`arcade-verdict ${outcome.correct ? "ok" : "bad"}`}>
                      {outcome.late
                        ? t.arcade.tooLate
                        : outcome.correct
                        ? t.arcade.hit(outcome.points ?? 0)
                        : t.arcade.miss}
                    </p>
                  )}
                  <button className="primary" onClick={next}>
                    {t.arcade.next}
                  </button>
                </div>
              )
            }
          />
        )}

        {tab === "free" && account.address && !event && (
          <div className="endgame">
            <button className="primary staked-cta" disabled={busy} onClick={next}>
              {texts.start}
            </button>
            <p className="dim devnet-note">{t.arcade.demoNote}</p>
          </div>
        )}

        {tab === "free" && event && (
          <div className="card arcade-card">
            <p className="arcade-event">
              <span aria-hidden="true">{teamFlag(event.home)}</span>{" "}
              {texts.event(event.home, event.away, event.minute)}{" "}
              <span aria-hidden="true">{teamFlag(event.away)}</span>
            </p>
            <h2 className="arcade-question">{t.arcade.questions[event.kind]}</h2>

            {!outcome ? (
              <>
                <div
                  className={`arcade-timer ${pct < 35 ? "urgent" : ""}`}
                  role="timer"
                  aria-label={`${Math.ceil(leftMs / 1000)}s`}
                >
                  <div className="arcade-timer-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="guess-buttons arcade-buttons">
                  <button className="hi" onClick={() => answer(0)}>
                    {texts.optA}
                    <small>{t.arcade.rewardChip(event.reward[0])}</small>
                  </button>
                  <button className="lo" onClick={() => answer(1)}>
                    {texts.optB}
                    <small>{t.arcade.rewardChip(event.reward[1])}</small>
                  </button>
                </div>
                {event.streak > 0 && (
                  <p className="mono center">{t.arcade.streakChip(event.streak)}</p>
                )}
              </>
            ) : (
              <div className="arcade-result">
                <p className={`arcade-verdict ${outcome.correct ? "ok" : "bad"}`}>
                  {outcome.late
                    ? t.arcade.tooLate
                    : outcome.correct
                    ? t.arcade.hit(outcome.points)
                    : t.arcade.miss}
                </p>
                <p className="dim">
                  {outcome.secret === 0 ? texts.optA : texts.optB}
                  {outcome.streak > 0 && <> · {t.arcade.streakChip(outcome.streak)}</>}
                </p>
                <button className="primary" onClick={next}>
                  {t.arcade.next}
                </button>
              </div>
            )}
          </div>
        )}

        {game === "live" && account.address && (
          <LiveBadge token={account.token} refreshKey={lbKey} />
        )}

        <Leaderboard
          url={`/api/arcade/${game}/leaderboard`}
          you={account.address}
          refreshKey={lbKey}
        />

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}

/* NFT de identidade do Live Challenge: sem aposta on-chain, o badge é emitido
   pelo server (1 por conta) quando o jogador acerta ao menos um desafio. */
function LiveBadge({ token, refreshKey }: { token: string | null; refreshKey: number }) {
  const { t } = useLang();
  const [status, setStatus] = useState<{ eligible: boolean; minted: boolean } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api("/nft/badge/live", undefined, token)
      .then(setStatus)
      .catch((e) => console.warn("[arcade] status do badge falhou:", e));
  }, [token, refreshKey]);

  if (!token || !status || (!status.eligible && !status.minted)) {
    return token ? <p className="dim center">{t.arcade.badgeHint}</p> : null;
  }

  async function claim() {
    setClaiming(true);
    setError("");
    try {
      await api("/nft/badge/live/claim", {}, token ?? undefined);
      setStatus((s) => (s ? { ...s, minted: true } : s));
      celebrateWin();
      playSfx("win");
    } catch (e) {
      console.error("[arcade] claim do badge falhou:", e);
      setError(String((e as Error).message));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="endgame">
      {status.minted ? (
        <p className="mono center">🏅 {t.arcade.badgeOwned}</p>
      ) : (
        <button className="primary" disabled={claiming} onClick={claim}>
          {claiming ? t.arcade.badgeClaiming : t.arcade.badgeClaim}
        </button>
      )}
      {error && <p className="dim center run-error">⚠️ {error}</p>}
    </div>
  );
}

/* ---------------- sessão apostada: 8 pênaltis, meta de acertos ---------------- */

interface SessionState {
  id: string;
  marketId: string;
  marketPda: string;
  target: number;
  oddsBps: number;
  stakeLamports: number;
  payoutLamports: number;
  closeTs: number;
  status: string;
  shots: number;
  hits: number;
  totalShots: number;
}

type SPhase =
  | "config"
  | "creating"
  | "betting"
  | "signing"
  | "playing"
  | "won"
  | "lost"
  | "expired";

const SESSION_STAKES = [0.01, 0.02, 0.05];

function StakedPenalty() {
  const { t } = useLang();
  const account = useAccount();
  const texts = t.arcade.penalty;

  const [odds, setOdds] = useState<Record<string, number>>({});
  const [target, setTarget] = useState(7);
  const [stakeSol, setStakeSol] = useState(SESSION_STAKES[0]);
  const [phase, setPhase] = useState<SPhase>("config");
  const [session, setSession] = useState<SessionState | null>(null);
  const [ticket, setTicket] = useState<PlacedBet | null>(null);
  const [event, setEvent] = useState<ArcadeEvent | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [leftMs, setLeftMs] = useState(0);
  const [totalMs, setTotalMs] = useState(1);
  const [secondsToClose, setSecondsToClose] = useState(0);
  const [settled, setSettled] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    api("/api/arcade/penalty/session-config")
      .then((c) => setOdds(c.odds ?? {}))
      .catch(() => {});
  }, []);

  // retoma sessão ativa (o server é a fonte de verdade)
  useEffect(() => {
    if (!account.address || !account.token) return;
    let cancelled = false;
    api(`/api/arcade/penalty/sessions/${account.address}`, undefined, account.token)
      .then(({ sessions }: { sessions: SessionState[] }) => {
        if (cancelled || !sessions?.length) return;
        const nowS = Math.floor(Date.now() / 1000);
        const active = sessions.find(
          (s) =>
            s.status === "playing" ||
            (s.status === "awaiting_bet" && s.closeTs > nowS)
        );
        if (!active) return;
        setSession(active);
        setPhase(active.status === "playing" ? "playing" : "betting");
      })
      .catch((e) => console.warn("[penalty] não retomou sessão ativa:", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.address, account.token]);

  // countdown da janela de aposta
  useEffect(() => {
    if (phase !== "betting" && phase !== "signing") return;
    const id = window.setInterval(() => {
      if (!session) return;
      const left = session.closeTs - Math.floor(Date.now() / 1000);
      setSecondsToClose(Math.max(0, left));
      if (left <= 0) setPhase("expired");
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, session]);

  // timer do pênalti em aberto
  useEffect(() => {
    if (!event || outcome) return;
    const id = window.setInterval(() => {
      const left = event.expiresAt - Date.now();
      setLeftMs(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(id);
        answer(-1);
      }
    }, 100);
    timer.current = id;
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, outcome]);

  // vitória: espera o cron liquidar pra liberar o claim
  useEffect(() => {
    if (phase !== "won" || !session || settled) return;
    const id = window.setInterval(async () => {
      try {
        const s = await api(
          `/api/arcade/penalty/session/${session.id}`,
          undefined,
          account.token
        );
        if (s.status === "settled") setSettled(true);
      } catch {
        /* tenta no próximo tick */
      }
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session, settled, account.token]);

  const stakeLamports = Math.round(stakeSol * 1e9);
  const oddsBps = odds[String(target)] ?? 0;
  const potential = Math.floor((stakeLamports * 0.9 * oddsBps) / 10_000);
  const balance = account.custodialBalance;
  const insufficient = balance != null && balance < stakeLamports;

  async function createSession() {
    if (!account.address) return;
    setError("");
    setPhase("creating");
    try {
      // a wallet da sessão é a da conta autenticada — o server ignora o body
      const s = await api(
        "/api/arcade/penalty/session",
        { target, stakeLamports },
        account.token
      );
      setSession(s);
      setPhase("betting");
    } catch (e) {
      console.error("[penalty] criar sessão falhou:", e);
      setError(String((e as Error).message));
      setPhase("config");
    }
  }

  async function signBet() {
    if (!account.address || !session) return;
    setError("");
    setPhase("signing");
    try {
      const placed = await account.placeBet(session.marketId, 0, session.stakeLamports);
      setTicket(placed);
      playSfx("click");
      setPhase("playing");
    } catch (e) {
      setError(String((e as Error).message));
      setPhase("betting");
    }
  }

  async function nextShot() {
    if (!session) return;
    setError("");
    setOutcome(null);
    try {
      const r = await api(
        `/api/arcade/penalty/session/${session.id}/shot`,
        {},
        account.token
      );
      setSession(r.session);
      // pênalti abandonado pode ter encerrado a sessão no server
      if (r.session.status === "won") {
        setPhase("won");
        celebrateWin();
        playSfx("win");
        return;
      }
      if (r.session.status === "lost") {
        setPhase("lost");
        playSfx("wrong");
        return;
      }
      setEvent(r.event);
      const total = r.event.expiresAt - Date.now();
      setTotalMs(Math.max(1, total));
      setLeftMs(Math.max(0, total));
      playSfx("click");
    } catch (e) {
      console.error("[penalty] próximo pênalti falhou:", e);
      setError(String((e as Error).message));
    }
  }

  async function answer(choice: number) {
    if (!session || !event || outcome) return;
    window.clearInterval(timer.current);
    try {
      const r = await api(
        `/api/arcade/penalty/session/${session.id}/answer`,
        { choice, name: account.displayName ?? undefined },
        account.token
      );
      setOutcome(r);
      setSession(r.session);
      setEvent(null);
      if (r.session.status === "won") {
        setPhase("won");
        celebrateWin();
        playSfx("win");
      } else if (r.session.status === "lost") {
        setPhase("lost");
        playSfx("wrong");
      } else if (r.correct) {
        celebrateCorrect(r.session.hits);
        playSfx("correct");
      } else {
        playSfx("wrong");
      }
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  async function claim() {
    if (!session || !ticket) return;
    setClaiming(true);
    setError("");
    try {
      await account.claim(session.marketPda, ticket.ticketMint, ticket.ticketAccount);
      setClaimed(true);
      celebrateWin();
      playSfx("win");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setClaiming(false);
    }
  }

  function reset() {
    setSession(null);
    setTicket(null);
    setEvent(null);
    setOutcome(null);
    setSettled(false);
    setClaimed(false);
    setError("");
    setPhase("config");
  }

  const pct = Math.round((leftMs / totalMs) * 100);
  const targets = Object.keys(odds)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="staked-config">
      {error && <p className="dim center run-error">⚠️ {error}</p>}

      {/* ---------- meta e stake ---------- */}
      {(phase === "config" || phase === "creating") && (
        <>
          <h2 className="staked-label">{t.penaltySession.chooseTarget}</h2>
          <div className="target-grid">
            {targets.map((n) => (
              <button
                key={n}
                className={`card target-card ${target === n ? "selected" : ""}`}
                onClick={() => setTarget(n)}
              >
                <span className="target-n mono">{t.penaltySession.targetLabel(n)}</span>
                <span className="target-odds">
                  {t.staked.oddsX((odds[String(n)] / 10_000).toLocaleString())}
                </span>
              </button>
            ))}
          </div>

          <h2 className="staked-label">{t.staked.stakeLabel}</h2>
          <div className="stake-row">
            {SESSION_STAKES.map((s) => (
              <button
                key={s}
                className={`stake-chip mono ${stakeSol === s ? "selected" : ""}`}
                onClick={() => setStakeSol(s)}
              >
                {s} SOL
              </button>
            ))}
          </div>

          {/* caixa de payout: resumo (stake → odds → prêmio) + CTA na mesma moldura */}
          <div className="payout-box">
            <dl className="hilo-summary penalty-summary">
              <div>
                <dt>{t.hiloUi.summaryStake}</dt>
                <dd className="mono">{stakeSol} SOL</dd>
              </div>
              <div>
                <dt>{t.hiloUi.summaryTop}</dt>
                <dd className="mono">{(oddsBps / 10_000).toLocaleString()}×</dd>
              </div>
              <div className="hilo-summary-prize">
                <dt>{t.hiloUi.summaryPrize}</dt>
                <dd className="mono">{formatSol(potential)}</dd>
              </div>
            </dl>
            {insufficient && (
              <p className="dim center run-error">
                ⚠️ {t.staked.insufficient(formatSol(stakeLamports))}
              </p>
            )}
            <button
              className="primary staked-cta"
              disabled={phase === "creating" || !oddsBps || insufficient}
              onClick={createSession}
            >
              {phase === "creating" ? (
                <span className="hilo-btn-loading">
                  <span className="hilo-spinner" aria-hidden="true" />
                  {t.penaltySession.creating}
                </span>
              ) : (
                t.penaltySession.start
              )}
            </button>
          </div>
          <p className="dim devnet-note">{t.staked.devnetNote}</p>
        </>
      )}

      {/* ---------- assinar a aposta ---------- */}
      {(phase === "betting" || phase === "signing") && session && (
        <section className="hilo-stage hilo-final">
          <div className="hilo-final-body">
            {/* timeline da transação: onde o jogador está no fluxo on-chain */}
            <ol className="hilo-flow" aria-label={t.staked.betTitle}>
              <li className="is-done">{t.arcadeUi.signSteps[0]}</li>
              <li className={phase === "signing" ? "is-busy" : "is-now"}>
                {t.arcadeUi.signSteps[1]}
              </li>
              <li>{t.arcadeUi.signSteps[2]}</li>
            </ol>
            <h2>{t.staked.betTitle}</h2>
            <p className="dim">{t.staked.betNote(3)}</p>
            {(() => {
              // exibição: antes do 1º tick do interval, deriva direto do closeTs
              const shown =
                secondsToClose > 0
                  ? secondsToClose
                  : Math.max(0, session.closeTs - Math.floor(Date.now() / 1000));
              return (
                <div className="hilo-countdown">
                  <span className="hilo-countdown-label">{t.hiloUi.signWindow}</span>
                  <span className="mono hilo-countdown-time">
                    ⏱ {Math.floor(shown / 60)}:{String(shown % 60).padStart(2, "0")}
                  </span>
                  <div
                    className="hilo-countdown-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={180}
                    aria-valuenow={shown}
                  >
                    <div
                      className="hilo-countdown-fill"
                      style={{ transform: `scaleX(${Math.min(1, shown / 180)})` }}
                    />
                  </div>
                </div>
              );
            })()}
            <button
              className="primary staked-cta"
              disabled={phase === "signing"}
              onClick={signBet}
            >
              {phase === "signing" ? (
                <span className="hilo-btn-loading">
                  <span className="hilo-spinner" aria-hidden="true" />
                  {t.staked.signing}
                </span>
              ) : (
                t.staked.signBet(formatSol(session.stakeLamports))
              )}
            </button>
          </div>
        </section>
      )}

      {/* ---------- jogando os 8 pênaltis ---------- */}
      {phase === "playing" && session && (
        <div className="card arcade-card">
          <p className="mono center">
            {t.penaltySession.progress(session.shots, session.totalShots, session.hits)} ·{" "}
            {t.penaltySession.needed(Math.max(0, session.target - session.hits))}
          </p>

          {event && !outcome ? (
            <>
              <p className="arcade-event">
                <span aria-hidden="true">{teamFlag(event.home)}</span>{" "}
                {texts.event(event.home, event.away, event.minute)}{" "}
                <span aria-hidden="true">{teamFlag(event.away)}</span>
              </p>
              <h2 className="arcade-question">{t.arcade.questions.penalty}</h2>
              <div
                className={`arcade-timer ${pct < 35 ? "urgent" : ""}`}
                role="timer"
                aria-label={`${Math.ceil(leftMs / 1000)}s`}
              >
                <div className="arcade-timer-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="guess-buttons arcade-buttons">
                <button className="hi" onClick={() => answer(0)}>
                  {texts.optA}
                </button>
                <button className="lo" onClick={() => answer(1)}>
                  {texts.optB}
                </button>
              </div>
            </>
          ) : (
            <div className="arcade-result">
              {outcome && (
                <>
                  <p className={`arcade-verdict ${outcome.correct ? "ok" : "bad"}`}>
                    {outcome.late
                      ? t.arcade.tooLate
                      : outcome.correct
                      ? t.arcade.hit(outcome.points)
                      : t.arcade.miss}
                  </p>
                  <p className="dim">
                    {outcome.secret === 0 ? texts.optA : texts.optB}
                  </p>
                </>
              )}
              <button className="primary" onClick={nextShot}>
                {t.arcade.next}
              </button>
            </div>
          )}

          <div className="market-foot mono">
            {t.staked.stakeLabel}: {formatSol(session.stakeLamports)} ·{" "}
            {t.staked.potential}: {formatSol(session.payoutLamports)}
          </div>
        </div>
      )}

      {/* ---------- vitória ---------- */}
      {phase === "won" && session && (
        <div className="hilo-stage hilo-final is-win">
          <div className="hilo-final-body">
          <h2>{t.penaltySession.wonTitle}</h2>
          <p>{settled ? "" : t.staked.wonSub(formatSol(session.payoutLamports))}</p>
          {claimed ? (
            <>
              <p className="success-float gold">{t.staked.claimedMsg}</p>
              <div className="endgame-actions">
                <a className="btn primary small" href="#/carteira">
                  {t.staked.seeWallet}
                </a>
                <button onClick={reset}>{t.staked.playAgain}</button>
              </div>
            </>
          ) : settled && ticket ? (
            <button className="primary" disabled={claiming} onClick={claim}>
              {claiming
                ? t.staked.claiming
                : t.staked.claimBtn(formatSol(session.payoutLamports))}
            </button>
          ) : settled ? (
            <a className="btn primary small" href="#/carteira">
              {t.staked.seeWallet}
            </a>
          ) : (
            <p className="dim hilo-settling">
              <span className="hilo-spinner" aria-hidden="true" />
              {t.staked.settling}
            </p>
          )}
          </div>
        </div>
      )}

      {/* ---------- derrota / expirada ---------- */}
      {(phase === "lost" || phase === "expired") && (
        <div className="hilo-stage hilo-final is-loss">
          <div className="hilo-final-body">
            <h2>
              {phase === "lost" ? t.penaltySession.lostTitle : t.staked.expiredTitle}
            </h2>
            <p>{phase === "lost" ? t.penaltySession.lostSub : t.staked.betExpired}</p>
            <div className="endgame-actions">
              <button className="primary" onClick={reset}>
                {t.staked.playAgain}
              </button>
              <a className="btn small" href="#/carteira">
                {t.staked.seeWallet}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
