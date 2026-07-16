import { useCallback, useEffect, useState } from "react";
import BackBar from "./BackBar";
import { useLang } from "./i18n";
import { LoginPanel, useAccount, useAccountCta } from "./chain/account";
import { ApiError, api } from "./chain/http";
import { formatSol } from "./chain/oddies";
import { celebrateWin } from "./celebration";
import { playSfx } from "./sfx";

interface TicketView {
  ticketMint: string;
  ticketAccount: string;
  market: string;
  marketId: string;
  outcome: number;
  stakeNet: number;
  status: "open" | "claimable" | "lost" | "claimed";
  payout: number;
  marketState: "open" | "resolved" | "voided";
  winningOutcome: number | null;
  kind: "parimutuel" | "houseBacked";
  label: string | null;
  closeTs: number;
}

type LoadState = "idle" | "loading" | "ready" | "error";

export default function WalletPage() {
  const { t } = useLang();
  const account = useAccount();
  const accountCta = useAccountCta();
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimedNow, setClaimedNow] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  function copyAddress() {
    if (!account.address) return;
    navigator.clipboard?.writeText(account.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  useEffect(() => {
    document.title = t.walletPage.docTitle;
  }, [t]);

  const refresh = useCallback(async () => {
    if (!account.address) return;
    setState("loading");
    setError("");
    try {
      const data = await api(`/api/tickets/${account.address}`);
      setTickets(data.tickets ?? []);
      setState("ready");
    } catch (e) {
      console.error("[wallet] listar tickets falhou:", e);
      const msg =
        e instanceof ApiError && e.status === 503
          ? t.walletPage.onchainOff
          : String((e as Error).message ?? e);
      setError(msg);
      setState("error");
    }
  }, [account.address, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onClaim(ticket: TicketView) {
    if (!account.address) return;
    setClaiming(ticket.ticketMint);
    try {
      await account.claim(ticket.market, ticket.ticketMint, ticket.ticketAccount);
      setClaimedNow((s) => new Set(s).add(ticket.ticketMint));
      celebrateWin();
      playSfx("win");
      refresh();
    } catch (e) {
      console.error("[wallet] claim falhou:", e);
      setError(`${t.walletPage.claimError}: ${String((e as Error).message ?? e)}`);
    } finally {
      setClaiming(null);
    }
  }

  const statusLabel: Record<TicketView["status"], string> = {
    open: t.walletPage.statusOpen,
    claimable: t.walletPage.statusClaimable,
    lost: t.walletPage.statusLost,
    claimed: t.walletPage.statusClaimed,
  };

  return (
    <div className="game-page wallet-page">
      <BackBar
        action={
          accountCta ?? {
            label: account.busy ? t.walletPage.connecting : t.walletPage.connect,
            onClick: () => account.connectWallet(),
          }
        }
      />

      <div className="shell">
        <header className="game-hero">
          <h1 className="game-question">{t.walletPage.title}</h1>
          <p className="game-sub">{t.walletPage.sub}</p>
        </header>

        {account.address && (
          <section className="wallet-card">
            <div className="wallet-id">
              <span className="wallet-avatar" aria-hidden="true">
                👛
              </span>
              <div className="wallet-id-text">
                <span className="wallet-name">{account.displayName}</span>
                <button
                  className="wallet-addr mono"
                  onClick={copyAddress}
                  title={account.address}
                >
                  {account.address.slice(0, 4)}…{account.address.slice(-4)}
                  <span className="wallet-copy">{copied ? "✓" : "⧉"}</span>
                </button>
              </div>
            </div>
            {account.mode === "custodial" && (
              <div className="wallet-balance mono">
                {t.auth.custodialBalance(formatSol(account.custodialBalance ?? 0))}
              </div>
            )}
          </section>
        )}
        {account.address && account.mode === "custodial" && (
          <p className="dim wallet-topup mono">
            {t.auth.custodialFund(account.address ?? "")}
          </p>
        )}

        {!account.address && <LoginPanel note={t.walletPage.connectFirst} />}

        {account.address && (
          <>
            {state === "loading" && <p className="dim center">{t.walletPage.loading}</p>}
            {state === "error" && (
              <div className="endgame wallet-state">
                <span className="wallet-state-icon" aria-hidden="true">
                  ⚠️
                </span>
                <p className="dim">{error}</p>
                <button onClick={refresh}>{t.walletPage.refresh}</button>
              </div>
            )}
            {state === "ready" && (
              <>
                {tickets.length === 0 ? (
                  <div className="endgame wallet-state">
                    <span className="wallet-state-icon" aria-hidden="true">
                      🎫
                    </span>
                    <p>{t.walletPage.empty}</p>
                    <a className="btn primary small" href="#/jogos">
                      {t.nav.games} →
                    </a>
                  </div>
                ) : (
                  <div className="ticket-list">
                    {tickets.map((ti) => {
                      const justClaimed = claimedNow.has(ti.ticketMint);
                      const status = justClaimed ? "claimed" : ti.status;
                      return (
                        <div key={ti.ticketMint} className={`card ticket-card ticket-${status}`}>
                          <div className="ticket-head">
                            <strong>
                              {ti.label ??
                                (ti.kind === "houseBacked"
                                  ? t.walletPage.kindRun
                                  : t.walletPage.kindMarket)}
                            </strong>
                            <span className="badge mono">{statusLabel[status]}</span>
                          </div>
                          <div className="ticket-meta mono">
                            <span>
                              {t.walletPage.outcomeLabel(ti.outcome)} · {t.walletPage.stake}{" "}
                              {formatSol(ti.stakeNet)}
                            </span>
                            <span>
                              {ti.status === "open"
                                ? t.walletPage.estPayout
                                : t.walletPage.payout}
                              : <b>{formatSol(ti.payout)}</b>
                            </span>
                          </div>
                          {status === "claimable" && (
                            <button
                              className="primary"
                              disabled={claiming === ti.ticketMint}
                              onClick={() => onClaim(ti)}
                            >
                              {claiming === ti.ticketMint
                                ? t.walletPage.claiming
                                : `${t.walletPage.claim} · ${formatSol(ti.payout)}`}
                            </button>
                          )}
                          {justClaimed && (
                            <span className="pending-chip">{t.walletPage.claimed}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="center">
                  <button onClick={refresh}>{t.walletPage.refresh}</button>
                </div>
              </>
            )}
          </>
        )}

        <footer>{t.game.gameFooter}</footer>
      </div>
    </div>
  );
}
