import { HttpError } from "../http/errors.js";
import {
  createSession,
  findOrCreateUser,
  sessionInfo,
  type SessionInfo,
} from "./store.js";

/** Login com Google: valida o ID token (Google Identity Services) contra o
 *  endpoint tokeninfo e amarra ao GOOGLE_CLIENT_ID configurado. */
export async function loginWithGoogle(credential: string): Promise<SessionInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new HttpError(
      501,
      "login Google não configurado: defina GOOGLE_CLIENT_ID no server/.env (e VITE_GOOGLE_CLIENT_ID no client/.env)"
    );
  }
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  if (!res.ok) throw new HttpError(401, "token do Google inválido");
  const info: any = await res.json();
  if (info.aud !== clientId) {
    throw new HttpError(401, "token de outro app (aud não confere)");
  }
  if (Number(info.exp) * 1000 < Date.now()) {
    throw new HttpError(401, "token do Google expirado");
  }
  const user = await findOrCreateUser("google", info.sub, {
    email: info.email,
    name: info.name ?? info.given_name,
  });
  return sessionInfo(user, createSession(user));
}
