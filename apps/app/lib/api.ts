// Thin client for apps/api rhythmic routes. Base URL via env; testnet only.
const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000/api/v1/rhythmic';

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error || `HTTP ${r.status}`);
  return (await r.json()).data as T;
}

export const api = {
  challenge: (did: string) => j<{ nonce: string }>(`/challenge`, { method: 'POST', body: JSON.stringify({ did }) }),
  verify: (did: string, sig: string, nonce: string) =>
    j<{ capabilityToken: string }>(`/verify`, { method: 'POST', body: JSON.stringify({ did, sig, nonce }) }),
  credit: (token: string) =>
    j<{ score: number; history: unknown[] }>(`/credit/me`, { headers: { authorization: `Bearer ${token}` } as HeadersInit }),
  ghost: (token: string, did: string, ghostOn: boolean) =>
    j<{ ghost: boolean }>(`/ghost/toggle`, { method: 'POST', headers: { authorization: `Bearer ${token}` } as HeadersInit, body: JSON.stringify({ did, ghost: ghostOn }) }),
};
