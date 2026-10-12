import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign } from 'crypto'
import bs58 from 'bs58'
import { decodeDidKey, derWrapECDSA, verifyDidSignature } from './did-verify'

// Roundtrips against real keys — no env, no network.
function ed25519Pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
  const did = `did:scn:${bs58.encode(raw)}`
  const sig = (nonce: string) => sign(null, Buffer.from(nonce, 'utf8'), privateKey).toString('hex')
  return { did, sig }
}

// Pull one 32-byte coordinate out of a DER ECDSA signature (r = index 0, s = 1).
function derRawPart(der: Buffer, index: 0 | 1): Buffer {
  let off = 2 // SEQUENCE header
  for (let i = 0; i <= index; i++) {
    const len = der[off + 1]
    if (i === index) {
      const raw = der.subarray(off + 2, off + 2 + len)
      const stripped = raw[0] === 0 ? raw.subarray(1) : raw
      return Buffer.concat([Buffer.alloc(32 - stripped.length), stripped])
    }
    off += 2 + len
  }
  throw new Error('unreachable')
}

function p256Pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  // SPKI DER = header + BIT STRING (0x00 pad + 65-byte uncompressed point).
  // WebCrypto 'raw' export (what real clients put in the DID) is the point itself.
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-66).subarray(1)
  const did = `did:scn:${bs58.encode(raw)}`
  const sig = (nonce: string) => sign('sha256', Buffer.from(nonce, 'utf8'), privateKey).toString('hex')
  return { did, sig }
}

describe('did-verify', () => {
  it('verifies Ed25519 challenge signatures', () => {
    const { did, sig } = ed25519Pair()
    const nonce = '123e4567-e89b-12d3-a456-426614174000'
    expect(verifyDidSignature(did, nonce, sig(nonce))).toBe(true)
  })
  it('verifies P-256 fallback signatures', () => {
    const { did, sig } = p256Pair()
    const nonce = '123e4567-e89b-12d3-a456-426614174000'
    expect(verifyDidSignature(did, nonce, sig(nonce))).toBe(true)
  })
  it('accepts legacy raw R||S P-256 signatures via DER wrap', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const rawPoint = publicKey.export({ format: 'der', type: 'spki' }).subarray(-66).subarray(1)
    const did = `did:scn:${bs58.encode(rawPoint)}`
    const nonce = '123e4567-e89b-12d3-a456-426614174000'
    // Simulate a WebCrypto client: raw IEEE P1363 signature, hex-encoded.
    const der = sign('sha256', Buffer.from(nonce, 'utf8'), privateKey)
    const raw = Buffer.concat([derRawPart(der, 0), derRawPart(der, 1)])
    expect(raw).toHaveLength(64)
    expect(verifyDidSignature(did, nonce, raw.toString('hex'))).toBe(true)
    expect(derWrapECDSA(raw).equals(der)).toBe(true)
  })
  it('rejects wrong nonce, tampered sig, and malformed DIDs', () => {
    const { did, sig } = ed25519Pair()
    const nonce = '123e4567-e89b-12d3-a456-426614174000'
    const good = sig(nonce)
    expect(verifyDidSignature(did, 'other-nonce', good)).toBe(false)
    expect(verifyDidSignature(did, nonce, good.slice(0, -2) + (good.endsWith('00') ? 'ff' : '00'))).toBe(false)
    expect(verifyDidSignature('did:scn:not!valid', nonce, good)).toBe(false)
    expect(verifyDidSignature('did:scn:11111111111111111111111111111111', nonce, good)).toBe(false)
    expect(verifyDidSignature(did, nonce, 'zz-top')).toBe(false)
  })
  it('classifies key encodings by length', () => {
    expect(decodeDidKey(ed25519Pair().did)?.algo).toBe('ed25519')
    expect(decodeDidKey(p256Pair().did)?.algo).toBe('p256')
    expect(decodeDidKey('did:scn:Nope')).toBe(null)
  })
})
