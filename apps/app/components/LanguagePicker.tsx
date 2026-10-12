'use client';
import { useEffect, useState } from 'react';
import { lang, type Tier1Lang } from '../lib/store';

// Tier-1 skeleton: full UI switchable yo/ig/ha/pcm/sw/en. Training loop is Phase 4.
const LANGS: { code: Tier1Lang; label: string }[] = [
  { code: 'yo', label: 'Yorùbá' }, { code: 'ig', label: 'Igbo' },
  { code: 'ha', label: 'Hausa' }, { code: 'pcm', label: 'Pidgin' },
  { code: 'sw', label: 'Kiswahili' }, { code: 'en', label: 'English' },
];
export const STRINGS: Record<Tier1Lang, { enter: string; ghost: string }> = {
  yo: { enter: 'Wọlé', ghost: 'Pamó' }, ig: { enter: 'Bata', ghost: 'Zoo' },
  ha: { enter: 'Shiga', ghost: 'Boye' }, pcm: { enter: 'Enter', ghost: 'Ghost' },
  sw: { enter: 'Ingia', ghost: 'Jifiche' }, en: { enter: 'Enter', ghost: 'Ghost' },
};
export default function LanguagePicker() {
  const [l, setL] = useState<Tier1Lang>('en');
  useEffect(() => setL(lang.get()), []); // client-only store; hydrate after mount
  return (
    <select aria-label="Language" value={l} onChange={(e) => { const v = e.target.value as Tier1Lang; setL(v); lang.set(v); }}>
      {LANGS.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
    </select>
  );
}
