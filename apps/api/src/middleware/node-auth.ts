import { FastifyRequest, FastifyReply } from 'fastify'
import { supabaseAdmin } from '../lib/supabase'

// Node auth — accepts EITHER credential the Rhythmic web app may hold:
//   1. DID capability token (sub = "did:scn:...", minted by /rhythmic/verify, 5 min)
//   2. Supabase user JWT (sub = users.id) → resolved to DID via node_identities
// Attaches req.node = { did } or rejects. Tables missing (migration 014 not yet
// applied) degrades to did-only mode rather than crashing.

export interface NodeAuthContext {
  did: string | null
  userId: number | null
}

declare module 'fastify' {
  interface FastifyRequest {
    node?: NodeAuthContext
  }
}

export async function requireNodeAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Unauthorized — invalid or expired token' })
  }
  const sub = (req.user as { sub: string }).sub
  if (sub.startsWith('did:scn:')) {
    req.node = { did: sub, userId: await didToUserId(sub) }
    return
  }
  const userId = Number(sub)
  if (!Number.isFinite(userId)) {
    return reply.code(401).send({ error: 'Unrecognized credential subject' })
  }
  req.node = { did: await userToDid(userId), userId }
}

async function didToUserId(did: string): Promise<number | null> {
  try {
    const { data } = await supabaseAdmin
      .from('node_identities').select('user_id').eq('did', did).maybeSingle()
    return (data?.user_id as number | undefined) ?? null
  } catch {
    return null
  }
}

async function userToDid(userId: number): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('node_identities').select('did').eq('user_id', userId).maybeSingle()
    return (data?.did as string | undefined) ?? null
  } catch {
    return null
  }
}
