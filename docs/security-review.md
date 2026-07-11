# Revisão de segurança — ChainPlay / oddies-bet

> Executada em 2026-07-11 sobre `program/programs/oddies-bet/src/lib.rs` (deployado em devnet
> como `F4xhKysY8SrNwfqLZxyuJrZCWW8KPVbTjZWb4HHtD4ZA`) e sobre a API do `server/`.
> Metodologia: scanner de 6 padrões de vulnerabilidade Solana (Trail of Bits), revisão manual
> do modelo econômico/estado, suíte Anchor (26 testes, incl. fuzzing com fast-check) e suíte
> E2E da API contra a devnet real (25 asserções — `npm run e2e:full`).

## 1. Contrato — scanner de padrões Solana

| # | Padrão | Severidade | Resultado |
|---|---|---|---|
| 1 | Arbitrary CPI (program ID controlado pelo usuário) | CRÍTICO | ✅ **Não afetado.** Todas as CPIs usam contas tipadas `Program<'info, System>` / `Program<'info, Token>` — o Anchor valida o program ID. Nenhum `invoke()` cru. |
| 2 | PDA sem bump canônico | CRÍTICO | ✅ **Não afetado.** `config`, `market`, `vault` e `bet` usam `seeds`+`bump` do Anchor; bumps canônicos gravados no estado na criação (`ctx.bumps`) e reusados (`bump = market.bump` etc.). Assinaturas de PDA (`transfer_from_vault`, mint do ticket) usam os bumps armazenados. |
| 3 | Falta de ownership check | ALTO | ✅ **Não afetado.** Todas as contas de dados são `Account<'info, T>` (owner + discriminator validados). As três `UncheckedAccount` são só a `team_wallet`, sempre amarrada: `address = config.team_wallet` (PlaceBet), `has_one = team_wallet` (WithdrawHouse), e no Initialize é input da própria authority. |
| 4 | Falta de signer check | CRÍTICO | ✅ **Não afetado.** Toda operação administrativa exige `Signer` + `has_one = authority` contra a config. `initialize` é travado na **upgrade authority do programa** via constraint de `program_data` (impede front-run de inicialização — coberto por teste). `bettor`/`claimer` são Signers. |
| 5 | Sysvar spoofado (pré-1.8.1) | ALTO | ✅ **N/A.** Único sysvar é `Sysvar<'info, Rent>` tipado; toolchain atual. |
| 6 | Instruction introspection insegura | MÉDIO | ✅ **N/A.** Não usa introspection. |

### Revisão econômica / de estado (manual)

- **Double-claim**: impossível — `bet.claimed` + ticket-NFT queimado no claim (testado on-chain: segundo claim falha).
- **Solvência HouseBacked**: `place_bet` recalcula o pior caso (`max` das liabilities) e exige cobertura do vault **incluindo** o stake que está entrando; fuzz de 26 casos confirma que a casa nunca aceita risco além do vault.
- **`withdraw_house` não rouba apostador**: bloqueado enquanto `outstanding` > 0; só saca o excedente e só para a `team_wallet` da config.
- **Aritmética**: `checked_add/sub`, produtos em `u128` antes da divisão; fee com piso e `net > 0` exigido.
- **Janela de resolução**: `resolve_after_ts > close_ts` on-chain impede resolução antes do fim real (testado).
- **Ticket-NFT**: mint authority congelada em `None` após supply 1 — ninguém minta tickets extras.

### Apontamentos (aceitáveis para v1, revisar antes de mainnet)

1. **Oráculo centralizado (por design)** — `resolve_market` depende de 1 chave. Mitigação já planejada em `keys_contract.md`: migrar `config.authority` para multisig (Squads) via `update_config` e transferir a upgrade authority.
2. **Fundos não resgatados ficam presos** — em mercados `Voided`, o que ninguém reclamar fica no vault para sempre (não é roubável, mas não é recuperável). Considerar instrução de expiração/varredura pós-prazo numa v2.
3. **Sem instrução de `close`** — contas `Market`/`Bet` nunca devolvem rent. Custo operacional, não risco.
4. **Poeira de arredondamento parimutuel** — sobras de divisão inteira ficam no vault e são sacáveis pela casa via `withdraw_house`. Comportamento esperado; documentado.

## 2. Server / API

### Corrigido nesta revisão

| Achado | Severidade | Correção |
|---|---|---|
| **Drenagem da authority via `POST /api/runs`**: cada run cria mercado + fund_house com SOL da authority (rent não-recuperável ~0.004 SOL); spam anônimo drenaria a carteira. | **ALTO** | 1 run ativa por wallet + teto global de 10 runs/5min + validação de pubkey (`runs.ts`). Runs abandonadas são resolvidas e têm a liquidez reciclada pelo cron (`withdraw_house`). Verificado ao vivo. |
| **`keys_contract.md` (seed phrases!) e `program/keys/` fora do `.gitignore`** — risco de commit acidental de segredos. | **ALTO** | Adicionados ao `.gitignore` da raiz. ⚠️ **Recomendação extra**: como as seeds da devnet já circularam em texto plano, rotacionar antes de qualquer uso em mainnet (nunca reutilizar essas seeds). |
| **Reativação TxLINE em loop** (airdrop + tx a cada ciclo do cron, 429 no faucet) | BAIXO | Cooldown de 10 min entre tentativas (`markets.ts`). |

### Validado por teste (suíte `e2e:full`, seção B)

- A sequência secreta das runs **nunca** sai pela API (`rounds` e valores futuros ausentes de todas as respostas) — o cliente não tem como prever o próximo número.
- Gate on-chain: `guess` só funciona depois do `place_bet` confirmado no mercado da run.
- Runs encerradas não aceitam mais palpites (sem replay).
- Inputs inválidos (meta, stake fracionário, stake acima do teto da casa, dir desconhecida) → 400.

### Apontamentos abertos (para as próximas fases)

1. **Autorização das runs por UUID** — quem tiver o id da run pode dar palpites nela. UUIDv4 (122 bits) é impraticável de adivinhar e não vaza em endpoint público, mas o correto para produção é exigir assinatura da wallet dona (challenge assinado) nos endpoints de `guess`/`cashout`.
2. **CORS aberto** (`app.use(cors())`) — ok para hackathon; restringir origem em produção.
3. **Sem TLS/secrets management** — `.data/` guarda credenciais e a wallet do server em disco plano; para produção, usar secret manager.
4. **Rate limit é em memória** — reinicia com o processo; para produção, mover para armazenamento compartilhado.

## 3. Evidências

- `program/`: `bash scripts/test-local.sh` → **26 passing** (fluxos multiplayer/singleplayer/cancelamento, controle de acesso com impostor em todas as instruções, fuzzing de invariantes com fast-check). Requer `anchor build` atualizado — os artefatos de `target/` estavam defasados em relação ao fonte e foram regenerados (IDL novo é idêntico ao `server/idl/oddies_bet.json` usado em produção).
- `server/`: `npm run e2e:full` → **25 ✅ / 0 ❌** contra a devnet real, incluindo o ciclo completo aposta → vitória → liquidação pelo cron → claim pago → double-claim bloqueado.
