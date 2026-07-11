import { Buffer } from "buffer";
// web3.js e anchor esperam o Buffer global do Node no browser
(globalThis as any).Buffer ??= Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./i18n";
import { WalletProvider } from "./chain/wallet";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </LanguageProvider>
  </React.StrictMode>
);
