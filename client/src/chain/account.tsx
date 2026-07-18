import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "./wallet";
import { api } from "./http";
import { claimTicket, placeBet as walletPlaceBet, type PlacedBet } from "./oddies";
import { useLang } from "../i18n";

/**
 * Conta unificada: wallet de extensão (não-custodial) OU sessão social
 * (Google/convidado, wallet custodial no server). As páginas de jogo só
 * falam com esta camada — apostar/resgatar funciona igual nos dois modos.
 */

const SESSION_KEY = "chainplay-session";

interface SessionInfo {
  token: string;
  address: string;
  provider: "google" | "guest" | "wallet";
  name: string | null;
  email: string | null;
}

interface AuthConfig {
  googleEnabled: boolean;
}

interface AccountCtx {
  /** endereço ativo (wallet conectada tem prioridade sobre sessão social) */
  address: string | null;
  /** Bearer da sessão de backend — exigido pelas rotas de jogo (runs/penalty/survivor) */
  token: string | null;
  mode: "wallet" | "custodial" | null;
  displayName: string | null;
  busy: boolean;
  error: string | null;
  authConfig: AuthConfig;
  /** API fora do ar — só o web3 connect (wallet) funciona */
  apiOffline: boolean;
  /** saldo da wallet custodial em lamports (null = desconhecido) */
  custodialBalance: number | null;
  connectWallet(): Promise<void>;
  loginGoogle(credential: string): Promise<void>;
  logout(): Promise<void>;
  placeBet(
    marketId: string,
    outcome: number,
    lamports: number,
    gameId?: number
  ): Promise<PlacedBet>;
  claim(market: string, ticketMint: string, ticketAccount: string): Promise<void>;
}

