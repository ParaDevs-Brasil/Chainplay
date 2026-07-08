# ⚽ Hi-Lo Stats · Copa 2026

Jogo de palpites com dados reais da Copa do Mundo 2026 via **TxLINE** (TxODDS),
a API de dados esportivos com verificação on-chain na **Solana**.

**Como funciona:** a cada rodada você vê a estatística da última partida
(gols, escanteios, cartões amarelos ou posse de bola) e palpita se a próxima
partida terá um valor **MAIOR ⬆** ou **MENOR ⬇**. Acertou, a sequência cresce;
errou, fim de jogo. Rejogável pelos 104 jogos da Copa, com recorde salvo e
placar compartilhável.

## Estrutura

```
server/  — Node/TS: assinatura free tier on-chain (Solana) + ativação do token
           TxLINE + proxy de dados (fixtures/scores) com cache e fallback mock
client/  — React/Vite: o jogo Hi-Lo
```

## Rodando

```bash
# 1. dependências
cd server && npm install
cd ../client && npm install

# 2. backend (porta 3001)
cd ../server
cp .env.example .env   # devnet por padrão
npm run dev

# 3. frontend (porta 5173, com proxy para /api)
cd ../client
npm run dev
```

Abra http://localhost:5173.

## Integração TxLINE (free tier da Copa)

Na primeira chamada de dados o servidor executa automaticamente o fluxo do
[World Cup Free Tier](https://txline.txodds.com/documentation/worldcup):

1. Cria/carrega uma keypair local em `server/.data/wallet.json`
   (na devnet pede airdrop de SOL automaticamente);
2. Chama `subscribe(SERVICE_LEVEL, 4)` no programa `txoracle` on-chain
   (free tier — sem custo em TxL, só a taxa da transação);
3. Obtém o guest JWT (`/auth/guest/start`), assina
   `"{txSig}::{jwt}"` com a carteira e ativa o token em `/api/token/activate`;
4. Guarda as credenciais em `server/.data/credentials.json` e as usa nos
   headers `Authorization: Bearer` + `X-Api-Token`.

Também dá para rodar o fluxo manualmente: `cd server && npm run subscribe`.

Se a TxLINE estiver inacessível (sem rede, ativação pendente etc.), o servidor
cai para um **dataset simulado dos 104 jogos** — o jogo continua demonstrável e
o front indica a origem dos dados no badge do topo.

### Configuração (`server/.env`)

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `TXLINE_NETWORK` | `devnet` | `devnet` ou `mainnet` (todos os endereços/hosts trocam juntos) |
| `TXLINE_SERVICE_LEVEL` | `1` | `1` = Copa com delay de 60s (grátis); `12` = tempo real (grátis, só mainnet) |
| `SOLANA_RPC_URL` | RPC público | RPC customizado, se quiser |
| `PORT` | `3001` | Porta do backend |

> Para mainnet: coloque `TXLINE_NETWORK=mainnet`, envie ~0.01 SOL para a
> carteira gerada (o endereço aparece no log) e reinicie.

## Endpoints do backend

- `GET /api/game/status` — rede, carteira e estado da ativação TxLINE
- `GET /api/game/matches` — partidas da Copa ordenadas com stats finais
  (`source: "txline" | "mock"`)

## Deploy na Vercel

O projeto já vem configurado (`vercel.json` + funções em `api/`):

- O frontend é buildado de `client/` e servido como estático;
- `GET /api/game/matches` e `/api/game/status` viram funções serverless que
  reutilizam o código de `server/src/` (cache vai para `/tmp`).

Passos:

```bash
npm i -g vercel   # se ainda não tiver
vercel            # deploy de preview
vercel --prod     # produção
```

Para dados reais da TxLINE em produção, ative as credenciais localmente e
cole no painel da Vercel (Settings → Environment Variables):

```bash
cd server && npm run subscribe
# o script imprime TXLINE_NETWORK, TXLINE_JWT e TXLINE_API_TOKEN prontos
```

Sem essas variáveis o deploy funciona igual, servindo o dataset simulado.

## Referências

- Quickstart: https://txline.txodds.com/documentation/quickstart
- Free tier da Copa: https://txline.txodds.com/documentation/worldcup
- Feed de futebol (encoding das stats): https://txline.txodds.com/documentation/scores/soccer-feed
- OpenAPI: https://txline.txodds.com/docs/docs.yaml
