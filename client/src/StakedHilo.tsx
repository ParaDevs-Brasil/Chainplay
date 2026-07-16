import { useCallback, useEffect, useRef, useState } from "react";
import BackBar from "./BackBar";
import { useLang } from "./i18n";
import { LoginPanel, useAccount, useAccountCta } from "./chain/account";
import { api } from "./chain/http";
import { formatSol, type PlacedBet } from "./chain/oddies";
import HowTo from "./components/HowTo";
import { ResultBanner, RollingValue, type Guess } from "./components/MatchCard";
import { celebrateCorrect, celebrateWin, prefersReducedMotion } from "./celebration";
import { playSfx } from "./sfx";
import { teamFlag } from "./flags";
import { CATEGORY_ICONS, type StatCategory } from "./types";
// arte do calango do Infinite Hi-Lo (asset público do Vite, servido da raiz)
const mascotImg = "/games/infiniti-gilo.png";

/* Fluxo da run apostada (house-backed):
   config → creating → betting (assina o place_bet) → playing → won|lost
   won: espera o cron liquidar on-chain (settled) e libera o claim. */

export type RunMode = "target" | "infinite";

interface RunCardInfo {
  home: string;
  away: string;
  category: StatCategory;
  value?: number;
  goals?: [number, number];
}

interface RunState {
  id: string;
  marketId: string;
  marketPda: string;
  mode?: RunMode;
  target: number;
  cashoutLamports?: number;
  nextRungLamports?: number;
  cashedLamports?: number;
  oddsBps: number;
  stakeLamports: number;
  payoutLamports: number;
  closeTs: number;
  status: string;
  streak: number;
  current: RunCardInfo | null;
  next: RunCardInfo | null;
}

type Phase =
  | "config"
  | "creating"
  | "betting"
  | "signing"
  | "playing"
  | "rolling"
  | "won"
  | "lost"
  | "cashed"
  | "expired";

const STAKE_PRESETS = [0.01, 0.02, 0.05];
// o topo da escada paga 28x — presets menores respeitam o teto de payout da casa
const INFINITE_STAKE_PRESETS = [0.002, 0.005, 0.01];
const ROLL_DURATION = 1000;
// janela de assinatura do mercado (só pra barra de progresso do countdown)
const BET_WINDOW_S = 3 * 60;

