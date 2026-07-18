import { useEffect, useRef, useState } from "react";
import { useLang } from "./i18n";
import { useAccount } from "./chain/account";
import { formatSol } from "./chain/oddies";
import chainplayLogo from "./assets/chainplay-logo.png";

export interface BackBarAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

/** Chip de conta com dropdown: endereço completo (com copiar), saldo e sair.
 *  Só apresentação — logout e saldo vêm do contexto de conta existente. */
function AccountMenu() {
  const { t } = useLang();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!account.address) return null;

  const short = `${account.address.slice(0, 4)}…${account.address.slice(-4)}`;
  const label =
    account.mode === "custodial" && account.displayName
      ? `${account.displayName} · ${short}`
      : short;

  async function copyAddress() {
    if (!account.address) return;
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard bloqueado: sem feedback, o endereço segue visível */
    }
  }

  return (
    <div className="acct-menu" ref={rootRef}>
      <button
        className="btn primary small acct-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.auth.menuAria}
        onClick={() => setOpen((o) => !o)}
      >
        👛 <span className="acct-trigger-label">{label}</span>{" "}
        <span className="acct-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="acct-pop" role="menu">
          <div className="acct-row">
            <span className="acct-label">{t.auth.addressLabel}</span>
            <code className="acct-addr mono">{account.address}</code>
            <button className="acct-copy" onClick={copyAddress}>
              {copied ? t.auth.copied : `⧉ ${t.auth.copy}`}
            </button>
          </div>

          {account.custodialBalance != null && (
            <div className="acct-row">
              <span className="acct-label">{t.staked.balanceLabel}</span>
              <strong className="acct-balance mono">
                {formatSol(account.custodialBalance)}
              </strong>
            </div>
          )}

          <button className="acct-logout" onClick={() => account.logout()}>
            ⏻ {t.auth.logout}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Barra mínima das telas internas de jogo: logo + "Voltar aos jogos".
 * Substitui o navbar completo (só a Landing e o Hub têm navbar cheio).
 * Logado, o slot da direita vira o menu de conta (endereço + saldo + sair);
 * deslogado, mostra o `action` da tela (em geral o conectar wallet).
 */
export default function BackBar({ action }: { action?: BackBarAction }) {
  const { t } = useLang();
  const account = useAccount();

  const actionEl = account.address ? (
    <AccountMenu />
  ) : action ? (
    action.href ? (
      <a className="btn primary small" href={action.href}>
        {action.label}
      </a>
    ) : (
      <button className="btn primary small nav-cta-btn" onClick={action.onClick}>
        {action.label}
      </button>
    )
  ) : null;

  return (
    <nav className="backbar">
      <a className="logo" href="#/" aria-label="ChainPlay">
        <img src={chainplayLogo} alt="ChainPlay" className="logo-img" />
      </a>

      <a className="backbar-back" href="#/jogos">
        <span aria-hidden="true">‹</span>{" "}
        <span className="backbar-back-label">{t.nav.backToGames}</span>
      </a>

      <div className="backbar-action">{actionEl}</div>
    </nav>
  );
}
