import { useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";
import { useLang } from "./i18n";
import { LoginPanel, useAccount, useAccountCta } from "./chain/account";
import { api } from "./chain/http";
import HowTo from "./components/HowTo";
import Leaderboard from "./components/Leaderboard";
import StakedSession from "./components/StakedSession";
import { celebrateCorrect, celebrateWin } from "./celebration";
import { playSfx } from "./sfx";
import { teamFlag } from "./flags";

/* Guess the Team (Fase 5): quiz de 5 rodadas contra o motor server-side
   (/api/quiz) — o raio-X estatístico de uma seleção e 4 opções; a resposta
   certa só existe no servidor (mesma regra de ouro anti-fraude das runs). */

interface RoundView {
  id: string;
  round: number;
  totalRounds: number;
  score: number;
  streak: number;
  expiresAt: number; // epoch ms
  options: string[];
  clues: {
    stage?: string;
    goalsFor: number;
    goalsAgainst: number;
    corners: number;
    yellowCards: number;
    possession: number;
  };
}

interface AnswerView {
  correct: boolean;
  late: boolean;
  points: number;
  answer: string;
  opponent: string;
  score: number;
  streak: number;
  finished: boolean;
  next: RoundView | null;
}

export default function GuessTeam() {
  const { t } = useLang();
  const account = useAccount();
  const accountCta = useAccountCta();

  const [tab, setTab] = useState<"free" | "staked">("free");
  const [round, setRound] = useState<RoundView | null>(null);
  const [outcome, setOutcome] = useState<AnswerView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leftMs, setLeftMs] = useState(0);
  const [totalMs, setTotalMs] = useState(1);
  const [lbKey, setLbKey] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.title = t.quiz.docTitle;
  }, [t]);

  useEffect(() => () => window.clearInterval(timer.current), []);

  // countdown da rodada: barra de tensão + auto-timeout (registra como erro)
  useEffect(() => {
    if (!round || outcome) return;
    const id = window.setInterval(() => {
      const left = round.expiresAt - Date.now();
      setLeftMs(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(id);
        answer("");
      }
    }, 100);
    timer.current = id;
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, outcome]);

  function adoptRound(r: RoundView) {
    setRound(r);
    setOutcome(null);
    const total = r.expiresAt - Date.now();
    setTotalMs(Math.max(1, total));
    setLeftMs(Math.max(0, total));
  }

  async function start() {
    if (!account.address) return;
    setBusy(true);
    setError("");
    try {
      const r: RoundView = await api("/api/quiz/start", {
        wallet: account.address,
        name: account.displayName ?? undefined,
      });
      adoptRound(r);
      playSfx("click");
    } catch (e) {
      console.error("[quiz] start falhou:", e);
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function answer(choice: string) {
    if (!round || outcome) return;
    window.clearInterval(timer.current);
    try {
      const res: AnswerView = await api(`/api/quiz/${round.id}/answer`, { choice });
      setOutcome(res);
      if (res.finished) setLbKey((k) => k + 1);
      if (res.correct) {
        if (res.streak >= 3) celebrateWin();
        else celebrateCorrect(res.streak);
        playSfx(res.streak >= 3 ? "win" : "correct");
      } else {
        playSfx("wrong");
      }
    } catch (e) {
      console.error("[quiz] answer falhou:", e);
      setError(String((e as Error).message));
      setRound(null);
    }
  }

  const pct = Math.round((leftMs / totalMs) * 100);
  const clueLabels = t.quiz.clues;

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
          <h1 className="game-question">{t.quiz.title}</h1>
          <p className="game-sub">{t.quiz.sub}</p>
        </header>

        <HowTo steps={t.howto.quiz.steps} profit={t.howto.quiz.profit} />

        {error && <p className="dim center run-error">⚠️ {error}</p>}
        {!account.address && <LoginPanel note={t.quiz.connectFirst} />}

        {/* grátis (ranking) x valendo SOL */}
        {account.address && (
          <div className="stake-row center-row">
            <button
              className={`stake-chip ${tab === "free" ? "selected" : ""}`}
              onClick={() => setTab("free")}
            >
              {t.teamSession.freeTab}
            </button>
            <button
              className={`stake-chip ${tab === "staked" ? "selected" : ""}`}
              onClick={() => setTab("staked")}
            >
              {t.teamSession.stakedTab}
            </button>
          </div>
        )}

        {/* ---------- valendo SOL: sessão house-backed de 5 rodadas ---------- */}
        {tab === "staked" && account.address && (
          <StakedSession
            apiBase="/api/quiz/staked"
            labels={{
              chooseTarget: t.teamSession.chooseTarget,
              targetLabel: t.teamSession.targetLabel,
              start: t.teamSession.start,
              creating: t.teamSession.creating,
              wonTitle: t.teamSession.wonTitle,
              lostTitle: t.teamSession.lostTitle,
              progress: t.teamSession.progress,
              nftNote: t.teamSession.nftNote,
            }}
            renderChallenge={({ event, outcome: out, answer, next, timerPct }) =>
              event && !out ? (
                <>
                  <h2 className="arcade-question">{t.teamSession.whoPlayed}</h2>
                  <div className={`arcade-timer ${timerPct < 35 ? "urgent" : ""}`} role="timer">
                    <div className="arcade-timer-fill" style={{ width: `${timerPct}%` }} />
                  </div>
                  <ClueGrid clues={event.clues} labels={t.quiz.clues} />
                  <div className="quiz-options">
                    {(event.options as string[]).map((team, i) => (
                      <button key={team} className="quiz-option" onClick={() => answer(i)}>
                        <span aria-hidden="true">{teamFlag(team)}</span> {team}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="arcade-result">
                  {out && (
                    <p className={`arcade-verdict ${out.correct ? "ok" : "bad"}`}>
                      {out.late
                        ? t.quiz.tooLate
                        : out.correct
                        ? t.quiz.hit(20)
                        : t.teamSession.wasTeam(out.answer, out.opponent)}
                    </p>
                  )}
                  <button className="primary" onClick={next}>
                    {t.quiz.next}
                  </button>
                </div>
              )
            }
          />
        )}

        {tab === "free" && account.address && !round && (
          <div className="endgame">
            <button className="primary staked-cta" disabled={busy} onClick={start}>
              {t.quiz.start}
            </button>
          </div>
        )}

        {tab === "free" && round && (
          <div className="card arcade-card">
            <p className="mono center dim">
              {t.quiz.roundLabel(round.round, round.totalRounds)} ·{" "}
              {t.quiz.finalScore(outcome?.score ?? round.score)}
            </p>

            {!outcome ? (
              <>
                <h2 className="arcade-question">{t.quiz.whoPlayed}</h2>
                <div
                  className={`arcade-timer ${pct < 35 ? "urgent" : ""}`}
                  role="timer"
                  aria-label={`${Math.ceil(leftMs / 1000)}s`}
                >
                  <div className="arcade-timer-fill" style={{ width: `${pct}%` }} />
                </div>

                <ClueGrid clues={round.clues} labels={clueLabels} />

                <div className="quiz-options">
                  {round.options.map((team) => (
                    <button key={team} className="quiz-option" onClick={() => answer(team)}>
                      <span aria-hidden="true">{teamFlag(team)}</span> {team}
                    </button>
                  ))}
                </div>
                {round.streak > 0 && (
                  <p className="mono center">{t.arcade.streakChip(round.streak)}</p>
                )}
              </>
            ) : (
              <div className="arcade-result">
                <p className={`arcade-verdict ${outcome.correct ? "ok" : "bad"}`}>
                  {outcome.late
                    ? t.quiz.tooLate
                    : outcome.correct
                    ? t.quiz.hit(outcome.points)
                    : t.quiz.missWas(outcome.answer)}
                </p>
                <p className="dim">
                  {teamFlag(outcome.answer)} {outcome.answer}{" "}
                  {t.quiz.vsWas(outcome.opponent)}
                  {outcome.streak > 0 && <> · {t.arcade.streakChip(outcome.streak)}</>}
                </p>
                {outcome.finished ? (
                  <>
                    <p className="mono center">{t.quiz.finalScore(outcome.score)}</p>
                    <button className="primary" onClick={start} disabled={busy}>
                      {t.quiz.playAgain}
                    </button>
                  </>
                ) : (
                  <button
                    className="primary"
                    onClick={() => outcome.next && adoptRound(outcome.next)}
                  >
                    {t.quiz.next}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <Leaderboard url="/api/quiz/leaderboard" you={account.address} refreshKey={lbKey} />

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}

/** Raio-X estatístico da seleção (pistas) — reusado no modo grátis e no apostado. */
function ClueGrid({
  clues,
  labels,
}: {
  clues: RoundView["clues"];
  labels: ReturnType<typeof useLang>["t"]["quiz"]["clues"];
}) {
  return (
    <dl className="quiz-clues">
      {clues.stage && (
        <div className="quiz-clue">
          <dt>{labels.stage}</dt>
          <dd>{clues.stage}</dd>
        </div>
      )}
      <div className="quiz-clue">
        <dt>{labels.goalsFor}</dt>
        <dd className="mono">{clues.goalsFor}</dd>
      </div>
      <div className="quiz-clue">
        <dt>{labels.goalsAgainst}</dt>
        <dd className="mono">{clues.goalsAgainst}</dd>
      </div>
      <div className="quiz-clue">
        <dt>{labels.corners}</dt>
        <dd className="mono">{clues.corners}</dd>
      </div>
      <div className="quiz-clue">
        <dt>{labels.yellowCards}</dt>
        <dd className="mono">{clues.yellowCards}</dd>
      </div>
      <div className="quiz-clue">
        <dt>{labels.possession}</dt>
        <dd className="mono">{clues.possession}%</dd>
      </div>
    </dl>
  );
}
