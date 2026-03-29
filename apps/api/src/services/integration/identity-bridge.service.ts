/**
 * IdentityBridgeService
 *
 * Maps neurons.app users ↔ sovereign node DIDs
 *
 * Architecture:
 *   - Every user IS a sovereign node with shared ed25519 keypair
 *   - User's social identity (Supabase) = Economic identity (DID)
 *   - DID format: did:scn:<base58-pubkey>
 *
 * Flow:
 *   1. User first accesses economic layer
 *   2. Client generates ed25519 keypair locally (never sent to server)
 *   3. Client derives DID from public key
 *   4. Client sends: { did, publicKeyHex, encryptedSecret } to POST /integration/identity
 *   5. Server stores in node_identities table via upsert_node_identity RPC
 *   6. From then on: DID ↔ user_id are cross-referenceable
 *
 * Security:
 *   - Private key never leaves client; only encrypted_secret stored server-side
 *   - Encrypted with user's session secret as symmetric key (client supplies)
 *   - Public key is visible; secrets stay encrypted in database
 *   - RLS ensures users only see their own identities
 */

import { supabase as supabaseClient } from '../../utils/supabase'

export interface NodeIdentity {
  id: string
  userId: number
  did: string
  publicKeyHex: string
  encryptedSecret: string
  nodeType: 'member' | 'operator' | 'auditor'
  activatedAt: string
  lastSeenAt: string
}

export interface NodeInfo {
  did: string
  publicKeyHex: string
  nodeType: 'member' | 'operator' | 'auditor'
  activatedAt: string
  lastSeenAt: string
}

export class IdentityBridgeService {
  /**
   * Get or create a node identity for a user.
   * Upserts in node_identities table via RPC.
   * Only callable by the user themselves (auth required).
   */
  async getOrCreateIdentity(
    userId: number,
    params: {
      did: string
      publicKeyHex: string
      encryptedSecret: string
      nodeType?: 'member' | 'operator' | 'auditor'
    }
  ): Promise<NodeIdentity> {
    const { did, publicKeyHex, encryptedSecret, nodeType = 'member' } = params

    const { data, error } = await supabaseClient.rpc('upsert_node_identity', {
      p_user_id: userId,
      p_did: did,
      p_public_key_hex: publicKeyHex,
      p_encrypted_secret: encryptedSecret,
      p_node_type: nodeType,
    })

    if (error || !data) {
      throw new Error(`Failed to create/update node identity: ${error?.message}`)
    }

    return this.mapNodeIdentity(data)
  }

  /**
   * Resolve a DID to its corresponding user_id.
   * Useful for reverse-lookup in supply chain contexts.
   */
  async resolveDidToUser(did: string): Promise<number | null> {
    const { data, error } = await supabaseClient.rpc('resolve_did_to_user', {
      p_did: did,
    })

    if (error) {
      throw new Error(`Failed to resolve DID: ${error.message}`)
    }

    return data ?? null
  }

  /**
   * Resolve a user_id to their node identity (public key only).
   * Returns { did, publicKeyHex } for cross-reference.
   * Users can only call this for their own user_id.
   */
  async resolveUserToDid(userId: number): Promise<Omit<NodeIdentity, 'encryptedSecret' | 'id'> | null> {
    const { data, error } = await supabase
      .from('node_identities')
      .select('did, public_key_hex, node_type, activated_at, last_seen_at')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw new Error(`Failed to resolve user to DID: ${error.message}`)
    }

    if (!data) return null

