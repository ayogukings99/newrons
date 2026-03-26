-- ═══════════════════════════════════════════════════════════════
-- Migration 003: NFC Tap-to-Transfer (Pillar 11)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE nfc_payment_tags (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  owner_id              BIGINT NOT NULL REFERENCES users(id),
  label                 TEXT NOT NULL,        -- e.g., "Mama Nkechi's Suya Stand"
  nfc_uid               TEXT UNIQUE,          -- hardware NFC tag UID
  qr_fallback_url       TEXT,                 -- QR code for non-NFC devices
  default_amount        NUMERIC(18,2),        -- pre-fill amount (optional)
  currency              TEXT DEFAULT 'NGN',
  category              TEXT CHECK (category IN ('transport','food','market','service','entertainment','religious')),
  geo_point             GEOMETRY(Point, 4326),
  is_active             BOOLEAN DEFAULT TRUE,
  total_received        NUMERIC(18,2) DEFAULT 0,
  tap_count             INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tap_transactions (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sender_id             BIGINT NOT NULL REFERENCES users(id),
  receiver_id           BIGINT NOT NULL REFERENCES users(id),
  nfc_tag_id            BIGINT REFERENCES nfc_payment_tags(id),  -- NULL for P2P tap
  amount                NUMERIC(18,2) NOT NULL,
  currency              TEXT DEFAULT 'NGN',
  transaction_id        BIGINT REFERENCES transactions(id),      -- links to main ledger
  sync_status           TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced','pending_sync','failed')),
  offline_created_at    TIMESTAMPTZ,          -- if created offline
  synced_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for nearby NFC tags (map discovery)
CREATE INDEX idx_nfc_tags_location ON nfc_payment_tags USING GIST (geo_point);
CREATE INDEX idx_nfc_tags_uid ON nfc_payment_tags (nfc_uid) WHERE nfc_uid IS NOT NULL;
CREATE INDEX idx_tap_transactions_sync ON tap_transactions (sync_status) WHERE sync_status = 'pending_sync';
