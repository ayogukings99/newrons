// Rhythmic OS — Phase-1 frozen interfaces (PRD v1.4 + Phase-1 Tech Spec v1.0).
// DID standard is the repo's existing `did:scn:<base58>` (see CLAUDE.md). Do not invent new formats.
// CivicCredit is soulbound: no transfer function exists anywhere by design.

export type NodeDID = `did:scn:${string}`;

export interface AvatarProfile {
  did: NodeDID;
  displayName: string;
  visual: { palette: string; motif: string; seedImageHash?: string };
  birthdaySeed: string; // YYYY-MM-DD, encrypted at rest, client-owned
  lifePath: number; // 1-9, derived client-side from birthdaySeed
  faceTemplateHash: string; // sha256 hex of on-device embedding; raw photo never leaves device
  createdAt: string;
}

export function lifePathFromBirthday(seed: string): number {
  const digits = seed.replace(/\D/g, '').split('').map(Number);
  if (digits.length === 0) return 0;
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && ![11, 22].includes(n)) n = String(n).split('').map(Number).reduce((a, b) => a + b, 0);
  return n > 9 ? 9 : n;
}

// Phase-1 implements 'escrow_dual' + 'escrow_liveproof' on Solana devnet.
// 'asset_sale' + 'timed_attendance' are forward-compat stubs for v1.4
// (brush packs + live per-hour classes) — accepted by types, rejected with
// a clear error if value is attempted before Phase 4.
export type SettlementKind = 'escrow_dual' | 'escrow_liveproof' | 'asset_sale' | 'timed_attendance';

export const PHASE1_ACTIVE_KINDS: SettlementKind[] = ['escrow_dual', 'escrow_liveproof'];

export interface EscrowAgreement {
  id: string;
  pda: string;
  chain: 'solana-devnet';
  payer: NodeDID;
  counterparty: NodeDID;
  amountNXT: number;
  fiatMemo?: { amount: number; currency: string };
  kind: SettlementKind;
  state: 'locked' | 'accepted' | 'released' | 'reversed' | 'disputed';
  liveProofHash?: string;
  expiresAt: string;
}

export interface CivicCreditScore {
  did: NodeDID;
  score: number; // 0-100, starts at 50
  updatedAt: string;
}

export interface CreditEvent {
  did: NodeDID;
  delta: number;
  reason: string;
  escrowId?: string;
  at: string;
}

export type Tier1Lang = 'yo' | 'ig' | 'ha' | 'pcm' | 'sw' | 'en';

export interface TapQuote {
  to: NodeDID;
  amountNXT: number;
  requiresFace: boolean;
  expiresAt: string;
}

export interface IntentSignal {
  did: NodeDID;
  kind: 'status' | 'need' | 'offer';
  text: string;
  lang: Tier1Lang;
  at: string;
}

// Capability token claims (short-lived, 5 min, scoped). Issued by API after
// DID-signature verify; required on every financial mutation with optional
// faceAssertionId above threshold.
export interface CapabilityClaims {
  did: NodeDID;
  scopes: Array<'escrow:create' | 'escrow:accept' | 'escrow:release' | 'transfer:submit' | 'signals:publish'>;
  exp: number;
}

// Mirror placeholder datum — every escrow event emits one (Architect §4.5).
export interface MirrorDatum {
  kind: 'escrow' | 'credit' | 'transfer';
  amount?: number;
  at: string;
}
