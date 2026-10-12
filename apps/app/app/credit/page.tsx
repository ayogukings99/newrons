'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

// Civic Credit — soulbound score (base 50) + verifiable event history.
// No transfer function exists by design; score moves only on real contribution.
export default function Credit() {
  const [view, setView] = useState<{ score: number; history: { delta: number; reason: string; at: string }[] } | null>(null);
  const [msg, setMsg] = useState('Loading…');
  useEffect(() => {
    const token = sessionStorage.getItem('newrons.cap');
    if (!token) { setMsg('Register first — no capability token.'); return; }
    api.credit(token).then(setView).catch((e) => setMsg((e as Error).message));
  }, []);
  if (!view) return <p style={{ fontSize: 13 }}>{msg}</p>;
  return (
    <div>
      <h2>Civic credit · {view.score}</h2>
      <div style={{ height: 10, borderRadius: 999, background: '#222', overflow: 'hidden' }}>
        <div style={{ width: `${view.score}%`, height: '100%', background: '#c9a227' }} />
      </div>
      <ul style={{ fontSize: 13, paddingLeft: 18 }}>
        {view.history.length === 0 && <li>No verified acts yet — complete an escrow or tap.</li>}
        {view.history.map((h, i) => (
          <li key={i}>{h.delta >= 0 ? '+' : ''}{h.delta} · {h.reason} · {new Date(h.at).toLocaleString()}</li>
        ))}
      </ul>
    </div>
  );
}
