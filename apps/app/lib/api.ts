// Thin client for apps/api rhythmic routes. Base URL via env; testnet only.
const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000/api/v1/rhythmic';

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error || `HTTP ${r.status}`);
  return (await r.json()).data as T;
}

export interface EscrowView {
  id: string; payerDid: string; counterpartyDid: string; amountNxt: number;
  kind: string; state: 'locked' | 'accepted' | 'released' | 'reversed' | 'disputed';
  expiresAt: string;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` } as HeadersInit;
}

export const api = {
  challenge: (did: string) => j<{ nonce: string }>(`/challenge`, { method: 'POST', body: JSON.stringify({ did }) }),
  verify: (did: string, sig: string, nonce: string) =>
    j<{ capabilityToken: string }>(`/verify`, { method: 'POST', body: JSON.stringify({ did, sig, nonce }) }),
  credit: (token: string) =>
    j<{ score: number; history: { delta: number; reason: string; at: string }[] }>(`/credit/me`, { headers: auth(token) }),
  ghost: (token: string, did: string, ghostOn: boolean) =>
    j<{ ghost: boolean }>(`/ghost/toggle`, { method: 'POST', headers: auth(token), body: JSON.stringify({ did, ghost: ghostOn }) }),
  escrowCreate: (token: string, counterparty: string, amountNXT: number, kind = 'escrow_dual') =>
    j<EscrowView>(`/escrow/create`, { method: 'POST', headers: auth(token), body: JSON.stringify({ counterparty, amountNXT, kind }) }),
  escrowGet: (token: string, id: string) => j<EscrowView>(`/escrow/${id}`, { headers: auth(token) }),
  escrowAccept: (token: string, id: string) =>
    j<EscrowView>(`/escrow/${id}/accept`, { method: 'POST', headers: auth(token) }),
  escrowRelease: (token: string, id: string, liveProofHash?: string) =>
    j<EscrowView>(`/escrow/${id}/release`, { method: 'POST', headers: auth(token), body: JSON.stringify({ liveProofHash }) }),
  escrowReverse: (token: string, id: string) =>
    j<EscrowView>(`/escrow/${id}/reverse`, { method: 'POST', headers: auth(token) }),
  tapQuote: (token: string, to: string, amountNXT: number) =>
    j<{ requiresFace: boolean }>(`/tap/quote`, { method: 'POST', headers: auth(token), body: JSON.stringify({ to, amountNXT }) }),
  tapSubmit: (token: string, to: string, amountNXT: number, faceAssertionId?: string) =>
    j<{ ok: boolean }>(`/tap/submit`, { method: 'POST', headers: auth(token), body: JSON.stringify({ to, amountNXT, faceAssertionId }) }),
};
