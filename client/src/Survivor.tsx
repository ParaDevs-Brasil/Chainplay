import { useCallback, useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useLang } from "./i18n";
import { LoginPanel, useAccount, useAccountCta } from "./chain/account";
import { api } from "./chain/http";
import { formatSol } from "./chain/oddies";
import HowTo from "./components/HowTo";
import { celebrateCorrect } from "./celebration";
import { playSfx } from "./sfx";
import { teamFlag } from "./flags";

/* Survivor: um pick por rodada nos mercados 1X2 — o pick é uma aposta
   parimutuel real (assina o place_bet) registrada na temporada. Errou → fora. */

interface MarketView {
  marketId: string;
  home: string;
  away: string;
  closeTs: number;
  status: string;
  demo?: boolean;
  poolPct: number[];
  pools: number[];
}

interface PickRecord {
  marketId: string;
  home: string;
  away: string;
  outcome: number;
  round: string;
  result: "pending" | "survived" | "eliminated" | "void";
}

interface Status {
  alive: boolean;
  survived: number;
  pending: number;
  picks: PickRecord[];
}

interface Board {
  totalPlayers: number;
  aliveCount: number;
  top: Array<{
    rank: number;
    wallet: string;
    name: string | null;
    survived: number;
    alive: boolean;
  }>;
}

const STAKE_PRESETS = [0.01, 0.05, 0.1];

