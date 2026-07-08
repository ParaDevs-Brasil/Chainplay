// Executa manualmente o fluxo de assinatura free tier + ativação do token:
//   npm run subscribe
import { subscribeAndActivate } from "../txlineAuth.js";

subscribeAndActivate()
  .then((creds) => {
    console.log("Ativado com sucesso:");
    console.log(`  carteira: ${creds.wallet}`);
    console.log(`  txSig:    ${creds.txSig}`);
    console.log(`  rede:     ${creds.network}`);
    console.log("\nPara usar na Vercel, configure as variáveis de ambiente:");
    console.log(`  TXLINE_NETWORK=${creds.network}`);
    console.log(`  TXLINE_JWT=${creds.jwt}`);
    console.log(`  TXLINE_API_TOKEN=${creds.apiToken}`);
  })
  .catch((err) => {
    console.error("Falha na assinatura/ativação:", err.response?.data ?? err.message);
    process.exit(1);
  });
