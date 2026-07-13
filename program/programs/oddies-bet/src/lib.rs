use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::metadata::{
    create_master_edition_v3, create_metadata_accounts_v3, set_and_verify_sized_collection_item,
    mpl_token_metadata::types::{CollectionDetails, DataV2},
    CreateMasterEditionV3, CreateMetadataAccountsV3, Metadata, SetAndVerifySizedCollectionItem,
};
use anchor_spl::token::{self, Burn, Mint, MintTo, SetAuthority, Token, TokenAccount};

declare_id!("F4xhKysY8SrNwfqLZxyuJrZCWW8KPVbTjZWb4HHtD4ZA");

pub const MAX_OUTCOMES: usize = 8;
pub const BPS_DENOMINATOR: u64 = 10_000;
/// Quantos jogos existem (uma coleção-identidade por jogo). Os `game_id` válidos
/// vão de 0 a GAME_COUNT-1 e mapeiam para as artes em `NFTs/`.
pub const GAME_COUNT: u8 = 7;
/// Sem coleção (ex.: mercados demo/genéricos): o ticket não entra em coleção.
pub const GAME_NONE: u8 = u8::MAX;
pub const MAX_NFT_NAME_LEN: usize = 32;
pub const MAX_NFT_SYMBOL_LEN: usize = 10;
pub const MAX_NFT_URI_LEN: usize = 200;

#[program]
pub mod oddies_bet {
    use super::*;

