-- =============================================================================
-- Migration 010: Solana On-Chain + DAO Governance Tables
-- Phase 4 — Months 11-18
-- =============================================================================

-- ── SOLANA WALLETS ────────────────────────────────────────────────────────────

CREATE TABLE user_wallets (
  id                   BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  solana_public_key    TEXT UNIQUE NOT NULL,
  solana_secret_key    TEXT NOT NULL,         -- AES-256-GCM encrypted
  network              TEXT NOT NULL DEFAULT 'devnet' CHECK (network IN ('devnet','mainnet-beta')),
  nxt_balance_cached   NUMERIC(18,6) DEFAULT 0,   -- cached from on-chain, refreshed on read
  sol_balance_cached   NUMERIC(18,9) DEFAULT 0,
  last_synced_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Token transactions log
CREATE TABLE solana_transactions (
  id           BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL CHECK (type IN ('mint','transfer_in','transfer_out','burn','withdrawal')),
  amount       NUMERIC(18,6) NOT NULL,
  signature    TEXT NOT NULL,               -- Solana transaction signature
  counterparty TEXT,                        -- user_id or external pubkey
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Pending mints to be settled on-chain (DB-to-chain queue)
CREATE TABLE solana_mint_queue (
  id           BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  amount       NUMERIC(18,6) NOT NULL,
  reason       TEXT,                        -- 'coin_earn' | 'quiz_reward' | 'creator_payout' etc.
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','failed')),
  signature    TEXT,
  retry_count  INT DEFAULT 0,
  settled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── DAO GOVERNANCE ─────────────────────────────────────────────────────────────

CREATE TABLE dao_proposals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id           BIGINT NOT NULL REFERENCES users(id),
  type                  TEXT NOT NULL CHECK (type IN (
    'platform_rule','community_fund','language_add','feature_request','ban_appeal','coin_policy'
  )),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'draft','active','passed','rejected','executed','cancelled'
  )),
  quorum_pct            FLOAT NOT NULL DEFAULT 5,
  majority_pct          FLOAT NOT NULL DEFAULT 51,
  voting_starts_at      TIMESTAMPTZ DEFAULT NOW(),
  voting_ends_at        TIMESTAMPTZ NOT NULL,
  yes_votes             NUMERIC(18,6) DEFAULT 0,   -- weighted by voting power
  no_votes              NUMERIC(18,6) DEFAULT 0,
  abstain_votes         NUMERIC(18,6) DEFAULT 0,
  total_eligible_voters BIGINT,
  execution_payload     JSONB,
  on_chain_ref          TEXT,              -- Solana memo transaction signature
  finalized_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dao_votes (
  id           BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  proposal_id  UUID NOT NULL REFERENCES dao_proposals(id) ON DELETE CASCADE,
  voter_id     BIGINT NOT NULL REFERENCES users(id),
  vote         TEXT NOT NULL CHECK (vote IN ('yes','no','abstain')),
  voting_power NUMERIC(18,6) NOT NULL,     -- NXT balance at time of vote
  on_chain_sig TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (proposal_id, voter_id)
);

CREATE TABLE dao_treasury (
  id              BIGINT PRIMARY KEY DEFAULT 1,
  nxt_balance     NUMERIC(18,6) DEFAULT 0,
  ngn_balance     NUMERIC(14,2) DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO dao_treasury (id, nxt_balance, ngn_balance) VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE dao_executions (
  id           BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  proposal_id  UUID NOT NULL REFERENCES dao_proposals(id),
  executed_by  BIGINT REFERENCES users(id),
  executed_at  TIMESTAMPTZ DEFAULT NOW(),
  result       TEXT,
  tx_hash      TEXT
);

-- ── RPC: vote tally increment ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dao_increment_votes(
  p_proposal_id UUID,
  p_field       TEXT,
  p_power       NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_field = 'yes_votes' THEN
    UPDATE dao_proposals SET yes_votes     = yes_votes     + p_power WHERE id = p_proposal_id;
  ELSIF p_field = 'no_votes' THEN
    UPDATE dao_proposals SET no_votes      = no_votes      + p_power WHERE id = p_proposal_id;
  ELSE
    UPDATE dao_proposals SET abstain_votes = abstain_votes + p_power WHERE id = p_proposal_id;
  END IF;
END;
$$;

-- ── USER COIN BALANCES (for voting power fallback) ────────────────────────────
-- May already exist from Phase 1; CREATE IF NOT EXISTS is safe

CREATE TABLE IF NOT EXISTS user_coin_balances (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance    NUMERIC(18,6) DEFAULT 0,
  lifetime   NUMERIC(18,6) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_user_wallets_pubkey      ON user_wallets (solana_public_key);
CREATE INDEX idx_solana_txns_user         ON solana_transactions (user_id, created_at DESC);
CREATE INDEX idx_mint_queue_pending       ON solana_mint_queue (status, created_at) WHERE status = 'pending';
CREATE INDEX idx_dao_proposals_status     ON dao_proposals (status, voting_ends_at);
CREATE INDEX idx_dao_proposals_type       ON dao_proposals (type, status);
CREATE INDEX idx_dao_votes_proposal       ON dao_votes (proposal_id);
CREATE INDEX idx_dao_votes_voter          ON dao_votes (voter_id);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE user_wallets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE solana_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dao_votes          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_own" ON user_wallets FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "txns_own" ON solana_transactions FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "votes_insert_own" ON dao_votes FOR INSERT
  WITH CHECK (voter_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "votes_select_all" ON dao_votes FOR SELECT USING (TRUE);
