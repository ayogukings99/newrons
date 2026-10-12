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
