'use client';
import { useRef, useState } from 'react';
import { captureFaceTemplate } from '../lib/face';

// Bank-app style capture: live preview, one button, explicit consent text.
// Raw frames stay in the <video> element — only templateHash leaves.
export default function FaceCapture({ onDone }: { onDone: (hash: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('Camera off. Your photo never leaves this device.');

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = ref.current!;
    v.srcObject = stream;
    await v.play();
    setOn(true);
    setMsg('Look at the camera, hold still…');
  }
  async function capture() {
    const { templateHash, liveness } = await captureFaceTemplate(ref.current!);
    (ref.current!.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
    setOn(false);
    if (!liveness) { setMsg('No liveness detected — try again in better light.'); return; }
    setMsg('Face template locked on this device.');
    onDone(templateHash);
  }
  return (
    <div style={{ border: '1px solid #2a2a35', borderRadius: 12, padding: 16 }}>
      <video ref={ref} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
      <p style={{ fontSize: 13, opacity: 0.75 }}>{msg}</p>
      {!on
        ? <button onClick={start}>Start camera</button>
        : <button onClick={capture}>Capture + lock template</button>}
    </div>
  );
}
