// Executa manualmente o fluxo de assinatura free tier + ativação do token:
//   npm run subscribe
import { subscribeAndActivate } from "../txline/auth.js";

subscribeAndActivate()
  .then((creds) => {
    console.log("Ativado com sucesso:");
    console.log(`  carteira: ${creds.wallet}`);
    console.log(`  txSig:    ${creds.txSig}`);
    console.log(`  rede:     ${creds.network}`);
    // nunca imprime credenciais inteiras: ficam no scrollback/logs
    const mask = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
    console.log("\nPara usar na Vercel, configure as variáveis de ambiente:");
    console.log(`  TXLINE_NETWORK=${creds.network}`);
    console.log(`  TXLINE_JWT=${mask(creds.jwt)}`);
    console.log(`  TXLINE_API_TOKEN=${mask(creds.apiToken)}`);
    console.log(
      "\nValores completos salvos em server/.data/credentials.json — copie de lá, não deste log."
    );
  })
  .catch((err) => {
    console.error("Falha na assinatura/ativação:", err.response?.data ?? err.message);
    process.exit(1);
  });
