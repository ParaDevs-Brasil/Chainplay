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
  // erros do express/body-parser trazem um status HTTP (ex.: 413 payload grande,
  // 400 JSON malformado): respeita o status mas sem vazar a mensagem interna.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    console.warn(`[http] ${req.method} ${req.path} → ${status}: ${message}`);
    res.status(status).json({ error: "requisição inválida" });
    return;
  }
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

/**
 * true quando a transação falhou porque a wallet da authority (a "casa") não
 * tem SOL pra bancar o mercado — o revert vem como "insufficient lamports" na
 * transferência do System program. Serve pra virar um 503 claro em vez de um
 * 500 genérico ("a casa está sem saldo") nos fluxos que criam/fundeiam mercado.
 */
export function isHouseUnfundedError(err: unknown): boolean {
  const e = err as { message?: string; logs?: string[] };
  const hay = [e?.message ?? String(err), ...(e?.logs ?? [])].join(" ");
  return /insufficient lamports|insufficient funds/i.test(hay);
}