    /// Cria a config global: quem administra, para onde vai a taxa e qual a taxa (ex.: 1000 = 10%).
    /// Só a upgrade authority do programa pode chamar (evita que alguém inicialize primeiro
    /// e vire authority permanente).
    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        require!(fee_bps as u64 <= BPS_DENOMINATOR, BetError::InvalidFee);
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.team_wallet = ctx.accounts.team_wallet.key();
        config.fee_bps = fee_bps;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Cria a Collection NFT de identidade de um jogo (ex.: "Penalty Predictor").
    /// Uma por jogo — os tickets de aposta desse jogo entram nesta coleção via
    /// `place_bet`, herdando a arte/identidade do jogo em carteiras e explorers.
    /// Só a authority. O mint/update authority de toda coleção é a PDA
    /// `collection_authority`, então o próprio programa assina a verificação dos
    /// itens (nenhuma chave externa precisa ser a autoridade da coleção).
    pub fn create_game_collection(
        ctx: Context<CreateGameCollection>,
        game_id: u8,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        require!(game_id < GAME_COUNT, BetError::InvalidGameId);
        require!(name.len() <= MAX_NFT_NAME_LEN, BetError::MetadataTooLong);
        require!(symbol.len() <= MAX_NFT_SYMBOL_LEN, BetError::MetadataTooLong);
        require!(uri.len() <= MAX_NFT_URI_LEN, BetError::MetadataTooLong);

        // Guarda a identidade do jogo no PDA: place_bet reusa esses valores como
        // metadados de cada ticket (o ticket compartilha nome/arte do jogo).
        let gc = &mut ctx.accounts.game_collection;
        gc.game_id = game_id;
        gc.collection_mint = ctx.accounts.collection_mint.key();
        gc.bump = ctx.bumps.game_collection;
        gc.collection_authority_bump = ctx.bumps.collection_authority;
        gc.ticket_name = name.clone();
        gc.ticket_symbol = symbol.clone();
        gc.ticket_uri = uri.clone();

        let signer: &[&[&[u8]]] = &[&[
            b"collection_authority",
            &[ctx.bumps.collection_authority],
        ]];

        // 1) minta 1 unidade da coleção pra conta custodiada pela PDA
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.collection_mint.to_account_info(),
                    to: ctx.accounts.collection_token_account.to_account_info(),
                    authority: ctx.accounts.collection_authority.to_account_info(),
                },
                signer,
            ),
            1,
        )?;

        // 2) metadados on-chain marcados como coleção "sized" (size cresce a cada item)
        create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.collection_metadata.to_account_info(),
                    mint: ctx.accounts.collection_mint.to_account_info(),
                    mint_authority: ctx.accounts.collection_authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    update_authority: ctx.accounts.collection_authority.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                signer,
            ),
            DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            true,
            true,
            Some(CollectionDetails::V1 { size: 0 }),
        )?;

        // 3) master edition (max_supply 0) — torna o mint uma NFT e habilita a
        //    coleção a verificar itens
        create_master_edition_v3(
            CpiContext::new_with_signer(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMasterEditionV3 {
                    edition: ctx.accounts.collection_master_edition.to_account_info(),
                    mint: ctx.accounts.collection_mint.to_account_info(),
                    update_authority: ctx.accounts.collection_authority.to_account_info(),
                    mint_authority: ctx.accounts.collection_authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    metadata: ctx.accounts.collection_metadata.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                signer,
            ),
            Some(0),
        )?;

        Ok(())
    }

    /// Abre um mercado de apostas para um fixture (partida).
    ///
    /// - `Parimutuel` (multiplayer): os apostadores dividem o pote entre si; odds emergem do pool.
    /// - `HouseBacked` (singleplayer): a casa paga `stake * odds_bps / 10000`; exige vault fundeado.
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        fixture_id: u64,
        kind: MarketKind,
        outcome_count: u8,
        odds_bps: [u64; MAX_OUTCOMES],
        close_ts: i64,
        resolve_after_ts: i64,
        game_id: u8,
    ) -> Result<()> {
        require!(
            outcome_count >= 2 && (outcome_count as usize) <= MAX_OUTCOMES,
            BetError::InvalidOutcomeCount
        );
        // game_id identifica de qual jogo é o mercado (define a coleção-identidade
        // dos tickets). GAME_NONE = mercado sem coleção (demo/genérico).
        require!(
            game_id < GAME_COUNT || game_id == GAME_NONE,
            BetError::InvalidGameId
        );
        let now = Clock::get()?.unix_timestamp;
        require!(close_ts > now, BetError::CloseInPast);
        // close_ts é o início da partida; resolve_after_ts precisa dar tempo dela terminar
        // de verdade (piso on-chain contra um resolve_market prematuro do backend).
        require!(resolve_after_ts > close_ts, BetError::InvalidResolveWindow);
        if kind == MarketKind::HouseBacked {
            for i in 0..outcome_count as usize {
                // Odds incluem o stake de volta, então precisam ser > 1x.
                require!(odds_bps[i] > BPS_DENOMINATOR, BetError::InvalidOdds);
            }
        }

        let market = &mut ctx.accounts.market;
        market.market_id = market_id;
        market.fixture_id = fixture_id;
        market.game_id = game_id;
        market.kind = kind;
        market.state = MarketState::Open;
        market.outcome_count = outcome_count;
        market.odds_bps = odds_bps;
        market.pools = [0; MAX_OUTCOMES];
        market.liabilities = [0; MAX_OUTCOMES];
        market.close_ts = close_ts;
        market.resolve_after_ts = resolve_after_ts;
        market.winning_outcome = 0;
        market.payout_pool = 0;
        market.outstanding = 0;
        market.bump = ctx.bumps.market;
        market.vault_bump = ctx.bumps.vault;

        // Buffer de rent do vault: nunca é distribuído, garante que a conta continue rent-exempt.
        let rent_min = Rent::get()?.minimum_balance(0);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            rent_min,
        )?;
        Ok(())
    }

    /// Deposita liquidez da casa no vault (necessário antes de aceitar apostas HouseBacked).
    /// Só a authority: dinheiro mandado por qualquer outra wallet ficaria preso no vault,
    /// só sacável pela authority via withdraw_house.
    pub fn fund_house(ctx: Context<FundHouse>, amount: u64) -> Result<()> {
        require!(amount > 0, BetError::ZeroAmount);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    /// Aposta: cobra a taxa para a wallet do time, deposita o líquido no vault,
    /// registra a Bet e minta o ticket-NFT (supply 1, decimals 0) para o apostador.
    /// Quem segurar o ticket é quem resgata o prêmio — a aposta é transferível.
    pub fn place_bet(ctx: Context<PlaceBet>, outcome: u8, amount: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.state == MarketState::Open, BetError::MarketNotOpen);
        let now = Clock::get()?.unix_timestamp;
        require!(now < market.close_ts, BetError::BettingClosed);
        require!(outcome < market.outcome_count, BetError::InvalidOutcome);
        require!(amount > 0, BetError::ZeroAmount);

        let fee = (amount as u128 * ctx.accounts.config.fee_bps as u128
            / BPS_DENOMINATOR as u128) as u64;
        let net = amount.checked_sub(fee).ok_or(BetError::MathOverflow)?;
        require!(net > 0, BetError::ZeroAmount);

        // Para HouseBacked, o payout é travado na entrada e o vault precisa cobrir
        // todas as obrigações do pior cenário (o outcome mais alavancado vencer).
        let payout = match market.kind {
            MarketKind::Parimutuel => 0,
            MarketKind::HouseBacked => {
                let p = (net as u128 * market.odds_bps[outcome as usize] as u128
                    / BPS_DENOMINATOR as u128) as u64;
                let new_liability = market.liabilities[outcome as usize]
                    .checked_add(p)
                    .ok_or(BetError::MathOverflow)?;
                let worst_case = market
                    .liabilities
                    .iter()
                    .enumerate()
                    .map(|(i, &l)| if i == outcome as usize { new_liability } else { l })
                    .max()
                    .unwrap_or(0);
                let usable = vault_usable_balance(&ctx.accounts.vault)?
                    .checked_add(net) // o stake desta aposta também entra no vault
                    .ok_or(BetError::MathOverflow)?;
                require!(worst_case <= usable, BetError::InsufficientHouseLiquidity);
                market.liabilities[outcome as usize] = new_liability;
                p
            }
        };

        market.pools[outcome as usize] = market.pools[outcome as usize]
            .checked_add(net)
            .ok_or(BetError::MathOverflow)?;

        // Split 10/90 (ou o fee configurado): taxa → wallet do time, líquido → vault.
        if fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.bettor.to_account_info(),
                        to: ctx.accounts.team_wallet.to_account_info(),
                    },
                ),
                fee,
            )?;
        }
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.bettor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            net,
        )?;

        let bet = &mut ctx.accounts.bet;
        bet.market = market.key();
        bet.ticket_mint = ctx.accounts.ticket_mint.key();
        bet.outcome = outcome;
        bet.stake_net = net;
        bet.fixed_payout = payout;
        bet.claimed = false;
        bet.bump = ctx.bumps.bet;

        // Minta o ticket para o apostador.
        let market_id_bytes = market.market_id.to_le_bytes();
        let market_signer: &[&[&[u8]]] = &[&[b"market", &market_id_bytes, &[market.bump]]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.ticket_mint.to_account_info(),
                    to: ctx.accounts.ticket_account.to_account_info(),
                    authority: market.to_account_info(),
                },
                market_signer,
            ),
            1,
        )?;

        // Metadados + identidade do jogo: cria a metadata do ticket e, se o
        // mercado pertence a um jogo com coleção, verifica o ticket como membro
        // da Collection NFT desse jogo (a arte/identidade do jogo passa a
        // aparecer na carteira do apostador). Feito enquanto o `market` ainda é
        // mint authority — a metadata exige a mint authority como signer.
        if market.game_id != GAME_NONE {
            let game = ctx
                .accounts
                .game_collection
                .as_ref()
                .ok_or(BetError::MissingGameCollection)?;
            require!(game.game_id == market.game_id, BetError::GameMismatch);
            let collection_mint = ctx
                .accounts
                .collection_mint
                .as_ref()
                .ok_or(BetError::MissingGameCollection)?;
            require!(
                collection_mint.key() == game.collection_mint,
                BetError::GameMismatch
            );
            let ticket_metadata = ctx
                .accounts
                .ticket_metadata
                .as_ref()
                .ok_or(BetError::MissingGameCollection)?;
            let collection_metadata = ctx
                .accounts
                .collection_metadata
                .as_ref()
                .ok_or(BetError::MissingGameCollection)?;
            let collection_master_edition = ctx
                .accounts
                .collection_master_edition
                .as_ref()
                .ok_or(BetError::MissingGameCollection)?;
            let collection_authority = ctx
                .accounts
                .collection_authority
                .as_ref()
                .ok_or(BetError::MissingGameCollection)?;
            let token_metadata_program = ctx
                .accounts
                .token_metadata_program
                .as_ref()
                .ok_or(BetError::MissingGameCollection)?;

            create_metadata_accounts_v3(
                CpiContext::new_with_signer(
                    token_metadata_program.to_account_info(),
                    CreateMetadataAccountsV3 {
                        metadata: ticket_metadata.to_account_info(),
                        mint: ctx.accounts.ticket_mint.to_account_info(),
                        mint_authority: market.to_account_info(),
                        payer: ctx.accounts.bettor.to_account_info(),
                        update_authority: collection_authority.to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                    },
                    market_signer,
                ),
                DataV2 {
                    name: game.ticket_name.clone(),
                    symbol: game.ticket_symbol.clone(),
                    uri: game.ticket_uri.clone(),
                    seller_fee_basis_points: 0,
                    creators: None,
                    collection: None,
                    uses: None,
                },
                true,
                false,
                None,
            )?;

            // set_and_verify: define a coleção e verifica o item num único CPI,
            // assinado pela PDA collection_authority (update authority da coleção
            // e do item). Incrementa o `size` da coleção.
            let col_signer: &[&[&[u8]]] =
                &[&[b"collection_authority", &[game.collection_authority_bump]]];
            set_and_verify_sized_collection_item(
                CpiContext::new_with_signer(
                    token_metadata_program.to_account_info(),
                    SetAndVerifySizedCollectionItem {
                        metadata: ticket_metadata.to_account_info(),
                        collection_authority: collection_authority.to_account_info(),
                        payer: ctx.accounts.bettor.to_account_info(),
                        update_authority: collection_authority.to_account_info(),
                        collection_mint: collection_mint.to_account_info(),
                        collection_metadata: collection_metadata.to_account_info(),
                        collection_master_edition: collection_master_edition.to_account_info(),
                    },
                    col_signer,
                ),
                None,
            )?;
        }

        // Congela o supply do ticket em 1: ninguém minta tickets extras.
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: market.to_account_info(),
                    account_or_mint: ctx.accounts.ticket_mint.to_account_info(),
                },
                market_signer,
            ),
            token::spl_token::instruction::AuthorityType::MintTokens,
            None,
        )?;

        emit!(BetPlaced {
            market: market.key(),
            ticket_mint: ctx.accounts.ticket_mint.key(),
            bettor: ctx.accounts.bettor.key(),
            outcome,
            amount,
            net,
        });
        Ok(())
    }

    /// Resolve o mercado com o outcome vencedor (autoridade = oráculo v1).
    /// Num parimutuel sem vencedores, o mercado vira Voided e todos recuperam o stake líquido.
    pub fn resolve_market(ctx: Context<ResolveMarket>, winning_outcome: u8) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.state == MarketState::Open, BetError::MarketNotOpen);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= market.resolve_after_ts, BetError::MatchNotFinished);
        require!(winning_outcome < market.outcome_count, BetError::InvalidOutcome);

        let total_net: u64 = market
            .pools
            .iter()
            .try_fold(0u64, |acc, &p| acc.checked_add(p))
            .ok_or(BetError::MathOverflow)?;

        match market.kind {
            MarketKind::Parimutuel => {
                let winning_pool = market.pools[winning_outcome as usize];
                if winning_pool == 0 {
                    // Ninguém acertou: devolve o stake líquido a todos.
                    market.state = MarketState::Voided;
                    market.outstanding = total_net;
                } else {
                    market.state = MarketState::Resolved;
                    market.winning_outcome = winning_outcome;
                    market.payout_pool = total_net;
                    market.outstanding = total_net;
                }
            }
            MarketKind::HouseBacked => {
                market.state = MarketState::Resolved;
                market.winning_outcome = winning_outcome;
                market.outstanding = market.liabilities[winning_outcome as usize];
            }
        }

        emit!(MarketResolved {
            market: market.key(),
            state: market.state,
            winning_outcome,
        });
        Ok(())
    }

    /// Cancela um mercado (partida adiada/cancelada). Todos recuperam o stake líquido.
    pub fn cancel_market(ctx: Context<ResolveMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.state == MarketState::Open, BetError::MarketNotOpen);
        let total_net: u64 = market
            .pools
            .iter()
            .try_fold(0u64, |acc, &p| acc.checked_add(p))
            .ok_or(BetError::MathOverflow)?;
        market.state = MarketState::Voided;
        market.outstanding = total_net;
        Ok(())
    }

    /// Resgate: quem segura o ticket-NFT queima o token e recebe o prêmio do vault.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let bet = &mut ctx.accounts.bet;
        require!(!bet.claimed, BetError::AlreadyClaimed);
        require!(
            ctx.accounts.ticket_account.amount == 1,
            BetError::TicketNotHeld
        );

        let payout: u64 = match market.state {
            MarketState::Voided => bet.stake_net,
            MarketState::Resolved => {
                require!(
                    bet.outcome == market.winning_outcome,
                    BetError::LosingBet
                );
                match market.kind {
                    MarketKind::Parimutuel => {
                        let winning_pool = market.pools[market.winning_outcome as usize];
                        ((bet.stake_net as u128 * market.payout_pool as u128)
                            / winning_pool as u128) as u64
                    }
                    MarketKind::HouseBacked => bet.fixed_payout,
                }
            }
            _ => return err!(BetError::MarketNotSettled),
        };

        bet.claimed = true;
        market.outstanding = market.outstanding.saturating_sub(payout.min(market.outstanding));

        // Queima o ticket: a aposta não pode ser resgatada duas vezes nem revendida depois.
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.ticket_mint.to_account_info(),
                    from: ctx.accounts.ticket_account.to_account_info(),
                    authority: ctx.accounts.claimer.to_account_info(),
                },
            ),
            1,
        )?;

        transfer_from_vault(
            &ctx.accounts.vault,
            &ctx.accounts.claimer.to_account_info(),
            &ctx.accounts.system_program,
            market.key(),
            market.vault_bump,
            payout,
        )?;

        emit!(Claimed {
            market: market.key(),
            ticket_mint: bet.ticket_mint,
            claimer: ctx.accounts.claimer.key(),
            payout,
        });
        Ok(())
    }

    /// Retira do vault o que não está comprometido com apostadores
    /// (lucro da casa em HouseBacked, ou sobras após um mercado liquidado).
    pub fn withdraw_house(ctx: Context<WithdrawHouse>, amount: u64) -> Result<()> {
        let market = &ctx.accounts.market;
        require!(
            market.state == MarketState::Resolved || market.state == MarketState::Voided,
            BetError::MarketNotSettled
        );
        let usable = vault_usable_balance(&ctx.accounts.vault)?;
        let free = usable
            .checked_sub(market.outstanding)
            .ok_or(BetError::InsufficientHouseLiquidity)?;
        require!(amount <= free, BetError::InsufficientHouseLiquidity);

        transfer_from_vault(
            &ctx.accounts.vault,
            &ctx.accounts.team_wallet.to_account_info(),
            &ctx.accounts.system_program,
            market.key(),
            market.vault_bump,
            amount,
        )?;
        Ok(())
    }

    /// Atualiza a config (authority, team_wallet e/ou fee). Permite migrar a authority
    /// pra uma multisig (ex.: Squads) sem precisar redeployar o programa.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_authority: Option<Pubkey>,
        new_team_wallet: Option<Pubkey>,
        new_fee_bps: Option<u16>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(authority) = new_authority {
            config.authority = authority;
        }
        if let Some(team_wallet) = new_team_wallet {
            config.team_wallet = team_wallet;
        }
        if let Some(fee_bps) = new_fee_bps {
            require!(fee_bps as u64 <= BPS_DENOMINATOR, BetError::InvalidFee);
            config.fee_bps = fee_bps;
        }
        Ok(())
    }
}

