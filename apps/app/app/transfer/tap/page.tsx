'use client';
import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import FaceCapture from '../../../components/FaceCapture';
import { api } from '../../../lib/api';

// Tap-to-Transfer (VS2): QR-compatible payload links (/transfer/tap?to=…&amount=…),
// on-device camera scan via BarcodeDetector where available, short-code paste
// fallback, face gate at/above 50 NXT. NFC Web API probe included; native NFC
// stays in the Expo app (existing nfc-payments rails).
function TapInner() {
  const q = useSearchParams();
  const [to, setTo] = useState(q.get('to') ?? '');
  const [amount, setAmount] = useState(q.get('amount') ?? '5');
  const [face, setFace] = useState('');
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const payload = `${typeof window !== 'undefined' ? window.location.origin : ''}/transfer/tap?to=${encodeURIComponent(to)}&amount=${encodeURIComponent(amount)}`;

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
          const u = new URL(found[0].rawValue);
          setTo(u.searchParams.get('to') ?? found[0].rawValue);
          setAmount(u.searchParams.get('amount') ?? amount);
          setMsg('Code captured.');
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) { setMsg(`Scan failed: ${(e as Error).message}`); }
  }

  async function submit() {
    const token = sessionStorage.getItem('newrons.cap');
    if (!token) { setMsg('Register first — no capability token.'); return; }
    try {
      const quote = await api.tapQuote(token, to.trim(), Number(amount));
      if (quote.requiresFace && !face) { setMsg('At/above 50 NXT: lock a face template below first.'); return; }
      await api.tapSubmit(token, to.trim(), Number(amount), face ? `face:${face.slice(0, 16)}` : undefined);
      setMsg(`Sent ${amount} NXT. Testnet — no real value.`);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div>
      <h2>Tap to transfer</h2>
      <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button onClick={scan}>Scan QR</button>
      </div>
      <label>To (DID or pasted code)<br /><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="did:scn:…" style={{ width: '100%' }} /></label>
      <br /><br />
      <label>Amount (NXT)<br /><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
      <p style={{ fontSize: 12, wordBreak: 'break-all', opacity: 0.7 }}>Shareable payload: {to ? payload : '—'}</p>
      <details>
        <summary style={{ fontSize: 13 }}>Face gate (≥ 50 NXT)</summary>
        <FaceCapture onDone={setFace} />
        <p style={{ fontSize: 12 }}>{face ? 'Assertion ready.' : 'Not locked.'}</p>
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
