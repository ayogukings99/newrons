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

-- ── ROW LEVEL SECURITY (follows 013 conventions) ─────────────────────────────
-- face_enrollments: own-DID rows only (clients can enroll/rotate/delete their
-- own template hash — erasure included; writes always carry the hash, never
-- images, enforced by API contract and audited in VS4).
-- rhythmic_tap_log: read-own (sender or receiver); writes are service-role-only
-- (API settles value, then logs). service_role bypasses RLS throughout.

ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythmic_tap_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON face_enrollments TO authenticated;
GRANT SELECT ON rhythmic_tap_log TO authenticated;

DROP POLICY IF EXISTS "users_manage_own_face_enrollment" ON face_enrollments;
CREATE POLICY "users_manage_own_face_enrollment"
  ON face_enrollments FOR ALL TO authenticated
  USING (
    did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  )
  WITH CHECK (
    did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );

DROP POLICY IF EXISTS "users_see_own_taps" ON rhythmic_tap_log;
CREATE POLICY "users_see_own_taps"
  ON rhythmic_tap_log FOR SELECT TO authenticated
  USING (
    sender_did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR receiver_did IN (SELECT did FROM node_identities WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );
