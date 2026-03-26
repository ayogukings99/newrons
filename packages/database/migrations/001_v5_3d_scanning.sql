-- ═══════════════════════════════════════════════════════════════
-- Migration 001: 3D World Scanning (Pillar 9)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE world_scans (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scanner_id            BIGINT NOT NULL REFERENCES users(id),
  type                  TEXT NOT NULL CHECK (type IN ('environment','object','art','sculpture','building','nature')),
  name                  TEXT NOT NULL,
  description           TEXT,
  -- Raw capture
  capture_images        TEXT[],
  capture_location      GEOMETRY(Point, 4326),
  capture_date          TIMESTAMPTZ,
  -- Processed assets
  mesh_url              TEXT,           -- .glb / .gltf file in R2
  texture_url           TEXT,           -- UV texture map
  thumbnail_url         TEXT,
  lod_urls              JSONB,          -- {high, medium, low} LOD versions
  -- Classification
  style_tags            TEXT[],         -- e.g. ['yoruba', 'colonial', 'modern', 'market']
  region_tag            TEXT,           -- city/country of origin
  -- Ownership
  visibility            TEXT DEFAULT 'private' CHECK (visibility IN ('private','marketplace','public_world')),
  price                 NUMERIC(18,2),
  currency              TEXT DEFAULT 'NGN',
  download_count        INT DEFAULT 0,
  -- Quality
  polygon_count         INT,
  quality_score         NUMERIC(3,1),   -- AI-assessed 0-10
  is_approved           BOOLEAN DEFAULT FALSE,
  processing_status     TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','ready','failed')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE world_asset_placements (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id               BIGINT NOT NULL REFERENCES users(id),
  scan_id               BIGINT NOT NULL REFERENCES world_scans(id),
  placement_context     TEXT NOT NULL CHECK (placement_context IN ('avatar_space','virtual_building','journal_bg','marketplace','public_world')),
  context_id            BIGINT,
  position              JSONB NOT NULL, -- {x, y, z}
  rotation              JSONB,          -- {rx, ry, rz}
  scale                 JSONB,          -- {sx, sy, sz}
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for nearby world assets
CREATE INDEX idx_world_scans_location ON world_scans USING GIST (capture_location);
CREATE INDEX idx_world_scans_visibility ON world_scans (visibility) WHERE visibility = 'public_world';
