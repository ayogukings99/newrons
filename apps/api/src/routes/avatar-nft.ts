/**
 * Avatar NFT Routes — Phase 5
 * Mount at: /avatar-nft
 *
 * Minting:
 *   POST   /mint                      — mint your Living Avatar as a Solana NFT
 *   GET    /mine                      — get my avatar NFT
 *   PATCH  /traits                    — update avatar traits (milestone trigger)
 *
 * Marketplace:
 *   GET    /marketplace               — list all active marketplace listings
 *   POST   /marketplace/list          — list my avatar for sale
 *   DELETE /marketplace/list          — cancel my listing
 *   POST   /marketplace/buy           — purchase a listed avatar NFT
 *
 * Cross-App Verification (public):
 *   GET    /verify/:walletAddress     — verify if wallet owns a NEXUS Avatar NFT
 */

import { FastifyInstance } from 'fastify'
import { avatarNFTService, AvatarTrait } from '../services/avatar-nft.service'
import { requireAuth } from '../middleware/auth'

export async function avatarNFTRoutes(app: FastifyInstance) {

  // ── Minting ────────────────────────────────────────────────────────────────

  /**
   * POST /mint
   * Body: { avatarName, imageUrl, traits, description? }
   */
  app.post('/mint', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { avatarName, imageUrl, traits, description } = req.body as {
      avatarName:   string
      imageUrl:     string
      traits:       AvatarTrait[]
      description?: string
    }

    if (!avatarName?.trim())     return reply.code(400).send({ error: 'avatarName required' })
    if (!imageUrl?.trim())       return reply.code(400).send({ error: 'imageUrl required' })
    if (!Array.isArray(traits))  return reply.code(400).send({ error: 'traits array required' })

    try {
      const nft = await avatarNFTService.mintAvatarNFT({ userId, avatarName, imageUrl, traits, description })
      return reply.code(201).send(nft)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /mine
   */
  app.get('/mine', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    try {
      const nft = await avatarNFTService.getUserAvatarNFT(userId)
      if (!nft) return reply.code(404).send({ error: 'No avatar NFT minted yet' })
      return reply.send(nft)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * PATCH /traits
   * Body: { traits: AvatarTrait[] }
   * Add or update traits on your minted avatar.
   */
  app.patch('/traits', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { traits } = req.body as { traits: AvatarTrait[] }

    if (!Array.isArray(traits) || traits.length === 0) {
      return reply.code(400).send({ error: 'traits array required' })
    }

    try {
      await avatarNFTService.updateAvatarTraits(userId, traits)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Marketplace ────────────────────────────────────────────────────────────

  /**
   * GET /marketplace?limit=50&offset=0
   */
  app.get('/marketplace', async (req, reply) => {
    const { limit = '50', offset = '0' } = req.query as Record<string, string>
    try {
      const listings = await avatarNFTService.getMarketplaceListings(parseInt(limit), parseInt(offset))
      return reply.send({ listings })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * POST /marketplace/list
   * Body: { priceNxt }
   */
  app.post('/marketplace/list', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { priceNxt } = req.body as { priceNxt: number }

    if (!priceNxt || priceNxt <= 0) return reply.code(400).send({ error: 'priceNxt must be a positive number' })

    try {
      const listing = await avatarNFTService.listForSale({ userId, priceNxt })
      return reply.code(201).send(listing)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * DELETE /marketplace/list
   * Cancel my active listing.
   */
  app.delete('/marketplace/list', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    try {
      await avatarNFTService.cancelListing(userId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /marketplace/buy
   * Body: { mintAddress }
   */
  app.post('/marketplace/buy', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { mintAddress } = req.body as { mintAddress: string }

    if (!mintAddress?.trim()) return reply.code(400).send({ error: 'mintAddress required' })

    try {
      const result = await avatarNFTService.purchaseAvatar({ buyerId: userId, mintAddress })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Cross-App Verification (public) ───────────────────────────────────────

  /**
   * GET /verify/:walletAddress
   * Public. Called by third-party apps to confirm NEXUS Avatar NFT ownership.
   */
  app.get('/verify/:walletAddress', async (req, reply) => {
    const { walletAddress } = req.params as { walletAddress: string }
    try {
      const result = await avatarNFTService.verifyOwnership(walletAddress)
      return reply.send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
