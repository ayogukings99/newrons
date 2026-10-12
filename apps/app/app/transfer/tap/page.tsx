'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import FaceCapture from '../../../components/FaceCapture';
import { api } from '../../../lib/api';
import { outbox } from '../../../lib/store';

// Tap-to-Transfer (VS3): QR-payload links, BarcodeDetector scan, paste fallback,
// server-issued face assertions (≥50 NXT), offline outbox with idempotent flush.
function TapInner() {
  const q = useSearchParams();
  const [to, setTo] = useState(q.get('to') ?? '');
  const [amount, setAmount] = useState(q.get('amount') ?? '5');
  const [face, setFace] = useState('');
  const [enrolled, setEnrolled] = useState(false);
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const payload = `${typeof window !== 'undefined' ? window.location.origin : ''}/transfer/tap?to=${encodeURIComponent(to)}&amount=${encodeURIComponent(amount)}`;

  // Flush the offline outbox on load and on reconnect.
  useEffect(() => {
    const flush = async () => {
      const token = sessionStorage.getItem('newrons.cap');
      const queued = outbox.all();
      if (!token || queued.length === 0) { setPending(queued.length); return; }
      try {
        const { results } = await api.tapSyncOffline(token, queued.map((t) => ({
          to: t.to, amountNXT: t.amountNxt, idempotencyKey: t.key, offlineCreatedAt: t.queuedAt,
          // Face assertions expire in 2 min — offline longer needs a fresh lock.
          faceAssertionId: undefined,
        })));
        for (const r of results) {
          if (r.ok) outbox.remove(r.key);
        }
        setPending(outbox.all().length);
        if (results.some((r) => r.ok)) setMsg('Offline taps settled.');
        const faceFails = results.filter((r) => !r.ok && /Face/i.test(r.error ?? ''));
        if (faceFails.length) setMsg(`${faceFails.length} queued tap(s) need a fresh face lock (assertions expire).`);
      } catch { setPending(queued.length); }
    };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  async function scan() {
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) { setMsg('No camera QR detector here — paste the link or code instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      const det = new BD({ formats: ['qr_code'] });
      for (let i = 0; i < 40; i++) {
        const found = await det.detect(v).catch(() => []);
        if (found.length) {
          try {
            const u = new URL(found[0].rawValue);
            setTo(u.searchParams.get('to') ?? found[0].rawValue);
            setAmount(u.searchParams.get('amount') ?? amount);
          } catch { setTo(found[0].rawValue); }
          setMsg('Code captured.');
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) { setMsg(`Scan failed: ${(e as Error).message}`); }
  }

  async function enroll() {
    const token = sessionStorage.getItem('newrons.cap');
    if (!token) { setMsg('Register first — no capability token.'); return; }
    if (!face) { setMsg('Lock a face template below first.'); return; }
    try {
      await api.faceEnroll(token, face);
      setEnrolled(true);
      setMsg('Template hash enrolled (images never leave your device).');
    } catch (e) { setMsg((e as Error).message); }
  }

  async function submit() {
    const token = sessionStorage.getItem('newrons.cap');
    if (!token) { setMsg('Register first — no capability token.'); return; }
    const amt = Number(amount);
    try {
      const quote = await api.tapQuote(token, to.trim(), amt);
      let assertion: string | undefined;
      if (quote.requiresFace) {
        if (!face) { setMsg('At/above 50 NXT: lock a face template below first.'); return; }
        if (!enrolled) { setMsg('Enroll the template first (one tap below).'); return; }
        assertion = (await api.faceVerify(token, face)).assertionId;
      }
      await api.tapSubmit(token, to.trim(), amt, assertion);
      setMsg(`Sent ${amount} NXT. Testnet — no real value.`);
    } catch (e) {
      const err = (e as Error).message;
      // Network failure (not a server rejection) → queue offline.
      if (/Failed to fetch|NetworkError|Load failed/i.test(err) || !navigator.onLine) {
        outbox.enqueue({ to: to.trim(), amountNxt: amt, faceHash: face || undefined });
        setPending(outbox.all().length);
        setMsg('Offline — tap queued, settles on reconnect.');
      } else setMsg(err);
    }
  }

  return (
    <div>
      <h2>Tap to transfer {pending > 0 && <span style={{ fontSize: 12 }}>· {pending} queued</span>}</h2>
      <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button onClick={scan}>Scan QR</button>
      </div>
      <label>To (DID or pasted code)<br /><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="did:scn:…" style={{ width: '100%' }} /></label>
      <br /><br />
      <label>Amount (NXT)<br /><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
      <p style={{ fontSize: 12, wordBreak: 'break-all', opacity: 0.7 }}>Shareable payload: {to ? payload : '—'}</p>
      <details open>
        <summary style={{ fontSize: 13 }}>Face gate (≥ 50 NXT, server assertions)</summary>
        <FaceCapture onDone={setFace} />
        <p style={{ fontSize: 12 }}>{face ? 'Template locked on device.' : 'Not locked.'}</p>
        <button onClick={enroll} disabled={!face}>{enrolled ? 'Enrolled ✓' : 'Enroll hash (consent)'}</button>
      </details>
      <br />
      <button onClick={submit}>Send →</button>
      <p style={{ fontSize: 13 }}>{msg}</p>
    </div>
  );
}

export default function Tap() {
  return <Suspense><TapInner /></Suspense>;
}
