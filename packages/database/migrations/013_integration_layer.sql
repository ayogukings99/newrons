-- =============================================================================
-- Migration 013: Integration Layer — Social ↔ Economic Identity Bridge
-- =============================================================================
-- Bridges Supabase users (social identity) to sovereign node DIDs (economic identity)
-- Every user IS a sovereign node with shared ed25519 keypair and DID format.
-- On first economic activity, auto-create node_identities with encrypted key storage.

-- ── NODE IDENTITIES ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS node_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  did             TEXT NOT NULL UNIQUE,             -- did:scn:<base58-pubkey>
  public_key_hex  TEXT NOT NULL,                   -- ed25519 public key hex
  encrypted_secret TEXT NOT NULL,                  -- AES-256-GCM encrypted secret key
  node_type       TEXT NOT NULL DEFAULT 'member'
                  CHECK (node_type IN ('member','operator','auditor')),
  activated_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PO SETTLEMENTS ───────────────────────────────────────────────────────────
-- Records every NXT transfer for a supply chain purchase order

CREATE TABLE IF NOT EXISTS po_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           TEXT NOT NULL,                   -- supply chain PO ID
  buyer_did       TEXT NOT NULL REFERENCES node_identities(did),
  supplier_did    TEXT NOT NULL REFERENCES node_identities(did),
  amount_nxt      NUMERIC(18,4) NOT NULL,
  transaction_id  UUID,                            -- wallet transaction ID
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','settled','failed')),
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── DEMAND SIGNALS ───────────────────────────────────────────────────────────
-- LOGOS community knowledge → supply chain forecasting

CREATE TABLE IF NOT EXISTS demand_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_external_id TEXT NOT NULL,                   -- supply chain SKU ID
  location_code   TEXT,                            -- ISO country/region code
  source          TEXT NOT NULL DEFAULT 'logos'
                  CHECK (source IN ('logos','community','manual','market')),
  signal_type     TEXT NOT NULL
                  CHECK (signal_type IN ('demand_spike','trend_up','trend_down','seasonal','alert')),
  magnitude       NUMERIC(8,4) NOT NULL DEFAULT 1.0,  -- multiplier (1.0 = neutral)
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.5,  -- 0-1
  logos_node_id   UUID REFERENCES logos_nodes(id),    -- originating LOGOS node if any
  valid_from      TIMESTAMPTZ DEFAULT NOW(),
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── LOGOS SUPPLY LINKS ───────────────────────────────────────────────────────
-- Bridges LOGOS knowledge nodes to supply chain entities

CREATE TABLE IF NOT EXISTS logos_supply_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logos_node_id   UUID NOT NULL REFERENCES logos_nodes(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('sku','supplier','route','location')),
  entity_id       TEXT NOT NULL,                   -- supply chain entity ID
  relevance       NUMERIC(4,3) DEFAULT 0.5,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (logos_node_id, entity_type, entity_id)
);

-- ── WAREHOUSE NFC EVENTS ─────────────────────────────────────────────────────
-- NFC tap → warehouse action mapping

CREATE TABLE IF NOT EXISTS warehouse_nfc_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         BIGINT NOT NULL REFERENCES users(id),
  nfc_uid         TEXT NOT NULL,
  event_type      TEXT NOT NULL
                  CHECK (event_type IN ('bin_scan','goods_receipt','transfer_confirm','task_complete')),
  bin_id          TEXT,
  sku_id          TEXT,
  qty             INTEGER,
  chain_event_id  TEXT,                            -- corresponding sovereign chain event ID
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE node_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_nfc_events ENABLE ROW LEVEL SECURITY;

-- Users see their own node identity
CREATE POLICY "users_see_own_node_identity"
  ON node_identities FOR SELECT USING (user_id = auth.uid()::bigint);

-- Users can insert their own node identity (once per user)
CREATE POLICY "users_insert_own_node_identity"
  ON node_identities FOR INSERT WITH CHECK (user_id = auth.uid()::bigint);

-- Users see settlements where they are buyer or supplier (via DID)
CREATE POLICY "users_see_own_settlements"
  ON po_settlements FOR SELECT
  USING (
    buyer_did IN (SELECT did FROM node_identities WHERE user_id = auth.uid()::bigint)
    OR supplier_did IN (SELECT did FROM node_identities WHERE user_id = auth.uid()::bigint)
  );

-- Demand signals readable by all authenticated users
CREATE POLICY "demand_signals_readable_by_authenticated"
  ON demand_signals FOR SELECT TO authenticated USING (true);

-- Users see their own warehouse NFC events
CREATE POLICY "users_see_own_nfc_events"
  ON warehouse_nfc_events FOR SELECT USING (user_id = auth.uid()::bigint);

-- ── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_node_identities_did ON node_identities(did);
CREATE INDEX IF NOT EXISTS idx_node_identities_user ON node_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_demand_signals_sku ON demand_signals(sku_external_id);
CREATE INDEX IF NOT EXISTS idx_demand_signals_valid ON demand_signals(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_logos_supply_links_node ON logos_supply_links(logos_node_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_nfc_user ON warehouse_nfc_events(user_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_nfc_sku ON warehouse_nfc_events(sku_id);
CREATE INDEX IF NOT EXISTS idx_po_settlements_buyer ON po_settlements(buyer_did);
CREATE INDEX IF NOT EXISTS idx_po_settlements_supplier ON po_settlements(supplier_did);

-- ── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

-- RPC: resolve DID to user_id
CREATE OR REPLACE FUNCTION resolve_did_to_user(p_did TEXT)
RETURNS BIGINT AS $$
  SELECT user_id FROM node_identities WHERE did = p_did LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- RPC: get or create node identity (upsert on user_id, returns full record)
CREATE OR REPLACE FUNCTION upsert_node_identity(
  p_user_id BIGINT,
  p_did TEXT,
  p_public_key_hex TEXT,
  p_encrypted_secret TEXT,
  p_node_type TEXT DEFAULT 'member'
) RETURNS node_identities AS $$
  INSERT INTO node_identities (user_id, did, public_key_hex, encrypted_secret, node_type)
  VALUES (p_user_id, p_did, p_public_key_hex, p_encrypted_secret, p_node_type)
  ON CONFLICT (user_id) DO UPDATE SET
    last_seen_at = NOW()
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;

-- RPC: update last_seen_at for a DID (touch activity)
CREATE OR REPLACE FUNCTION touch_node_last_seen(p_did TEXT)
RETURNS VOID AS $$
  UPDATE node_identities SET last_seen_at = NOW() WHERE did = p_did;
$$ LANGUAGE sql SECURITY DEFINER;

-- RPC: get node info by DID (public key only, no secrets)
CREATE OR REPLACE FUNCTION get_node_info(p_did TEXT)
RETURNS TABLE (
  did TEXT,
  public_key_hex TEXT,
  node_type TEXT,
  activated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
) AS $$
  SELECT did, public_key_hex, node_type, activated_at, last_seen_at
  FROM node_identities WHERE did = p_did;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
