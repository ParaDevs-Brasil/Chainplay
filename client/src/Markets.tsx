import { useCallback, useEffect, useState } from "react";
import BackBar from "./BackBar";
import { useLang } from "./i18n";
import { LoginPanel, useAccount, useAccountCta } from "./chain/account";
import { api } from "./chain/http";
import { formatSol } from "./chain/oddies";
import { celebrateCorrect } from "./celebration";
import { playSfx } from "./sfx";
import { teamFlag } from "./flags";

interface MarketView {
  marketId: string;
  pda: string;
  home: string;
  away: string;
  closeTs: number;
  status: "open" | "resolved" | "voided";
  winningOutcome?: number;
  demo?: boolean;
  pools: number[];
  totalPool: number;
  poolPct: number[];
  secondsToClose: number;
}

const STAKE_PRESETS = [0.01, 0.05, 0.1];

export default function Markets() {
  const { t } = useLang();
  const account = useAccount();
  const accountCta = useAccountCta();
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [loading, setLoading] = useState(true);
  const [stakeSol, setStakeSol] = useState(STAKE_PRESETS[0]);
  const [betting, setBetting] = useState<string | null>(null); // `${marketId}:${outcome}`
  const [placed, setPlaced] = useState<Record<string, number>>({}); // marketId → outcome
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    document.title = t.markets.docTitle;
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      const json = await api("/api/markets");
      setMarkets(json.markets ?? []);
      setError("");
    } catch (e) {
      console.error("[markets] refresh falhou:", e);
      setError(t.markets.serverOffline);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // pools atualizam a cada 15s; countdown a cada 1s
  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 15_000);
    const tick = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  async function bet(m: MarketView, outcome: number) {
    if (!account.address) return;
    const key = `${m.marketId}:${outcome}`;
    setBetting(key);
    setError("");
    try {
      await account.placeBet(m.marketId, outcome, Math.round(stakeSol * 1e9));
      setPlaced((p) => ({ ...p, [m.marketId]: outcome }));
      celebrateCorrect(3);
      playSfx("correct");
      refresh();
    } catch (e) {
      console.error("[markets] aposta falhou:", e);
      setError(`${t.markets.error}: ${String((e as Error).message)}`);
    } finally {
      setBetting(null);
    }
  }

  function outcomeLabel(m: MarketView, i: number): string {
    return i === 0 ? m.home : i === 1 ? t.markets.draw : m.away;
  }

  function countdown(secs: number): string {
    if (secs <= 0) return t.markets.closed;
    const h = Math.floor(secs / 3600);
    const mnt = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}h ${String(mnt).padStart(2, "0")}m`
      : `${mnt}:${String(s).padStart(2, "0")}`;
  }

  // só jogos que ainda não começaram — o server já filtra, e o countdown
  // local esconde o mercado assim que o lock passa
  const visible = markets.filter((m) => m.status === "open" && m.closeTs > now);

  return (
    <div className="game-page markets-page">
      <BackBar
        action={
          accountCta ?? {
            label: account.busy ? t.staked.connecting : t.markets.connect,
            onClick: () => account.connectWallet(),
          }
        }
      />

      <div className="shell">
        <header className="game-hero hilo-hero">
          <span className="hilo-hero-badge">{t.hiloUi.heroBadge}</span>
          <h1 className="hilo-display">
            <span>{t.marketsUi.heroTitleA}</span>
            <span className="accent">{t.marketsUi.heroTitleB}</span>
          </h1>
          <p className="game-sub">{t.marketsUi.heroTag}</p>
        </header>

        {/* o loop do jogo como trilho conectado — mesma linguagem da timeline
            de assinatura, com os chips 1·X·2 ecoando os botões reais abaixo */}
        <ol className="mkt-flow">
          <li>
            <span className="mkt-flow-glyph">
              <span className="mkt-flow-chip mono">◎ SOL</span>
            </span>
            <span className="mkt-flow-label">{t.marketsUi.flow[0]}</span>
          </li>
          <li>
            <span className="mkt-flow-glyph">
              <span className="mkt-mini-tag mono">1</span>
              <span className="mkt-mini-tag mono">X</span>
              <span className="mkt-mini-tag mono">2</span>
            </span>
            <span className="mkt-flow-label">{t.marketsUi.flow[1]}</span>
          </li>
          <li>
            <span className="mkt-flow-glyph">✍️</span>
            <span className="mkt-flow-label">{t.marketsUi.flow[2]}</span>
          </li>
          <li>
            <span className="mkt-flow-glyph">🏆</span>
            <span className="mkt-flow-label">{t.marketsUi.flow[3]}</span>
          </li>
        </ol>

        {error && <p className="dim center run-error">⚠️ {error}</p>}
        {!account.address && <LoginPanel note={t.markets.connectFirst} />}

        {/* stake como campo de verdade: o clique nos resultados usa esse valor */}
        <div className="hilo-field mkt-stake">
          <h2 className="hilo-field-label center">{t.markets.stakeLabel}</h2>
          <div className="stake-row">
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
        
        </div>

        {loading ? (
          <p className="dim center">{t.markets.loading}</p>
        ) : !visible.length ? (
          <div className="endgame">
            <p>{t.markets.empty}</p>
            <button onClick={refresh}>{t.markets.refresh}</button>
          </div>
        ) : (
          <div className="market-list">
            {visible.map((m) => {
              const secs = Math.max(0, m.closeTs - now);
              const open = m.status === "open" && secs > 0;
              const myPick = placed[m.marketId];
              return (
                <div key={m.marketId} className="card market-card">
                  {/* sem título: os times já vivem nos botões 1 e 2 */}
                  <div className="market-head mkt-head-slim">
                    <span className="badge mono">
                      {m.demo ? `${t.markets.demoTag} · ` : ""}
                      {m.status === "resolved"
                        ? t.markets.resolvedTag
                        : m.status === "voided"
                        ? t.markets.voidedTag
                        : `⏱ ${t.markets.locksIn} ${countdown(secs)}`}
                    </span>
                  </div>

                  <div className="outcome-row">
                    {[0, 1, 2].map((i) => {
                      const key = `${m.marketId}:${i}`;
                      const winner = m.status === "resolved" && m.winningOutcome === i;
                      // estimativa parimutuel de agora: (pote + stake) / (lado + stake)
                      const stakeL = Math.round(stakeSol * 1e9);
                      const est = (m.totalPool + stakeL) / (m.pools[i] + stakeL);
                      return (
                        <button
                          key={i}
                          className={`outcome-btn ${myPick === i ? "picked" : ""} ${
                            winner ? "winner" : ""
                          }`}
                          disabled={!open || betting !== null || !account.address}
                          onClick={() => bet(m, i)}
                        >
                          <span className="mkt-tag mono" aria-hidden="true">
                            {i === 0 ? "1" : i === 1 ? "X" : "2"}
                          </span>
                          <span className="outcome-name">
                            {i !== 1 && (
                              <span className="flag" aria-hidden="true">
                                {teamFlag(i === 0 ? m.home : m.away)}{" "}
                              </span>
                            )}
                            {outcomeLabel(m, i)}
                          </span>
                          <span className="outcome-pct mono">{m.poolPct[i]}%</span>
                          <small className="mono">{formatSol(m.pools[i], 4)}</small>
                          <span className="mkt-est mono">
                            {t.marketsUi.est(
                              est.toLocaleString(undefined, {
                                maximumFractionDigits: 1,
                              })
                            )}
                          </span>
                          {betting === key ? (
                            <span className="mkt-bet-cta is-busy">
                              <span className="hilo-spinner" aria-hidden="true" />
                              {t.markets.betting}
                            </span>
                          ) : myPick === i ? (
                            <span className="mkt-bet-cta is-picked">
                              ✓ {t.markets.yourPick}
                            </span>
                          ) : open && account.address ? (
                            <span className="mkt-bet-cta">
                              {t.marketsUi.betCta(`${stakeSol} SOL`)}
                            </span>
                          ) : null}
                          {/* participação do lado no pote, visual */}
                          <span
                            className="mkt-share-bar"
                            aria-hidden="true"
                            style={{ width: `${m.poolPct[i]}%` }}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="market-foot mono">
                    💰 {formatSol(m.totalPool, 4)} {t.markets.inPool}
                  </div>
                  {myPick !== undefined && (
                    <p className="dim market-ok">{t.markets.betOk}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* nota do ≈× uma vez só, fora dos cards */}
        {!loading && visible.length > 0 && (
          <p className="dim center mkt-note">{t.marketsUi.estNote}</p>
        )}

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}