export default function Survivor() {
  const { t } = useLang();
  const account = useAccount();
  const accountCta = useAccountCta();

  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [stakeSol, setStakeSol] = useState(STAKE_PRESETS[0]);
  const [picking, setPicking] = useState<string | null>(null); // `${marketId}:${outcome}`
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    document.title = t.survivorGame.docTitle;
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      setMarkets((await api("/api/survivor/markets")).markets ?? []);
      setBoard(await api("/api/survivor/leaderboard"));
      if (account.address) {
        setStatus(await api(`/api/survivor/status/${account.address}`));
      }
      setError("");
    } catch (e) {
      console.error("[survivor] refresh falhou:", e);
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, [account.address]);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 15_000);
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  async function pick(m: MarketView, outcome: number) {
    if (!account.address) return;
    setPicking(`${m.marketId}:${outcome}`);
    setError("");
    try {
      // 1) aposta real no mercado 1X2 (ticket-NFT na carteira)
      await account.placeBet(m.marketId, outcome, Math.round(stakeSol * 1e9));
      // 2) registra o pick da temporada — a wallet vem da sessão autenticada
      await api(
        "/api/survivor/pick",
        {
          name: account.displayName ?? undefined,
          marketId: m.marketId,
          outcome,
        },
        account.token
      );
      celebrateCorrect(3);
      playSfx("correct");
      refresh();
    } catch (e) {
      console.error("[survivor] pick falhou:", e);
      setError(String((e as Error).message));
    } finally {
      setPicking(null);
    }
  }

  function outcomeLabel(m: MarketView, i: number): string {
    return i === 0 ? m.home : i === 1 ? t.markets.draw : m.away;
  }

  function countdown(secs: number): string {
    if (secs <= 0) return t.markets.closed;
    const h = Math.floor(secs / 3600);
    const mnt = Math.floor((secs % 3600) / 60);
    return h > 0
      ? `${h}h ${String(mnt).padStart(2, "0")}m`
      : `${mnt}:${String(secs % 60).padStart(2, "0")}`;
  }

  const resultLabel: Record<PickRecord["result"], string> = {
    pending: t.survivorGame.resultPending,
    survived: t.survivorGame.resultSurvived,
    eliminated: t.survivorGame.resultEliminated,
    void: t.survivorGame.resultVoid,
  };

  const visible = markets.filter((m) => m.status === "open" && m.closeTs > now);
  const alive = status?.alive ?? true;
  const roundsWithPick = new Set(
    (status?.picks ?? [])
      .filter((p) => p.result !== "void")
      .map((p) => p.round)
  );

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
          <h1 className="game-question">{t.survivorGame.title}</h1>
          <p className="game-sub">{t.survivorGame.sub}</p>
        </header>

        <HowTo steps={t.howto.survivor.steps} profit={t.howto.survivor.profit} />

        {error && <p className="dim center run-error">⚠️ {error}</p>}
        {!account.address && <LoginPanel note={t.survivorGame.connectFirst} />}

        {/* estado da temporada */}
        {account.address && status && (
          <div className="scoreboard survivor-status">
            <div>
              <span className="label">status</span>
              <strong>{alive ? t.survivorGame.aliveBadge : t.survivorGame.deadBadge}</strong>
            </div>
            <div>
              <span className="label">🛡️</span>
              <strong>{t.survivorGame.survivedRounds(status.survived)}</strong>
            </div>
            {board && board.totalPlayers > 0 && (
              <div>
                <span className="label">👥</span>
                <strong>
                  {t.survivorGame.onlyRemain(board.aliveCount, board.totalPlayers)}
                </strong>
              </div>
            )}
          </div>
        )}

        {account.address && !alive ? (
          <div className="endgame">
            <p>💀 {t.survivorGame.eliminated}</p>
          </div>
        ) : (
          <>
            <p className="dim center">{t.survivorGame.pickNote}</p>
            <div className="stake-row center-row">
              <span className="staked-label-inline">{t.markets.stakeLabel}:</span>
              {STAKE_PRESETS.map((s) => (
                <button
                  key={s}
                  className={`stake-chip mono ${stakeSol === s ? "selected" : ""}`}
                  onClick={() => setStakeSol(s)}
                >
                  {s} SOL
                </button>
              ))}
            </div>

            {loading ? (
              <p className="dim center">{t.survivorGame.loading}</p>
            ) : !visible.length ? (
              <div className="endgame">
                <p>{t.survivorGame.empty}</p>
                <button onClick={refresh}>{t.markets.refresh}</button>
              </div>
            ) : (
              <div className="market-list">
                {visible.map((m) => {
                  const secs = Math.max(0, m.closeTs - now);
                  const round = new Date(m.closeTs * 1000).toISOString().slice(0, 10);
                  const roundTaken = roundsWithPick.has(round);
                  return (
                    <div key={m.marketId} className="card market-card">
                      <div className="market-head">
                        <strong>
                          <span aria-hidden="true">{teamFlag(m.home)}</span> {m.home}{" "}
                          <em>vs</em> {m.away}{" "}
                          <span aria-hidden="true">{teamFlag(m.away)}</span>
                        </strong>
                        <span className="badge mono">
                          {m.demo ? `${t.markets.demoTag} · ` : ""}
                          {t.markets.locksIn} {countdown(secs)}
                        </span>
                      </div>
                      {roundTaken ? (
                        <p className="dim market-ok">{t.survivorGame.picked}</p>
                      ) : (
                        <div className="outcome-row">
                          {[0, 1, 2].map((i) => (
                            <button
                              key={i}
                              className="outcome-btn"
                              disabled={picking !== null || !account.address}
                              onClick={() => pick(m, i)}
                            >
                              <span className="outcome-name">{outcomeLabel(m, i)}</span>
                              <span className="outcome-pct mono">{m.poolPct[i]}%</span>
                              <small className="mono">{formatSol(m.pools[i], 4)}</small>
                              {picking === `${m.marketId}:${i}` && (
                                <small>{t.survivorGame.picking}</small>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* histórico de picks */}
        {status && status.picks.length > 0 && (
          <>
            <h2 className="staked-label">{t.survivorGame.myPicks}</h2>
            <div className="market-list">
              {status.picks.map((p, i) => (
                <div key={`${p.marketId}${i}`} className="card market-card pick-row">
                  <span>
                    {p.home} <em>vs</em> {p.away} ·{" "}
                    <b>{p.outcome === 0 ? p.home : p.outcome === 1 ? t.markets.draw : p.away}</b>
                  </span>
                  <span className={`badge mono pick-${p.result}`}>
                    {resultLabel[p.result]}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ranking de sobreviventes */}
        {board && board.top.length > 0 && (
          <div className="card lb-card">
            <h3 className="lb-title">{t.lb.title}</h3>
            <ol className="lb-list">
              {board.top.map((r) => (
                <li
                  key={r.wallet}
                  className={`lb-row mono ${r.wallet === account.address ? "lb-you" : ""}`}
                >
                  <span className="lb-rank">#{r.rank}</span>
                  <span className="lb-name">
                    {r.alive ? "🛡️" : "💀"}{" "}
                    {r.name ?? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}`}
                    {r.wallet === account.address && <em> · {t.lb.you}</em>}
                  </span>
                  <span className="lb-pts">{t.survivorGame.survivedRounds(r.survived)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}
