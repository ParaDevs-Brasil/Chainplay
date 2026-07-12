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
  /** abre o modal do web3 connect */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

const RPC_URL = "https://api.devnet.solana.com";

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

  // O modal do react-ui só faz o select() da wallet — quem conecta somos nós.
  useEffect(() => {
    if (!wantConnect.current || !adapter.wallet || adapter.connected || adapter.connecting) {
      return;
    }
    wantConnect.current = false;
    adapter.connect().catch((e) => setError(connectErrorMessage(e)));
  }, [adapter.wallet, adapter.connected, adapter.connecting, adapter, setError]);

  // wallets "detectáveis": instaladas (Installed) ou carregáveis (Loadable)
  const anyWallet = adapter.wallets.some(
    (w) => w.readyState === "Installed" || w.readyState === "Loadable"
  );

  const provider: InjectedProvider | null = useMemo(() => {
    if (!adapter.publicKey || !adapter.signTransaction) return null;
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
  }, [adapter.publicKey, adapter.signTransaction, adapter.signAllTransactions]);

  async function connect() {
    setError(null);
    if (!anyWallet) {
      setError(
        "Nenhuma wallet Solana encontrada — instale Phantom, Backpack ou Solflare e recarregue a página."
      );
      return;
    }
    wantConnect.current = true;
    // wallet já selecionada antes (ex.: reconexão): conecta direto
    if (adapter.wallet && !adapter.connected) {
      wantConnect.current = false;
      await adapter.connect().catch((e) => setError(connectErrorMessage(e)));
      return;
    }
    setVisible(true);
  }

  async function disconnect() {
    setError(null);
    await adapter.disconnect().catch(() => {});
  }

  return (
    <Ctx.Provider
      value={{
        address: adapter.publicKey?.toBase58() ?? null,
        publicKey: adapter.publicKey,
        walletName: adapter.wallet?.adapter.name ?? null,
        connecting: adapter.connecting,
        unavailable: !anyWallet,
        error,
        provider,
        connect,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

function connectErrorMessage(e: { message?: string; name?: string }): string {
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
