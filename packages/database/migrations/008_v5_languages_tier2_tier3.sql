-- =============================================================================
-- Migration 008: African Languages Tier 2 & Tier 3 Activation
-- Phase 3 — Months 4-10
-- =============================================================================
-- Tier 2 (Phase 3 launch, ~M4): Zulu, Xhosa, Amharic, Twi, Wolof
-- Tier 3 (Phase 3 expansion, ~M7): Shona, Somali, Oromo, Fula, Lingala, Ndebele
--
-- Each language record includes:
--  - Estimated speaker count
--  - Azure Cognitive Services voice code (TTS/STT)
--  - SeamlessM4T language tag for translation
--  - Cohere multilingual embed support flag
--  - Writing system / script
-- =============================================================================

-- ── TIER 2 LANGUAGES ─────────────────────────────────────────────────────────

INSERT INTO supported_languages (
  code, name_english, name_native, tier, speaker_count_approx,
  azure_voice_code, seamless_code, script, is_active, activated_at
) VALUES

  -- Zulu (South Africa) — 12M speakers
  ('zu', 'Zulu', 'isiZulu', 2, 12000000,
   'zu-ZA-ThandoNeural', 'zul', 'Latin', TRUE, NOW()),

  -- Xhosa (South Africa) — 8.2M speakers
  ('xh', 'Xhosa', 'isiXhosa', 2, 8200000,
   'xh-ZA-ThandiweNeural', 'xho', 'Latin', TRUE, NOW()),

  -- Amharic (Ethiopia) — 57M speakers, Ge'ez script
  ('am', 'Amharic', 'አማርኛ', 2, 57000000,
   'am-ET-AmehaNeural', 'amh', 'Ethiopic', TRUE, NOW()),

  -- Twi / Akan (Ghana) — 9M speakers
  ('tw', 'Twi', 'Twi', 2, 9000000,
   'tw-GH', 'twi', 'Latin', TRUE, NOW()),

  -- Wolof (Senegal) — 5.5M L1, 11M total speakers
  ('wo', 'Wolof', 'Wolof', 2, 11000000,
   'wo-SN', 'wol', 'Latin', TRUE, NOW())

ON CONFLICT (code) DO UPDATE SET
  tier       = EXCLUDED.tier,
  is_active  = TRUE,
  activated_at = NOW();

-- ── TIER 3 LANGUAGES ─────────────────────────────────────────────────────────

INSERT INTO supported_languages (
  code, name_english, name_native, tier, speaker_count_approx,
  azure_voice_code, seamless_code, script, is_active, activated_at
) VALUES

  -- Shona (Zimbabwe) — 13M speakers
  ('sn', 'Shona', 'chiShona', 3, 13000000,
   'sn-ZW', 'sna', 'Latin', FALSE, NULL),

  -- Somali — 21M speakers
  ('so', 'Somali', 'Soomaali', 3, 21000000,
   'so-SO-UbaxNeural', 'som', 'Latin', FALSE, NULL),

  -- Oromo (Ethiopia/Kenya) — 40M speakers
  ('om', 'Oromo', 'Afaan Oromoo', 3, 40000000,
   'om-ET', 'orm', 'Latin', FALSE, NULL),

  -- Fula / Fulfulde — 25M speakers across West Africa
  ('ff', 'Fula', 'Fulfulde', 3, 25000000,
   'ff-Adlm-GN', 'fuv', 'Latin', FALSE, NULL),

  -- Lingala (DRC/Congo) — 45M speakers
  ('ln', 'Lingala', 'Lingála', 3, 45000000,
   'ln-CD', 'lin', 'Latin', FALSE, NULL),

  -- Ndebele (Zimbabwe/South Africa) — 1.5M speakers
  ('nd', 'Ndebele', 'isiNdebele', 3, 1500000,
   'nd-ZW', 'nde', 'Latin', FALSE, NULL)

