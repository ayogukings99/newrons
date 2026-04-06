# Sovereign OS — MVP Roadmap

> Phase-by-phase build plan. Each phase ships something usable.

---

## Phase 0 — What Exists (DONE)

- **Social layer (NEXUS)**: 5 phases, 21 services, 21 routes, 12 migrations, 31 components
- **Economic layer**: Rust protocol core (6 modules: Inventory, Procurement, Warehouse, Logistics, QC, Demand Forecasting) + Tauri v2 desktop node + Expo mobile screens
- **Integration layer**: 4 bridges wired, committed, and pushed
  - Identity Bridge — maps Supabase `users(id)` to `did:scn:` sovereign DID
  - NXT Settlement Bridge — PO lifecycle settled in NXT via `process_wallet_transfer` RPC
  - LOGOS Intelligence Bridge — Claude Haiku classifies community knowledge as demand signals
  - NFC Warehouse Bridge — context-aware warehouse scanning via `nfc_payment_tags`
- **Website**: newrons.app live on Vercel
- **Infrastructure**: Turborepo + pnpm workspaces + Cargo workspace, Supabase (PostgreSQL) + SQLite (local), 13 migrations written

---

## Phase 1 — Foundation MVP (Months 1-2)

**Goal**: One user can create identity, see their avatar, send NXT, browse a storefront.

### Scope

- Apply migration `013_integration_layer.sql` to Supabase production
- Deploy API to Vercel (Vercel MCP connected, one command)
- Unify supply-chain mobile screens into `apps/mobile/` (merge from `supply-chain-os/apps/mobile/`)
- **Anima v1**: static 3D avatar bound to DID (no dynamic evolution yet)
- **Storefront v1**: basic profile page per node (name, services, reputation score)
- NFC tap-to-transfer working end-to-end (social tipping + warehouse scanning)
- **Brand Finance Card** screen: NXT balance, transaction history, reputation score

### Ships

- Unified mobile app with identity + wallet + storefront
- Working NFC payments on physical devices
- Production API with all 4 integration bridges live

---

## Phase 2 — Loom + Social (Months 3-4)

**Goal**: Users can create/assign tasks, earn rewards, chat with embedded economy.

### Scope

- **Loom v1**: create task, assign to friend, set NXT escrow, confirm completion, pay out rewards
- **Chat system**: real-time messaging with storefront sharing (extend Pillar 13 Barbershop)
- **Calendar v1**: task deadlines + social commitments in unified view
- **Audio Layer**: music integrated into tasks and group spaces (extend Pillar 12)
- **Anima v2**: avatar responds to velocity (activity level drives size/luminosity)

### Ships

- Task system with real economic stakes (NXT escrow)
- Social messaging with embedded economy (share storefronts, tasks, quizzes)
- Calendar that unifies tasks and social life

---

## Phase 3 — Beehive + Local Economy (Months 5-7)

**Goal**: Local economy clusters work. Delivery, errands, skill exchange.

### Scope

- **Beehive Network v1**: GPS hex-clustering, local-first service routing
- Service matching: delivery, errands, skill exchange within hex zones
- **Hiring System v1**: companies view Loom task history as proof-of-work (no CV needed)
- **Card System**: proof-of-work cards with history + media evidence for trust validation
- **Real libp2p P2P sessions**: peer discovery, trading partner connections, dual-signed event exchange
- **Swarm Protocol v1**: self-organising node clusters, adaptive load balancing

### Ships

- Location-aware local economy (find services near you)
- Peer-to-peer trading without central server
- Hiring pipeline based on provable work history

---

## Phase 4 — Intelligence + AR (Months 8-10)

**Goal**: AI layer active, AR scanning works, governance live.

### Scope

- **Blackbox Optimizer v1**: invisible latency + network tuning
- **LOGOS AI v1**: passive intelligence across voice, vision, and context (multimodal)
- **AR/Reality Layer**: scan real world, digitise objects, place virtual objects in space
- **Wardrobe v1**: scan real clothing, digital wardrobe, avatar try-on
- **Governance v1**: blockchain voting at local scale (reputation-weighted)
- **Journal System**: monetisable journaling with AI-assisted reflection

### Ships

- AI that observes and assists without dominating
- Augmented reality scanning on mobile
- Community governance with on-chain voting

---

## Phase 5 — Sovereign Scale (Months 11-18)

**Goal**: Full Sovereign OS. Community-owned infrastructure.

### Scope

- Solana on-chain anchoring for DAG events
- DAO governance scaled to national level
- Quadratic voting + anti-sybil systems (proof-of-action identity)
- Full mesh networking: Bluetooth/local mesh (offline-first) + Internet fallback
- Linux fork exploration (full OS, not just app)
- Community-owned coins (NXT at scale)
- Platform as public infrastructure — no single owner, no rent-seeking

### Ships

- Sovereign, censorship-resistant infrastructure
- Offline-capable mesh economy
- Democratic governance at scale

---

## Build Principles

- Each phase ships usable software (not just backend)
- Mobile-first (Expo React Native)
- Local-first, P2P where possible
- One identity (DID), one token (NXT), one organism
- Optimised for low-resource environments (Nigeria baseline)
- WhatsApp-level simplicity in UX
