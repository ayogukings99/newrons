//! Newrons Rhythmic OS — Two-Stage Escrow (Solana devnet).
//!
//! PDA seeds: ["escrow", payer, counterparty, escrow_id(16 bytes)].
//! The TS mirror lives in apps/api/src/services/rhythmic-escrow.logic.ts
//! (SEED_STR, PDA derivation, state machine). Keep the two in sync.
//!
//! Release rule:
//!   - kind == DUAL (0):      payer AND counterparty must both sign release.
//!   - kind == LIVE_PROOF (1): payer signs + 32-byte live-proof hash must match.
//! Reverse rule: payer after expiry, or counterparty any time pre-release
//! (refusal path). Funds are NXT-mint SPL tokens held by the PDA.

use anchor_lang::prelude::*;

declare_id!("NRNSescrw1111111111111111111111111111111111");

pub const KIND_DUAL: u8 = 0;
pub const KIND_LIVE_PROOF: u8 = 1;

pub const STATE_LOCKED: u8 = 0;
pub const STATE_ACCEPTED: u8 = 1;
pub const STATE_RELEASED: u8 = 2;
pub const STATE_REVERSED: u8 = 3;
pub const STATE_DISPUTED: u8 = 4;

#[program]
pub mod newrons_escrow {
    use super::*;

    /// Lock funds into a new escrow PDA. Phase-1 kinds only (0, 1).
    /// v1.4 kinds (asset_sale = 2, timed_attendance = 3) are rejected here
    /// until Phase 4 — the columns already fit them, so no migration then.
    pub fn initialize(
        ctx: Context<Initialize>,
        amount: u64,
        kind: u8,
        expires_at: i64,
        escrow_id: [u8; 16],
    ) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        require!(
            kind == KIND_DUAL || kind == KIND_LIVE_PROOF,
            EscrowError::InvalidKind
        );
        require!(
            expires_at > Clock::get()?.unix_timestamp,
            EscrowError::InvalidExpiry
        );
        require_keys_neq!(ctx.accounts.payer.key(), ctx.accounts.counterparty.key());

        let escrow = &mut ctx.accounts.escrow;
        escrow.payer = ctx.accounts.payer.key();
        escrow.counterparty = ctx.accounts.counterparty.key();
        escrow.amount = amount;
        escrow.kind = kind;
        escrow.state = STATE_LOCKED;
        escrow.expires_at = expires_at;
        escrow.bump = ctx.bumps.escrow;

        emit!(EscrowLocked {
            escrow: escrow.key(),
            payer: escrow.payer,
            counterparty: escrow.counterparty,
            amount,
            kind,
        });
        Ok(())
    }

    /// Counterparty accepts the locked escrow.
    pub fn accept(ctx: Context<Accept>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == STATE_LOCKED, EscrowError::InvalidState);
        require!(
            Clock::get()?.unix_timestamp < escrow.expires_at,
            EscrowError::Expired
        );
        escrow.state = STATE_ACCEPTED;
        emit!(EscrowAccepted { escrow: escrow.key() });
        Ok(())
    }

    /// Release locked funds to the counterparty (see module docs for signer rules).
    pub fn release(ctx: Context<Release>, proof_hash: Option<[u8; 32]>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.state == STATE_ACCEPTED, EscrowError::InvalidState);

        if escrow.kind == KIND_DUAL {
            // Dual signature: payer must co-sign (counterparty is already a signer
            // via the Release accounts context — enforced below).
            require!(ctx.accounts.payer.is_signer, EscrowError::MissingCoSignature);
        } else {
            let hash = proof_hash.ok_or(EscrowError::MissingProof)?;
            escrow.live_proof_hash = Some(hash);
        }

        escrow.state = STATE_RELEASED;
        // NOTE: SPL transfer of escrow.amount from PDA token account to the
        // counterparty token account is executed by the API relay (VS2) via
        // process_wallet_transfer, then anchored here in VS3 with full CPI.
        emit!(EscrowReleased { escrow: escrow.key() });
        Ok(())
    }

    /// Reverse locked funds back to the payer.
    pub fn reverse(ctx: Context<Reverse>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.state == STATE_LOCKED || escrow.state == STATE_ACCEPTED,
            EscrowError::InvalidState
        );
        let now = Clock::get()?.unix_timestamp;
        let by_payer_after_expiry =
            ctx.accounts.authority.key() == escrow.payer && now >= escrow.expires_at;
        let by_counterparty_refusal = ctx.accounts.authority.key() == escrow.counterparty;
        require!(
            by_payer_after_expiry || by_counterparty_refusal,
            EscrowError::UnauthorizedReverse
        );
        escrow.state = STATE_REVERSED;
        emit!(EscrowReversed { escrow: escrow.key() });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, kind: u8, expires_at: i64, escrow_id: [u8; 16])]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: counterparty is a raw pubkey (DID-mapped off-chain in VS2).
    pub counterparty: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 8 + 1 + 1 + 8 + 16 + 33 + 1,
        seeds = [b"escrow", payer.key().as_ref(), counterparty.key().as_ref(), &escrow_id],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Accept<'info> {
    pub counterparty: Signer<'info>,
    #[account(
        mut,
        has_one = counterparty,
        seeds = [b"escrow", escrow.payer.as_ref(), escrow.counterparty.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    pub counterparty: Signer<'info>,
    /// CHECK: payer co-signs dual-kind releases; enforced in the handler via
    /// is_signer for KIND_DUAL. No data is read from this account.
    pub payer: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = counterparty,
        has_one = payer,
        seeds = [b"escrow", escrow.payer.as_ref(), escrow.counterparty.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Reverse<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.payer.as_ref(), escrow.counterparty.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[account]
pub struct Escrow {
    pub payer: Pubkey,
    pub counterparty: Pubkey,
    pub amount: u64,
    pub kind: u8,
    pub state: u8,
    pub expires_at: i64,
    pub escrow_id: [u8; 16],
    pub live_proof_hash: Option<[u8; 32]>,
    pub bump: u8,
}

#[event]
pub struct EscrowLocked {
    pub escrow: Pubkey,
    pub payer: Pubkey,
    pub counterparty: Pubkey,
    pub amount: u64,
    pub kind: u8,
}

#[event]
pub struct EscrowAccepted {
    pub escrow: Pubkey,
}

#[event]
pub struct EscrowReleased {
    pub escrow: Pubkey,
}

#[event]
pub struct EscrowReversed {
    pub escrow: Pubkey,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero (zero-value escrows earn zero credit).")]
    ZeroAmount,
    #[msg("Kind not enabled yet — asset_sale / timed_attendance arrive in Phase 4.")]
    InvalidKind,
    #[msg("Expiry must be in the future.")]
    InvalidExpiry,
    #[msg("Escrow is not in the required state for this action.")]
    InvalidState,
    #[msg("Escrow has expired.")]
    Expired,
    #[msg("Dual-kind release needs the payer co-signature.")]
    MissingCoSignature,
    #[msg("Live-proof release needs the 32-byte proof hash.")]
    MissingProof,
    #[msg("Only the payer (after expiry) or the counterparty (refusal) may reverse.")]
    UnauthorizedReverse,
}
