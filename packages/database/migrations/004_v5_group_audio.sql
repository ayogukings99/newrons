-- ═══════════════════════════════════════════════════════════════
-- Migration 004: Group Audio + DJ Layer (Pillar 12)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE audio_sessions (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  host_id               BIGINT NOT NULL REFERENCES users(id),
  hub_id                BIGINT,               -- FK → company_hubs or group context
  hub_type              TEXT CHECK (hub_type IN ('barbershop','office','study','household','event','broadcast')),
  session_type          TEXT NOT NULL CHECK (session_type IN ('group_listen','live_dj','broadcast','ai_dj')),
  title                 TEXT,
  -- Current state
  is_live               BOOLEAN DEFAULT TRUE,
  current_track_id      BIGINT REFERENCES creator_content(id),
  current_position_ms   INT DEFAULT 0,
  playback_speed        NUMERIC(3,2) DEFAULT 1.0,
  -- DJ state
  dj_user_id            BIGINT REFERENCES users(id),   -- current DJ (can be passed)
  ai_dj_enabled         BOOLEAN DEFAULT FALSE,
  ai_dj_mood            TEXT CHECK (ai_dj_mood IN ('energetic','chill','focused','celebratory')),
  -- EQ + Effects
  eq_settings           JSONB DEFAULT '{"bass": 50, "mid": 50, "treble": 50}',
  active_effect         TEXT DEFAULT 'none' CHECK (active_effect IN ('none','reverb','echo','vinyl','rewind')),
  effect_intensity      NUMERIC(3,2) DEFAULT 0.5,
  -- Access
  is_public             BOOLEAN DEFAULT FALSE,
  max_listeners         INT DEFAULT 50,
  current_listeners     INT DEFAULT 0,
  -- Monetization
  tip_total             NUMERIC(18,2) DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  ended_at              TIMESTAMPTZ
);

CREATE TABLE audio_session_listeners (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id  BIGINT NOT NULL REFERENCES audio_sessions(id),
  user_id     BIGINT NOT NULL REFERENCES users(id),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  left_at     TIMESTAMPTZ,
  UNIQUE(session_id, user_id)
);

CREATE TABLE audio_session_queue (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id      BIGINT NOT NULL REFERENCES audio_sessions(id),
  track_id        BIGINT NOT NULL REFERENCES creator_content(id),
  requested_by    BIGINT NOT NULL REFERENCES users(id),
  queue_position  INT NOT NULL,
  played_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audio_sessions_live ON audio_sessions (is_live) WHERE is_live = TRUE;
CREATE INDEX idx_audio_sessions_hub ON audio_sessions (hub_id) WHERE hub_id IS NOT NULL;
