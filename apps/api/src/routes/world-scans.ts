import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ScanPipelineService } from '../services/scan-pipeline.service'

const scanPipeline = new ScanPipelineService()

export default async function worldScansRoutes(app: FastifyInstance) {
  // POST /api/v1/world-scans — Upload images and start 3D reconstruction
  app.post('/process', async (req, reply) => {
    // 1. Receive multipart upload (multiple angle photos)
    // 2. Upload images to R2
    // 3. Enqueue reconstruction job (Luma AI)
    // 4. Return scan record with status: 'processing'
    return reply.code(501).send({ message: 'TODO: implement scan processing' })
  })

  // GET /api/v1/world-scans/:scanId — Get scan status + asset URLs
  app.get('/:scanId', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: get scan by ID' })
  })

  // GET /api/v1/world-scans — List user's scans
  app.get('/', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: list user scans' })
  })

  // POST /api/v1/world-scans/:scanId/place — Place scan in a context
  app.post('/:scanId/place', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: place scan in context' })
  })

  // GET /api/v1/world-scans/public — List public world assets by region
  app.get('/public', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: list public world assets' })
  })

  // POST /api/v1/world-scans/:scanId/submit-approval — Submit for public world
  app.post('/:scanId/submit-approval', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: submit for public approval' })
  })
}