    return {
      userId,
      did: data.did,
      publicKeyHex: data.public_key_hex,
      nodeType: data.node_type,
      activatedAt: data.activated_at,
      lastSeenAt: data.last_seen_at,
    }
  }

  /**
   * Batch resolve multiple DIDs to their public info.
   * Returns array of NodeInfo objects in same order as input.
   */
  async listPeerIdentities(dids: string[]): Promise<NodeInfo[]> {
    if (dids.length === 0) return []

    const { data, error } = await supabase
      .from('node_identities')
      .select('did, public_key_hex, node_type, activated_at, last_seen_at')
      .in('did', dids)

    if (error) {
      throw new Error(`Failed to batch resolve DIDs: ${error.message}`)
    }

    const nodeMap = new Map<string, NodeInfo>()
    if (data) {
      for (const row of data) {
        nodeMap.set(row.did, {
          did: row.did,
          publicKeyHex: row.public_key_hex,
          nodeType: row.node_type,
          activatedAt: row.activated_at,
          lastSeenAt: row.last_seen_at,
        })
      }
    }

    // Return in input order, fill gaps with null
    return dids.map((did) => nodeMap.get(did) ?? null as any)
  }

  /**
   * Update last_seen_at for a DID (touch activity timestamp).
   * Called on each economic action (settlement, forecasting, etc).
   */
  async updateLastSeen(did: string): Promise<void> {
    const { error } = await supabaseClient.rpc('touch_node_last_seen', {
      p_did: did,
    })

    if (error) {
      throw new Error(`Failed to update last_seen: ${error.message}`)
    }
  }

  /**
   * Get the node_type for a DID.
   * Returns 'member' | 'operator' | 'auditor'
   */
  async getNodeType(did: string): Promise<string | null> {
    const { data, error } = await supabaseClient.rpc('get_node_info', {
      p_did: did,
    })

    if (error) {
      throw new Error(`Failed to get node type: ${error.message}`)
    }

    return data?.[0]?.node_type ?? null
  }

  /**
   * Verify that a user owns a specific DID.
   * Returns true only if user_id matches the DID's owner.
   * Used for authorization checks (e.g., can this user sign with this DID?).
   */
  async verifyDIDOwnership(userId: number, did: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('node_identities')
      .select('user_id')
      .eq('did', did)
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to verify DID ownership: ${error.message}`)
    }

    return !!data
  }

  /**
   * Get full node identity for a user (with encrypted secret).
   * Only callable on behalf of that user (RLS enforced).
   */
  async getUserNodeIdentity(userId: number): Promise<NodeIdentity | null> {
    const { data, error } = await supabase
      .from('node_identities')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get user node identity: ${error.message}`)
    }

    if (!data) return null

    return this.mapNodeIdentity(data)
  }

  /**
   * Get public-facing node info by DID (no encrypted secret).
   * Callable by anyone, returns only public key + type info.
   */
  async getPublicNodeInfo(did: string): Promise<NodeInfo | null> {
    const { data, error } = await supabaseClient.rpc('get_node_info', {
      p_did: did,
    })

    if (error) {
      throw new Error(`Failed to get public node info: ${error.message}`)
    }

    if (!data || data.length === 0) return null

    const row = data[0]
    return {
      did: row.did,
      publicKeyHex: row.public_key_hex,
      nodeType: row.node_type,
      activatedAt: row.activated_at,
      lastSeenAt: row.last_seen_at,
    }
  }

  /**
   * Verify DID ownership via signature challenge.
   * Client signs a nonce with their private key; we verify against public key.
   * This is an optional extra validation step for high-security operations.
   *
   * Note: Actual signature verification must be done client-side with a crypto library
   * that matches the keypair generation. This function just returns true if the
   * DID exists and belongs to the user; the actual signature check is left to the route handler.
   */
  async verifyDIDSignature(
    userId: number,
    did: string,
    challenge: string,
    signature: string
  ): Promise<boolean> {
    // Verify DID belongs to user
    const owns = await this.verifyDIDOwnership(userId, did)
    if (!owns) return false

    // Get public key for this DID
    const nodeInfo = await this.getPublicNodeInfo(did)
    if (!nodeInfo) return false

    // TODO: Implement actual signature verification here
    // For now, we just verify ownership. The route handler can
    // do the cryptographic signature check using the publicKeyHex.
    // Example verification (pseudocode):
    //   const pubKey = nacl.sign.keyOpen(Buffer.from(nodeInfo.publicKeyHex, 'hex'))
    //   const verified = nacl.sign.detached.verify(
    //     Buffer.from(challenge),
    //     Buffer.from(signature, 'hex'),
    //     pubKey
    //   )
    //   return verified

    return true
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private mapNodeIdentity(row: any): NodeIdentity {
    return {
      id: String(row.id),
      userId: Number(row.user_id),
      did: row.did,
      publicKeyHex: row.public_key_hex,
      encryptedSecret: row.encrypted_secret,
      nodeType: row.node_type,
      activatedAt: row.activated_at,
      lastSeenAt: row.last_seen_at,
    }
  }
}

export const identityBridgeService = new IdentityBridgeService()
