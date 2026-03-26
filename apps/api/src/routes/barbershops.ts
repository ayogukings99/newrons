import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { BarbershopService } from '../services/barbershop.service'

const service = new BarbershopService()

const UpsertProfileSchema = z.object({
  shopName: z.string().min(1).max(100),
  specialties: z.array(z.enum(['fade', 'locs', 'braids', 'coloring', 'shaving', 'beard_design'])),
  baseCutPrice: z.number().positive().optional(),
  currency: z.string().length(3).default('NGN'),
  priceList: z.array(z.object({ service: z.string(), price: z.number() })).optional(),
  hubId: z.string().optional(),
})

const JoinLineupSchema = z.object({
  serviceRequested: z.string().min(1),
  styleReferenceId: z.string().optional(),
})

const UpdateStatusSchema = z.object({
  status: z.enum(['waiting', 'in_chair', 'completed', 'cancelled', 'no_show']),
})

const LogCutSchema = z.object({
  clientId: z.string(),
  lineupId: z.string(),
  styleName: z.string().min(1),
  description: z.string().optional(),
  photoUrls: z.array(z.string().url()).optional(),
  clientConsented: z.boolean(),
})

async function getUserId(req: FastifyRequest): Promise<string> {
  await req.jwtVerify()
  return (req.user as { sub: string }).sub
}

export default async function barbershopsRoutes(app: FastifyInstance) {

  // POST /api/v1/barbershops — Create/update barbershop profile
  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = UpsertProfileSchema.parse(req.body)
    const profile = await service.upsertProfile({ barberId: userId, ...body })
    return reply.code(201).send({ data: profile })
  })

  // GET /api/v1/barbershops/nearby?lat=&lng=&radius=&specialty=
  app.get('/nearby', async (req: FastifyRequest, reply: FastifyReply) => {
    const { lat, lng, radius, specialty, maxWait } = req.query as {
      lat: string; lng: string; radius?: string; specialty?: string; maxWait?: string
    }
    if (!lat || !lng) return reply.code(400).send({ error: 'lat and lng are required' })

    const shops = await service.findNearby({
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radiusKm: radius ? parseFloat(radius) : 5,
      specialty,
      maxWaitMins: maxWait ? parseInt(maxWait) : undefined,
    })
    return reply.send({ data: shops })
  })

  // GET /api/v1/barbershops/mine — Get barber's own shop
  app.get('/mine', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const profile = await service.getProfileByBarber(userId)
    if (!profile) return reply.code(404).send({ error: 'No barbershop profile found' })
    return reply.send({ data: profile })
  })

  // GET /api/v1/barbershops/:shopId — Get barbershop profile
  app.get<{ Params: { shopId: string } }>('/:shopId', async (req, reply) => {
    const profile = await service.getProfile(req.params.shopId)
    return reply.send({ data: profile })
  })

  // PUT /api/v1/barbershops/:shopId — Update barbershop profile
  app.put<{ Params: { shopId: string } }>('/:shopId', async (req, reply) => {
    const userId = await getUserId(req)
    const body = UpsertProfileSchema.partial().parse(req.body)
    const profile = await service.upsertProfile({ barberId: userId, ...body as any })
    return reply.send({ data: profile })
  })

  // ── Lineup ──────────────────────────────────────────────────

  // GET /api/v1/barbershops/:shopId/lineup — Get live lineup
  app.get<{ Params: { shopId: string } }>('/:shopId/lineup', async (req, reply) => {
    const lineup = await service.getLineup(req.params.shopId)
    return reply.send({ data: lineup })
  })

  // POST /api/v1/barbershops/:shopId/lineup/join — Join the queue
  app.post<{ Params: { shopId: string } }>('/:shopId/lineup/join', async (req, reply) => {
    const userId = await getUserId(req)
    const body = JoinLineupSchema.parse(req.body)
    const entry = await service.joinLineup({
      shopId: req.params.shopId,
      clientId: userId,
      ...body,
    })
    return reply.code(201).send({ data: entry })
  })

  // PUT /api/v1/barbershops/:shopId/lineup/:lineupId — Update queue entry status
  app.put<{ Params: { shopId: string; lineupId: string } }>(
    '/:shopId/lineup/:lineupId',
    async (req, reply) => {
      await getUserId(req) // barber must be authenticated
      const body = UpdateStatusSchema.parse(req.body)
      const entry = await service.updateLineupStatus(
        req.params.lineupId,
        req.params.shopId,
        body.status
      )
      return reply.send({ data: entry })
    }
  )

  // ── Portfolio ────────────────────────────────────────────────

  // GET /api/v1/barbershops/:shopId/portfolio — Barber's cut gallery
  app.get<{ Params: { shopId: string } }>('/:shopId/portfolio', async (req, reply) => {
    const { limit } = req.query as { limit?: string }
    const cuts = await service.getPortfolio(req.params.shopId, limit ? parseInt(limit) : 30)
    return reply.send({ data: cuts })
  })

  // POST /api/v1/barbershops/:shopId/cuts — Log a completed cut
  app.post<{ Params: { shopId: string } }>('/:shopId/cuts', async (req, reply) => {
    const userId = await getUserId(req)
    const body = LogCutSchema.parse(req.body)
    const cut = await service.logCompletedCut({ barberId: userId, ...body })
    return reply.code(201).send({ data: cut })
  })
}
