import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import { supabase } from '../utils/supabase'

/**
 * Auth middleware — validates Supabase JWT and attaches user to request.
 * Usage: app.addHook('preHandler', requireAuth) on protected routes.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    const payload = req.user as { sub: string; email?: string; role?: string }

    // Optionally verify user exists in DB (catches deleted/suspended accounts)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, is_active, is_suspended')
      .eq('id', payload.sub)
      .maybeSingle()

    if (!user) {
      return reply.code(401).send({ error: 'User not found' })
    }

    if (user.is_suspended) {
      return reply.code(403).send({ error: 'Account suspended' })
    }
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized — invalid or expired token' })
  }
}

/**
 * Extract userId from JWT without throwing — returns null if unauthenticated.
 * Use for routes that behave differently for auth vs anonymous users.
 */
export async function optionalAuth(req: FastifyRequest): Promise<string | null> {
  try {
    await req.jwtVerify()
    return (req.user as { sub: string }).sub
  } catch {
    return null
  }
}

/**
 * Rate limiter hook — in-memory, per bucket (NOT shared across limiters).
 * Keyed by IP for anonymous routes; callers may pass a finer key (e.g. DID).
 * Requires periodic sweep() on long-lived instances — see startRateLimitSweep.
 * In production: use Redis-based rate limiter.
 */
const rateLimitStores = new Map<string, Map<string, { count: number; resetAt: number }>>()

export function createRateLimit(maxRequests: number, windowMs: number, bucket?: string) {
  const name = bucket ?? `${maxRequests}/${windowMs}/${rateLimitStores.size}`
  let store = rateLimitStores.get(name)
  if (!store) {
    store = new Map()
    rateLimitStores.set(name, store)
  }
  const bucketStore = store
  return Object.assign(
    async (req: FastifyRequest, reply: FastifyReply) => {
      // Prefer DID over IP where the caller is already authenticated —
      // cybercafes/NAT put many real users behind one egress IP.
      const actor = (req.node?.did as string | undefined) ?? (req.user as { sub?: string } | undefined)?.sub
      const key = actor ? `${req.ip}|${actor}` : req.ip
      const now = Date.now()
      const entry = bucketStore.get(key)

      if (!entry || now > entry.resetAt) {
        bucketStore.set(key, { count: 1, resetAt: now + windowMs })
        return
      }

      if (entry.count >= maxRequests) {
        reply.header('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
        return reply.code(429).send({ error: 'Too many requests — please slow down' })
      }

      entry.count++
    },
    { bucket: name },
  )
}

/** Drop expired entries across all limiter buckets. Run every few minutes. */
export function sweepRateLimits(now = Date.now()): number {
  let dropped = 0
  for (const store of rateLimitStores.values()) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key)
        dropped++
      }
    }
  }
  return dropped
}

let sweepTimer: ReturnType<typeof setInterval> | null = null

export function startRateLimitSweep(intervalMs = 5 * 60_000) {
  if (sweepTimer) return
  sweepTimer = setInterval(() => sweepRateLimits(), intervalMs)
  sweepTimer.unref?.()
}

// Pre-built rate limits
export const strictRateLimit = createRateLimit(5, 60_000)    // 5/min for sensitive endpoints
export const standardRateLimit = createRateLimit(60, 60_000) // 60/min for normal endpoints
export const reportRateLimit = createRateLimit(10, 300_000)  // 10 per 5min for incident reports
