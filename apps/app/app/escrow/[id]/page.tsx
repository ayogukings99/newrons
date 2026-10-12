'use client';
import { use, useEffect, useState } from 'react';
import { api, type EscrowView } from '../../../lib/api';

// Escrow detail — accept / release / reverse according to state + role.
// Dual-kind release must be triggered by the payer (co-signature rule).
export default function EscrowDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [esc, setEsc] = useState<EscrowView | null>(null);
  const [proof, setProof] = useState('');
  const [msg, setMsg] = useState('Loading…');
  const token = () => sessionStorage.getItem('newrons.cap') ?? '';

  useEffect(() => {
    api.escrowGet(token(), id).then(setEsc).catch((e) => setMsg((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function act(fn: () => Promise<EscrowView>) {
    try { setEsc(await fn()); setMsg(''); }
    catch (e) { setMsg((e as Error).message); }
  }
  if (!esc) return <p style={{ fontSize: 13 }}>{msg}</p>;
  return (
    <div>
      <h2>Escrow · {esc.state}</h2>
      <p style={{ fontSize: 13 }}>{esc.amountNxt} NXT · {esc.kind}<br />{esc.payerDid} → {esc.counterpartyDid}<br />expires {esc.expiresAt}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {esc.state === 'locked' && <button onClick={() => act(() => api.escrowAccept(token(), id))}>Accept (counterparty)</button>}
        {esc.state === 'accepted' && (
          <>
            {esc.kind === 'escrow_liveproof' && (
              <input value={proof} onChange={(e) => setProof(e.target.value)} placeholder="live-proof hash (64 hex)" style={{ width: '100%' }} />
            )}
            <button onClick={() => act(() => api.escrowRelease(token(), id, proof || undefined))}>Release</button>
          </>
        )}
        {(esc.state === 'locked' || esc.state === 'accepted') && (
          <button onClick={() => act(() => api.escrowReverse(token(), id))}>Reverse</button>
        )}
      </div>
      <p style={{ fontSize: 13 }}>{msg === 'Loading…' ? '' : msg}</p>
    </div>
  );
}
