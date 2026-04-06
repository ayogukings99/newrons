# neurons.app — CLAUDE.md
> Project context for Claude Code and Cowork sessions.
> Read this first. Everything you need to understand before touching any code.

---

## What This Is

**neurons.app** (Sovereign OS) is a living, decentralised, AI-native operating system.
One unified mobile app. One brand. Two inseparable layers — social and economic — built as a single organism.
Five named layers — Root Ledger, Brain, Interface, Loom, Spirits — forming one organism.

**GitHub**: `github.com/ayogukings99/newrons`
**Owner**: Kelechi (ayogukings99@gmail.com)

> "Global on arrival. Adapted for African cultural values."
> Like a starfish — no center, no single point of failure. You cannot manipulate it. You can only cooperate with it.
> To ignore it is to put yourself outside the social organism.

This is NOT a social app with a supply chain bolt-on. It is a **cooperative economic protocol** where social trust, community intelligence, and economic trade share the same identity, the same value token (NXT), and the same physical interaction layer (NFC).

---

## Monorepo Layout

```
newrons/                          ← this repo
├── apps/
│   ├── api/                      ← Fastify + TypeScript API (NEXUS backend)
│   └── mobile/                   ← UNIFIED Expo React Native app (one app, everything)
├── packages/
│   ├── database/migrations/      ← Supabase SQL migrations (001–013)
│   └── shared-types/             ← TypeScript types shared across apps
└── supply-chain-os/              ← Economic layer (Rust protocol + Tauri desktop + mobile)
    ├── apps/
    │   ├── desktop/              ← Tauri v2 desktop node (supply chain operators)
    │   └── mobile/               ← Supply chain mobile screens (being merged into apps/mobile)
    ├── packages/
    │   ├── protocol/             ← Rust core: DAG, CRDT, libp2p, identity, all 6 modules
    │   ├── shared-types/         ← Rust/TS type mirrors
    │   └── ui/                   ← Shared UI components (Badge, DualSigBadge, OnChainBadge, etc.)
    └── Cargo.toml                ← Rust workspace
```

**Toolchain**: Turborepo + pnpm workspaces + Cargo workspace (Rust)

---

## Architecture

### Identity
Every user is a **sovereign node**. Identity is an ed25519 keypair that produces a DID:
```
did:scn:<base58-pubkey>
```
Same DID across social layer AND economic layer. One identity, one keypair, two contexts.

### Dual Database Model
- **Supabase** (PostgreSQL) — social graph, community state, shared knowledge
- **SQLite** (local, per-node) — sovereign local state, event log, projections
- **Source Chain** (append-only DAG) — every action is an event; SQLite is always a rebuildable projection

### Named Architecture Layers

| Layer | Name | Function |
|---|---|---|
| Foundation | **Root Ledger** | Smart contracts, routing, DAG event log |
| Intelligence | **Brain** | AI + optimisation (Blackbox + LOGOS) |
| Interface | **Interface** | React / React Native / Tauri UI |
| Tasks | **Loom** | Task execution + escrow rewards |
| Identity | **Spirits** | Anima avatars + digital assets |

### The 15 Pillars (v5) — Reusable Context Forms
The pillars are abstract interaction patterns that apply in BOTH social and economic contexts:
1. Living Avatar — sovereign node identity (DID-anchored 3D avatar)
2. LOGOS Layer — community knowledge graph
3. Dumps + Journal — long-form thought capture
4. Brand Finance Card — economic passport: NXT balance, reputation, trading history
5. Community Coins (NXT) — universal settlement currency (social + economic)
6. Flight Logs — activity record / audit trail
7. Decentralised Power — governance / cooperative decision-making
8. Authorization Privacy — consent and access control
9. 3D World Scanning — spatial anchoring
10. African Languages — first-class multilingual (Azure Cognitive + SeamlessM4T)
11. Tap-to-Transfer (NFC) — physical value transfer and warehouse scanning
12. Group Audio + DJ — collaborative audio spaces
13. Barbershop Layer — scheduled community sessions
14. Security Intelligence — community threat awareness
15. Personal AI Quiz — adaptive learning layer

### Sovereign OS Systems (NEW)

| System | Type | Function |
|---|---|---|
| Anima | Extends Pillar 1 | High-fidelity 3D avatar with wealth/velocity/stillness evolution |
| Loom | NEW | Escrow-backed gamified task system with proof-of-work rewards |
| Beehive Network | NEW | GPS hex-node clustering for local-first economy + service routing |
| Swarm Protocol | Extends libp2p | Self-organising node clusters, adaptive load balancing |
| Blackbox Optimizer | NEW | Invisible performance/latency/AI tuning layer |
| Storefront | NEW | Each node = persistent shop/service page |
| Wardrobe | NEW | Scan real clothing, digital wardrobe, avatar try-on |
| Calendar | NEW | Unified calendar: tasks, chats, social, health |
| Hiring | NEW | Proof-of-work hiring — companies view task history, no CV |

> See `docs/SOVEREIGN_OS.md` for full specification.

