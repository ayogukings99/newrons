# NEXUS (newrons)

> **Built for Africa. Built by Africa. Built in Africa's voice.**

NEXUS is a civilization-layer protocol built from Africa — from its languages, informal economy, street-level commerce, community structures, creative culture, oral traditions, and physical reality.

---

## The 15 Pillars

| # | Pillar | Core Value |
|---|--------|-----------|
| 1 | Living Avatar | Your digital body, socially evolved |
| 2 | LOGOS Layer | AI mirrors your patterns, surfaces truth |
| 3 | Dumps + Journal | Your life, arranged into meaning |
| 4 | Brand Finance Card | Your identity as your payment method |
| 5 | Community Coins | Value from contribution, not speculation |
| 6 | Flight Logs | Professional aviation infrastructure |
| 7 | Decentralized Power | Community-owned, not platform-controlled |
| 8 | Authorization Privacy | Your data, only with your consent |
| 9 | 3D World Scanning | Reality scanned into a living virtual world |
| 10 | African Languages | Every African tongue, community-trained |
| 11 | Tap-to-Transfer | The street economy, digitized |
| 12 | Group Audio + DJ | Sound as community infrastructure |
| 13 | Barbershop Layer | Culture's sacred space, virtualized |
| 14 | Security Intelligence | Safety context without surveillance |
| 15 | Personal AI Quiz | Your knowledge, made interactive |

---

## Monorepo Structure

```
newrons/
├── apps/
│   ├── api/          # Fastify backend (Node.js + TypeScript)
│   └── mobile/       # Expo React Native app
├── packages/
│   ├── shared/       # Shared types, constants, utilities
│   ├── database/     # Supabase migrations + schema
│   └── config/       # Shared ESLint, TSConfig
├── docs/             # Architecture decisions, API docs
└── .github/          # CI/CD workflows
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify + TypeScript |
| Mobile | Expo + React Native |
| Database | Supabase (PostgreSQL + pgvector + PostGIS) |
| Storage | Cloudflare R2 |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime + WebSockets |
| 3D Rendering | Three.js (mobile) + Babylon.js (web) |
| AI | Claude API + OpenAI Embeddings |
| Language AI | Azure Cognitive Services + Meta SeamlessM4T |
| 3D Reconstruction | Luma AI API |
| Payments | NFC (React Native NFC Manager) + Solana (Phase 4) |
| PDF Export | Gotenberg (self-hosted) |
| Deployment | Railway + Cloudflare |

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 8+
- Expo CLI
- Supabase CLI

### Install
```bash
pnpm install
```

### Environment
```bash
cp .env.example .env
# Fill in your credentials
```

### Run API
```bash
pnpm --filter api dev
```

### Run Mobile
```bash
pnpm --filter mobile start
```

### Run Database Migrations
```bash
pnpm --filter database migrate
```

---

## Phase Roadmap

- **Phase 1 (Months 1–3):** Identity · Wallet · Escrow · AI Chat · NFC Tap · African Languages Tier 1 · Barbershop Lineup · Security Reports
- **Phase 2 (Months 4–6):** Map Layer · Virtual Buildings · 3D Scanning Beta · Group Audio + DJ · Full Barbershop · Language Training Mechanic
- **Phase 3 (Months 7–10):** Creator Economy · Personal AI · Quiz System · 3D World Full · Languages Tier 3 · LOGOS v1
- **Phase 4 (Months 11–18):** Solana On-chain · DAO Governance · 3D Haircut Try-On · Full Security Intelligence
- **Phase 5 (Months 18–30):** Platform as Public Infrastructure · Community-Owned Coins · Language Model Community-Owned

---

*Reality and relativity first. The Word beneath everything. The people above everything else.*