ON CONFLICT (code) DO UPDATE SET
  tier         = EXCLUDED.tier,
  activated_at = EXCLUDED.activated_at;

-- ── SEED PHRASE PACKS ─────────────────────────────────────────────────────────
-- Bootstrap phrase table so the AI has grounding before community contributions

-- Tier 2 bootstrapping phrases
INSERT INTO language_phrases (language_id, phrase_english, phrase_native, category, is_verified)
SELECT
  sl.id,
  p.phrase_english,
  p.phrase_native,
  p.category,
  TRUE
FROM (VALUES
  -- Zulu
  ('zu', 'Hello',                  'Sawubona',             'greeting'),
  ('zu', 'How are you?',           'Unjani?',              'greeting'),
  ('zu', 'Thank you',              'Ngiyabonga',           'courtesy'),
  ('zu', 'I love you',             'Ngiyakuthanda',        'expression'),
  ('zu', 'What is your name?',     'Ubani igama lakho?',   'question'),
  ('zu', 'My name is',             'Igama lami ngu-',      'identity'),
  ('zu', 'Where are you from?',    'Uvela kuphi?',         'question'),
  ('zu', 'Send money',             'Thumela imali',        'finance'),
  ('zu', 'How much does it cost?', 'Kubiza malini?',       'finance'),
  ('zu', 'Goodbye',                'Hamba kahle',          'farewell'),

  -- Xhosa
  ('xh', 'Hello',                  'Molo',                 'greeting'),
  ('xh', 'How are you?',           'Unjani?',              'greeting'),
  ('xh', 'Thank you',              'Enkosi',               'courtesy'),
  ('xh', 'Yes',                    'Ewe',                  'response'),
  ('xh', 'No',                     'Hayi',                 'response'),
  ('xh', 'Please',                 'Nceda',                'courtesy'),
  ('xh', 'Good morning',           'Molweni',              'greeting'),
  ('xh', 'Send money',             'Thumela imali',        'finance'),
  ('xh', 'I understand',           'Ndiyaqonda',           'comprehension'),
  ('xh', 'Goodbye',                'Sala kakuhle',         'farewell'),

  -- Amharic
  ('am', 'Hello',                  'ሰላም',                  'greeting'),
  ('am', 'How are you?',           'እንዴት ነህ?',             'greeting'),
  ('am', 'Thank you',              'አመሰግናለሁ',              'courtesy'),
  ('am', 'Yes',                    'አዎ',                   'response'),
  ('am', 'No',                     'አይ',                   'response'),
  ('am', 'Good morning',           'እንደምን አደርክ',           'greeting'),
  ('am', 'What is your name?',     'ስምህ ማን ነው?',           'question'),
  ('am', 'Send money',             'ገንዘብ ላክ',              'finance'),
  ('am', 'How much does it cost?', 'ስንት ነው?',              'finance'),
  ('am', 'Goodbye',                'ቸር ይሁን',               'farewell'),

  -- Twi
  ('tw', 'Hello',                  'Maakyé / Maaaha',      'greeting'),
  ('tw', 'How are you?',           'Wo ho te sɛn?',        'greeting'),
  ('tw', 'Thank you',              'Meda wo ase',          'courtesy'),
  ('tw', 'Yes',                    'Aane',                 'response'),
  ('tw', 'No',                     'Daabi',                'response'),
  ('tw', 'What is your name?',     'Wo din de sɛn?',       'question'),
  ('tw', 'My name is',             'Me din de',            'identity'),
  ('tw', 'Send money',             'Fa sika kɔ',           'finance'),
  ('tw', 'I love you',             'Me dɔ wo',             'expression'),
  ('tw', 'Goodbye',                'Nante yie',            'farewell'),

  -- Wolof
  ('wo', 'Hello',                  'Nanga def?',           'greeting'),
  ('wo', 'How are you?',           'Nanga def?',           'greeting'),
  ('wo', 'Thank you',              'Jërejëf',              'courtesy'),
  ('wo', 'Yes',                    'Waaw',                 'response'),
  ('wo', 'No',                     'Déedéet',              'response'),
  ('wo', 'What is your name?',     'Lan la sa tuur?',      'question'),
  ('wo', 'My name is',             'Ma tuur',              'identity'),
  ('wo', 'Good morning',           'Jaam nga fanaan',      'greeting'),
  ('wo', 'Send money',             'Yonni xaalis',         'finance'),
  ('wo', 'Goodbye',                'Mangi dem',            'farewell')
) AS p(lang_code, phrase_english, phrase_native, category)
JOIN supported_languages sl ON sl.code = p.lang_code
ON CONFLICT DO NOTHING;

