import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { SecurityService } from '../services/security.service'

const service = new SecurityService()

const IncidentReportSchema = z.object({
  category: z.enum(['theft', 'harassment', 'accident', 'road_hazard', 'flooding', 'protest']),
  severity: z.enum(['low', 'moderate', 'high']),
  geoPoint: z.object({ lat: z.number(), lng: z.number() }),
  timeOfIncident: z.string().datetime().optional(),
  radiusMeters: z.number().int().min(10).max(500).optional(),
})

const RouteReportSchema = z.object({
  origin: z.object({ lat: z.number(), lng: z.number() }),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  departureTime: z.string().datetime().optional(),
})

const SafetyCompanionSchema = z.object({
  trustedContactId: z.string(),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  estimatedArrival: z.string().datetime(),
})

async function getUserId(req: FastifyRequest): Promise<string> {
  await req.jwtVerify()
  return (req.user as { sub: string }).sub
}

export default async function securityRoutes(app: FastifyInstance) {

  /**
   * POST /api/v1/security/report
   * Submit an anonymous community incident report.
   * PRIVACY: No auth required by design — to ensure complete anonymity.
   * Rate-limited at gateway level to prevent abuse.
   */
  app.post('/report', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = IncidentReportSchema.parse(req.body)

    await service.submitIncidentReport({
      ...body,
      geoPoint: body.geoPoint,
      timeOfIncident: body.timeOfIncident ? new Date(body.timeOfIncident) : undefined,
    })

    // Return 204 — no data to return, and we don't confirm report ID
    // (confirming an ID could theoretically be used to track the reporter)
    return reply.code(204).send()
  })

  /**
   * POST /api/v1/security/route-report
   * Get a security intelligence report for a route.
   * PRIVACY: No auth required — query is ephemeral, never linked to identity.
   */
  app.post('/route-report', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = RouteReportSchema.parse(req.body)

    const report = await service.getRouteReport({
      origin: body.origin,
      destination: body.destination,
      departureTime: body.departureTime ? new Date(body.departureTime) : new Date(),
    })

    return reply.send({ data: report })
  })

  /**
   * POST /api/v1/security/safety-companion
   * Activate safety companion — share your journey with one trusted contact.
   * Requires auth so the share can notify the recipient.
   */
  app.post('/safety-companion', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = SafetyCompanionSchema.parse(req.body)

    const share = await service.activateSafetyCompanion({
      userId,
      trustedContactId: body.trustedContactId,
      destination: body.destination,
      estimatedArrival: new Date(body.estimatedArrival),
    })

    return reply.code(201).send({ data: share })
  })

  /**
   * DELETE /api/v1/security/safety-companion/:shareId
   * End a safety companion share (arrived safely or user cancelled).
   */
  app.delete<{ Params: { shareId: string } }>(
    '/safety-companion/:shareId',
    async (req, reply) => {
      const userId = await getUserId(req)
      await service.endSafetyCompanion(req.params.shareId, userId)
      return reply.code(204).send()
    }
  )
}
