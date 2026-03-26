-- ═══════════════════════════════════════════════════════════════
-- Migration 007: Personal AI + Conference Quiz System (Pillar 15)
-- ═══════════════════════════════════════════════════════════════

-- Enable pgvector extension (for knowledge base embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_knowledge_bases (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  owner_id        BIGINT NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  description     TEXT,
  access_level    TEXT DEFAULT 'private' CHECK (access_level IN ('private','trusted','public')),
  document_count  INT DEFAULT 0,
  total_tokens    BIGINT DEFAULT 0,
  last_trained_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_knowledge_documents (
  id                BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  knowledge_base_id BIGINT NOT NULL REFERENCES ai_knowledge_bases(id) ON DELETE CASCADE,
  file_id           BIGINT REFERENCES files(id),
  type              TEXT NOT NULL CHECK (type IN ('pdf','text','voice_note','video_transcript','web_link','image')),
  title             TEXT,
  content_summary   TEXT,
  chunk_count       INT DEFAULT 0,
  vector_namespace  TEXT,           -- Supabase pgvector namespace for this document
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','ready','failed')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_sessions (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  host_id               BIGINT NOT NULL REFERENCES users(id),
  knowledge_base_id     BIGINT REFERENCES ai_knowledge_bases(id),
  context_id            BIGINT,
  context_type          TEXT CHECK (context_type IN ('hub','event','group','meeting')),
  title                 TEXT,
  question_count        INT DEFAULT 10,
  time_per_question_sec INT DEFAULT 30,
  difficulty            TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard','mixed')),
  format                TEXT DEFAULT 'mixed' CHECK (format IN ('multiple_choice','true_false','short_answer','mixed')),
  language_id           BIGINT REFERENCES supported_languages(id),
  status                TEXT DEFAULT 'preparing' CHECK (status IN ('preparing','active','completed')),
  current_question      INT DEFAULT 0,
  prize_amount          NUMERIC(18,2) DEFAULT 0,
  prize_currency        TEXT DEFAULT 'NGN',
  prize_coin_id         BIGINT REFERENCES community_coins(id),
  prize_coin_amount     BIGINT DEFAULT 0,
  participant_count     INT DEFAULT 0,
  started_at            TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_questions (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id      BIGINT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_number INT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('multiple_choice','true_false','short_answer','image','audio')),
  question_text   TEXT NOT NULL,
  media_url       TEXT,
  options         JSONB,            -- [{id, text}] for MC/TF
  correct_option_id TEXT,           -- for MC/TF
  correct_answer_text TEXT,         -- for short answer (AI grades contextually)
  explanation     TEXT,             -- shown after answer
  points          INT DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_responses (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id      BIGINT NOT NULL REFERENCES quiz_sessions(id),
  question_id     BIGINT NOT NULL REFERENCES quiz_questions(id),
  participant_id  BIGINT NOT NULL REFERENCES users(id),
  response        TEXT,
  is_correct      BOOLEAN,
  points_earned   INT DEFAULT 0,
  response_time_ms INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_leaderboard (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id    BIGINT NOT NULL REFERENCES quiz_sessions(id),
  user_id       BIGINT NOT NULL REFERENCES users(id),
  total_points  INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  rank          INT,
  prize_earned  NUMERIC(18,2) DEFAULT 0,
  coins_earned  BIGINT DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX idx_quiz_sessions_host ON quiz_sessions (host_id, status);
CREATE INDEX idx_quiz_responses_session ON quiz_responses (session_id, question_id);
CREATE INDEX idx_quiz_leaderboard_session ON quiz_leaderboard (session_id, total_points DESC);
