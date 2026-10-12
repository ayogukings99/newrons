'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

// The Mirror (Layer 6 placeholder): live protocol aggregates only — escrow
// states, credit average, tap volume. No DIDs, no per-node data: Ghost-safe
// by construction. Three.js twin + scanning arrive Phase 3.
export default function Mirror() {
  const [s, setS] = useState<{ escrows: Record<string, number>; creditAvg: number; creditNodes: number; taps: number; tapVolumeNxt: number } | null>(null);
  useEffect(() => {
    api.mirror().then(setS).catch(() => setS(null));
    const t = setInterval(() => api.mirror().then(setS).catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, []);
  const total = s ? Object.values(s.escrows).reduce((a, b) => a + b, 0) : 0;
  return (
    <div>
      <h2>Mirror · testnet</h2>
      <div style={{ border: '1px solid #2a2a35', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>◉</div>
        {!s ? <p>Offline — showing nothing rather than stale illusions.</p> : (
          <>
            <p>Escrows: {total} {Object.entries(s.escrows).map(([k, v]) => `· ${k} ${v}`).join(' ')}</p>
            <p>Credit avg: {s.creditAvg} across {s.creditNodes} node{s.creditNodes === 1 ? '' : 's'}</p>
            <p>Taps: {s.taps} · {s.tapVolumeNxt} NXT moved</p>
          </>
        )}
        <p style={{ fontSize: 12, opacity: 0.6 }}>Live Three.js twin plugs in here (Phase 3). Every escrow event already emits MirrorDatum.</p>
      </div>
    </div>
  );
}
