// Sovereign Node DID manager — client-side, non-custodial.
// Keys never leave the device. VS1 uses WebCrypto; Solana devnet keypair
// wiring + WebAuthn passkeys land in VS2 (see docs/RHYTHMIC_PHASE1.md).

export type NodeDID = `did:scn:${string}`;

const KEY_NAME = 'newrons.nodekey.v1';

function b58(bytes: Uint8Array): string {
  const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')) || 0n;
  let out = '';
  // Only LEADING zeroes become '1's — an interior zero must not add one,
  // or the DID decodes to extra bytes and the server rejects the key.
  for (const b of bytes) {
    if (b !== 0) break;
    out += '1';
  }
  while (num > 0n) { out = ALPH[Number(num % 58n)] + out; num /= 58n; }
  return out || '1';
}

// WebCrypto ECDSA signatures are raw R||S; servers (Node/JWS) expect DER.
function derEncodeECDSA(raw: Uint8Array): Uint8Array {
  const norm = (v: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++;
    const s = v.subarray(i);
    return s[0] & 0x80 ? Uint8Array.of(0, ...s) : s;
  };
  const r = norm(raw.subarray(0, 32));
  const s = norm(raw.subarray(32, 64));
  const out = new Uint8Array(6 + r.length + s.length);
  out[0] = 0x30; out[1] = 4 + r.length + s.length;
  out[2] = 0x02; out[3] = r.length;
  out.set(r, 4);
  out[4 + r.length] = 0x02; out[5 + r.length] = s.length;
  out.set(s, 6 + r.length);
  return out;
}

export async function getOrCreateNode(): Promise<{ did: NodeDID; pubB58: string }> {
  const raw = localStorage.getItem(KEY_NAME);
  if (raw) return JSON.parse(raw);
  // Ed25519 where supported, else P-256 fallback (flagged, upgraded in VS2).
  let algo: AlgorithmIdentifier | EcKeyGenParams = { name: 'Ed25519' } as AlgorithmIdentifier;
  try {
    await crypto.subtle.generateKey(algo, false, ['sign']);
  } catch {
    algo = { name: 'ECDSA', namedCurve: 'P-256' };
  }
  const kp = (await crypto.subtle.generateKey(algo, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const pubB58 = b58(pubRaw);
  const did = `did:scn:${pubB58}` as NodeDID;
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  localStorage.setItem(KEY_NAME, JSON.stringify({ did, pubB58, privJwk, algo: (algo as { name?: string }).name }));
  return { did, pubB58 };
}

export async function signNonce(nonce: string): Promise<string> {
  const raw = localStorage.getItem(KEY_NAME);
  if (!raw) throw new Error('No node key — register first');
  const { privJwk, algo } = JSON.parse(raw);
  const key = await crypto.subtle.importKey(
    'jwk', privJwk,
    algo === 'Ed25519' ? ({ name: 'Ed25519' } as AlgorithmIdentifier) : { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  );
  const data = new TextEncoder().encode(nonce);
  const rawSig = new Uint8Array(await crypto.subtle.sign(
    algo === 'Ed25519' ? ({ name: 'Ed25519' } as AlgorithmIdentifier) : { name: 'ECDSA', hash: 'SHA-256' },
    key, data,
  ));
  // Ed25519 stays raw 64-byte; ECDSA goes out DER-encoded (what verifiers expect).
  const sig = algo === 'Ed25519' ? rawSig : derEncodeECDSA(rawSig);
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
