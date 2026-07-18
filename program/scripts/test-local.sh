#!/usr/bin/env bash
# Sobe um solana-test-validator com o oddies-bet carregado como programa
# upgradeable de verdade (upgrade authority = keys/devnet-deploy-wallet.json).
#
# Por que isso existe: o fluxo padrão do `anchor test` carrega o programa no
# genesis do validador local com upgrade authority "none" (imutável), então o
# teste de initialize() travado na upgrade authority nunca teria um signer
# válido pra passar. Aqui controlamos o deploy nós mesmos pra poder testar
# esse controle de acesso de verdade.
set -euo pipefail
cd "$(dirname "$0")/.."

PROGRAM_ID="F4xhKysY8SrNwfqLZxyuJrZCWW8KPVbTjZWb4HHtD4ZA"
SO_PATH="target/deploy/oddies_bet.so"
DEPLOY_WALLET="keys/devnet-deploy-wallet.json"
LEDGER_DIR="test-ledger"
RPC_URL="http://127.0.0.1:8899"

if [ ! -f "$SO_PATH" ]; then
  echo "Falta $SO_PATH — rode 'cargo build-sbf' antes." >&2
  exit 1
fi

pkill -f "solana-test-validator.*$LEDGER_DIR" 2>/dev/null || true
rm -rf "$LEDGER_DIR"

solana-test-validator \
  --reset \
  --quiet \
  --ledger "$LEDGER_DIR" \
  --upgradeable-program "$PROGRAM_ID" "$SO_PATH" "$(solana-keygen pubkey "$DEPLOY_WALLET")" \
  > /tmp/oddies-bet-test-validator.log 2>&1 &
VALIDATOR_PID=$!

cleanup() {
  kill "$VALIDATOR_PID" 2>/dev/null || true
  wait "$VALIDATOR_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Aguardando o validador local subir (PID $VALIDATOR_PID)..."
for _ in $(seq 1 60); do
  if solana cluster-version --url "$RPC_URL" >/dev/null 2>&1; then
    echo "Validador local no ar."
    break
  fi
  sleep 1
done

# validador do zero não tem o auto-airdrop que o `anchor test` padrão faz na wallet do provider.
solana airdrop 500 --keypair "$DEPLOY_WALLET" --url "$RPC_URL" >/dev/null

export ANCHOR_PROVIDER_URL="$RPC_URL"
export ANCHOR_WALLET="$DEPLOY_WALLET"
export NODE_OPTIONS="${NODE_OPTIONS:-} --no-experimental-strip-types"

yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
