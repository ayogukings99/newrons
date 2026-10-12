import { createPublicKey, verify } from 'crypto'
import bs58 from 'bs58'

// Real DID-ownership verification (closes the VS2 stub).
// did:scn:<base58> carries the raw public key: 32 bytes = Ed25519,
// 65 bytes (0x04 prefix) = P-256 fallback from older web clients.
// The client signs the UTF-8 challenge nonce; signatures arrive as hex.
// Pure module — no env, fully unit-tested. Returns false on any malformation.

export function decodeDidKey(did: string): { algo: 'ed25519' | 'p256'; raw: Buffer } | null {
  // 32-byte Ed25519 keys encode to 43–44 chars; 65-byte P-256 (0x04‖x‖y) to ~88.
  const m = /^did:scn:([1-9A-HJ-NP-Za-km-z]{32,90})$/.exec(did)
  if (!m) return null
  let raw: Buffer
  try {
    raw = Buffer.from(bs58.decode(m[1]))
  } catch {
    return null
  }
  if (raw.length === 32) return { algo: 'ed25519', raw }
  if (raw.length === 65 && raw[0] === 0x04) return { algo: 'p256', raw }
  return null
}

/** Wrap raw 64-byte R||S into a DER SEQUENCE (liberal counterpart to the client's encoder). */
export function derWrapECDSA(raw: Buffer): Buffer {
  const norm = (v: Buffer): Buffer => {
    let i = 0
    while (i < v.length - 1 && v[i] === 0) i++
    const s = v.subarray(i)
    return s[0] & 0x80 ? Buffer.concat([Buffer.of(0), s]) : s
  }
  const r = norm(raw.subarray(0, 32))
  const s = norm(raw.subarray(32, 64))
  return Buffer.concat([Buffer.of(0x30, 4 + r.length + s.length, 0x02, r.length), r, Buffer.of(0x02, s.length), s])
}

export function verifyDidSignature(did: string, nonce: string, sigHex: string): boolean {
  try {
    const key = decodeDidKey(did)
    if (!key) return false
    if (!/^[0-9a-fA-F]+$/.test(sigHex) || sigHex.length % 2 !== 0) return false
    const sig = Buffer.from(sigHex, 'hex')
    const data = Buffer.from(nonce, 'utf8')
    if (key.algo === 'ed25519') {
      if (sig.length !== 64) return false
      const pub = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: key.raw.toString('base64url') },
        format: 'jwk',
      })
      return verify(null, data, pub, sig)
    }
    if (sig.length < 8) return false
    const pub = createPublicKey({
      key: {
        kty: 'EC', crv: 'P-256',
        x: key.raw.subarray(1, 33).toString('base64url'),
        y: key.raw.subarray(33, 65).toString('base64url'),
      },
      format: 'jwk',
    })
    if (verify('sha256', data, pub, sig)) return true
    // Fallback: older clients send WebCrypto raw R||S — wrap to DER and retry.
    // The 64-byte length check keeps this unambiguous (never valid DER).
    if (sig.length === 64) {
      try {
        return verify('sha256', data, pub, derWrapECDSA(sig))
      } catch {
        return false
      }
    }
    return false
  } catch {
    return false
  }
}
