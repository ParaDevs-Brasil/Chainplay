import { Buffer } from "buffer";
// web3.js e anchor esperam o Buffer global do Node no browser
(globalThis as any).Buffer ??= Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import App from "./App";

// Só em dev: expõe as classes do web3 pra testes E2E de browser injetarem
// uma wallet falsa (ver client/e2e/). Nunca vai pro bundle de produção.
if (import.meta.env.DEV) {
  (window as any).__cp = { Keypair, PublicKey, Transaction };
}
import { LanguageProvider } from "./i18n";
import { WalletProvider } from "./chain/wallet";
import { AccountProvider } from "./chain/account";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <WalletProvider>
        <AccountProvider>
          <App />
        </AccountProvider>
      </WalletProvider>
    </LanguageProvider>
  </React.StrictMode>
);
