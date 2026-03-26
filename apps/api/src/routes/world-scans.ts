import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { scanPipelineService } from '../services/scan-pipeline.service'
import { requireAuth, optionalAuth } from '../middleware/auth'

const processCaptureSchema = z.object({
  captureImages: z.array(z.string()).min(3).max(30),
  captureLocation: z.object({ lat: z.number(), lng: z.number() }),
  type: z.enum(['environment', 'object', 'art', 'sculpture']),
  name: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
})

const placeScanSchema = z.object({
  context: z.object({
    type: z.enum(['avatar_space', 'virtual_building', 'journal_bg', 'marketplace', 'public_world']),
    contextId: z.string(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    rotation: z.object({ rx: z.number(), ry: z.number(), rz: z.number() }),
    scale: z.object({ sx: z.number(), sy: z.number(), sz: z.number() }),
  }),
})

const updateScanSchema = z.object({
  name: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['private', 'marketplace', 'public_world']).optional(),
  price: z.number().min(0).optional(),
  styleTags: z.array(z.string()).optional(),
})

const listPublicSchema = z.object({
  minLat: z.coerce.number(),
  maxLat: z.coerce.number(),
  minLng: z.coerce.number(),
  maxLng: z.coerce.number(),
})

export default async function worldScansRoutes(fastify: FastifyInstance) {
  /**
   * POST /world-scans
   * Submit a multi-angle capture for 3D reconstruction.
   * Returns immediately with a scan record (status: processing).
   * The .glb mesh becomes available when the background job completes.
   */
  fastify.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const body = processCaptureSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      const scan = await scanPipelineService.processCapture({
        userId: user.id,
        ...body.data,
      })
      return reply.status(201).send(scan)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  /**
   * GET /world-scans/mine
   * Get the authenticated user's full scan library.
   */
  fastify.get('/mine', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    try {
      const scans = await scanPipelineService.getUserScans(user.id)
      return reply.send(scans)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  /**
   * GET /world-scans/public?minLat=&maxLat=&minLng=&maxLng=
   * List public world assets in a geographic bounding box.
   * No auth required — powers the NEXUS public map view.
   */
  fastify.get('/public', { preHandler: optionalAuth }, async (req, reply) => {
    const query = listPublicSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ error: query.error.issues })

    try {
      const assets = await scanPipelineService.listPublicWorldAssets(query.data)
      return reply.send(assets)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  /**
   * GET /world-scans/:scanId
   * Get a single scan. Private scans are only accessible by their owner.
   */
  fastify.get('/:scanId', { preHandler: optionalAuth }, async (req, reply) => {
    const { scanId } = req.params as { scanId: string }
    const user = (req as any).user

    try {
      const scan = await scanPipelineService.getScan(scanId, user?.id)
      return reply.send(scan)
    } catch (err: any) {
      const status = err.message === 'Access denied' ? 403 : 404
      return reply.status(status).send({ error: err.message })
    }
  })

  /**
   * PATCH /world-scans/:scanId
   * Update scan metadata, visibility, or marketplace price.
   */
  fastify.patch('/:scanId', { preHandler: requireAuth }, async (req, reply) => {
    const { scanId } = req.params as { scanId: string }
    const user = (req as any).user
    const body = updateScanSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      const scan = await scanPipelineService.updateScan(scanId, user.id, body.data)
      return reply.send(scan)
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * POST /world-scans/:scanId/place
   * Place a scan asset into an avatar space, virtual building, or public world.
   */
  fastify.post('/:scanId/place', { preHandler: requireAuth }, async (req, reply) => {
    const { scanId } = req.params as { scanId: string }
    const user = (req as any).user
    const body = placeScanSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      const placement = await scanPipelineService.placeScan(scanId, user.id, body.data.context)
      return reply.status(201).send(placement)
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * POST /world-scans/:scanId/submit-approval
   * Submit a processed scan for public world moderation.
   * Once approved by a moderator, it appears on the global NEXUS map.
   */
  fastify.post('/:scanId/submit-approval', { preHandler: requireAuth }, async (req, reply) => {
    const { scanId } = req.params as { scanId: string }
    const user = (req as any).user

    try {
      await scanPipelineService.submitForPublicApproval(scanId, user.id)
      return reply.send({ message: 'Submitted for review. Approval typically takes 24–48 hours.' })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
