-- =============================================================================
-- Migration 015: Rhythmic face-gate hardening + offline tap outbox log
-- =============================================================================
-- face_enrollments stores ONLY the sha256 template hash (never raw images),
-- written only with explicit user consent at enroll time. Raw biometrics must
-- never touch these tables — enforced by API contract, audited in VS4.
-- rhythmic_tap_log gives offline-queued taps idempotent settlement.

CREATE TABLE IF NOT EXISTS face_enrollments (
  did           TEXT PRIMARY KEY,            -- did:scn:<base58>
  template_hash TEXT NOT NULL CHECK (template_hash ~ '^[0-9a-fA-F]{64}$'),
  consented_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rhythmic_tap_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key    TEXT NOT NULL UNIQUE,   -- client uuid per tap attempt
  sender_did         TEXT NOT NULL,
  receiver_did       TEXT NOT NULL,
  amount_nxt         NUMERIC(18,4) NOT NULL CHECK (amount_nxt > 0),
  offline_created_at TIMESTAMPTZ,            -- set when queued offline
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sender_did <> receiver_did)
);

CREATE INDEX IF NOT EXISTS idx_tap_log_sender ON rhythmic_tap_log(sender_did, created_at DESC);
