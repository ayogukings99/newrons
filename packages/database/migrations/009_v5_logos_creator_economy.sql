-- =============================================================================
-- Migration 009: LOGOS Layer + Creator Economy Tables
-- Phase 3
-- =============================================================================

-- ── LOGOS LAYER ───────────────────────────────────────────────────────────────

CREATE TABLE logos_nodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  content          TEXT NOT NULL,
  summary          TEXT,
  content_type     TEXT NOT NULL CHECK (content_type IN ('text','image','audio','video','link','formula')),
  language_code    TEXT NOT NULL DEFAULT 'en',
  source_url       TEXT,
  tags             TEXT[] DEFAULT '{}',
  embedding        vector(1024),            -- Cohere embed-multilingual-v3.0 = 1024 dims
  is_public        BOOLEAN DEFAULT TRUE,
  is_verified      BOOLEAN DEFAULT FALSE,
  view_count       INT DEFAULT 0,
  citation_count   INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE logos_graphs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  node_ids     UUID[] DEFAULT '{}',
  is_public    BOOLEAN DEFAULT TRUE,
  is_protocol  BOOLEAN DEFAULT FALSE,      -- reusable knowledge template
  fork_count   INT DEFAULT 0,
  forked_from  UUID REFERENCES logos_graphs(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE logos_edges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id          UUID NOT NULL REFERENCES logos_graphs(id) ON DELETE CASCADE,
  from_node_id      UUID NOT NULL REFERENCES logos_nodes(id) ON DELETE CASCADE,
  to_node_id        UUID NOT NULL REFERENCES logos_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN
    ('prerequisite','related','contradicts','supports','example_of','derived_from')),
  weight            FLOAT DEFAULT 1.0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (graph_id, from_node_id, to_node_id, relationship_type)
);

CREATE TABLE logos_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES logos_nodes(id) ON DELETE CASCADE,
  verifier_id BIGINT NOT NULL REFERENCES users(id),
  verdict     TEXT NOT NULL CHECK (verdict IN ('verified','disputed','needs_review')),
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (node_id, verifier_id)
);

