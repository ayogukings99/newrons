-- =============================================================================
-- Migration 012: Phase 5 — Public Infrastructure
-- Community Language Model, Developer API, Avatar NFT, Grants, LOGOS Public
-- =============================================================================

-- ── COMMUNITY LANGUAGE MODEL (CLM) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clm_contributions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('text','audio','translation_pair')),
  language_code    TEXT NOT NULL,
  dialect_tag      TEXT,
  domain           TEXT NOT NULL CHECK (domain IN (
    'general','proverb','story','news','legal','medical',
    'agriculture','tech','religion','music'
  )),
  content          TEXT NOT NULL,
  content_hash     TEXT NOT NULL,
  target_content   TEXT,
  target_lang      TEXT,
  char_count       INT NOT NULL DEFAULT 0,
  duration_secs    NUMERIC(6,1),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','validating','accepted','rejected')),
  validation_count INT NOT NULL DEFAULT 0,
  approve_count    INT NOT NULL DEFAULT 0,
  reject_count     INT NOT NULL DEFAULT 0,
  coins_earned     INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contributor_id, content_hash, language_code)
);

CREATE TABLE IF NOT EXISTS clm_validations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id  UUID NOT NULL REFERENCES clm_contributions(id) ON DELETE CASCADE,
  validator_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote             TEXT NOT NULL CHECK (vote IN ('approve','reject')),
  reason           TEXT,
  coins_earned     INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contribution_id, validator_id)
);

CREATE TABLE IF NOT EXISTS clm_dataset_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     BIGINT NOT NULL REFERENCES users(id),
  version_label  TEXT NOT NULL UNIQUE,
  version_hash   TEXT NOT NULL,
  notes          TEXT,
  stats          JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Per-language aggregate stats (updated via RPC after each acceptance)
CREATE TABLE IF NOT EXISTS clm_dataset_stats (
  language_code       TEXT PRIMARY KEY,
  contribution_count  INT NOT NULL DEFAULT 0,
  token_count         INT NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RPC: increment dataset stats per language
CREATE OR REPLACE FUNCTION clm_increment_dataset_stats(
  p_language TEXT,
  p_domain   TEXT,
  p_tokens   INT
) RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO clm_dataset_stats (language_code, contribution_count, token_count)
  VALUES (p_language, 1, p_tokens)
  ON CONFLICT (language_code) DO UPDATE
  SET contribution_count = clm_dataset_stats.contribution_count + 1,
      token_count        = clm_dataset_stats.token_count + p_tokens,
      updated_at         = NOW();
$$;

-- RPC: overall dataset totals
CREATE OR REPLACE FUNCTION clm_dataset_totals()
RETURNS TABLE (
  total_contributions BIGINT,
  accepted_count      BIGINT,
  total_tokens        BIGINT
) LANGUAGE SQL STABLE AS $$
  SELECT
    COUNT(*)                                  AS total_contributions,
    COUNT(*) FILTER (WHERE status='accepted') AS accepted_count,
    SUM(CASE WHEN status='accepted' THEN ROUND(char_count * 0.25) ELSE 0 END) AS total_tokens
  FROM clm_contributions;
$$;

-- RPC: contributor stats
CREATE OR REPLACE FUNCTION clm_contributor_stats(p_user_id BIGINT)
RETURNS TABLE (
  total_submitted    BIGINT,
  total_accepted     BIGINT,
  total_rejected     BIGINT,
  total_validated    BIGINT,
  total_coins_earned BIGINT
) LANGUAGE SQL STABLE AS $$
  SELECT
    COUNT(*)                                   AS total_submitted,
    COUNT(*) FILTER (WHERE status='accepted')  AS total_accepted,
    COUNT(*) FILTER (WHERE status='rejected')  AS total_rejected,
    (SELECT COUNT(*) FROM clm_validations WHERE validator_id = p_user_id) AS total_validated,
    (
      SELECT COALESCE(SUM(coins_earned),0) FROM clm_contributions WHERE contributor_id = p_user_id
    ) + (
      SELECT COALESCE(SUM(coins_earned),0) FROM clm_validations WHERE validator_id = p_user_id
    ) AS total_coins_earned
  FROM clm_contributions
  WHERE contributor_id = p_user_id;
$$;

-- RPC: leaderboard
CREATE OR REPLACE FUNCTION clm_leaderboard(p_limit INT DEFAULT 50)
RETURNS TABLE (
  contributor_id BIGINT,
  accepted_count BIGINT,
  total_coins    BIGINT
) LANGUAGE SQL STABLE AS $$
  SELECT
    contributor_id,
    COUNT(*) FILTER (WHERE status='accepted') AS accepted_count,
    SUM(coins_earned)                         AS total_coins
  FROM clm_contributions
  GROUP BY contributor_id
  ORDER BY total_coins DESC
  LIMIT p_limit;
$$;

-- ── DEVELOPER API ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS developer_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  app_name     TEXT NOT NULL,
  app_url      TEXT,
  tier         TEXT NOT NULL DEFAULT 'free'
               CHECK (tier IN ('free','starter','pro','enterprise')),
  webhook_url  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  key_hash         TEXT NOT NULL UNIQUE,
  prefix           TEXT NOT NULL,
  scopes           TEXT NOT NULL DEFAULT '["*"]',   -- JSON array
  tier             TEXT NOT NULL DEFAULT 'free',
  env              TEXT NOT NULL DEFAULT 'live' CHECK (env IN ('live','test')),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','revoked','expired')),
  monthly_quota    INT NOT NULL DEFAULT 1000,        -- -1 = unlimited
  used_this_month  INT NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_usage (
  id             BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key_id         UUID NOT NULL REFERENCES developer_api_keys(id) ON DELETE CASCADE,
  period         DATE NOT NULL,      -- YYYY-MM-DD
  endpoint       TEXT NOT NULL,
  request_count  INT NOT NULL DEFAULT 0,
  error_count    INT NOT NULL DEFAULT 0,
  avg_latency_ms INT NOT NULL DEFAULT 0,
  UNIQUE (key_id, period, endpoint)
);

CREATE TABLE IF NOT EXISTS developer_rate_buckets (
  key_id         UUID NOT NULL REFERENCES developer_api_keys(id) ON DELETE CASCADE,
  bucket         TEXT NOT NULL,      -- "YYYY-MM-DDTHH:MM"
  request_count  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, bucket)
);