### Economic Layer — 6 Modules
Built inside `supply-chain-os/packages/protocol/` (pure Rust, local-first):
1. **Inventory** — SKU management, stock levels, reorder alerts, cycle count
2. **Procurement (SRM)** — PO lifecycle, dual-signed events, supplier scorecards
3. **Warehouse** — task queue, bin map, put/pick/receive operations
4. **Logistics/Routes** — VRP route optimisation (nearest-neighbour + 2-opt), delivery confirmation
5. **Quality Control** — ISO 2859-1 AQL sampling, NCR management
6. **Demand Forecasting** — Holt-Winters triple exponential smoothing, ONNX local inference, Wilson EOQ

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | Expo React Native (unified app at `apps/mobile/`) |
| Desktop node | Tauri v2 (Rust + React, `supply-chain-os/apps/desktop/`) |
| API | Fastify + TypeScript (`apps/api/`) |
| Social DB | Supabase (PostgreSQL) |
| Sovereign DB | SQLite via rusqlite |
| Protocol core | Rust (DAG, CRDT/Automerge, libp2p, ed25519) |
| AI | Claude API (Haiku for LOGOS signal classification) |
| Embeddings | Cohere |
| Local ML | ONNX Runtime |
| Languages | Azure Cognitive Services + Meta SeamlessM4T |
| Storage | Cloudflare R2 |
| Blockchain | Solana (on-chain anchoring) + custom DAG (local source chain) |
| Settlement | NXT community coins via `process_wallet_transfer` Supabase RPC |
| P2P | libp2p (peer sessions, DHT anchoring) |

---

## Integration Layer — The 4 Bridges

The social and economic layers are wired together at 4 seams:

### 1. Identity Bridge
`apps/api/src/services/integration/identity-bridge.service.ts`
Maps `users(id)` (Supabase social identity) ↔ `did:scn:` (sovereign node DID).
Routes: `/api/v1/integration/identity/*`
Migration: `packages/database/migrations/013_integration_layer.sql`

### 2. NXT Settlement Bridge
`apps/api/src/services/integration/settlement-bridge.service.ts`
PO lifecycle settled in NXT using the same `process_wallet_transfer` RPC that powers social tipping.
Reserve on `PO_CONFIRMED`, execute on goods receipt, release on cancellation.
Mobile component: `apps/mobile/src/components/nfc/PoSettlementTap.tsx`
Routes: `/api/v1/integration/settlement/*`

### 3. LOGOS Intelligence Bridge
`apps/api/src/services/integration/logos-intelligence.service.ts`
Claude Haiku classifies community knowledge graph nodes as demand signals:
`demand_spike | trend_up | trend_down | seasonal | alert`
Background job runs every 6 hours (wired in `apps/api/src/index.ts`).
Desktop component: `supply-chain-os/apps/desktop/src/components/forecasting/LogosSignals.tsx`
Routes: `/api/v1/integration/intelligence/*`

### 4. NFC → Warehouse Bridge
`apps/api/src/services/integration/warehouse-nfc.service.ts`
Extends existing `nfc_payment_tags` (category=`warehouse_bin`) for warehouse scanning.
Context-aware: `task_complete | goods_receipt | bin_lookup | transfer`
Mobile component: `apps/mobile/src/components/nfc/NfcWarehouseTap.tsx`
Routes: `/api/v1/integration/warehouse/*`

---

## Key Conventions

### DID Format
```
did:scn:<base58-encoded-ed25519-pubkey>
```

### Event Types (DAG)
38 event types in `supply-chain-os/packages/protocol/src/dag/mod.rs`.
Key cross-node events require dual signatures (both parties): `PO_CONFIRMED`, `DELIVERY_CONFIRMED`.

### NXT Settlement
Always use the `process_wallet_transfer` Supabase RPC — never raw SQL balance updates.
The same RPC handles NFC social tipping AND supply chain PO settlement.

### Supabase Migrations
Sequential, in `packages/database/migrations/`.
Latest: `013_integration_layer.sql` (must be applied to production Supabase before integration routes work).

### Tauri Commands
All 50+ commands registered in `supply-chain-os/apps/desktop/src-tauri/src/lib.rs`.
TypeScript IPC wrappers at `supply-chain-os/apps/desktop/src/lib/tauri.ts`.

---

## Build Status

| Layer | Status |
|---|---|
| Social layer (NEXUS) | ✅ COMPLETE — 5 phases, 21 services, 21 routes, 12 migrations, 31 components |
| Economic layer (6 modules) | ✅ COMPLETE — Rust protocol core + Tauri desktop + Expo mobile |
| Integration layer (4 bridges) | ✅ COMPLETE — wired, committed, pushed |
| Migration 013 applied to prod | ⏳ PENDING |
| API deployed to production | ⏳ PENDING |
| Mobile supply-chain screens unified | ⏳ PENDING (supply-chain-os/apps/mobile/ → apps/mobile/) |
| Real P2P trading sessions (libp2p) | ⏳ PENDING — the soul of the starfish |

---

## Pending Work (priority order)

1. **Apply migration 013** to Supabase production — 5 minutes, unblocks everything integration
2. **Deploy API** to Vercel — Vercel MCP is connected, one command
3. **Unify supply-chain mobile screens** — move `supply-chain-os/apps/mobile/src/components/` into `apps/mobile/src/`
4. **Real libp2p P2P sessions** — peer discovery, trading partner connections, dual-signed event exchange
5. **Living Avatar** (Pillar 1) — DID-anchored 3D avatar, the visual face of the sovereign node
6. **Brand Finance Card** (Pillar 4) — economic passport screen: NXT balance, reputation, trading history
7. **Loom Task System** — escrow-backed task engine (new Sovereign OS system)
8. **Beehive Network** — GPS hex-clustering for local economy routing
9. **Storefront System** — node-as-shop persistent profiles

---

## Do Not

- Add a central server or database that all nodes report to — the architecture is peer-to-peer, local-first
- Separate the social and economic layers into different apps or brands — they are ONE organism
- Use raw SQL balance updates — always use `process_wallet_transfer` RPC for NXT
- Create new DID formats — `did:scn:<base58>` is the standard
- Touch `process_wallet_transfer` without understanding the escrow/reserve pattern in `settlement-bridge.service.ts`
- Treat Sovereign OS systems (Loom, Beehive, Storefront, etc.) as separate products — they are subsystems of ONE organism, sharing identity (DID) and settlement (NXT)
