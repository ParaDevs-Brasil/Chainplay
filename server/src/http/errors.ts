import type { NextFunction, Request, Response } from "express";

/** Erro com status HTTP — as camadas de domínio lançam, o middleware responde. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "rota não encontrada" });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    // 4xx também precisa de rastro no server (login falho, rate-limit, 403…)
    const level = err.status >= 500 ? "error" : "warn";
    console[level](`[http] ${req.method} ${req.path} → ${err.status}: ${err.message}`);
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[http] ${req.method} ${req.path}: ${message}`);
  // mensagem interna (RPC/Anchor/simulação) fica só no log — não vaza ao cliente
  res.status(500).json({ error: "erro interno — tente novamente em instantes" });
}

/** Encaminha rejeições de handlers async pro errorHandler. */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