-- RPC: increment daily usage
CREATE OR REPLACE FUNCTION developer_increment_usage(
  p_key_id   UUID,
  p_date     DATE,
  p_endpoint TEXT
) RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO developer_usage (key_id, period, endpoint, request_count)
  VALUES (p_key_id, p_date, p_endpoint, 1)
  ON CONFLICT (key_id, period, endpoint) DO UPDATE
  SET request_count = developer_usage.request_count + 1;
$$;

-- RPC: increment monthly key usage
CREATE OR REPLACE FUNCTION developer_increment_monthly(p_key_id UUID)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE developer_api_keys
  SET used_this_month = used_this_month + 1,
      last_used_at    = NOW()
  WHERE id = p_key_id;
$$;

-- ── AVATAR NFT ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS avatar_nfts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mint_address  TEXT NOT NULL UNIQUE,
  metadata_uri  TEXT NOT NULL,
  name          TEXT NOT NULL,
  image_url     TEXT NOT NULL,
  traits        JSONB NOT NULL DEFAULT '[]',
  listed        BOOLEAN NOT NULL DEFAULT FALSE,
  list_price    NUMERIC(18,6),
  minted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS avatar_listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_id         UUID NOT NULL UNIQUE REFERENCES avatar_nfts(id) ON DELETE CASCADE,
  seller_id      BIGINT NOT NULL REFERENCES users(id),
  mint_address   TEXT NOT NULL,
  price_nxt      NUMERIC(18,6) NOT NULL,
  escrow_address TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS avatar_sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_id        UUID NOT NULL REFERENCES avatar_nfts(id),
  seller_id     BIGINT NOT NULL REFERENCES users(id),
  buyer_id      BIGINT NOT NULL REFERENCES users(id),
  price_nxt     NUMERIC(18,6) NOT NULL,
  tx_signature  TEXT,
  sold_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── COMMUNITY GRANTS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grant_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id     BIGINT NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  impact_statement TEXT NOT NULL,
  requested_nxt    NUMERIC(18,6) NOT NULL,
  milestones       JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('draft','submitted','voting','approved','active','completed','rejected','cancelled')),
  dao_proposal_id  UUID REFERENCES dao_proposals(id),
  approved_at      TIMESTAMPTZ,
  disbursed_nxt    NUMERIC(18,6) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grant_disbursements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id         UUID NOT NULL REFERENCES grant_applications(id) ON DELETE CASCADE,
  milestone_order  INT NOT NULL,
  nxt_amount       NUMERIC(18,6) NOT NULL,
  proof_url        TEXT NOT NULL,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','approved','rejected')),
  approved_by      BIGINT REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  tx_signature     TEXT,
  review_ends_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treasury_transactions (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  direction   TEXT NOT NULL CHECK (direction IN ('inflow','outflow')),
  amount_nxt  NUMERIC(18,6) NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RPC: increment disbursed amount on grant
CREATE OR REPLACE FUNCTION grant_increment_disbursed(
  p_grant_id UUID,
  p_amount   NUMERIC
) RETURNS VOID LANGUAGE SQL AS $$
  UPDATE grant_applications
  SET disbursed_nxt = disbursed_nxt + p_amount
  WHERE id = p_grant_id;
$$;

-- RPC: adjust treasury balance
CREATE OR REPLACE FUNCTION treasury_adjust_balance(
  p_delta     NUMERIC,
  p_direction TEXT,
  p_amount    NUMERIC
) RETURNS VOID LANGUAGE SQL AS $$
  UPDATE dao_treasury
  SET nxt_balance   = GREATEST(0, nxt_balance + p_delta),
      total_inflow  = CASE WHEN p_direction='inflow'  THEN total_inflow  + p_amount ELSE total_inflow  END,
      total_outflow = CASE WHEN p_direction='outflow' THEN total_outflow + p_amount ELSE total_outflow END,
      updated_at    = NOW()
  WHERE id = 1;
$$;

-- ── LOGOS PUBLIC INFRASTRUCTURE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logos_public_graphs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             BIGINT NOT NULL REFERENCES users(id),
  graph_id             UUID NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL,
  language_code        TEXT NOT NULL DEFAULT 'en',
  pricing_model        TEXT NOT NULL DEFAULT 'free'
                       CHECK (pricing_model IN ('free','per_query','subscription')),
  price_per_query_nxt  NUMERIC(10,4) NOT NULL DEFAULT 0,
  node_count           INT NOT NULL DEFAULT 0,
  edge_count           INT NOT NULL DEFAULT 0,
  total_queries        INT NOT NULL DEFAULT 0,
  avg_rating           NUMERIC(3,2) NOT NULL DEFAULT 0,
  quality_badge        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logos_query_log (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  graph_id    UUID NOT NULL,
  node_id     UUID,
  caller_id   UUID,    -- developer account id
  key_id      UUID REFERENCES developer_api_keys(id) ON DELETE SET NULL,
  latency_ms  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logos_graph_ratings (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  graph_id   UUID NOT NULL,
  rater_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars      INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (graph_id, rater_id)
);

CREATE TABLE IF NOT EXISTS logos_federation (
  id               BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  institution_id   TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  graph_id         TEXT NOT NULL,
  graph_name       TEXT NOT NULL,
  endpoint_url     TEXT NOT NULL,
  trust_level      TEXT NOT NULL DEFAULT 'query-only'
                   CHECK (trust_level IN ('full','read-only','query-only')),
  registered_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (institution_id, graph_id)
);

-- RPC: query volume by day for a graph
CREATE OR REPLACE FUNCTION logos_query_volume_by_day(p_graph_id UUID, p_days INT DEFAULT 14)
RETURNS TABLE (date TEXT, count BIGINT) LANGUAGE SQL STABLE AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
    COUNT(*) AS count
  FROM logos_query_log
  WHERE graph_id = p_graph_id
  AND   created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE_TRUNC('day', created_at)
  ORDER BY DATE_TRUNC('day', created_at);
$$;

-- RPC: increment graph query count
CREATE OR REPLACE FUNCTION logos_increment_queries(p_graph_id UUID)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE logos_public_graphs
  SET total_queries = total_queries + 1
  WHERE graph_id = p_graph_id;
$$;

-- Community coins RPCs (used by CLM + LOGOS billing)
CREATE OR REPLACE FUNCTION increment_community_coins(
  p_user_id BIGINT,
  p_amount  INT,
  p_note    TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO user_coin_balances (user_id, balance, total_earned)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance      = user_coin_balances.balance + p_amount,
      total_earned = user_coin_balances.total_earned + p_amount;
$$;

CREATE OR REPLACE FUNCTION decrement_community_coins_safe(
  p_user_id BIGINT,
  p_amount  INT,
  p_note    TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE SQL AS $$
  UPDATE user_coin_balances
  SET balance = GREATEST(0, balance - p_amount)
  WHERE user_id = p_user_id;
$$;

-- ── INDEXES ───────────────────────────────────────────────────────────────────

-- CLM
CREATE INDEX IF NOT EXISTS idx_clm_contributions_contributor ON clm_contributions (contributor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clm_contributions_status      ON clm_contributions (status, language_code);
CREATE INDEX IF NOT EXISTS idx_clm_contributions_hash        ON clm_contributions (content_hash);
CREATE INDEX IF NOT EXISTS idx_clm_validations_contribution  ON clm_validations (contribution_id);
CREATE INDEX IF NOT EXISTS idx_clm_validations_validator     ON clm_validations (validator_id);

-- Developer API
CREATE INDEX IF NOT EXISTS idx_dev_keys_account     ON developer_api_keys (account_id, status);
CREATE INDEX IF NOT EXISTS idx_dev_keys_hash        ON developer_api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_dev_usage_key_period ON developer_usage (key_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_dev_rate_key_bucket  ON developer_rate_buckets (key_id, bucket);

-- Avatar NFT
CREATE INDEX IF NOT EXISTS idx_avatar_nfts_owner    ON avatar_nfts (owner_id);
CREATE INDEX IF NOT EXISTS idx_avatar_listings_mint ON avatar_listings (mint_address);
CREATE INDEX IF NOT EXISTS idx_avatar_sales_nft     ON avatar_sales (nft_id, sold_at DESC);

-- Grants
CREATE INDEX IF NOT EXISTS idx_grants_applicant ON grant_applications (applicant_id, status);
CREATE INDEX IF NOT EXISTS idx_grants_proposal  ON grant_applications (dao_proposal_id);
CREATE INDEX IF NOT EXISTS idx_disbursements    ON grant_disbursements (grant_id, status);
CREATE INDEX IF NOT EXISTS idx_treasury_txns    ON treasury_transactions (direction, created_at DESC);

-- LOGOS public
CREATE INDEX IF NOT EXISTS idx_logos_pub_graphs_popular ON logos_public_graphs (total_queries DESC);
CREATE INDEX IF NOT EXISTS idx_logos_pub_graphs_lang    ON logos_public_graphs (language_code);
CREATE INDEX IF NOT EXISTS idx_logos_query_log_graph    ON logos_query_log (graph_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logos_query_log_caller   ON logos_query_log (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logos_ratings_graph      ON logos_graph_ratings (graph_id);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE clm_contributions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clm_validations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_api_keys     ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_nfts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_listings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_applications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_disbursements    ENABLE ROW LEVEL SECURITY;

-- CLM: anyone can read public contributions; insert/update own
CREATE POLICY "clm_contributions_select" ON clm_contributions FOR SELECT USING (TRUE);
CREATE POLICY "clm_contributions_insert" ON clm_contributions FOR INSERT
  WITH CHECK (contributor_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "clm_validations_select" ON clm_validations FOR SELECT USING (TRUE);
CREATE POLICY "clm_validations_insert" ON clm_validations FOR INSERT
  WITH CHECK (validator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Developer: own account
CREATE POLICY "dev_accounts_own" ON developer_accounts FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "dev_keys_own" ON developer_api_keys FOR ALL
  USING (account_id IN (
    SELECT id FROM developer_accounts
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  ));

-- Avatar NFT: owner controls; public can read listings
CREATE POLICY "avatar_nfts_own" ON avatar_nfts FOR ALL
  USING (owner_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "avatar_listings_select" ON avatar_listings FOR SELECT USING (TRUE);
CREATE POLICY "avatar_listings_own"    ON avatar_listings FOR INSERT
  WITH CHECK (seller_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Grants: public read; insert own
CREATE POLICY "grants_select" ON grant_applications FOR SELECT USING (TRUE);
CREATE POLICY "grants_insert" ON grant_applications FOR INSERT
  WITH CHECK (applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "disbursements_select" ON grant_disbursements FOR SELECT USING (TRUE);
CREATE POLICY "disbursements_insert" ON grant_disbursements FOR INSERT
  WITH CHECK (
    grant_id IN (
      SELECT id FROM grant_applications
      WHERE applicant_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
