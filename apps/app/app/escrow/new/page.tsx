'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

// Two-Stage Escrow — create a lock. Funds reserve from the payer's NXT via
// the API; release needs dual signature or live proof (see escrow/[id]).
export default function NewEscrow() {
  const router = useRouter();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('10');
  const [kind, setKind] = useState('escrow_dual');
  const [msg, setMsg] = useState('');
  async function create() {
    const token = sessionStorage.getItem('newrons.cap');
    if (!token) { setMsg('Register first — no capability token.'); return; }
    try {
      const esc = await api.escrowCreate(token, to.trim(), Number(amount), kind);
      router.push(`/escrow/${esc.id}`);
    } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <div>
      <h2>New escrow lock</h2>
      <label>Counterparty DID<br /><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="did:scn:…" style={{ width: '100%' }} /></label>
      <br /><br />
      <label>Amount (NXT)<br /><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
      <br /><br />
      <label>Kind<br />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="escrow_dual">Dual signature</option>
          <option value="escrow_liveproof">Live proof</option>
        </select>
      </label>
      <br /><br />
      <button onClick={create}>Lock funds →</button>
      <p aria-live="polite" style={{ fontSize: 13 }}>{msg}</p>
    </div>
  );
}