-- ── DIALECT REGISTRY ─────────────────────────────────────────────────────────
-- Regional variants that affect pronunciation and vocabulary

CREATE TABLE IF NOT EXISTS language_dialects (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  language_id     BIGINT NOT NULL REFERENCES supported_languages(id) ON DELETE CASCADE,
  dialect_name    TEXT NOT NULL,
  region          TEXT NOT NULL,
  country_codes   TEXT[],          -- ISO 3166-1 alpha-2
  notes           TEXT,
  speaker_est     INT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (language_id, dialect_name)
);

INSERT INTO language_dialects (language_id, dialect_name, region, country_codes, notes, speaker_est)
SELECT sl.id, d.dialect_name, d.region, d.country_codes, d.notes, d.speaker_est
FROM (VALUES
  -- Zulu dialects
  ('zu', 'Standard Zulu',    'KwaZulu-Natal', ARRAY['ZA'], 'Official standard', 8000000),
  ('zu', 'Gauteng Zulu',     'Gauteng',       ARRAY['ZA'], 'Urban variety, more code-switching', 4000000),

  -- Amharic dialects
  ('am', 'Addis Ababa',      'Central Ethiopia', ARRAY['ET'], 'Standard/prestige variety', 25000000),
  ('am', 'Gojjam',           'Northwest Ethiopia', ARRAY['ET'], 'Gojjam dialect', 5000000),
  ('am', 'Gondar',           'North Ethiopia', ARRAY['ET'], 'Gondar variety', 8000000),

  -- Twi sub-languages
  ('tw', 'Asante Twi',       'Ashanti Region', ARRAY['GH'], 'Most widely spoken variety', 5000000),
  ('tw', 'Akuapem Twi',      'Eastern Region', ARRAY['GH'], 'Prestige/literary standard', 2000000),
  ('tw', 'Fante',            'Central Region', ARRAY['GH'], 'Coastal variety', 2000000),

  -- Wolof dialects
  ('wo', 'Dakar Wolof',      'Dakar',          ARRAY['SN'], 'Urban, heavy French loans', 3000000),
  ('wo', 'Gambian Wolof',    'Gambia',         ARRAY['GM'], 'English-influenced variety', 1000000),

  -- Xhosa dialects
  ('xh', 'Gcaleka',          'Eastern Cape',   ARRAY['ZA'], 'Traditional standard', 4000000),
  ('xh', 'Ngqika',           'Eastern Cape',   ARRAY['ZA'], 'Most common spoken variety', 4000000)

) AS d(lang_code, dialect_name, region, country_codes, notes, speaker_est)
JOIN supported_languages sl ON sl.code = d.lang_code
ON CONFLICT (language_id, dialect_name) DO NOTHING;

-- ── LANGUAGE AI MODELS REGISTRY ──────────────────────────────────────────────
-- Track which AI capabilities are available per language

