import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { securityHeaders } from './security-headers'

describe('security-headers', () => {
  it('sets hardening headers on every response', async () => {
    const app = Fastify()
    app.addHook('onSend', securityHeaders)
    app.get('/ping', async () => ({ ok: true }))
    const res = await app.inject({ method: 'GET', url: '/ping' })
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    expect(res.headers['permissions-policy']).toContain('camera=()')
    await app.close()
  })
})