export default function StakedHilo({ mode = "target" }: { mode?: RunMode }) {
  const { t } = useLang();
  const account = useAccount();
  const accountCta = useAccountCta();
  const infinite = mode === "infinite";
  const presets = infinite ? INFINITE_STAKE_PRESETS : STAKE_PRESETS;

  const [oddsTable, setOddsTable] = useState<Record<string, number>>({});
  const [ladder, setLadder] = useState<Record<string, number>>({});
  const [ladderCap, setLadderCap] = useState(12);
  const [target, setTarget] = useState(5);
  const [stakeSol, setStakeSol] = useState(presets[0]);
  const [phase, setPhase] = useState<Phase>("config");
  const [run, setRun] = useState<RunState | null>(null);
  const [ticket, setTicket] = useState<PlacedBet | null>(null);
  const [lastReveal, setLastReveal] = useState<{
    card: RunCardInfo;
    correct: boolean;
    push: boolean;
    /** valor da carta anterior e palpite, pro banner de resultado */
    prevValue: number;
    guess: Guess;
  } | null>(null);
  const [lastGuess, setLastGuess] = useState<Guess | null>(null);
  const [error, setError] = useState("");
  const [settled, setSettled] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [secondsToClose, setSecondsToClose] = useState(0);
  const revealTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.title = infinite ? t.infinite.docTitle : t.staked.docTitle;
  }, [t, infinite]);

  useEffect(() => () => window.clearTimeout(revealTimer.current), []);

  // odds vindas do server — a mesma tabela usada pra criar o mercado
  useEffect(() => {
    api("/api/runs/config")
      .then((c) => {
        setOddsTable(c.odds ?? {});
        setLadder(c.infiniteLadder ?? {});
        if (c.infiniteCap) setLadderCap(c.infiniteCap);
        const targets = Object.keys(c.odds ?? {}).map(Number);
        if (targets.length && !targets.includes(target)) setTarget(targets[0]);
      })
      .catch((e) => setError(String(e.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retoma a run ativa se a página fechou no meio (o server é a fonte de
  // verdade): awaiting_bet com janela aberta volta pra assinatura; playing
  // volta direto pro jogo.
  useEffect(() => {
    if (!account.address || !account.token) return;
    let cancelled = false;
    api(`/api/runs/wallet/${account.address}`, undefined, account.token)
      .then(({ runs }: { runs: RunState[] }) => {
        if (cancelled || !runs?.length) return;
        const nowS = Math.floor(Date.now() / 1000);
        const active = runs.find(
          (r) =>
            (r.mode ?? "target") === mode &&
            (r.status === "playing" ||
              (r.status === "awaiting_bet" && r.closeTs > nowS))
        );
        if (!active) return;
        setRun(active);
        setPhase(active.status === "playing" ? "playing" : "betting");
      })
      .catch((e) => console.warn("[hilo] não retomou run ativa:", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.address, account.token]);

  // countdown da janela de aposta
  useEffect(() => {
    if (phase !== "betting" && phase !== "signing") return;
    const id = window.setInterval(() => {
      if (!run) return;
      const left = run.closeTs - Math.floor(Date.now() / 1000);
      setSecondsToClose(Math.max(0, left));
      if (left <= 0) setPhase("expired");
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, run]);

  // depois de ganhar, espera o cron liquidar pra liberar o claim
  useEffect(() => {
    if (phase !== "won" || !run || settled) return;
    const id = window.setInterval(async () => {
      try {
        const s = await api(`/api/runs/${run.id}`, undefined, account.token);
        if (s.status === "settled") setSettled(true);
      } catch {
        /* tenta de novo no próximo tick */
      }
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, run, settled, account.token]);

  const capBps = ladder[String(ladderCap)] ?? 0;
  const oddsBps = infinite ? capBps : oddsTable[String(target)] ?? 0;
  const stakeLamports = Math.round(stakeSol * 1e9);
  const potential = Math.floor((stakeLamports * 0.9 * oddsBps) / 10_000);
  // saldo conhecido via /api/auth/me (custodial ou sessão wallet/SIWS);
  // null = desconhecido (não bloqueia — a transação valida on-chain)
  const balance = account.custodialBalance;
  const insufficient = balance != null && balance < stakeLamports;

  async function createRun() {
    if (!account.address) return;
    setError("");
    setPhase("creating");
    try {
      // a wallet da run é a da sessão autenticada — o server ignora o body
      const r = await api("/api/runs", { target, stakeLamports, mode }, account.token);
      setRun(r);
      setPhase("betting");
    } catch (e) {
      console.error("[hilo] criar run falhou:", e);
      setError(String((e as Error).message));
      setPhase("config");
    }
  }

  async function signBet() {
    if (!account.address || !run) return;
    setError("");
    setPhase("signing");
    try {
      const placed = await account.placeBet(run.marketId, 0, run.stakeLamports);
      setTicket(placed);
      playSfx("click");
      setPhase("playing");
    } catch (e) {
      console.error("[hilo] assinatura da aposta falhou:", e);
      setError(String((e as Error).message));
      setPhase("betting");
    }
  }

  async function guess(dir: "higher" | "lower") {
    if (!run || phase !== "playing") return;
    setError("");
    playSfx("click");
    const prevValue = run.current?.value ?? 0;
    setLastGuess(dir);
    try {
      const r = await api(`/api/runs/${run.id}/guess`, { dir }, account.token);
      const apply = () => {
        setLastReveal({
          card: r.revealed,
          correct: r.correct,
          push: r.push,
          prevValue,
          guess: dir,
        });
        setRun((old) => ({ ...(old as RunState), ...r }));
        if (r.status === "won") {
          setPhase("won");
          celebrateWin();
          playSfx("win");
        } else if (r.status !== "playing") {
          setPhase("lost");
          playSfx("wrong");
        } else {
          setPhase("playing");
          if (r.correct && !r.push) {
            celebrateCorrect(r.streak);
            playSfx("correct");
          } else {
            playSfx(r.push ? "push" : "wrong");
          }
        }
      };
      if (prefersReducedMotion()) {
        apply();
      } else {
        setPhase("rolling");
        revealTimer.current = window.setTimeout(apply, ROLL_DURATION);
      }
    } catch (e) {
      console.error("[hilo] guess falhou:", e);
      setError(String((e as Error).message));
    }
  }

  async function forfeit() {
    if (!run) return;
    try {
      const r = await api(`/api/runs/${run.id}/cashout`, {}, account.token);
      if (r.status === "cashed") {
        // infinite: saque na escada — mercado anulado, prêmio garantido
        setRun((old) => ({ ...(old as RunState), ...r }));
        setPhase("cashed");
        celebrateWin();
        playSfx("win");
      } else {
        setPhase("lost");
        playSfx("wrong");
      }
    } catch (e) {
      console.error("[hilo] cashout falhou:", e);
      setError(String((e as Error).message));
    }
  }

  async function claim() {
    if (!account.address || !run || !ticket) return;
    setClaiming(true);
    setError("");
    try {
      await account.claim(run.marketPda, ticket.ticketMint, ticket.ticketAccount);
      setClaimed(true);
      celebrateWin();
      playSfx("win");
    } catch (e) {
      console.error("[hilo] claim falhou:", e);
      setError(String((e as Error).message));
    } finally {
      setClaiming(false);
    }
  }

  const reset = useCallback(() => {
    setRun(null);
    setTicket(null);
    setLastReveal(null);
    setLastGuess(null);
    setSettled(false);
    setClaimed(false);
    setError("");
    setPhase("config");
  }, []);

  const targets = Object.keys(oddsTable)
    .map(Number)
    .sort((a, b) => a - b);

  /* humor do mascote derivado da fase — só apresentação */
  const mascotMood: MascotMood =
    phase === "won" || phase === "cashed"
      ? "cheer"
      : phase === "lost" || phase === "expired"
      ? "sad"
      : phase === "rolling"
      ? "suspense"
      : phase === "betting" || phase === "signing"
      ? "point"
      : phase === "playing" && lastReveal
      ? lastReveal.correct
        ? "cheer"
        : "sad"
      : "idle";

  return (
    <div className="game-page">
      <BackBar
        action={
          accountCta ?? {
            label: account.busy ? t.staked.connecting : t.staked.connect,
            onClick: () => account.connectWallet(),
          }
        }
      />

      <div className="shell">
        <header className={`game-hero ${infinite ? "hilo-hero" : ""}`}>
          {infinite && (
            <span className="hilo-hero-badge">{t.hiloUi.heroBadge}</span>
          )}
          <h1 className="game-question">
            {infinite ? t.hiloUi.heroTitle : t.staked.title}
          </h1>
          <p className="game-sub">
            {infinite ? t.hiloUi.heroTag : t.staked.sub}
          </p>
        </header>

        {error && <p className="dim center run-error">⚠️ {error}</p>}

        {/* ---------------- escolha de meta e stake ---------------- */}
        {(phase === "config" || phase === "creating") && (
          <section className="hilo-stage">
            {/* escada em largura total: a progressão é a estrela do palco */}
            {infinite ? (
              <div className="hilo-field hilo-ladder-field">
                <h2 className="hilo-field-label">{t.infinite.ladderLabel}</h2>
                <LadderRail ladder={ladder} cap={ladderCap} streak={0} t={t} />
                <p className="hilo-footnote">
                  {t.infinite.capNote(
                    ladderCap,
                    (capBps / 10_000).toLocaleString()
                  )}
                </p>
              </div>
            ) : (
              <div className="hilo-field hilo-ladder-field">
                <h2 className="hilo-field-label">{t.staked.chooseTarget}</h2>
                <div className="target-grid">
                  {targets.map((n) => (
                    <button
                      key={n}
                      className={`card target-card ${target === n ? "selected" : ""}`}
                      onClick={() => setTarget(n)}
                    >
                      <span className="target-n mono">{n}</span>
                      <span className="target-odds">
                        {t.staked.oddsX(
                          (oddsTable[String(n)] / 10_000).toLocaleString()
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="hilo-setup">
            <div className="hilo-mascot-col">
              <Mascot
                mood="idle"
                bubble={infinite ? t.hiloUi.bubbleConfig : t.hiloUi.bubbleTarget}
                alt={t.hiloUi.mascotAlt}
              />
            </div>

            <div className="hilo-panel">
              <div className="hilo-field">
                <h2 className="hilo-field-label">{t.staked.stakeLabel}</h2>
                <div className="stake-row">
                  {presets.map((s) => (
                    <button
                      key={s}
                      className={`stake-chip mono ${stakeSol === s ? "selected" : ""}`}
                      onClick={() => setStakeSol(s)}
                    >
                      {s} SOL
                    </button>
                  ))}
                </div>
              </div>

              {/* resumo da aposta: stake → multiplicador do topo → prêmio */}
              <dl className="hilo-summary">
                <div>
                  <dt>{t.hiloUi.summaryStake}</dt>
                  <dd className="mono">{stakeSol} SOL</dd>
                </div>
                <div>
                  <dt>{t.hiloUi.summaryTop}</dt>
                  <dd className="mono">
                    {(oddsBps / 10_000).toLocaleString()}×
                  </dd>
                </div>
                <div className="hilo-summary-prize">
                  <dt>{t.hiloUi.summaryPrize}</dt>
                  <dd className="mono">{formatSol(potential)}</dd>
                </div>
              </dl>

              {!account.address ? (
                <LoginPanel note={t.staked.connectFirst} />
              ) : (
                <>
                  {insufficient && (
                    <p className="dim center run-error">
                      ⚠️ {t.staked.insufficient(formatSol(stakeLamports))}
                    </p>
                  )}
                  <button
                    className="primary staked-cta"
                    disabled={phase === "creating" || !oddsBps || insufficient}
                    onClick={createRun}
                  >
                    {phase === "creating" ? (
                      <span className="hilo-btn-loading">
                        <span className="hilo-spinner" aria-hidden="true" />
                        {t.staked.creating}
                      </span>
                    ) : infinite ? (
                      t.infinite.start
                    ) : (
                      t.staked.start
                    )}
                  </button>
                  <p className="dim center betting-as">
                    {t.staked.bettingAs(
                      account.displayName ?? `${account.address.slice(0, 4)}…`
                    )}
                    {balance != null &&
                      ` · ${t.staked.balanceLabel}: ${formatSol(balance)}`}
                  </p>
                </>
              )}
              <p className="dim devnet-note center">{t.staked.devnetNote}</p>
            </div>
            </div>
          </section>
        )}

        {/* tutorial visual: o loop do jogo em 5 passos, sem parede de texto */}
        {(phase === "config" || phase === "creating") && infinite && (
          <ol className="hilo-steps">
            {t.hiloUi.steps.map((s, i) => (
              <li key={i}>
                <span className="hilo-step-n mono">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        )}

        {(phase === "config" || phase === "creating") && (
          <HowTo
            steps={infinite ? t.howto.infinite.steps : t.howto.staked.steps}
            profit={infinite ? t.howto.infinite.profit : t.howto.staked.profit}
          />
        )}

        {/* ---------------- assinar a aposta ---------------- */}
        {(phase === "betting" || phase === "signing") && run && (
          <section className="hilo-stage hilo-final">
            <Mascot mood="point" bubble={t.hiloUi.bubbleBetting} alt={t.hiloUi.mascotAlt} />
            <div className="hilo-final-body">
              {/* timeline da transação: onde o jogador está no fluxo on-chain */}
              <ol className="hilo-flow" aria-label={t.staked.betTitle}>
                <li className="is-done">{t.hiloUi.flowSteps[0]}</li>
                <li className={phase === "signing" ? "is-busy" : "is-now"}>
                  {t.hiloUi.flowSteps[1]}
                </li>
                <li>{t.hiloUi.flowSteps[2]}</li>
              </ol>
              <h2>{t.staked.betTitle}</h2>
              <p className="dim">{t.staked.betNote(3)}</p>
              {(() => {
                // exibição: antes do 1º tick do interval, deriva direto do closeTs
                const shown =
                  secondsToClose > 0
                    ? secondsToClose
                    : Math.max(0, run.closeTs - Math.floor(Date.now() / 1000));
                return (
                  <div className="hilo-countdown">
                    <span className="hilo-countdown-label">{t.hiloUi.signWindow}</span>
                    <span className="mono hilo-countdown-time">
                      ⏱ {Math.floor(shown / 60)}:
                      {String(shown % 60).padStart(2, "0")}
                    </span>
                    <div
                      className="hilo-countdown-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={BET_WINDOW_S}
                      aria-valuenow={shown}
                    >
                      <div
                        className="hilo-countdown-fill"
                        style={{
                          transform: `scaleX(${Math.min(1, shown / BET_WINDOW_S)})`,
                        }}
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
                  t.staked.signBet(formatSol(run.stakeLamports))
                )}
              </button>
            </div>
          </section>
        )}

        {/* ---------------- jogando ---------------- */}
        {(phase === "playing" || phase === "rolling") && run?.current && (
          <section className="hilo-play">
            {/* HUD: sequência, multiplicador/stake, garantido e prêmio */}
            <div className="hilo-hud">
              <div>
                <span className="label">{t.game.streak}</span>
                <strong className="stat-pop" key={`s${run.streak}`}>
                  🔥 {run.streak}
                  {infinite ? "" : `/${run.target}`}
                </strong>
              </div>
              {infinite ? (
                <div>
                  <span className="label">{t.infinite.multiplier}</span>
                  <strong className="mono">
                    {((ladder[String(Math.max(1, Math.min(run.streak, ladderCap)))] ??
                      10_000) /
                      10_000
                    ).toLocaleString()}
                    ×
                  </strong>
                </div>
              ) : (
                <div>
                  <span className="label">{t.staked.stakeLabel}</span>
                  <strong className="mono">{formatSol(run.stakeLamports)}</strong>
                </div>
              )}
              {infinite && run.streak >= 1 && (
                <div className="hilo-hud-secured">
                  <span className="label">{t.hiloUi.securedNow}</span>
                  <strong className="mono">
                    {formatSol(run.cashoutLamports ?? 0)}
                  </strong>
                </div>
              )}
              <div>
                <span className="label">
                  {infinite ? t.hiloUi.hudPrize : t.staked.potential}
                </span>
                <strong className="mono">{formatSol(run.payoutLamports)}</strong>
              </div>
            </div>

            <div className="cards">
              <RunCard
                card={run.current}
                revealed
                label={t.game.lastMatch}
                t={t}
                stateClass={
                  phase === "playing" && lastReveal
                    ? lastReveal.correct
                      ? "flash-ok"
                      : "flash-bad"
                    : ""
                }
              />
              <div className="vs">
                {/* resultado do palpite anterior: acertou/errou e a comparação */}
                {phase === "playing" && lastReveal && (
                  <ResultBanner
                    result={{ correct: lastReveal.correct, push: lastReveal.push }}
                    guess={lastReveal.guess}
                    current={lastReveal.prevValue}
                    next={lastReveal.card.value ?? 0}
                    unit={t.game.categoryUnits[lastReveal.card.category]}
                    t={t}
                  />
                )}
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
                    <small>{t.game.moreThan(run.current.value ?? 0)}</small>
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
                    <small>{t.game.lessThan(run.current.value ?? 0)}</small>
                  </button>
                </div>
              </div>
              <RunCard
                card={run.next ?? { home: "?", away: "?", category: "goals" }}
                revealed={false}
                rolling={phase === "rolling"}
                rollMax={run.current.value ?? 10}
                label={t.game.nextMatch}
                t={t}
              />

              {/* mascote assiste a run e reage aos acertos/erros */}
              <div className="hilo-play-mascot" key={`m${run.streak}${phase}`}>
                <Mascot
                  mood={mascotMood}
                  compact
                  bubble={
                    phase === "rolling"
                      ? t.hiloUi.bubbleRolling
                      : lastReveal
                      ? undefined
                      : t.hiloUi.bubblePlaying
                  }
                  alt={t.hiloUi.mascotAlt}
                />
              </div>
            </div>

            {/* progresso na escada: degraus subidos, atual e topo */}
            {infinite && (
              <LadderRail
                ladder={ladder}
                cap={ladderCap}
                streak={run.streak}
                t={t}
              />
            )}

            {infinite && run.streak >= 1 ? (
              <>
                {/* a decisão de ouro: seguir subindo ou garantir o prêmio */}
                <button className="primary cashout-cta" onClick={forfeit}>
                  {t.infinite.cashoutBtn(formatSol(run.cashoutLamports ?? 0))}
                </button>
                <p className="dim center hilo-cashout-hint">
                  {t.infinite.cashoutHint}
                  {run.nextRungLamports
                    ? ` · ${t.infinite.nextRung(formatSol(run.nextRungLamports))}`
                    : ""}
                </p>
              </>
            ) : (
              <button className="ghost-btn" onClick={forfeit}>
                {infinite ? t.infinite.forfeitZero : t.staked.cashout}
              </button>
            )}
          </section>
        )}

        {/* ---------------- vitória ---------------- */}
        {phase === "won" && run && (
          <section className="hilo-stage hilo-final is-win">
            <Mascot mood="cheer" bubble={t.hiloUi.bubbleWin} alt={t.hiloUi.mascotAlt} />
            <div className="hilo-final-body">
              <h2>{infinite ? t.infinite.wonTitle : t.staked.wonTitle}</h2>
              <p>{settled ? "" : t.staked.wonSub(formatSol(run.payoutLamports))}</p>
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
              ) : settled ? (
                <button className="primary" disabled={claiming} onClick={claim}>
                  {claiming
                    ? t.staked.claiming
                    : t.staked.claimBtn(formatSol(run.payoutLamports))}
                </button>
              ) : (
                <p className="dim hilo-settling">
                  <span className="hilo-spinner" aria-hidden="true" />
                  {t.staked.settling}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ---------------- cash-out da escada (infinite) ---------------- */}
        {phase === "cashed" && run && (
          <section className="hilo-stage hilo-final is-win">
            <Mascot mood="cheer" bubble={t.hiloUi.bubbleCashed} alt={t.hiloUi.mascotAlt} />
            <div className="hilo-final-body">
              <h2>{t.infinite.cashedTitle}</h2>
              <p>{t.infinite.cashedSub(formatSol(run.cashedLamports ?? 0))}</p>
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
              ) : ticket ? (
                // mercado anulado on-chain: o claim do ticket devolve o stake líquido
                <button className="primary" disabled={claiming} onClick={claim}>
                  {claiming
                    ? t.staked.claiming
                    : t.infinite.claimStake(
                        formatSol(Math.floor(run.stakeLamports * 0.9))
                      )}
                </button>
              ) : (
                <div className="endgame-actions">
                  <a className="btn primary small" href="#/carteira">
                    {t.staked.seeWallet}
                  </a>
                  <button onClick={reset}>{t.staked.playAgain}</button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ---------------- derrota / expirada ---------------- */}
        {(phase === "lost" || phase === "expired") && (
          <section className="hilo-stage hilo-final is-loss">
            <Mascot
              mood="sad"
              bubble={phase === "lost" ? t.hiloUi.bubbleLose : t.hiloUi.bubbleExpired}
              alt={t.hiloUi.mascotAlt}
            />
            <div className="hilo-final-body">
              <h2>{phase === "lost" ? t.staked.lostTitle : t.staked.expiredTitle}</h2>
              {/* mostra a carta que encerrou a run: palpite × valor real */}
              {phase === "lost" && lastReveal && !lastReveal.correct && (
                <ResultBanner
                  result={{ correct: false, push: false }}
                  guess={lastReveal.guess}
                  current={lastReveal.prevValue}
                  next={lastReveal.card.value ?? 0}
                  unit={t.game.categoryUnits[lastReveal.card.category]}
                  t={t}
                />
              )}
              <p>{phase === "lost" ? t.staked.lostSub : t.staked.betExpired}</p>
              <div className="endgame-actions">
                <button className="primary" onClick={reset}>
                  {t.staked.playAgain}
                </button>
                <a className="btn small" href="#/carteira">
                  {t.staked.seeWallet}
                </a>
              </div>
            </div>
          </section>
        )}

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}

/* carta compacta da run: o server só revela o valor da carta atual */
function RunCard({
  card,
  revealed,
  rolling = false,
  rollMax = 10,
  label,
  t,
  stateClass = "",
}: {
  card: RunCardInfo;
  revealed: boolean;
  rolling?: boolean;
  rollMax?: number;
  label: string;
  t: ReturnType<typeof useLang>["t"];
  stateClass?: string;
}) {
  return (
    <div
      className={`card ${revealed ? "revealed" : "hidden-value"} ${
        stateClass === "flash-bad" ? "wrong-shake" : ""
      }`}
    >
      <span className="card-label">{label}</span>
      <div className="teams">
        <span className="team">
          <span className="flag" aria-hidden="true">
            {teamFlag(card.home)}
          </span>
          {card.home}
        </span>
        <em>vs</em>
        <span className="team">
          <span className="flag" aria-hidden="true">
            {teamFlag(card.away)}
          </span>
          {card.away}
        </span>
      </div>
      <div className={`value ${revealed ? stateClass : ""}`}>
        {revealed ? card.value : rolling ? <RollingValue max={rollMax} /> : "?"}
      </div>
      <div className="value-unit">
        {CATEGORY_ICONS[card.category]} {t.game.categoryUnits[card.category]}
      </div>
      {!revealed && !rolling && (
        <span className="pending-chip">{t.game.pendingPick}</span>
      )}
    </div>
  );
}

/* ---------- apresentação: mascote e escada (sem lógica de jogo) ---------- */

type MascotMood = "idle" | "cheer" | "sad" | "suspense" | "point";

/** Calango reativo: mesma arte, humor via CSS (bob, pulo, tremida, tristeza). */
function Mascot({
  mood,
  bubble,
  alt,
  compact = false,
}: {
  mood: MascotMood;
  bubble?: string;
  alt: string;
  compact?: boolean;
}) {
  return (
    <figure className={`hilo-mascot mood-${mood} ${compact ? "compact" : ""}`}>
      {bubble && <figcaption className="mascot-bubble">{bubble}</figcaption>}
      <img src={mascotImg} alt={alt} draggable={false} />
    </figure>
  );
}

/** Escada de prêmio como trilho horizontal: degraus subidos, atual e topo.
 *  streak = 0 mostra a escada inteira como preview (fase de config). */
function LadderRail({
  ladder,
  cap,
  streak,
  t,
}: {
  ladder: Record<string, number>;
  cap: number;
  streak: number;
  t: ReturnType<typeof useLang>["t"];
}) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  // mantém o degrau atual visível quando a escada estoura a largura
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [streak]);

  const rungs = Object.entries(ladder).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  );
  if (!rungs.length) return null;

  return (
    <div className="ladder-rail" aria-label={t.infinite.ladderLabel}>
      {rungs.map(([n, bps]) => {
        const num = Number(n);
        const isDone = streak > 0 && num <= streak;
        const isCurrent = streak > 0 && num === streak;
        const isNext = num === streak + 1;
        return (
          <div
            key={n}
            ref={isCurrent || (streak === 0 && num === 1) ? activeRef : undefined}
            className={`rail-rung ${isDone ? "done" : ""} ${
              isCurrent ? "current" : ""
            } ${isNext ? "next" : ""} ${num === cap ? "cap" : ""}`}
            style={{ "--i": num, "--cap": cap } as React.CSSProperties}
          >
            <span className="rung-mult mono">
              {(bps / 10_000).toLocaleString()}×
            </span>
            <span className="rung-step">
              {num === cap ? "🏔" : isDone ? "✓" : num}
            </span>
            {isCurrent && (
              <span className="rung-here">{t.hiloUi.ladderHere}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
