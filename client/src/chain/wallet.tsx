import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

/** Provider injetado (Phantom/Solflare/Backpack seguem a mesma interface). */
export interface InjectedProvider {
  publicKey: PublicKey | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
  on?(event: string, cb: (...args: any[]) => void): void;
}

export function detectProvider(): { name: string; provider: InjectedProvider } | null {
  const w = window as any;
  if (w.phantom?.solana?.isPhantom) return { name: "Phantom", provider: w.phantom.solana };
  if (w.solana?.isPhantom) return { name: "Phantom", provider: w.solana };
  if (w.backpack?.isBackpack) return { name: "Backpack", provider: w.backpack };
  if (w.solflare?.isSolflare) return { name: "Solflare", provider: w.solflare };
  if (w.solana) return { name: "Wallet", provider: w.solana };
  return null;
}

interface WalletCtx {
  /** base58 da wallet conectada, ou null */
  address: string | null;
  publicKey: PublicKey | null;
  walletName: string | null;
  connecting: boolean;
  /** nenhuma wallet instalada no navegador */
  unavailable: boolean;
  provider: InjectedProvider | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

const AUTOCONNECT_KEY = "chainplay-wallet-autoconnect";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [provider, setProvider] = useState<InjectedProvider | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // reconecta silenciosamente quem já autorizou o site antes
  useEffect(() => {
    const detected = detectProvider();
    if (!detected) {
      setUnavailable(true);
      return;
    }
    setProvider(detected.provider);
    setWalletName(detected.name);
    detected.provider.on?.("accountChanged", (pk: PublicKey | null) => {
      setPublicKey(pk ?? null);
    });
    detected.provider.on?.("disconnect", () => setPublicKey(null));
    if (localStorage.getItem(AUTOCONNECT_KEY) === "1") {
      detected.provider
        .connect({ onlyIfTrusted: true })
        .then(({ publicKey }) => setPublicKey(publicKey))
        .catch(() => {});
    }
  }, []);

  async function connect() {
    const detected = detectProvider();
    if (!detected) {
      setUnavailable(true);
      return;
    }
    setConnecting(true);
    try {
      const { publicKey } = await detected.provider.connect();
      setProvider(detected.provider);
      setWalletName(detected.name);
      setPublicKey(publicKey);
      localStorage.setItem(AUTOCONNECT_KEY, "1");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    localStorage.removeItem(AUTOCONNECT_KEY);
    try {
      await provider?.disconnect();
    } finally {
      setPublicKey(null);
    }
  }

  return (
    <Ctx.Provider
      value={{
        address: publicKey?.toBase58() ?? null,
        publicKey,
        walletName,
        connecting,
        unavailable,
        provider,
        connect,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet fora do WalletProvider");
  return ctx;
}
