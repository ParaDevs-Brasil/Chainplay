import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "../i18n";
import { useAccount } from "../chain/account";
import { api } from "../chain/http";
import { formatSol, type PlacedBet } from "../chain/oddies";
import { celebrateCorrect, celebrateWin } from "../celebration";
import { playSfx } from "../sfx";

/**
 * Sessão house-backed genérica valendo SOL (Padrão B), reutilizada por qualquer
 * jogo skill single-player: escolhe meta + stake → assina UM place_bet (que já
 * minta a NFT do jogo) → responde os desafios → bate a meta → resgata o prêmio.
 * O componente cuida de todo o ciclo e da assinatura on-chain; cada jogo entrega
 * só a UI do seu desafio via `renderChallenge` (Live: sim/não; Team: 4 opções).
 */

export interface StakedSessionState {
  id: string;
  marketId: string;
  marketPda: string;
  target: number;
  oddsBps: number;
  stakeLamports: number;
  payoutLamports: number;
  closeTs: number;
  status: string;
  rounds: number;
  hits: number;
  totalRounds: number;
}

/** Args passados pro render do desafio de cada jogo. */
export interface ChallengeRenderArgs {
  event: any;
  outcome: any;
  /** responde o desafio em aberto (choice = índice da opção) */
  answer: (choice: number) => void;
  /** pede o próximo desafio (após o reveal) */
  next: () => void;
  /** % do timer restante (0-100) */
  timerPct: number;
  busy: boolean;
}

export interface StakedSessionLabels {
  chooseTarget: string;
  targetLabel: (n: number) => string;
  start: string;
  creating: string;
  wonTitle: string;
  lostTitle: string;
  /** "acertos X de N · faltam Y" */
  progress: (hits: number, total: number, target: number, rounds: number) => string;
  /** nota didática: "cada aposta vira a NFT de identidade deste jogo" */
  nftNote: string;
}

const SESSION_STAKES = [0.01, 0.02, 0.05];

type SPhase =
  | "config"
  | "creating"
  | "betting"
  | "signing"
  | "playing"
  | "won"
  | "lost"
  | "expired";