/// Saldo do vault descontando o buffer de rent, que nunca é distribuído.
fn vault_usable_balance(vault: &SystemAccount) -> Result<u64> {
    let rent_min = Rent::get()?.minimum_balance(0);
    Ok(vault.lamports().saturating_sub(rent_min))
}

fn transfer_from_vault<'info>(
    vault: &SystemAccount<'info>,
    to: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    market: Pubkey,
    vault_bump: u8,
    amount: u64,
) -> Result<()> {
    let usable = vault_usable_balance(vault)?;
    require!(amount <= usable, BetError::InsufficientHouseLiquidity);
    let seeds: &[&[&[u8]]] = &[&[b"vault", market.as_ref(), &[vault_bump]]];
    system_program::transfer(
        CpiContext::new_with_signer(
            system_program.to_account_info(),
            system_program::Transfer {
                from: vault.to_account_info(),
                to: to.clone(),
            },
            seeds,
        ),
        amount,
    )
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: destino das taxas; apenas armazenado.
    pub team_wallet: UncheckedAccount<'info>,
    /// Conta executável do próprio programa; usada só pra provar, via `program_data`,
    /// que `authority` é a upgrade authority.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ BetError::Unauthorized)]
    pub program: Program<'info, crate::program::OddiesBet>,
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()) @ BetError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u8)]
pub struct CreateGameCollection<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + GameCollection::INIT_SPACE,
        seeds = [b"game_collection".as_ref(), &[game_id]],
        bump
    )]
    pub game_collection: Account<'info, GameCollection>,
    /// PDA que é mint/update authority de todas as coleções — o programa assina
    /// com ela pra mintar a coleção e verificar os itens.
    /// CHECK: PDA validada por seeds; não guarda dados.
    #[account(seeds = [b"collection_authority"], bump)]
    pub collection_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        mint::decimals = 0,
        mint::authority = collection_authority,
        mint::freeze_authority = collection_authority,
    )]
    pub collection_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        token::mint = collection_mint,
        token::authority = collection_authority,
    )]
    pub collection_token_account: Account<'info, TokenAccount>,
    /// CHECK: criada por CPI ao Token Metadata; PDA validada por seeds.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), collection_mint.key().as_ref()],
        seeds::program = token_metadata_program.key(),
        bump
    )]
    pub collection_metadata: UncheckedAccount<'info>,
    /// CHECK: criada por CPI ao Token Metadata; PDA validada por seeds.
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), collection_mint.key().as_ref(), b"edition"],
        seeds::program = token_metadata_program.key(),
        bump
    )]
    pub collection_master_edition: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarket<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundHouse<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump = market.vault_bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"market", market.market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump = market.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: validado contra a config.
    #[account(mut, address = config.team_wallet)]
    pub team_wallet: UncheckedAccount<'info>,
    #[account(
        init,
        payer = bettor,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", market.key().as_ref(), ticket_mint.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,
    /// Ticket-NFT da aposta: mint novo (keypair do cliente), decimals 0, autoridade = market.
    #[account(
        init,
        payer = bettor,
        mint::decimals = 0,
        mint::authority = market,
    )]
    pub ticket_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = bettor,
        token::mint = ticket_mint,
        token::authority = bettor,
    )]
    pub ticket_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bettor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    // --- Identidade do jogo (opcionais): presentes quando market.game_id != GAME_NONE ---
    /// Registro da coleção do jogo do mercado (define nome/arte do ticket).
    #[account(
        seeds = [b"game_collection".as_ref(), &[market.game_id]],
        bump = game_collection.bump,
    )]
    pub game_collection: Option<Account<'info, GameCollection>>,
    /// CHECK: metadata do ticket; o Token Metadata valida a derivação da PDA no CPI.
    #[account(mut)]
    pub ticket_metadata: Option<UncheckedAccount<'info>>,
    /// Mint da coleção do jogo (checado contra game_collection.collection_mint no handler).
    #[account(mut)]
    pub collection_mint: Option<Account<'info, Mint>>,
    /// CHECK: metadata da coleção; validada pelo Token Metadata no CPI (size cresce).
    #[account(mut)]
    pub collection_metadata: Option<UncheckedAccount<'info>>,
    /// CHECK: master edition da coleção; validada pelo Token Metadata no CPI.
    pub collection_master_edition: Option<UncheckedAccount<'info>>,
    /// CHECK: PDA update authority da coleção; valida por seeds, assina via bump armazenado.
    #[account(seeds = [b"collection_authority"], bump)]
    pub collection_authority: Option<UncheckedAccount<'info>>,
    pub token_metadata_program: Option<Program<'info, Metadata>>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"market", market.market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut, seeds = [b"market", market.market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump = market.vault_bump)]
    pub vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"bet", market.key().as_ref(), ticket_mint.key().as_ref()],
        bump = bet.bump,
        has_one = market,
        has_one = ticket_mint,
    )]
    pub bet: Account<'info, Bet>,
    #[account(mut)]
    pub ticket_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = ticket_mint,
        token::authority = claimer,
    )]
    pub ticket_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub claimer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawHouse<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority, has_one = team_wallet)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"market", market.market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"vault", market.key().as_ref()], bump = market.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: validado contra a config via has_one.
    #[account(mut)]
    pub team_wallet: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub team_wallet: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketKind {
    /// Multiplayer: pote dividido entre vencedores, proporcional ao stake.
    Parimutuel,
    /// Singleplayer: casa paga odds fixas, vault precisa de liquidez.
    HouseBacked,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketState {
    Open,
    Resolved,
    /// Cancelado ou sem vencedores: todos recuperam o stake líquido.
    Voided,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub market_id: u64,
    pub fixture_id: u64,
    /// Jogo do mercado: define a coleção-identidade dos tickets. GAME_NONE = sem coleção.
    pub game_id: u8,
    pub kind: MarketKind,
    pub state: MarketState,
    pub outcome_count: u8,
    /// Odds em bps (25000 = 2.5x, inclui o stake). Só usado em HouseBacked.
    pub odds_bps: [u64; MAX_OUTCOMES],
    /// Total líquido apostado por outcome.
    pub pools: [u64; MAX_OUTCOMES],
    /// Obrigações da casa por outcome (só HouseBacked).
    pub liabilities: [u64; MAX_OUTCOMES],
    pub close_ts: i64,
    /// Piso pra resolve_market: precisa ser depois do fim real da partida, não só do kickoff.
    pub resolve_after_ts: i64,
    pub winning_outcome: u8,
    /// Pote total a distribuir (snapshot na resolução, só Parimutuel).
    pub payout_pool: u64,
    /// Quanto ainda pode ser reivindicado por apostadores; trava o withdraw_house.
    pub outstanding: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

/// Identidade on-chain de um jogo: a Collection NFT + os metadados que cada
/// ticket do jogo herda. Uma por game_id.
#[account]
#[derive(InitSpace)]
pub struct GameCollection {
    pub game_id: u8,
    pub collection_mint: Pubkey,
    pub bump: u8,
    pub collection_authority_bump: u8,
    #[max_len(32)]
    pub ticket_name: String,
    #[max_len(10)]
    pub ticket_symbol: String,
    #[max_len(200)]
    pub ticket_uri: String,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub market: Pubkey,
    pub ticket_mint: Pubkey,
    pub outcome: u8,
    /// Stake líquido (após taxa) que entrou no vault.
    pub stake_net: u64,
    /// Payout travado na entrada (só HouseBacked).
    pub fixed_payout: u64,
    pub claimed: bool,
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Eventos e erros
// ---------------------------------------------------------------------------

#[event]
pub struct BetPlaced {
    pub market: Pubkey,
    pub ticket_mint: Pubkey,
    pub bettor: Pubkey,
    pub outcome: u8,
    pub amount: u64,
    pub net: u64,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub state: MarketState,
    pub winning_outcome: u8,
}

#[event]
pub struct Claimed {
    pub market: Pubkey,
    pub ticket_mint: Pubkey,
    pub claimer: Pubkey,
    pub payout: u64,
}

#[error_code]
pub enum BetError {
    #[msg("Taxa inválida (máximo 10000 bps)")]
    InvalidFee,
    #[msg("Número de outcomes inválido (2 a 8)")]
    InvalidOutcomeCount,
    #[msg("Odds precisam ser maiores que 1x (10000 bps)")]
    InvalidOdds,
    #[msg("Deadline de apostas no passado")]
    CloseInPast,
    #[msg("Mercado não está aberto")]
    MarketNotOpen,
    #[msg("Apostas encerradas para este mercado")]
    BettingClosed,
    #[msg("Outcome inválido")]
    InvalidOutcome,
    #[msg("Valor precisa ser maior que zero")]
    ZeroAmount,
    #[msg("Vault da casa sem liquidez suficiente")]
    InsufficientHouseLiquidity,
    #[msg("Partida ainda não terminou")]
    MatchNotFinished,
    #[msg("Mercado ainda não foi liquidado")]
    MarketNotSettled,
    #[msg("Aposta já resgatada")]
    AlreadyClaimed,
    #[msg("Você não segura o ticket desta aposta")]
    TicketNotHeld,
    #[msg("Aposta perdedora")]
    LosingBet,
    #[msg("Overflow aritmético")]
    MathOverflow,
    #[msg("resolve_after_ts precisa ser depois de close_ts")]
    InvalidResolveWindow,
    #[msg("Não autorizado")]
    Unauthorized,
    #[msg("game_id inválido")]
    InvalidGameId,
    #[msg("Metadado (nome/símbolo/uri) longo demais")]
    MetadataTooLong,
    #[msg("Mercado pertence a um jogo com coleção: contas da coleção são obrigatórias")]
    MissingGameCollection,
    #[msg("Coleção não corresponde ao jogo do mercado")]
    GameMismatch,
}
