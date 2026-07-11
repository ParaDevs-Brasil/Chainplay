import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // shims exigidos pelo @coral-xyz/anchor / @solana/web3.js no browser
  define: {
    "process.env": {},
    global: "globalThis",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
