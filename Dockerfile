# Server único de produção: builda o client e serve o SPA + API no mesmo processo.
# Deploy em qualquer host persistente (Railway/Render/Fly/VPS) — NÃO serverless:
# o server tem crons (resolve mercados), WebSocket (live hub) e a keypair da
# authority, que exigem um processo de vida longa.
FROM node:20-slim

WORKDIR /app

# 1) deps do client + server (camadas cacheáveis: só reinstalam se o manifesto mudar)
# npm install (não ci): os lockfiles são gitignorados por decisão do time,
# então não existem no contexto de build de PaaS que clona do git.
COPY client/package*.json client/
RUN npm install --prefix client
COPY server/package*.json server/
RUN npm install --prefix server

# 2) código e build do client
COPY client/ client/
RUN npm run build --prefix client
COPY server/ server/

ENV NODE_ENV=production
# Porta do server (PaaS costuma injetar PORT). O app.ts serve client/dist na
# mesma origem automaticamente quando o build existe.
EXPOSE 3001

# A authority keypair e credenciais entram por env/secret no host, nunca na imagem:
#   AUTHORITY_KEYPAIR='[...]'  (array JSON da secretKey)  ou  AUTHORITY_KEYPAIR_PATH
#   SOLANA_RPC_URL, TXLINE_NETWORK, ALLOWED_ORIGINS, PUBLIC_BASE_URL, VITE_GOOGLE_CLIENT_ID
CMD ["npm", "run", "start", "--prefix", "server"]
