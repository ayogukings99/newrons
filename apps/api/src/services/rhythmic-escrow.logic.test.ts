import { describe, it, expect } from 'vitest'
import {
  ESCROW_SEED, KIND_TO_U8, STATE_TO_U8, CREDIT_BASE, FACE_THRESHOLD_NXT,
  assertPhase1Kind, assertTransition, canTransition,
  applyCredit, escrowIdBuffer, findEscrowPda, isRapidCycling, mergeOutbox,
} from './rhythmic-escrow.logic'

// Pure-logic tests — no env, no supabase. Mirror of contracts/escrow/src/lib.rs.
describe('kind gate', () => {
  it('accepts Phase-1 kinds', () => {
    expect(() => assertPhase1Kind('escrow_dual')).not.toThrow()
    expect(() => assertPhase1Kind('escrow_liveproof')).not.toThrow()
  })
  it('rejects v1.4 kinds until Phase 4', () => {
    expect(() => assertPhase1Kind('asset_sale')).toThrow(/Phase 4/)
    expect(() => assertPhase1Kind('timed_attendance')).toThrow(/Phase 4/)
  })
  it('u8 mapping matches the Anchor program constants', () => {
    expect(KIND_TO_U8).toEqual({ escrow_dual: 0, escrow_liveproof: 1 })
    expect(STATE_TO_U8).toEqual({ locked: 0, accepted: 1, released: 2, reversed: 3, disputed: 4 })
  })
})

describe('state machine', () => {
  it('allows the happy path locked → accepted → released', () => {
    expect(canTransition('locked', 'accepted')).toBe(true)
    expect(canTransition('accepted', 'released')).toBe(true)
  })
  it('rejects release before accept and any exit from terminal states', () => {
    expect(canTransition('locked', 'released')).toBe(false)
    for (const s of ['released', 'reversed', 'disputed'] as const) {
      expect(canTransition(s, 'locked')).toBe(false)
      expect(() => assertTransition(s, 'accepted')).toThrow(/Illegal/)
    }
  })
})

describe('credit math', () => {
  it('clamps to 0–100 around base 50', () => {
    expect(applyCredit(CREDIT_BASE, 2)).toBe(52)
    expect(applyCredit(99, 5)).toBe(100)
    expect(applyCredit(3, -5)).toBe(0)
  })
})

describe('PDA derivation', () => {
  const program = 'NRNSescrw1111111111111111111111111111111111'
  const payer = '11111111111111111111111111111111'
  const counter = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  it('uses the "escrow" seed and is deterministic', () => {
    expect(ESCROW_SEED).toBe('escrow')
    const key = '123e4567-e89b-12d3-a456-426614174000'
    const a = findEscrowPda(program, payer, counter, key)
    const b = findEscrowPda(program, payer, counter, key)
    expect(a).toEqual(b)
    expect(a.pda.length).toBeGreaterThan(30)
  })
  it('rejects non-uuid escrow keys', () => {
    expect(() => escrowIdBuffer('not-a-uuid')).toThrow()
    expect(escrowIdBuffer('123e4567-e89b-12d3-a456-426614174000')).toHaveLength(16)
  })
})

describe('face gate + offline outbox', () => {
  it('gates instant transfers at 50 NXT', () => {
    expect(FACE_THRESHOLD_NXT).toBe(50)
  })
  it('dedupes the outbox by idempotency key and caps at 50', () => {
    const mk = (key: string) => ({ key, to: 'did:scn:x', amountNxt: 1, queuedAt: new Date().toISOString() })
    const merged = mergeOutbox([mk('a')], [mk('a'), mk('b')])
    expect(merged.map((t) => t.key)).toEqual(['a', 'b'])
    const big = Array.from({ length: 60 }, (_, i) => mk(`k${i}`))
    expect(mergeOutbox([], big)).toHaveLength(50)
  })
})

describe('rapid-cycling heuristic', () => {
  it('flags >3 same-pair escrows in 10 minutes', () => {
    const now = Date.now()
    expect(isRapidCycling([now - 1_000, now - 2_000, now - 3_000, now - 4_000], now)).toBe(true)
    expect(isRapidCycling([now - 1_000, now - 2_000], now)).toBe(false)
    expect(isRapidCycling([now - 11 * 60_000, now - 12 * 60_000, now - 13 * 60_000, now - 14 * 60_000], now)).toBe(false)
  })
})
