import { describe, it, expect } from 'vitest'
import { createRateLimit, sweepRateLimits } from './auth'

// The rate-limit store must be per limiter instance: a strict bucket and a
// backstop bucket sharing one counter silently halves the strict budget.
describe('createRateLimit', () => {
  const req = (ip: string) => ({ ip }) as never
  const reply = () => {
    const headers: Record<string, string> = {}
    return {
      header: (k: string, v: string) => { headers[k] = v },
      code: (c: number) => ({ send: (b: unknown) => ({ status: c, body: b, headers }) }),
    } as never
  }

  it('keeps independent buckets per limiter instance', async () => {
    const strict = createRateLimit(2, 60_000, 'test-strict')
    const loose = createRateLimit(100, 60_000, 'test-loose')
    await strict(req('9.9.9.9'), reply())
    await strict(req('9.9.9.9'), reply())
    // Strict budget exhausted at exactly 2 — the loose bucket is untouched.
    const blocked = (await strict(req('9.9.9.9'), reply())) as { status: number } | undefined
    expect(blocked?.status).toBe(429)
    expect(await loose(req('9.9.9.9'), reply())).toBeUndefined()
  })

  it('keys actors separately behind one egress IP', async () => {
    const limit = createRateLimit(1, 60_000, 'test-actor')
    const authReq = (ip: string, did: string) =>
      ({ ip, node: { did }, user: { sub: did } }) as never
    await limit(authReq('8.8.8.8', 'did:scn:AAA'), reply())
    // Same IP, different DID — cybercafe neighbors must not share a budget.
    expect(await limit(authReq('8.8.8.8', 'did:scn:BBB'), reply())).toBeUndefined()
    const blocked = (await limit(authReq('8.8.8.8', 'did:scn:AAA'), reply())) as { status: number } | undefined
    expect(blocked?.status).toBe(429)
  })

  it('sweeps expired windows', async () => {
    const limit = createRateLimit(1, 20, 'test-sweep')
    await limit(req('7.7.7.7'), reply())
    await new Promise((r) => setTimeout(r, 30))
    expect(sweepRateLimits()).toBeGreaterThanOrEqual(1)
    expect(await limit(req('7.7.7.7'), reply())).toBeUndefined()
  })
})