export default function StakedSession({
  apiBase,
  labels,
  renderChallenge,
}: {
  /** base das rotas, ex.: "/api/arcade/live" ou "/api/quiz/staked" */
  apiBase: string;
  labels: StakedSessionLabels;
  renderChallenge: (a: ChallengeRenderArgs) => ReactNode;
}) {
  const { t } = useLang();
  const account = useAccount();

  const [odds, setOdds] = useState<Record<string, number>>({});
  const [target, setTarget] = useState(0);
  const [stakeSol, setStakeSol] = useState(SESSION_STAKES[0]);
  const [phase, setPhase] = useState<SPhase>("config");
  const [session, setSession] = useState<StakedSessionState | null>(null);
  const [ticket, setTicket] = useState<PlacedBet | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [outcome, setOutcome] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leftMs, setLeftMs] = useState(0);
  const [totalMs, setTotalMs] = useState(1);
  const [secondsToClose, setSecondsToClose] = useState(0);
  const [settled, setSettled] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // odds/config do jogo
  useEffect(() => {
    api(`${apiBase}/session-config`)
      .then((c) => {
        setOdds(c.odds ?? {});
        const ts = Object.keys(c.odds ?? {}).map(Number).sort((a, b) => a - b);
        if (ts.length) setTarget(ts[Math.floor(ts.length / 2)]);
      })
      .catch(() => {});
  }, [apiBase]);

  // retoma sessão ativa (server é a fonte de verdade)
  useEffect(() => {
    if (!account.address || !account.token) return;
    let cancelled = false;
    api(`${apiBase}/sessions/${account.address}`, undefined, account.token)
      .then(({ sessions }: { sessions: StakedSessionState[] }) => {
        if (cancelled || !sessions?.length) return;
        const nowS = Math.floor(Date.now() / 1000);
        const active = sessions.find(
          (s) => s.status === "playing" || (s.status === "awaiting_bet" && s.closeTs > nowS)
        );
        if (!active) return;
        setSession(active);
        setPhase(active.status === "playing" ? "playing" : "betting");
      })
      .catch((e) => console.warn("[staked] não retomou sessão:", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.address, account.token, apiBase]);

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

  // timer do desafio em aberto
  useEffect(() => {
    if (!event || outcome) return;
    const id = window.setInterval(() => {
      const left = (event.expiresAt as number) - Date.now();
      setLeftMs(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(id);
        answer(-1); // estourou o tempo: conta como erro
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
        const s = await api(`${apiBase}/session/${session.id}`, undefined, account.token);
        if (s.status === "settled") setSettled(true);
      } catch {
        /* tenta no próximo tick */
      }
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session, settled, account.token, apiBase]);

  const stakeLamports = Math.round(stakeSol * 1e9);
  const oddsBps = odds[String(target)] ?? 0;
  const potential = Math.floor((stakeLamports * 0.9 * oddsBps) / 10_000);
  const balance = account.custodialBalance;
  const insufficient = balance != null && balance < stakeLamports;
  const targets = Object.keys(odds).map(Number).sort((a, b) => a - b);

  async function createSession() {
    if (!account.address) return;
    setError("");
    setPhase("creating");
    try {
      const s = await api(`${apiBase}/session`, { target, stakeLamports }, account.token);
      setSession(s);
      setPhase("betting");
    } catch (e) {
      console.error("[staked] criar sessão falhou:", e);
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

  async function next() {
    if (!session) return;
    setError("");
    setOutcome(null);
    setBusy(true);
    try {
      const r = await api(`${apiBase}/session/${session.id}/next`, {}, account.token);
      setSession(r.session);
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
      const total = (r.event.expiresAt as number) - Date.now();
      setTotalMs(Math.max(1, total));
      setLeftMs(Math.max(0, total));
      playSfx("click");
    } catch (e) {
      console.error("[staked] próximo desafio falhou:", e);
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function answer(choice: number) {
    if (!session || !event || outcome) return;
    window.clearInterval(timer.current);
    try {
      const r = await api(
        `${apiBase}/session/${session.id}/answer`,
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

  return (
    <div className="staked-config">
      {error && <p className="dim center run-error">⚠️ {error}</p>}

      {/* meta + stake */}
      {(phase === "config" || phase === "creating") && (
        <>
          <h2 className="staked-label">{labels.chooseTarget}</h2>
          <div className="target-grid">
            {targets.map((n) => (
              <button
                key={n}
                className={`card target-card ${target === n ? "selected" : ""}`}
                onClick={() => setTarget(n)}
              >
                <span className="target-n mono">{labels.targetLabel(n)}</span>
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

          <div className="potential mono">
            {t.staked.potential}: <b>{formatSol(potential)}</b>
          </div>
          <p className="dim center nft-note">🎟️ {labels.nftNote}</p>
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
            {phase === "creating" ? labels.creating : labels.start}
          </button>
          <p className="dim devnet-note">{t.staked.devnetNote}</p>
        </>
      )}

      {/* assinar a aposta */}
      {(phase === "betting" || phase === "signing") && session && (
        <div className="endgame">
          <h2>{t.staked.betTitle}</h2>
          <p className="dim">{t.staked.betNote(3)}</p>
          <p className="mono lock-countdown">
            ⏱ {Math.floor(secondsToClose / 60)}:{String(secondsToClose % 60).padStart(2, "0")}
          </p>
          <button className="primary" disabled={phase === "signing"} onClick={signBet}>
            {phase === "signing" ? t.staked.signing : t.staked.signBet(formatSol(session.stakeLamports))}
          </button>
        </div>
      )}

      {/* jogando os desafios */}
      {phase === "playing" && session && (
        <div className="card arcade-card">
          <p className="mono center">
            {labels.progress(session.hits, session.totalRounds, session.target, session.rounds)}
          </p>
          {renderChallenge({ event, outcome, answer, next, timerPct: pct, busy })}
          <div className="market-foot mono">
            {t.staked.stakeLabel}: {formatSol(session.stakeLamports)} · {t.staked.potential}:{" "}
            {formatSol(session.payoutLamports)}
          </div>
        </div>
      )}

      {/* vitória */}
      {phase === "won" && session && (
        <div className="endgame">
          <h2>{labels.wonTitle}</h2>
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
              {claiming ? t.staked.claiming : t.staked.claimBtn(formatSol(session.payoutLamports))}
            </button>
          ) : settled ? (
            <a className="btn primary small" href="#/carteira">
              {t.staked.seeWallet}
            </a>
          ) : (
            <p className="dim">⏳ {t.staked.settling}</p>
          )}
        </div>
      )}

      {/* derrota / expirada */}
      {(phase === "lost" || phase === "expired") && (
        <div className="endgame">
          <h2>{phase === "lost" ? labels.lostTitle : t.staked.expiredTitle}</h2>
          <p className="dim">{t.staked.lostSub}</p>
          <button className="primary" onClick={reset}>
            {t.staked.playAgain}
          </button>
        </div>
      )}
    </div>
  );
}
