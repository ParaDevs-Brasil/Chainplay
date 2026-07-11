import { useEffect, useState } from "react";
import type { GameMatch } from "../types";
import type { Dict } from "../i18n";
import { teamFlag } from "../flags";

/* Blocos compartilhados pelos mini games (Hi-Lo, Infinite, Guess the Stats…):
   carta de partida, número girando no suspense e banner de resultado. */

export type Guess = "higher" | "lower";

export interface RoundResult {
  correct: boolean;
  push: boolean;
}

/* número girando durante o suspense do reveal */
export function RollingValue({ max }: { max: number }) {
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

export function MatchCard({
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

export function ResultBanner({
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
