import { Router } from "express";
import { CHAIN_RPC_URL } from "../../chain/client.js";
import { HttpError, asyncHandler } from "../errors.js";

export const rpcRoutes = Router();

/**
 * Métodos JSON-RPC que o client realmente usa (place_bet, claim, leitura de
 * contas, confirmação de tx). Sem allowlist o proxy seria um open relay: qualquer
 * site poderia usar nosso IP/quota de RPC pra métodos caros (getProgramAccounts)
 * ou spam — e num RPC pago (Helius/Triton) isso drena créditos anonimamente.
 */
const ALLOWED_METHODS = new Set([
  "getLatestBlockhash",
  "getFeeForMessage",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccountsInfo",
  "getMinimumBalanceForRentExemption",
  "getSignatureStatuses",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "sendTransaction",
  "simulateTransaction",
  "getSlot",
  "getGenesisHash",
  "getEpochInfo",
]);

/** Um método é permitido se estiver na allowlist. Aplica a chamada única e à
 *  batch (array de chamadas) — rejeita a requisição inteira se qualquer uma
 *  fugir da allowlist. */
function methodsAllowed(body: unknown): boolean {
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length) return false;
  return calls.every(
    (c) =>
      c && typeof (c as { method?: unknown }).method === "string" &&
      ALLOWED_METHODS.has((c as { method: string }).method)
  );
}

/**
 * Proxy JSON-RPC para o RPC da chain. O RPC público da devnet bloqueia/limita
 * requisições de browser (aparece como "CORS failure" intermitente no client);
 * passando pela mesma origem do app o browser não faz preflight e o server —
 * que não sofre CORS — repassa. Só POST JSON-RPC de métodos da allowlist; as
 * assinaturas continuam 100% na wallet do jogador (aqui passa só a tx já
 * assinada em sendTransaction/simulateTransaction).
 */
rpcRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!methodsAllowed(req.body)) {
      throw new HttpError(403, "método RPC não permitido");
    }
    let upstream: Response;
    try {
      upstream = await fetch(CHAIN_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
    } catch (err) {
      throw new HttpError(502, "RPC da chain indisponível — tente novamente");
    }
    res.status(upstream.status).type("application/json").send(await upstream.text());
  })
);
