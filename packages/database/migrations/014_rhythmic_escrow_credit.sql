-- =============================================================================
-- Migration 014: Rhythmic OS escrow records + soulbound Civic Credit
-- =============================================================================
-- Phase-1 (VS2) economic rails. NXT value moves through the existing
-- process_wallet_transfer RPC (never raw SQL balance updates, per convention).
-- On-chain Anchor PDA escrow (contracts/escrow) mirrors this state machine;
-- the pda column links the two once the program is deployed to devnet.
--
-- Soulbound guarantee: scores change ONLY via civic_credit_events rows written
-- by the API service role. There is intentionally no transfer function.

-- ── RHYTHMIC ESCROWS ─────────────────────────────────────────────────────────
-- Two-Stage Escrow: locked → accepted → (released | reversed | disputed).
-- kind is Phase-1 only; v1.4 kinds (asset_sale, timed_attendance) are rejected
-- by the API + program until Phase 4 — the columns already fit them (no rework).

CREATE TABLE IF NOT EXISTS rhythmic_escrows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_key       TEXT NOT NULL UNIQUE,   -- client idempotency key (uuid v4)
  payer_did        TEXT NOT NULL,          -- did:scn:<base58>
  counterparty_did TEXT NOT NULL,
  amount_nxt       NUMERIC(18,4) NOT NULL CHECK (amount_nxt > 0),
  kind             TEXT NOT NULL DEFAULT 'escrow_dual'
                   CHECK (kind IN ('escrow_dual', 'escrow_liveproof')),
  state            TEXT NOT NULL DEFAULT 'locked'
                   CHECK (state IN ('locked', 'accepted', 'released', 'reversed', 'disputed')),
  pda              TEXT,                   -- solana PDA once onchain, NULL in NXT-reserve mode
  live_proof_hash  TEXT,                   -- sha256 hex unlocking liveproof release
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  settled_at       TIMESTAMPTZ,
  CHECK (payer_did <> counterparty_did)    -- no self-escrow, enforced at DB level
);

CREATE INDEX IF NOT EXISTS idx_rhythmic_escrows_payer ON rhythmic_escrows(payer_did, state);
CREATE INDEX IF NOT EXISTS idx_rhythmic_escrows_counterparty ON rhythmic_escrows(counterparty_did, state);

-- ── CIVIC CREDIT EVENTS (append-only ledger) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_credit_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  did        TEXT NOT NULL,                -- did:scn:<base58>
  delta      INT NOT NULL CHECK (delta BETWEEN -100 AND 100),
  reason     TEXT NOT NULL,                -- e.g. escrow_released, escrow_disputed, tap_transfer
  escrow_id  UUID REFERENCES rhythmic_escrows(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_events_did ON civic_credit_events(did, created_at DESC);

-- ── CIVIC CREDIT SCORES (projection; base 50, clamp 0–100) ────────────────────

CREATE TABLE IF NOT EXISTS civic_credit_scores (
  did        TEXT PRIMARY KEY,
  score      INT NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY (follows 013 conventions) ─────────────────────────────
-- Writes stay service-role-only (API enforces the escrow state machine and
-- mints credit); authenticated clients get read-own-rows for their own UX.
-- service_role bypasses RLS, so API settlement is unaffected.

ALTER TABLE rhythmic_escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE civic_credit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE civic_credit_scores ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON rhythmic_escrows TO authenticated;
GRANT SELECT ON civic_credit_events TO authenticated;
GRANT SELECT ON civic_credit_scores TO authenticated;

DROP POLICY IF EXISTS "users_see_own_escrows" ON rhythmic_escrows;
CREATE POLICY "users_see_own_escrows"
  ON rhythmic_escrows FOR SELECT TO authenticated
  USING (
    payer_did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR counterparty_did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );

DROP POLICY IF EXISTS "users_see_own_credit_events" ON civic_credit_events;
CREATE POLICY "users_see_own_credit_events"
  ON civic_credit_events FOR SELECT TO authenticated
  USING (
    did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );

DROP POLICY IF EXISTS "users_see_own_credit_score" ON civic_credit_scores;
CREATE POLICY "users_see_own_credit_score"
  ON civic_credit_scores FOR SELECT TO authenticated
  USING (
    did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );
