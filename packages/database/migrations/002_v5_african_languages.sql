-- ═══════════════════════════════════════════════════════════════
-- Migration 002: African Language Layer (Pillar 10)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE supported_languages (
  id                      BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code                    TEXT UNIQUE NOT NULL,  -- e.g., 'yo' (Yoruba), 'ig' (Igbo), 'ha' (Hausa)
  name_english            TEXT NOT NULL,
  name_native             TEXT NOT NULL,
  tier                    INT CHECK (tier IN (1,2,3,4)),  -- 1=launch, 2=month3, 3=month6, 4=community
  speaker_count_approx    BIGINT,
  tts_available           BOOLEAN DEFAULT FALSE,
  stt_available           BOOLEAN DEFAULT FALSE,
  translation_available   BOOLEAN DEFAULT FALSE,
  is_active               BOOLEAN DEFAULT FALSE,
  community_trainer_count INT DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Tier 1 languages (launch)
INSERT INTO supported_languages (code, name_english, name_native, tier, speaker_count_approx, is_active) VALUES
  ('yo',  'Yoruba',         'Yorùbá',        1, 45000000,  TRUE),
  ('ig',  'Igbo',           'Asụsụ Igbo',    1, 44000000,  TRUE),
  ('ha',  'Hausa',          'Harshen Hausa', 1, 70000000,  TRUE),
  ('pcm', 'Nigerian Pidgin','Naijá',         1, 75000000,  TRUE),
  ('sw',  'Swahili',        'Kiswahili',     1, 200000000, TRUE);

CREATE TABLE language_training_contributions (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  contributor_id        BIGINT NOT NULL REFERENCES users(id),
  language_id           BIGINT NOT NULL REFERENCES supported_languages(id),
  contribution_type     TEXT NOT NULL CHECK (contribution_type IN ('correction','new_phrase','dialect_variant','pronunciation')),
  original_text         TEXT NOT NULL,
  ai_output             TEXT NOT NULL,      -- what the AI got wrong
  corrected_text        TEXT NOT NULL,      -- what the contributor provided
  context               TEXT,              -- what was being discussed
  dialect_variant       TEXT,              -- e.g., 'Lagos Yoruba' vs 'Oyo Yoruba'
  validation_count      INT DEFAULT 0,     -- upvotes from other speakers
  validation_threshold  INT DEFAULT 3,     -- needed before applied to model
  is_applied            BOOLEAN DEFAULT FALSE,
  reward_paid           BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_language_preferences (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id               BIGINT UNIQUE NOT NULL REFERENCES users(id),
  primary_language_id   BIGINT REFERENCES supported_languages(id),
  secondary_languages   BIGINT[],           -- FK → supported_languages
  dialect               TEXT,
  ai_response_language  TEXT DEFAULT 'match_input' CHECK (ai_response_language IN ('match_input','primary','english')),
  translate_content     BOOLEAN DEFAULT TRUE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contributions_language ON language_training_contributions (language_id, is_applied);
CREATE INDEX idx_contributions_pending ON language_training_contributions (validation_count, is_applied) WHERE is_applied = FALSE;
