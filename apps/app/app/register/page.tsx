'use client';
import { useState } from 'react';
import FaceCapture from '../../components/FaceCapture';
import { getOrCreateNode, signNonce } from '../../lib/did';
import { api } from '../../lib/api';
import { consentLog } from '../../lib/store';

// VS1 sovereign entry: DID → face template → challenge → capability token.
// Keys + photo stay on device; server sees only DID + templateHash + signature.
export default function Register() {
  const [did, setDid] = useState('');
  const [faceHash, setFaceHash] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');

  async function begin() {
    const { did } = await getOrCreateNode();
    setDid(did);
    consentLog.add({ action: 'node-key-created', at: new Date().toISOString(), granted: true });
    setMsg(`Node ${did} created locally.`);
  }
  async function finish() {
    if (!did || !faceHash) { setMsg('Create node + lock face first.'); return; }
    const { nonce } = await api.challenge(did);
    const sig = await signNonce(nonce);
    const { capabilityToken } = await api.verify(did, sig, nonce);
    setToken(capabilityToken);
    sessionStorage.setItem('newrons.cap', capabilityToken);
    consentLog.add({ action: 'face-template-enrolled', at: new Date().toISOString(), granted: true });
    setMsg('Registered. Capability token held for 5 minutes.');
  }
  return (
    <div>
      <h2>Register node</h2>
      <button onClick={begin}>1 · Create local DID</button>
      <p style={{ fontSize: 13 }}>{did || 'No node yet.'}</p>
      <FaceCapture onDone={(h) => setFaceHash(h)} />
      <p style={{ fontSize: 13 }}>{faceHash ? `template ${faceHash.slice(0, 16)}… locked` : 'No face template.'}</p>
      <button onClick={finish}>2 · Prove + enter</button>
      <p aria-live="polite" style={{ fontSize: 13 }}>{msg}</p>
      {token && <p style={{ fontSize: 12, wordBreak: 'break-all' }}>cap: {token.slice(0, 24)}…</p>}
    </div>
  );
}
