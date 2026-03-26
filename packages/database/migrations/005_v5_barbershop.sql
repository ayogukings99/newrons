-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Barbershop Layer (Pillar 13)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE barbershop_profiles (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  barber_id             BIGINT NOT NULL REFERENCES users(id),
  shop_name             TEXT NOT NULL,
  hub_id                BIGINT REFERENCES company_hubs(id),
  building_id           BIGINT REFERENCES virtual_buildings(id),
  -- Specialties
  specialties           TEXT[],   -- fade|locs|braids|coloring|shaving|beard_design
  -- Pricing
  base_cut_price        NUMERIC(18,2),
  currency              TEXT DEFAULT 'NGN',
  price_list            JSONB,    -- [{service, price}]
  -- Audio
  audio_session_id      BIGINT REFERENCES audio_sessions(id),
  -- Stats
  total_cuts            INT DEFAULT 0,
  repeat_client_rate    NUMERIC(5,2) DEFAULT 0,
  avg_wait_minutes      INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE barbershop_lineups (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  shop_id               BIGINT NOT NULL REFERENCES barbershop_profiles(id),
  client_id             BIGINT NOT NULL REFERENCES users(id),
  position              INT NOT NULL,
  service_requested     TEXT,
  style_reference_id    BIGINT REFERENCES barbershop_cuts(id),
  deposit_escrow_id     BIGINT REFERENCES escrow_contracts(id),
  status                TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','in_chair','completed','cancelled','no_show')),
  estimated_wait_mins   INT,
  joined_at             TIMESTAMPTZ DEFAULT NOW(),
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ
);

CREATE TABLE barbershop_cuts (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  barber_id             BIGINT NOT NULL REFERENCES users(id),
  client_id             BIGINT NOT NULL REFERENCES users(id),
  -- The cut
  style_name            TEXT NOT NULL,
  description           TEXT,
  -- Avatar representation
  avatar_render_url     TEXT,       -- rendered image of client avatar with cut
  avatar_render_3d_url  TEXT,       -- 3D model (Phase 4)
  -- Media
  photo_urls            TEXT[],     -- real photos (with client consent only)
  -- Visibility
  client_consented      BOOLEAN DEFAULT FALSE,
  is_portfolio          BOOLEAN DEFAULT FALSE,
  -- Links
  lineup_id             BIGINT REFERENCES barbershop_lineups(id),
  transaction_id        BIGINT REFERENCES transactions(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_barbershop_lineups_shop ON barbershop_lineups (shop_id, status);
CREATE INDEX idx_barbershop_cuts_portfolio ON barbershop_cuts (barber_id, is_portfolio) WHERE is_portfolio = TRUE;
