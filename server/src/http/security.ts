import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";
import { HttpError } from "./errors.js";

/**
 * Endurecimento HTTP sem dependência nova (helmet não está no projeto):
 * headers de segurança, CORS com allowlist opcional e rate limit global leve.
 */

// CSP do SPA em produção (o server serve o client/dist na mesma origem). Cobre
// os recursos externos que o app usa: Google Fonts, Google Sign-In e o WebSocket
// do RPC (confirmação de tx roda direto na chain — WS não passa pelo proxy).
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://gsi.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  // /api/rpc é same-origin; o wsEndpoint aponta pro RPC público (devnet/mainnet)
  "connect-src 'self' https://accounts.google.com https://api.devnet.solana.com wss://api.devnet.solana.com https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com",
  "frame-src https://accounts.google.com", // botão do Google Sign-In
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// CSP trancado das rotas de dados: JSON e imagens não renderizam nada.
const API_CSP = "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'";

/** Cabeçalhos de segurança aplicados a toda resposta. */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // rotas de dados ficam com o CSP estrito; o SPA (todo o resto) recebe o
  // CSP que libera só o necessário pros recursos externos conhecidos
  const isApi = req.path.startsWith("/api") || req.path.startsWith("/nft");
  res.setHeader("Content-Security-Policy", isApi ? API_CSP : APP_CSP);
  next();
}

/**
 * CORS: se ALLOWED_ORIGINS estiver definido (lista separada por vírgula),
 * só essas origens passam; senão, mantém aberto (dev/hackathon). Como a auth é
 * por Bearer (não cookie), CORS aberto não vaza sessão, mas restringir é higiene.
 */
export function corsOptions(): CorsOptions {
  const raw = (process.env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return {}; // aberto (comportamento atual)
  const allow = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return {
    origin(origin, cb) {
      // sem Origin (curl, server-to-server, imagens) → libera
      if (!origin || allow.has(origin)) return cb(null, true);
      // origem não permitida: não seta os headers CORS (o browser bloqueia a
      // leitura da resposta) em vez de derrubar a request com 500
      cb(null, false);
    },
  };
}

/**
 * Rate limit global por IP (janela deslizante em memória). Protege contra
 * flood/força-bruta; limite generoso pra não atrapalhar o polling normal do
 * client. Ajustável por RATE_LIMIT_PER_MIN (0 = desliga). Em memória: reinicia
 * com o processo — pra produção multi-instância, mover pra store compartilhada.
 */
export function rateLimiter() {
  const perMin = Number(process.env.RATE_LIMIT_PER_MIN ?? 600);
  const WINDOW_MS = 60_000;
  const hits = new Map<string, number[]>();

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!perMin || perMin <= 0) return next();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    arr.push(now);
    hits.set(ip, arr);
    // limpeza oportunista pra não crescer sem limite
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
    if (arr.length > perMin) {
      return next(new HttpError(429, "muitas requisições — tente novamente em instantes"));
    }
    next();
  };
}
