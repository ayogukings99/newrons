import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { securityHeaders } from './security-headers'

describe('security-headers', () => {
  it('sets hardening headers on every response', async () => {
    const app = Fastify()
    app.addHook('onSend', securityHeaders)
    app.get('/ping', async () => ({ ok: true }))
    const res = await app.inject({ method: 'GET', url: '/ping' })
    // inject() reports hostname localhost → HSTS correctly withheld in dev.
    expect(res.headers['strict-transport-security']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    expect(res.headers['permissions-policy']).toContain('camera=()')
    await app.close()
  })
})
