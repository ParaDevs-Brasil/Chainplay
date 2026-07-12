import react from "@vitejs/plugin-react";
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
    },
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
