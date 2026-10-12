# Rhythmic OS — Phase-1 build record (living)

Source: PRD v1.4 (12 Oct 2026) + Phase-1 Tech Spec v1.0. Adapts the Architect's
frozen interfaces to this repo's reality: `did:scn:<base58>` stays the standard,
Fastify `apps/api` stays the backend, NFC/settlement bridges are reused —
not replaced. New surface is minimal:

- `apps/app` — Next.js 15 PWA playground for `app.newrons.app` (this branch).
  `apps/web` (marketing site) is untouched.
- `apps/api/src/routes/rhythmic.ts` — `/api/v1/rhythmic/*` (challenge, verify,
  credit/me, escrow/create stub, ghost/toggle, signals/publish).
- `packages/shared/src/types/rhythmic.ts` — frozen Phase-1 types. Import these;
  do not redefine.

## Vertical slices
- VS1 (branch `phase-1/vs1-sovereign-entry`, PR pending): register → face →
  DID → avatar → ghost + language skeleton + mirror placeholder + consent log.
- VS2 (branch `phase-1/vs2-escrow-credit-tap`, this branch): Two-Stage Escrow
  in NXT-reserve mode (`rhythmic_escrows` + `process_wallet_transfer`, same
  pattern as SettlementBridgeService) + Civic Credit mint/slash
  (`civic_credit_events` + `civic_credit_scores`, base 50) + tap-to-transfer
  (QR-payload links + BarcodeDetector scan + 50-NXT face gate) + `requireNodeAuth`
  (fixes VS1 bug where DID capability tokens were rejected by `requireAuth`).
  Anchor program source ships in `contracts/escrow` (devnet deploy pending
  toolchain — see its README). Migration 014 must be applied to Supabase
  alongside the still-pending 013.
- VS3 (branch `phase-1/vs3-street-ready`, this branch): street-ready hardening —
  server-issued single-use face assertions (`face_enrollments`, 2-min TTL,
  equality match; fuzzy model is VS4+) replacing trusted client strings;
  offline tap outbox (localStorage, idempotent flush via `tap/sync-offline`,
  cap 50, face re-lock needed after expiry); live Mirror aggregates
  (`GET /mirror`, Ghost-safe counts only). Migration 015 pending with 013/014.
- VS4 (branch `phase-1/vs4-hardening`, this branch): exit-criteria hardening —
  real Ed25519/P-256 challenge-signature verify (closes the VS2 stub);
  tiered rate limits (120/min backstop, 10/min on challenge/verify/face);
  API security headers + app CSP/Permissions-Policy (camera self-only);
  offline service worker (shell only, never API/secrets); skip link,
  focus-visible rings, live-region status, viewport+theme meta.
  First load ~107 kB (inside the low-end budget). Migrations 013–015 still
  await Supabase application; in-memory limits/nonces/assertions need Redis
  pre-production; device/camera + screen-reader pass still owed on hardware.
  Post-review fixes (on this branch): b58 leading-zero-only encoding, P-256
  DER wire format (+ server raw fallback), per-instance limiter stores with
  DID-aware keys and sweeps, 403 (not 500) for DID-less callers,
  consume-assertion-after-settlement, offline face re-verify at flush,
  SW GET guard, localhost HSTS exemption. 013 left untouched deliberately:
  its REFERENCES users(id) follow the repo-wide 001–012 convention
  (public.users is a bootstrap table); pointing 013 at auth.users(id)
  would type-mismatch (BIGINT vs UUID) and orphan the identity bridges.
- VS3: street-ready QR + face-threshold + offline queue (reuse sync-offline).
- VS4: hardening (CSP, rate-limit tuning, WCAG pass, low-end Android, PWA offline).

## v1.4 forward-compat (no rework rule)
`SettlementKind` includes `asset_sale` + `timed_attendance` now; API rejects
them with 409 until Phase 4. Brush packs / live per-hour classes plug into the
same escrow + credit rails.

## Impact Analysis (required on every PR touching auth/keys/escrow/identity)
1. Scope (layers touched) · 2. Positive-sum check · 3. Starfish check (new centre?)
4. Collusion surface (how could 2+ nodes game it? detection/slash?)
5. Privacy/consent (stays on-device? revocation?) · 6. Purity/resonance
7. Storage/a11y cost · 8. Rollback. Failing 2–4 rejects the PR.

## Anti-collusion minimum (Phase 1)
Rate limits on challenge/escrow (in place), coordinated-farming heuristics on
escrow pairs, zero-value/self-dealing escrows earn zero credit + review queue.

## Test
- `pnpm --filter shared typecheck`, `pnpm --filter api typecheck`
- `pnpm --filter @newrons/app typecheck && pnpm --filter @newrons/app build`
- Device: low-end Android Chrome + desktop; camera permission flow; ghost blocks signals.
