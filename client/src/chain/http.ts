/** Helper único de chamada à API — substitui as cópias que viviam em
 *  account.tsx, StakedHilo.tsx, Markets.tsx e WalletPage.tsx.
 *  `token` é o Bearer da sessão de backend (obrigatório nas rotas de jogo
 *  com dinheiro real: runs, penalty session, survivor pick). */

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api(path: string, body?: unknown, token?: string | null) {
  const res = await fetch(path, {
    method: body !== undefined ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // proxy do vite responde texto/HTML quando a API está fora
  if (!res.headers.get("content-type")?.includes("json")) {
    throw new ApiError("resposta inesperada do servidor", res.status);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status);
  return json;
}
