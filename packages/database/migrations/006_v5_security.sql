-- ═══════════════════════════════════════════════════════════════
-- Migration 006: Security Intelligence (Pillar 14)
-- PRIVACY: No user identity is ever stored in these tables.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE community_safety_reports (
  id                  BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- PRIVACY: Completely anonymous — no user link stored after aggregation
  category            TEXT NOT NULL CHECK (category IN ('theft','harassment','accident','road_hazard','flooding','protest')),
  severity            TEXT NOT NULL CHECK (severity IN ('low','moderate','high')),
  geo_point           GEOMETRY(Point, 4326) NOT NULL,
  radius_meters       INT DEFAULT 50,
  time_reported       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_of_incident    TIMESTAMPTZ,
  validation_count    INT DEFAULT 1,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  is_active           BOOLEAN DEFAULT TRUE
  -- NOTE: No reporter_id column — reports are anonymized immediately on creation
);

CREATE TABLE route_security_queries (
  id                  BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- PRIVACY: No user_id — queries are ephemeral and never linked to identity
  origin_hash         TEXT NOT NULL,         -- one-way hash of origin location
  destination_hash    TEXT NOT NULL,         -- one-way hash for cache only
  query_time          TIMESTAMPTZ DEFAULT NOW(),
  -- Cached result
  risk_level          TEXT CHECK (risk_level IN ('low','moderate','elevated','high')),
  report_summary      JSONB,                 -- {incident_count_24h, incident_types, peak_risk_time}
  alternative_routes  JSONB,
  cache_expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for fast geo-queries
CREATE INDEX idx_safety_reports_location ON community_safety_reports USING GIST (geo_point);
CREATE INDEX idx_safety_reports_active ON community_safety_reports (is_active, expires_at) WHERE is_active = TRUE;
CREATE INDEX idx_route_cache_hash ON route_security_queries (origin_hash, destination_hash, cache_expires_at);