CREATE TABLE IF NOT EXISTS language_ai_capabilities (
  id                      BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  language_id             BIGINT UNIQUE NOT NULL REFERENCES supported_languages(id),
  tts_available           BOOLEAN DEFAULT FALSE,
  stt_available           BOOLEAN DEFAULT FALSE,
  translation_available   BOOLEAN DEFAULT FALSE,
  cohere_embed_support    BOOLEAN DEFAULT FALSE,   -- embed-multilingual-v3.0 support
  seamless_available      BOOLEAN DEFAULT FALSE,   -- Meta SeamlessM4T
  llm_finetuned           BOOLEAN DEFAULT FALSE,   -- custom NEXUS language model
  quality_score           FLOAT,                   -- 0-1, assessed AI accuracy
  last_evaluated_at       TIMESTAMPTZ,
  notes                   TEXT
);

INSERT INTO language_ai_capabilities (language_id, tts_available, stt_available, translation_available, cohere_embed_support, seamless_available, quality_score)
SELECT
  sl.id,
  caps.tts_available,
  caps.stt_available,
  caps.translation_available,
  caps.cohere_embed_support,
  caps.seamless_available,
  caps.quality_score
FROM (VALUES
  -- Tier 1 (already active, update capabilities)
  ('ha',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.82),   -- Hausa
  ('yo',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.85),   -- Yoruba
  ('ig',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.80),   -- Igbo
  ('sw',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.90),   -- Swahili
  ('fr',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.96),   -- French (Africa)
  ('pt',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.95),   -- Portuguese (Africa)
  ('ar',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.92),   -- Arabic
  ('pcm', FALSE, FALSE, TRUE,  TRUE,  FALSE, 0.65),   -- Nigerian Pidgin
  ('zu',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.75),   -- Zulu (Tier 2)
  ('xh',  TRUE,  FALSE, TRUE,  TRUE,  TRUE,  0.72),   -- Xhosa (Tier 2)
  ('am',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  0.78),   -- Amharic (Tier 2)
  ('tw',  FALSE, FALSE, TRUE,  TRUE,  TRUE,  0.60),   -- Twi (Tier 2)
  ('wo',  FALSE, FALSE, TRUE,  TRUE,  FALSE, 0.55),   -- Wolof (Tier 2)
  ('sn',  FALSE, FALSE, FALSE, TRUE,  FALSE, 0.40),   -- Shona (Tier 3)
  ('so',  FALSE, FALSE, TRUE,  TRUE,  TRUE,  0.65),   -- Somali (Tier 3)
  ('om',  FALSE, FALSE, FALSE, TRUE,  FALSE, 0.35),   -- Oromo (Tier 3)
  ('ff',  FALSE, FALSE, FALSE, FALSE, FALSE, 0.20),   -- Fula (Tier 3)
  ('ln',  FALSE, FALSE, FALSE, TRUE,  FALSE, 0.30),   -- Lingala (Tier 3)
  ('nd',  FALSE, FALSE, FALSE, TRUE,  FALSE, 0.25)    -- Ndebele (Tier 3)
) AS caps(lang_code, tts_available, stt_available, translation_available, cohere_embed_support, seamless_available, quality_score)
JOIN supported_languages sl ON sl.code = caps.lang_code
ON CONFLICT (language_id) DO UPDATE SET
  tts_available          = EXCLUDED.tts_available,
  stt_available          = EXCLUDED.stt_available,
  translation_available  = EXCLUDED.translation_available,
  cohere_embed_support   = EXCLUDED.cohere_embed_support,
  seamless_available     = EXCLUDED.seamless_available,
  quality_score          = EXCLUDED.quality_score,
  last_evaluated_at      = NOW();

-- ── INDEXES ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_languages_tier       ON supported_languages (tier, is_active);
CREATE INDEX IF NOT EXISTS idx_dialects_language    ON language_dialects (language_id);
CREATE INDEX IF NOT EXISTS idx_ai_caps_language     ON language_ai_capabilities (language_id);

-- ── ACTIVATION FUNCTION ───────────────────────────────────────────────────────
-- Helper: activate a tier-3 language when ready (called by ops team)
CREATE OR REPLACE FUNCTION activate_language(p_code TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE supported_languages
  SET is_active = TRUE, activated_at = NOW()
  WHERE code = p_code;
END;
$$;
