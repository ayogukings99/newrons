# NEXUS Architecture Overview

## System Design

NEXUS is a TypeScript monorepo (Turborepo) with two main apps:

```
newrons/
├── apps/api/     — Fastify REST + WebSocket API
├── apps/mobile/  — Expo React Native app
└── packages/
    ├── shared/   — Shared types & constants
    ├── database/ — Supabase migrations
    └── config/   — Shared tooling config
```

## Data Flow

```
Mobile App (Expo)
      ↓ HTTP / WebSocket
   Fastify API
      ↓
   Supabase (PostgreSQL + pgvector + PostGIS + Auth + Realtime)
      ↓ Files
   Cloudflare R2
```

## Key Third-Party Services

| Service | Purpose | Pillar |
|---------|---------|--------|
| Supabase | DB, Auth, Realtime, Vector Search | All |
| Cloudflare R2 | Asset storage (3D meshes, audio, images) | 3, 9 |
| Claude API | AI chat, quiz grading, AI DJ, RAG | 2, 15 |
| Luma AI | 3D photogrammetry reconstruction | 9 |
| Azure Cognitive Services | African language TTS/STT | 10 |
| Meta SeamlessM4T | African language translation (self-hosted) | 10 |
| Cohere Embed Multilingual | Vector embeddings for African languages | 15 |
| Gotenberg | PDF export (self-hosted) | 3, 15 |

## Privacy Architecture (Pillar 14 - Security Intelligence)

Security queries and incident reports are **never linked to user identities**:
- `community_safety_reports` — no `reporter_id` column
- `route_security_queries` — no `user_id`, origin/destination hashed
- Safety companion shares are peer-to-peer, ephemeral, and auto-expire

## Real-time Architecture

- **Group Audio**: Custom WebSocket room via Fastify + ws
  - Sync interval: 10 seconds
  - Latency target: < 200ms across hub devices
- **Quiz Live Session**: WebSocket room for question broadcast + leaderboard updates
- **Barbershop Lineup**: Supabase Realtime for queue position updates
- **Safety Companion**: Peer-to-peer location sharing via Supabase Realtime

## Database Indexing Strategy

- All geo-based features use PostGIS `GIST` indexes
- Security reports have compound indexes on `(is_active, expires_at)`
- NFC tags indexed on `nfc_uid` for fast hardware tap resolution
- Quiz leaderboard indexed with `total_points DESC` for real-time ranking
