'use client';
import { useState } from 'react';
import { lifePathFromBirthday } from 'shared';

// Basic Living Avatar (VS1): visual builder + Birthday-Seed → Life-Path.
// Silent intelligence lives only inside the user's own avatar — no visible
// AI sits between nodes (PRD Layer 1, non-negotiable).
export default function Avatar() {
  const [name, setName] = useState('');
  const [seed, setSeed] = useState('');
  const [palette, setPalette] = useState('#c9a227');
  const life = seed ? lifePathFromBirthday(seed) : 0;
  function save() {
    localStorage.setItem('newrons.avatar.v1', JSON.stringify({ name, seed, palette, life, at: new Date().toISOString() }));
    alert(`Avatar saved — Life-Path ${life}.`);
  }
  return (
    <div>
      <h2>Living avatar</h2>
      <label>Display name<br /><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <br /><br />
      <label>Birthday seed (YYYY-MM-DD, stays on device)<br /><input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="1990-05-21" /></label>
      <p>Life-Path: <strong>{life || '—'}</strong></p>
      <label>Palette<br /><input type="color" value={palette} onChange={(e) => setPalette(e.target.value)} /></label>
      <div style={{ width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${palette}, #0b0b10)`, margin: '16px 0' }} />
      <button onClick={save}>Save avatar locally</button>
    </div>
  );
}
