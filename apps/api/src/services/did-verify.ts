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
    return verify('sha256', data, pub, sig)
  } catch {
    return false
  }
}
