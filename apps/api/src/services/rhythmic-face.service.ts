import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../lib/supabase'

// Face gate — server-issued, single-use assertions.
// Enroll stores ONLY the template hash with explicit consent (never images).
// Verify compares hash equality and mints a 2-minute assertion the tap/escrow
// endpoints consume. Honest limitation: equality match on the client-side
// embedding stub; fuzzy biometric matching arrives with the real model (VS4+).
// Assertions are in-memory (single-instance dev; move to Redis pre-production).

interface Assertion {
  did: string
  expiresAt: number
  spent: boolean
}

const assertions = new Map<string, Assertion>()
export const ASSERTION_TTL_MS = 2 * 60_000

// Swept alongside the rate-limit stores so spent assertions never accumulate.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of assertions) if (v.spent || now > v.expiresAt) assertions.delete(k)
}, 5 * 60_000).unref?.()

export function isTemplateHash(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s)
}

export class RhythmicFaceService {
  async enroll(did: string, templateHash: string, consent: boolean): Promise<void> {
    if (!consent) throw new Error('Explicit consent is required to store a face template hash')
    if (!isTemplateHash(templateHash)) throw new Error('templateHash must be 32-byte hex')
    const { error } = await supabaseAdmin.from('face_enrollments').upsert(
      { did, template_hash: templateHash.toLowerCase(), updated_at: new Date().toISOString() },
      { onConflict: 'did' },
    )
    if (error) throw new Error(`Enroll failed: ${error.message}`)
  }

  async verify(did: string, templateHash: string): Promise<{ assertionId: string; expiresAt: string }> {
    if (!isTemplateHash(templateHash)) throw new Error('templateHash must be 32-byte hex')
    const { data, error } = await supabaseAdmin
      .from('face_enrollments').select('template_hash').eq('did', did).maybeSingle()
    if (error || !data) throw new Error('No enrolled template for this DID — enroll first')
    // Constant-shape comparison (both 64-hex); fuzzy matching is a VS4+ upgrade.
    if ((data.template_hash as string).toLowerCase() !== templateHash.toLowerCase()) {
      throw new Error('Face mismatch')
    }
    const assertionId = `fa_${randomUUID()}`
    assertions.set(assertionId, { did, expiresAt: Date.now() + ASSERTION_TTL_MS, spent: false })
    return { assertionId, expiresAt: new Date(Date.now() + ASSERTION_TTL_MS).toISOString() }
  }

  /** Validate without spending — call this BEFORE the guarded action. */
  peek(assertionId: string, did: string): void {
    const a = assertions.get(assertionId)
    if (!a || a.did !== did) throw new Error('Unknown face assertion')
    if (a.spent) throw new Error('Face assertion already spent')
    if (Date.now() > a.expiresAt) {
      assertions.delete(assertionId)
      throw new Error('Face assertion expired — verify again')
    }
  }

  /** Consume a single-use assertion. Throws on reuse, expiry, or DID mismatch. */
  consume(assertionId: string, did: string): void {
    this.peek(assertionId, did)
    assertions.get(assertionId)!.spent = true
  }
}