CREATE TABLE logos_citations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id          UUID NOT NULL REFERENCES logos_nodes(id) ON DELETE CASCADE,
  cited_by_node_id UUID REFERENCES logos_nodes(id),
  cited_by_type    TEXT,   -- 'logos_node' | 'kb_query' | 'quiz_question'
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- pgvector similarity search function for LOGOS nodes
CREATE OR REPLACE FUNCTION match_logos_nodes(
  query_embedding vector(1024),
  match_count     INT DEFAULT 10,
  namespace       TEXT DEFAULT 'nexus_logos'
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  summary     TEXT,
  content_type TEXT,
  language_code TEXT,
  is_verified  BOOLEAN,
  creator_id   BIGINT,
  tags         TEXT[],
  view_count   INT,
  similarity   FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id, n.title, n.summary, n.content_type, n.language_code,
    n.is_verified, n.creator_id, n.tags, n.view_count,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM logos_nodes n
  WHERE n.is_public = TRUE AND n.embedding IS NOT NULL
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── CREATOR ECONOMY ───────────────────────────────────────────────────────────

CREATE TABLE creator_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  content_type    TEXT NOT NULL CHECK (content_type IN ('video','audio','image','article','course','template')),
  media_url       TEXT NOT NULL,
  thumbnail_url   TEXT,
  pricing_model   TEXT NOT NULL CHECK (pricing_model IN ('free','tip_only','paid','subscription')),
  price_amount    NUMERIC(12,2) DEFAULT 0,
  price_currency  TEXT DEFAULT 'NGN',
  tags            TEXT[] DEFAULT '{}',
  is_published    BOOLEAN DEFAULT FALSE,
  view_count      INT DEFAULT 0,
  purchase_count  INT DEFAULT 0,
  total_earned    NUMERIC(14,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id   UUID NOT NULL REFERENCES creator_content(id) ON DELETE CASCADE,
  buyer_id     BIGINT NOT NULL REFERENCES users(id),
  amount_paid  NUMERIC(12,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  payment_ref  TEXT NOT NULL,
  affiliate_id BIGINT REFERENCES users(id),
  royalty_paid NUMERIC(12,2),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (content_id, buyer_id)
);

CREATE TABLE content_tips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id   UUID NOT NULL REFERENCES creator_content(id) ON DELETE CASCADE,
  tipper_id    BIGINT NOT NULL REFERENCES users(id),
  amount       NUMERIC(12,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  message      TEXT,
  payment_ref  TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE creator_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id BIGINT NOT NULL REFERENCES users(id),
  creator_id    BIGINT NOT NULL REFERENCES users(id),
  plan          TEXT NOT NULL CHECK (plan IN ('monthly','yearly')),
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'NGN',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  payment_ref   TEXT NOT NULL,
  UNIQUE (subscriber_id, creator_id)
);

CREATE TABLE creator_payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    BIGINT NOT NULL REFERENCES users(id),
  amount        NUMERIC(14,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'NGN',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  payout_ref    TEXT,
  period_start  TIMESTAMPTZ,
  period_end    TIMESTAMPTZ,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE affiliate_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       BIGINT NOT NULL REFERENCES users(id),
  content_id       UUID NOT NULL REFERENCES creator_content(id) ON DELETE CASCADE,
  code             TEXT UNIQUE NOT NULL,
  commission_pct   FLOAT NOT NULL DEFAULT 5.0,
  click_count      INT DEFAULT 0,
  conversion_count INT DEFAULT 0,
  total_earned     NUMERIC(12,2) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliate helper RPCs
CREATE OR REPLACE FUNCTION increment_affiliate_click(p_code TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE affiliate_links SET click_count = click_count + 1 WHERE code = p_code;
END;
$$;

CREATE OR REPLACE FUNCTION increment_affiliate_conversion(p_code TEXT, p_earned NUMERIC)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE affiliate_links
  SET conversion_count = conversion_count + 1,
      total_earned     = total_earned + p_earned
  WHERE code = p_code;
END;
$$;

-- ── INDEXES ───────────────────────────────────────────────────────────────────

-- LOGOS
CREATE INDEX idx_logos_nodes_creator    ON logos_nodes (creator_id);
CREATE INDEX idx_logos_nodes_public     ON logos_nodes (is_public, is_verified, view_count DESC);
CREATE INDEX idx_logos_nodes_language   ON logos_nodes (language_code);
CREATE INDEX idx_logos_nodes_embedding  ON logos_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_logos_graphs_creator   ON logos_graphs (creator_id);
CREATE INDEX idx_logos_graphs_public    ON logos_graphs (is_public, is_protocol);
CREATE INDEX idx_logos_edges_graph      ON logos_edges (graph_id);
CREATE INDEX idx_logos_verif_node       ON logos_verifications (node_id);

-- Creator Economy
CREATE INDEX idx_creator_content_pub    ON creator_content (is_published, content_type, view_count DESC);
CREATE INDEX idx_creator_content_owner  ON creator_content (creator_id);
CREATE INDEX idx_purchases_content      ON content_purchases (content_id);
CREATE INDEX idx_purchases_buyer        ON content_purchases (buyer_id);
CREATE INDEX idx_tips_content           ON content_tips (content_id);
CREATE INDEX idx_subscriptions_creator  ON creator_subscriptions (creator_id, status);
CREATE INDEX idx_subscriptions_sub      ON creator_subscriptions (subscriber_id, status);
CREATE INDEX idx_payouts_creator        ON creator_payouts (creator_id, status);
CREATE INDEX idx_affiliate_code         ON affiliate_links (code);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE logos_nodes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE logos_graphs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_content      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_purchases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_payouts      ENABLE ROW LEVEL SECURITY;

-- LOGOS nodes: public nodes visible to all, private only to owner
CREATE POLICY "logos_nodes_select" ON logos_nodes FOR SELECT
  USING (is_public = TRUE OR creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "logos_nodes_insert" ON logos_nodes FOR INSERT
  WITH CHECK (creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "logos_nodes_update" ON logos_nodes FOR UPDATE
  USING (creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Creator content: published content visible to all, unpublished only to owner
CREATE POLICY "creator_content_select" ON creator_content FOR SELECT
  USING (is_published = TRUE OR creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "creator_content_insert" ON creator_content FOR INSERT
  WITH CHECK (creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Purchases: visible only to buyer and creator
CREATE POLICY "purchases_select" ON content_purchases FOR SELECT
  USING (
    buyer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM creator_content cc
      WHERE cc.id = content_id
      AND cc.creator_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Payouts: visible only to creator
CREATE POLICY "payouts_select" ON creator_payouts FOR SELECT
  USING (creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
