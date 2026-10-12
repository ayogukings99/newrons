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
- VS1 (this branch): register → face → DID → avatar → ghost + language skeleton
  + mirror placeholder + consent log.
- VS2 (next): Solana-devnet Two-Stage Escrow (Anchor PDA) + credit mint on
  escrow events + tap-to-transfer QR (NFC bonus, reuse nfc-payments routes).
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
