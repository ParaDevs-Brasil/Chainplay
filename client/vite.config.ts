import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // shims exigidos pelo @coral-xyz/anchor / @solana/web3.js no browser
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    // "buffer" deve resolver pro polyfill npm, não pro builtin do Node
    // (o Vite externaliza builtins no browser e Buffer viraria undefined)
    alias: {
      buffer: "buffer/",
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  server: {
    proxy: {
      // API_PROXY: desvio quando a 3001 está ocupada (ex.: API_PROXY=http://localhost:3010)
      "/api": process.env.API_PROXY ?? "http://localhost:3001",
    },
  },
});