const Ctx = createContext<AccountCtx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [session, setSession] = useState<SessionInfo | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    } catch {
      return null;
    }
  });
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    googleEnabled: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custodialBalance, setCustodialBalance] = useState<number | null>(null);
  const [apiOffline, setApiOffline] = useState(false);

  // sonda a API; se estiver fora, re-tenta até voltar (o web3 connect
  // continua funcionando enquanto isso, direto na chain)
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const probe = () => {
      api("/api/auth/config")
        .then((cfg) => {
          if (cancelled) return;
          setAuthConfig(cfg);
          setApiOffline(false);
        })
        .catch(() => {
          if (cancelled) return;
          setApiOffline(true);
          timer = window.setTimeout(probe, 15_000);
        });
    };
    probe();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // valida a sessão persistida e busca o saldo custodial
  useEffect(() => {
    if (!session) {
      setCustodialBalance(null);
      return;
    }
    api("/api/auth/me", undefined, session.token)
      .then((me) => setCustodialBalance(me.balance))
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
      });
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  function adoptSession(info: SessionInfo) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(info));
    setSession(info);
    setError(null);
  }

  // Sign-In With Solana: quando a wallet conecta pelo web3 connect, cria uma
  // sessão no backend assinando um nonce (uma assinatura, sessão de 7 dias).
  // Melhor esforço: se a wallet não suporta signMessage ou o usuário recusar,
  // o jogo on-chain segue funcionando só com a wallet conectada.
  const siwsAttempted = useRef<string | null>(null);
  useEffect(() => {
    const address = wallet.address;
    const sign = wallet.signMessage;
    if (!address || !sign || apiOffline) return;
    if (session?.provider === "wallet" && session.address === address) return;
    if (siwsAttempted.current === address) return;
    siwsAttempted.current = address;

    let cancelled = false;
    (async () => {
      try {
        const challenge = await api("/api/auth/wallet/nonce", { address });
        const signature = await sign(new TextEncoder().encode(challenge.message));
        const info = await api("/api/auth/wallet/verify", {
          address,
          signature: btoa(String.fromCharCode(...signature)),
        });
        if (!cancelled) adoptSession(info);
      } catch (e) {
        // recusa do usuário ou API sem suporte — segue sem sessão de backend
        console.warn("[account] SIWS automático não completou:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, wallet.signMessage, apiOffline]);

  const loginGoogle = useCallback(async (credential: string) => {
    setBusy(true);
    setError(null);
    try {
      adoptSession(await api("/api/auth/google", { credential }));
    } catch (e) {
      console.error("[account] login Google falhou:", e);
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    siwsAttempted.current = null;
    if (session) {
      api("/api/auth/logout", {}, session.token).catch(() => {});
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    }
    if (wallet.address) await wallet.disconnect();
  }, [session, wallet]);

  // wallet conectada tem prioridade (não-custodial primeiro)
  const mode: AccountCtx["mode"] = wallet.address
    ? "wallet"
    : session
    ? "custodial"
    : null;
  const address = wallet.address ?? session?.address ?? null;

  const placeBet = useCallback(
    // gameId declara o jogo (coleção do ticket-NFT); sem ele vale o principal do mercado
    async (
      marketId: string,
      outcome: number,
      lamports: number,
      gameId?: number
    ): Promise<PlacedBet> => {
      if (wallet.address && wallet.provider) {
        return walletPlaceBet(wallet.provider, marketId, outcome, lamports, gameId);
      }
      if (session) {
        const r = await api(
          "/api/custodial/place-bet",
          { marketId, outcome, lamports, gameId },
          session.token
        );
        return { ...r, bet: "" };
      }
      throw new Error("conecte a wallet ou faça login primeiro");
    },
    [wallet.address, wallet.provider, session]
  );

  const claim = useCallback(
    async (market: string, ticketMint: string, ticketAccount: string) => {
      if (wallet.address && wallet.provider) {
        await claimTicket(wallet.provider, market, ticketMint, ticketAccount);
        return;
      }
      if (session) {
        await api("/api/custodial/claim", { market, ticketMint, ticketAccount }, session.token);
        return;
      }
      throw new Error("conecte a wallet ou faça login primeiro");
    },
    [wallet.address, wallet.provider, session]
  );

  return (
    <Ctx.Provider
      value={{
        address,
        token: session?.token ?? null,
        mode,
        displayName:
          mode === "wallet"
            ? wallet.walletName
            : session?.name ?? (session ? "Convidado" : null),
        busy: busy || wallet.connecting,
        error: error ?? wallet.error,
        authConfig,
        apiOffline,
        custodialBalance,
        connectWallet: wallet.connect,
        loginGoogle,
        logout,
        placeBet,
        claim,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAccount(): AccountCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount fora do AccountProvider");
  return ctx;
}

/* ---------- botão oficial do Google (Google Identity Services) ---------- */

const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;

function GoogleButton({ onCredential }: { onCredential: (c: string) => void }) {
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !slot.current) return;
    const render = () => {
      const g = (window as any).google?.accounts?.id;
      if (!g || !slot.current) return;
      g.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp: { credential: string }) => onCredential(resp.credential),
      });
      g.renderButton(slot.current, { theme: "filled_black", size: "large", shape: "pill" });
    };
    if ((window as any).google?.accounts?.id) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [onCredential]);

  return <div ref={slot} className="google-btn-slot" />;
}

/* ---------- painel de login compartilhado pelas páginas ---------- */

export function LoginPanel({ note }: { note?: string }) {
  const { t } = useLang();
  const account = useAccount();
  const wallet = useWallet();
  // Google é conta custodial assinada pelo server — sem API não funciona;
  // o web3 connect fala direto com a chain e segue de pé.
  const googleReady =
    !account.apiOffline && account.authConfig.googleEnabled && Boolean(GOOGLE_CLIENT_ID);

  return (
    <div className="endgame login-panel">
      <p>{note ?? t.auth.title}</p>

      <div className="login-options">
        <button className="primary" disabled={account.busy} onClick={account.connectWallet}>
          {account.busy ? t.auth.working : t.auth.withWallet}
        </button>

        {googleReady && <GoogleButton onCredential={account.loginGoogle} />}
      </div>

      {account.apiOffline && <p className="dim login-hint">{t.auth.apiOfflineHint}</p>}
      {!googleReady && !account.apiOffline && (
        <p className="dim login-hint">{t.auth.googleSetupHint}</p>
      )}
      {wallet.unavailable && <p className="dim login-hint">{t.auth.noWalletHint}</p>}
      {account.error && <p className="dim login-error">⚠️ {account.error}</p>}
    </div>
  );
}

/** chip de conta pra navbar: quem está logado + sair */
export function useAccountCta() {
  const { t } = useLang();
  const account = useAccount();
  if (!account.address) return null;
  const label =
    account.mode === "custodial"
      ? `${account.displayName} · ${account.address.slice(0, 4)}…`
      : `${account.address.slice(0, 4)}…${account.address.slice(-4)}`;
  return { label: `${label} · ${t.auth.logout}`, onClick: () => account.logout() };
}
