import { PublicKey } from '@solana/web3.js'
import { randomUUID } from 'crypto'

// Pure Rhythmic escrow logic — NO supabase imports (unit-testable without env).
// Mirrors contracts/escrow/src/lib.rs: same "escrow" seed string, same state
// machine, same kind gate. If the program changes, this file + its tests change.

export const ESCROW_SEED = 'escrow'

export const KIND = { DUAL: 0, LIVE_PROOF: 1 } as const
export const STATE = {
  LOCKED: 0, ACCEPTED: 1, RELEASED: 2, REVERSED: 3, DISPUTED: 4,
} as const

export type EscrowKind = 'escrow_dual' | 'escrow_liveproof'
export type EscrowState = 'locked' | 'accepted' | 'released' | 'reversed' | 'disputed'

export const KIND_TO_U8: Record<EscrowKind, number> = { escrow_dual: 0, escrow_liveproof: 1 }
export const STATE_TO_U8: Record<EscrowState, number> = {
  locked: 0, accepted: 1, released: 2, reversed: 3, disputed: 4,
}

/** v1.4 kinds are typed upstream but rejected here until Phase 4. */
export function assertPhase1Kind(kind: string): asserts kind is EscrowKind {
  if (kind !== 'escrow_dual' && kind !== 'escrow_liveproof') {
    throw new Error(`Settlement kind reserved for Phase 4: ${kind}`)
  }
}

const TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  locked: ['accepted', 'reversed', 'disputed'],
  accepted: ['released', 'reversed', 'disputed'],
  released: [],
  reversed: [],
  disputed: [],
}

export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: EscrowState, to: EscrowState): void {
  if (!canTransition(from, to)) throw new Error(`Illegal escrow transition ${from} → ${to}`)
}

// ── Civic Credit math (soulbound; base 50, clamp 0–100) ──────────────────────

export const CREDIT_BASE = 50
export const CREDIT_RELEASE_REWARD = 2
export const CREDIT_DISPUTE_SLASH = -5

export function applyCredit(current: number, delta: number): number {
  return Math.min(100, Math.max(0, current + delta))
}

// ── PDA derivation (seed-compatible with the Anchor program) ─────────────────

/** 16-byte escrow id buffer (uuid v4 hex, dashes stripped). */
export function escrowIdBuffer(escrowKey: string): Buffer {
  const hex = escrowKey.replace(/-/g, '')
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error('escrowKey must be a uuid v4')
  return Buffer.from(hex, 'hex')
}

export function findEscrowPda(
  programId: string,
  payer: string,
  counterparty: string,
  escrowKey: string,
): { pda: string; bump: number } {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(ESCROW_SEED),
      new PublicKey(payer).toBuffer(),
      new PublicKey(counterparty).toBuffer(),
      escrowIdBuffer(escrowKey),
    ],
    new PublicKey(programId),
  )
  return { pda: pda.toBase58(), bump }
}

export function newEscrowKey(): string {
  return randomUUID()
}

// ── Anti-collusion heuristics ─────────────────────────────────────────────────
// Rapid same-pair cycling (lock→reverse loops farming credit events) is the
// cheapest farming pattern. >3 same-pair escrows in 10 min → disputed.

export const PAIR_CYCLE_WINDOW_MS = 10 * 60_000
export const PAIR_CYCLE_LIMIT = 3

export function isRapidCycling(pairCreatedAts: number[], now = Date.now()): boolean {
  return pairCreatedAts.filter((t) => now - t < PAIR_CYCLE_WINDOW_MS).length > PAIR_CYCLE_LIMIT
}
