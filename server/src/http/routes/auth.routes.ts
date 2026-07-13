import { Router } from "express";
import { loginAsGuest } from "../../auth/guest.js";
import { loginWithGoogle } from "../../auth/google.js";
import {
  destroySession,
  publicKeyOf,
  sessionUser,
  userAddress,
} from "../../auth/store.js";
import { loginWithWallet, walletChallenge } from "../../auth/wallet.js";
import { getChain } from "../../chain/client.js";
import { HttpError, asyncHandler } from "../errors.js";

export const authRoutes = Router();

authRoutes.get("/config", (_req, res) => {
  res.json({
    googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
    guestEnabled: process.env.ALLOW_GUEST !== "0",
    walletEnabled: true,
  });
});

authRoutes.post(
  "/google",
  asyncHandler(async (req, res) => {
    const credential = req.body?.credential;
    if (typeof credential !== "string" || !credential) {
      throw new HttpError(400, "credential (ID token do Google) obrigatório");
    }
    res.json(await loginWithGoogle(credential));
  })
);

authRoutes.post(
  "/guest",
  asyncHandler(async (_req, res) => {
    res.json(await loginAsGuest());
  })
);

// Login não-custodial via web3 connect: nonce → assinatura → sessão
authRoutes.post(
  "/wallet/nonce",
  asyncHandler(async (req, res) => {
    res.json(walletChallenge(req.body?.address));
  })
);

authRoutes.post(
  "/wallet/verify",
  asyncHandler(async (req, res) => {
    res.json(await loginWithWallet(req.body?.address, req.body?.signature));
  })
);

authRoutes.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = sessionUser(req.headers.authorization);
    if (!user) throw new HttpError(401, "sessão inválida");
    let balance: number | null = null;
    const chain = getChain();
    if (chain) {
      try {
        balance = await chain.connection.getBalance(publicKeyOf(user));
      } catch (err) {
        // RPC fora: devolve sem saldo, mas deixa rastro no log
        console.warn(
          `[auth] falha ao consultar saldo de ${userAddress(user).slice(0, 6)}…: ${(err as Error).message}`
        );
      }
    }
    res.json({
      address: userAddress(user),
      provider: user.provider,
      name: user.name ?? null,
      email: user.email ?? null,
      balance,
    });
  })
);

authRoutes.post("/logout", (req, res) => {
  destroySession(req.headers.authorization);
  res.json({ ok: true });
});
