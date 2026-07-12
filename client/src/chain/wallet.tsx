import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider as AdapterWalletProvider,
  useWallet as useAdapterWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Web3 connect via Solana Wallet Adapter oficial: modal multi-wallet,
 * auto-connect e detecção de qualquer wallet compatível com o Wallet
 * Standard (Phantom, Backpack, Solflare…). Este arquivo faz a ponte entre
 * o adapter e a interface `useWallet` que o resto do app consome.
 */

/** Interface de assinatura que o oddies.ts espera (compatível com o adapter). */
export interface InjectedProvider {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

interface WalletCtx {
  /** base58 da wallet conectada, ou null */
  address: string | null;
  publicKey: PublicKey | null;
  walletName: string | null;
  connecting: boolean;
  /** nenhuma wallet instalada/detectada até agora */
  unavailable: boolean;
  /** último erro de conexão, legível pro usuário */
  error: string | null;
  provider: InjectedProvider | null;
  /** assina uma mensagem arbitrária (Sign-In With Solana) — nem toda wallet suporta */
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  /** abre o modal do web3 connect */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

const RPC_URL = "https://api.devnet.solana.com";

/** Provider Solana injetado direto na página (fora do Wallet Standard):
 *  MetaMask com suporte a Solana, forks e wallets antigas. É o fallback
 *  quando o modal não reconhece a wallet do usuário. */
interface RawInjected extends InjectedProvider {
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect?(): Promise<void>;
  /** Phantom-like: retorna { signature } ou a assinatura direto */
  signMessage?(
    message: Uint8Array,
    encoding?: string
  ): Promise<Uint8Array | { signature: Uint8Array }>;
  isPhantom?: boolean;
  isMetaMask?: boolean;
  on?(event: string, cb: (...args: any[]) => void): void;
}

function detectInjected(): { name: string; provider: RawInjected } | null {
  const w = window as any;
  const candidates: Array<[string, RawInjected | undefined]> = [
    ["Phantom", w.phantom?.solana],
    ["Solflare", w.solflare?.isSolflare ? w.solflare : undefined],
    ["Backpack", w.backpack?.isBackpack ? w.backpack : undefined],
    ["", w.solana],
  ];
  for (const [label, p] of candidates) {
    if (!p || typeof p.connect !== "function") continue;
    const name =
      label ||
      (p.isMetaMask ? "MetaMask" : p.isPhantom ? "Phantom" : "Wallet Solana");
    return { name, provider: p };
  }
  return null;
}

const FALLBACK_AUTOCONNECT_KEY = "chainplay-injected-autoconnect";

function Bridge({
  error,
  setError,
  children,
}: {
  error: string | null;
  setError: (e: string | null) => void;
  children: ReactNode;
}) {
  const adapter = useAdapterWallet();
  const { setVisible } = useWalletModal();
  const wantConnect = useRef(false);

  // conexão direta com provider injetado (MetaMask etc.), fora do modal
  const [fallback, setFallback] = useState<{
    name: string;
    provider: RawInjected;
    publicKey: PublicKey;
  } | null>(null);
  const [fallbackConnecting, setFallbackConnecting] = useState(false);

  async function connectInjected(silent = false) {
    const detected = detectInjected();
    if (!detected) return false;
    setFallbackConnecting(true);
    try {
      const { publicKey } = await detected.provider.connect(
        silent ? { onlyIfTrusted: true } : undefined
      );
      setFallback({ ...detected, publicKey });
      detected.provider.on?.("disconnect", () => setFallback(null));
      detected.provider.on?.("accountChanged", (pk: PublicKey | null) => {
        setFallback((f) => (f && pk ? { ...f, publicKey: pk } : null));
      });
      localStorage.setItem(FALLBACK_AUTOCONNECT_KEY, "1");
      return true;
    } catch (e) {
      if (!silent) setError(connectErrorMessage(e as Error));
      return false;
    } finally {
      setFallbackConnecting(false);
    }
  }

  // reconexão silenciosa do fallback (a extensão pode injetar tarde)
  useEffect(() => {
    if (localStorage.getItem(FALLBACK_AUTOCONNECT_KEY) !== "1") return;
    let cancelled = false;
    const attempt = (wait: number) => {
      if (cancelled) return;
      if (detectInjected()) {
        connectInjected(true);
        return;
      }
      if (wait < 3000) window.setTimeout(() => attempt(wait + 300), 300);
    };
    attempt(0);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O modal do react-ui só faz o select() da wallet — quem conecta somos nós.
  useEffect(() => {
    if (!wantConnect.current || !adapter.wallet || adapter.connected || adapter.connecting) {
      return;
    }
    wantConnect.current = false;
    const chosen = adapter.wallet;
    const ready =
      chosen.readyState === "Installed" || chosen.readyState === "Loadable";
    if (!ready) {
      // wallet listada mas não instalada neste navegador: orienta e abre o site
      setError(notInstalledMessage(chosen.adapter.name));
      window.open(chosen.adapter.url, "_blank", "noopener");
      return;
    }
    adapter.connect().catch((e) => setError(connectErrorMessage(e)));
  }, [adapter.wallet, adapter.connected, adapter.connecting, adapter, setError]);

  const anyInstalled = adapter.wallets.some((w) => w.readyState === "Installed");
  const anyLoadable = adapter.wallets.some((w) => w.readyState === "Loadable");

  const provider: InjectedProvider | null = useMemo(() => {
    if (adapter.publicKey && adapter.signTransaction) {
      return {
        publicKey: adapter.publicKey,
        signTransaction: adapter.signTransaction,
        signAllTransactions:
          adapter.signAllTransactions ??
          (async (txs) => {
            const out = [] as typeof txs;
            for (const tx of txs) out.push(await adapter.signTransaction!(tx));
            return out;
          }),
      };
    }
    return fallback?.provider ?? null;
  }, [adapter.publicKey, adapter.signTransaction, adapter.signAllTransactions, fallback]);

  async function connect() {
    setError(null);
    // 1) wallets reconhecidas pelo Wallet Standard → modal oficial
    if (anyInstalled) {
      const chosenReady =
        adapter.wallet &&
        (adapter.wallet.readyState === "Installed" ||
          adapter.wallet.readyState === "Loadable");
      // reconecta direto só se a seleção anterior existe NESTE navegador
      if (chosenReady && !adapter.connected) {
        await adapter.connect().catch((e) => setError(connectErrorMessage(e)));
        return;
      }
      // seleção antiga de outra wallet (ex.: Phantom salvo no localStorage
      // antes de instalar a Solflare) — descarta e deixa o usuário escolher
      if (adapter.wallet && !chosenReady) {
        adapter.select(null);
      }
      wantConnect.current = true;
      setVisible(true);
      return;
    }
    // 2) provider injetado fora do padrão (MetaMask com Solana etc.)
    if (await connectInjected()) return;
    // 3) só opções "carregáveis" (ex.: Solflare web) → ainda dá pro modal
    if (anyLoadable) {
      wantConnect.current = true;
      setVisible(true);
      return;
    }
    setError(notInstalledMessage());
  }

  async function disconnect() {
    setError(null);
    localStorage.removeItem(FALLBACK_AUTOCONNECT_KEY);
    if (fallback) {
      await fallback.provider.disconnect?.().catch(() => {});
      setFallback(null);
    }
    await adapter.disconnect().catch(() => {});
  }

  const activePk = adapter.publicKey ?? fallback?.publicKey ?? null;

  const signMessage = useMemo(() => {
    if (adapter.publicKey && adapter.signMessage) return adapter.signMessage;
    const raw = fallback?.provider;
    if (raw?.signMessage) {
      return async (message: Uint8Array) => {
        const result = await raw.signMessage!(message, "utf8");
        return result instanceof Uint8Array ? result : result.signature;
      };
    }
    return null;
  }, [adapter.publicKey, adapter.signMessage, fallback]);

  return (
    <Ctx.Provider
      value={{
        address: activePk?.toBase58() ?? null,
        publicKey: activePk,
        walletName: adapter.publicKey
          ? adapter.wallet?.adapter.name ?? null
          : fallback?.name ?? null,
        connecting: adapter.connecting || fallbackConnecting,
        unavailable: !anyInstalled && !anyLoadable && !detectInjected(),
        error,
        provider,
        signMessage,
        connect,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Orientação quando não há wallet Solana utilizável neste navegador.
 *  MetaMask (Ethereum) e Freighter (Stellar) não contam — precisa ser Solana.
 *  No Firefox a opção com extensão é a Solflare; Phantom/Backpack são
 *  Chrome/Brave/Edge. Enquanto isso, o modo convidado funciona sem wallet. */
function notInstalledMessage(walletName?: string): string {
  const isFirefox = /firefox/i.test(navigator.userAgent);
  const suggestion = isFirefox
    ? "No Firefox, instale a extensão Solflare (solflare.com) — Phantom e Backpack não têm versão pra Firefox."
    : "Instale Phantom, Backpack ou Solflare e recarregue a página.";
  const prefix = walletName
    ? `${walletName} não está instalada neste navegador.`
    : "Nenhuma wallet Solana encontrada (MetaMask/Freighter não servem — são de outras redes).";
  return `${prefix} ${suggestion} Sem wallet, dá pra jogar como convidado.`;
}

function connectErrorMessage(e: { message?: string; name?: string }): string {
  if (e?.name === "WalletNotReadyError") {
    return "Essa wallet não está instalada neste navegador — instale a extensão e recarregue a página.";
  }
  if (/reject|denied|cancel/i.test(`${e?.name} ${e?.message}`)) {
    return "Conexão recusada na wallet — tente de novo e aprove o popup.";
  }
  return e?.message || "Falha ao conectar a wallet.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  // Phantom/Solflare explícitos cobrem providers injetados legados;
  // wallets Wallet Standard (Backpack etc.) são detectadas automaticamente.
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <AdapterWalletProvider
        wallets={wallets}
        autoConnect
        onError={(e: any) => {
          // WalletNotReadyError acontece no autoConnect quando a wallet
          // escolhida numa visita anterior não existe neste navegador —
          // o fluxo de clique já orienta o usuário; aqui é só ruído.
          if (e?.name === "WalletNotReadyError") return;
          console.warn("[wallet-adapter]", e?.name, e?.message, e?.error?.message ?? "");
          setError(connectErrorMessage(e));
        }}
      >
        <WalletModalProvider>
          <Bridge error={error} setError={setError}>
            {children}
          </Bridge>
        </WalletModalProvider>
      </AdapterWalletProvider>
    </ConnectionProvider>
  );
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet fora do WalletProvider");
  return ctx;
}
