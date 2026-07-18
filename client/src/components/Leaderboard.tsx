import { useEffect, useState } from "react";
import { useLang } from "../i18n";

interface Row {
  rank: number;
  wallet: string;
  name: string | null;
  points: number;
  plays: number;
}

/** Ranking off-chain dos mini games — busca `url` (que responde `{ top: [...] }`)
 *  e destaca a linha do próprio jogador. */
export default function Leaderboard({
  url,
  you,
  refreshKey = 0,
}: {
  url: string;
  you?: string | null;
  /** mude pra forçar re-fetch (ex.: depois de pontuar) */
  refreshKey?: number;
}) {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((j) => !cancelled && setRows(j.top ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url, refreshKey]);

  return (
    <div className="card lb-card">
      <h3 className="lb-title">{t.lb.title}</h3>
      {!rows.length ? (
        <p className="dim">{t.lb.empty}</p>
      ) : (
        <ol className="lb-list">
          {rows.map((r) => {
            const mine = you && r.wallet === you;
            return (
              <li key={r.wallet} className={`lb-row mono ${mine ? "lb-you" : ""}`}>
                <span className="lb-rank">#{r.rank}</span>
                <span className="lb-name">
                  {r.name ?? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}`}
                  {mine && <em> · {t.lb.you}</em>}
                </span>
                <span className="lb-pts">
                  {r.points} {t.lb.points}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
