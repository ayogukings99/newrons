// Local-first stores: ghost mode, language, consent log. Device-owned,
// sync only with explicit consent (Layer 3). Ghost blocks all non-essential
// signal contribution (Layer 5 gate).

export type Tier1Lang = 'yo' | 'ig' | 'ha' | 'pcm' | 'sw' | 'en';

const GHOST = 'newrons.ghost.v1';
const LANG = 'newrons.lang.v1';
const CONSENT = 'newrons.consent.v1';

export const ghost = {
  get(): boolean { return localStorage.getItem(GHOST) === '1'; },
  set(v: boolean) { localStorage.setItem(GHOST, v ? '1' : '0'); },
};

export const lang = {
  get(): Tier1Lang { return (localStorage.getItem(LANG) as Tier1Lang) || 'en'; },
  set(v: Tier1Lang) { localStorage.setItem(LANG, v); },
};

export interface ConsentEntry { action: string; at: string; granted: boolean }
export const consentLog = {
  all(): ConsentEntry[] { try { return JSON.parse(localStorage.getItem(CONSENT) || '[]'); } catch { return []; } },
  add(e: ConsentEntry) { localStorage.setItem(CONSENT, JSON.stringify([...consentLog.all(), e].slice(-200))); },
};

// Offline tap outbox — queued when the network is down, flushed on reconnect.
// Each tap carries its own idempotency key so retries settle exactly once.
export interface QueuedTap {
  key: string; to: string; amountNxt: number; faceHash?: string; queuedAt: string;
}
const OUTBOX = 'newrons.tap.outbox.v1';
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
export const outbox = {
  all(): QueuedTap[] { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; } },
  enqueue(t: Omit<QueuedTap, 'key' | 'queuedAt'>): QueuedTap {
    const item = { ...t, key: uuid(), queuedAt: new Date().toISOString() };
    const seen = new Set(outbox.all().map((x) => x.key));
    const next = [...outbox.all(), item].filter((x) => seen.has(x.key) || (seen.add(x.key), true)).slice(-50);
    localStorage.setItem(OUTBOX, JSON.stringify(next));
    return item;
  },
  remove(key: string) {
    localStorage.setItem(OUTBOX, JSON.stringify(outbox.all().filter((x) => x.key !== key)));
  },
  get pending(): number { return outbox.all().length; },
};
