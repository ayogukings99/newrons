'use client';
import { useEffect, useState } from 'react';
import { ghost } from '../lib/store';

// Mandatory Ghost Mode (Layer 5): one tap stops all non-essential signals.
export default function GhostToggle() {
  const [g, setG] = useState(false);
  useEffect(() => setG(ghost.get()), []); // localStorage is client-only; hydrate after mount
  return (
    <button
      aria-pressed={g}
      onClick={() => { const v = !g; setG(v); ghost.set(v); }}
      style={{ border: '1px solid #2a2a35', borderRadius: 999, padding: '8px 16px' }}
    >
      {g ? '👻 Ghost ON — silent' : '👁 Ghost OFF — present'}
    </button>
  );
}
