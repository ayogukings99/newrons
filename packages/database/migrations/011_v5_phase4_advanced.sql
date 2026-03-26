-- =============================================================================
-- Migration 011: Phase 4 Advanced — Flight Log v2, Translation, LOGOS v2,
--                Security Intelligence v2
-- =============================================================================

-- ── FLIGHT LOG v2 ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flight_log_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  aircraft_reg          TEXT NOT NULL,
  aircraft_type         TEXT NOT NULL,
  departure_icao        TEXT NOT NULL,
  arrival_icao          TEXT NOT NULL,
  route                 TEXT,
  role                  TEXT NOT NULL CHECK (role IN ('pic','sic','dual','student','observer')),
  total_time_hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
  pic_hours             NUMERIC(6,2) NOT NULL DEFAULT 0,
  dual_hours            NUMERIC(6,2) NOT NULL DEFAULT 0,
  instrument_hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
  night_hours           NUMERIC(6,2) NOT NULL DEFAULT 0,
  xc_hours              NUMERIC(6,2) NOT NULL DEFAULT 0,
  sim_instrument_hours  NUMERIC(6,2) NOT NULL DEFAULT 0,
  day_landings          INT NOT NULL DEFAULT 0,
  night_landings        INT NOT NULL DEFAULT 0,
  approaches            INT NOT NULL DEFAULT 0,
  remarks               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flight_routes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  origin            JSONB NOT NULL,
  destination       JSONB NOT NULL,
  waypoints         JSONB NOT NULL DEFAULT '[]',
  total_distance_nm NUMERIC(8,1),
  eta_minutes       INT,
  fuel_burn_gal     NUMERIC(6,1),
  status            TEXT NOT NULL DEFAULT 'optimized' CHECK (status IN ('draft','optimized','filed','flown')),
  notams            JSONB DEFAULT '[]',
  weather_summary   TEXT,
  go_no_go          TEXT NOT NULL DEFAULT 'go' CHECK (go_no_go IN ('go','no-go','caution')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flight_weather_cache (
  icao           TEXT PRIMARY KEY,
  metar          TEXT,
  taf            TEXT,
  conditions     TEXT NOT NULL DEFAULT 'vmc' CHECK (conditions IN ('vmc','imc','mixed')),
  ceiling_ft     INT,
  visibility_sm  NUMERIC(4,1),
  wind_dir       INT,
  wind_kts       INT,
  fetched_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregate function for logbook totals
CREATE OR REPLACE FUNCTION flight_log_totals(p_pilot_id BIGINT)
RETURNS TABLE (
  total_flights        BIGINT,
  total_time_hours     NUMERIC,
  pic_hours            NUMERIC,
  dual_hours           NUMERIC,
  instrument_hours     NUMERIC,
  night_hours          NUMERIC,
  xc_hours             NUMERIC,
  sim_instrument_hours NUMERIC,
  total_landings       BIGINT,
  total_approaches     BIGINT
) LANGUAGE SQL STABLE AS $$
  SELECT
    COUNT(*)                       AS total_flights,
    SUM(total_time_hours)          AS total_time_hours,
    SUM(pic_hours)                 AS pic_hours,
    SUM(dual_hours)                AS dual_hours,
    SUM(instrument_hours)          AS instrument_hours,
    SUM(night_hours)               AS night_hours,
    SUM(xc_hours)                  AS xc_hours,
    SUM(sim_instrument_hours)      AS sim_instrument_hours,
    SUM(day_landings + night_landings) AS total_landings,
    SUM(approaches)                AS total_approaches
  FROM flight_log_entries
  WHERE pilot_id = p_pilot_id;
$$;

-- ── TRANSLATION ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS translation_cache (
  cache_key       TEXT PRIMARY KEY,
  source_lang     TEXT NOT NULL,
  target_lang     TEXT NOT NULL,
  source_text     TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS translation_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id      TEXT NOT NULL,
  source_lang  TEXT NOT NULL,
  target_langs TEXT[] NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── LOGOS v2 — Protocol Templates ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logos_protocols (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       BIGINT NOT NULL REFERENCES users(id),
  graph_id         UUID NOT NULL,      -- references logos_graphs(id)
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  trigger_node_id  UUID NOT NULL,      -- starting node of the protocol
  steps            JSONB NOT NULL DEFAULT '[]',  -- [{step, action, checkpoint, nodeId}]
  is_public        BOOLEAN NOT NULL DEFAULT FALSE,
  language_code    TEXT NOT NULL DEFAULT 'en',
  use_count        INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── LOGOS v2 — Node View History (for ambient exclusion) ─────────────────────

CREATE TABLE IF NOT EXISTS logos_node_views (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id    UUID NOT NULL,
  viewed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, node_id)
);

-- ── SECURITY INTELLIGENCE v2 ──────────────────────────────────────────────────

-- PostGIS extension (may already be enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS security_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  BIGINT NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL CHECK (type IN (
    'theft','assault','suspicious_activity','road_hazard','police_checkpoint',
    'fire','flood','protest','power_outage','other'
  )),
  severity     TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  location     GEOMETRY(Point, 4326) NOT NULL,
  description  TEXT NOT NULL,
  anonymous    BOOLEAN NOT NULL DEFAULT TRUE,
  incident_id  UUID REFERENCES security_incidents(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked','dismissed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Note: security_incidents must be created before security_reports due to FK above
-- We pre-declare security_incidents first:
CREATE TABLE IF NOT EXISTS security_incidents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  location       GEOMETRY(Point, 4326) NOT NULL,
  report_count   INT NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'validating' CHECK (status IN (
    'reported','validating','confirmed','resolved','dismissed'
  )),
  summary        TEXT,
  first_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS security_trusted_contacts (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);

CREATE TABLE IF NOT EXISTS security_companion_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location     GEOMETRY(Point, 4326) NOT NULL,
  watcher_ids  BIGINT[] NOT NULL DEFAULT '{}',
  is_sos       BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── PostGIS RPC helpers ───────────────────────────────────────────────────────

-- Find security reports within radius for a specific user and time window
CREATE OR REPLACE FUNCTION security_reports_in_radius(
  p_lat      FLOAT,
  p_lng      FLOAT,
  p_radius   FLOAT,   -- meters
  p_since    TIMESTAMPTZ,
  p_user_id  BIGINT
) RETURNS SETOF security_reports LANGUAGE SQL STABLE AS $$
  SELECT * FROM security_reports
  WHERE  reporter_id = p_user_id
  AND    created_at >= p_since
  AND    ST_DWithin(
    location::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius
  );
$$;

-- Find security incidents within radius for clustering
CREATE OR REPLACE FUNCTION security_incidents_in_radius(
  p_lat    FLOAT,
  p_lng    FLOAT,
  p_radius FLOAT,
  p_type   TEXT,
  p_since  TIMESTAMPTZ
) RETURNS TABLE (
  id           UUID,
  type         TEXT,
  severity     TEXT,
  lat          FLOAT,
  lng          FLOAT,
  report_count INT,
  status       TEXT,
  summary      TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ
) LANGUAGE SQL STABLE AS $$
  SELECT
    id,
    type,
    severity,
    ST_Y(location::geometry) AS lat,
    ST_X(location::geometry) AS lng,
    report_count,
    status,
    summary,
    first_seen_at,
    last_seen_at,
    expires_at
  FROM security_incidents
  WHERE (p_type IS NULL OR type = p_type)
  AND   status NOT IN ('resolved','dismissed')
  AND   last_seen_at >= p_since
  AND   ST_DWithin(
    location::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius
  )
  ORDER BY ST_Distance(
    location::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  );
$$;

-- ── INDEXES ───────────────────────────────────────────────────────────────────

-- Flight log
CREATE INDEX IF NOT EXISTS idx_flight_log_pilot_date     ON flight_log_entries (pilot_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_flight_routes_pilot        ON flight_routes (pilot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flight_weather_fetched     ON flight_weather_cache (fetched_at);

-- Translation
CREATE INDEX IF NOT EXISTS idx_translation_cache_created  ON translation_cache (created_at);
CREATE INDEX IF NOT EXISTS idx_translation_sessions_room  ON translation_sessions (room_id, is_active);

-- LOGOS v2
CREATE INDEX IF NOT EXISTS idx_logos_protocols_public     ON logos_protocols (is_public, language_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logos_protocols_creator    ON logos_protocols (creator_id);
CREATE INDEX IF NOT EXISTS idx_logos_node_views_user      ON logos_node_views (user_id, viewed_at DESC);

-- Security v2
CREATE INDEX IF NOT EXISTS idx_security_reports_reporter  ON security_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_reports_incident  ON security_reports (incident_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status  ON security_incidents (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_security_incidents_spatial ON security_incidents USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_security_reports_spatial   ON security_reports USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_security_contacts_user     ON security_trusted_contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_security_contacts_contact  ON security_trusted_contacts (contact_id);
CREATE INDEX IF NOT EXISTS idx_companion_sessions_sharer  ON security_companion_sessions (sharer_id, expires_at);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE flight_log_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_routes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE logos_protocols             ENABLE ROW LEVEL SECURITY;
ALTER TABLE logos_node_views            ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_trusted_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_companion_sessions ENABLE ROW LEVEL SECURITY;

-- Flight log: pilots own their entries
CREATE POLICY "flight_log_own" ON flight_log_entries FOR ALL
  USING (pilot_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "flight_routes_own" ON flight_routes FOR ALL
  USING (pilot_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Translation sessions: user owns their sessions
CREATE POLICY "translation_sessions_own" ON translation_sessions FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- LOGOS protocols: public protocols visible to all; private only to creator
CREATE POLICY "logos_protocols_select" ON logos_protocols FOR SELECT
  USING (is_public = TRUE OR creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "logos_protocols_insert" ON logos_protocols FOR INSERT
  WITH CHECK (creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Node views: user owns their view history
CREATE POLICY "logos_node_views_own" ON logos_node_views FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Security reports: insert own; read all (public safety data)
CREATE POLICY "security_reports_insert" ON security_reports FOR INSERT
  WITH CHECK (reporter_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "security_reports_select" ON security_reports FOR SELECT USING (TRUE);

-- Trusted contacts: own
CREATE POLICY "security_contacts_own" ON security_trusted_contacts FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Companion sessions: sharer owns; watchers can read
CREATE POLICY "companion_sessions_sharer" ON security_companion_sessions
  FOR ALL USING (sharer_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
