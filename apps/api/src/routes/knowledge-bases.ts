import { FastifyInstance } from 'fastify'

export default async function knowledgeBasesRoutes(app: FastifyInstance) {
  // POST /api/v1/knowledge-bases — Create a knowledge base
  app.post('/', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: create knowledge base' })
  })

  // GET /api/v1/knowledge-bases — List user's knowledge bases
  app.get('/', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: list knowledge bases' })
  })

  // GET /api/v1/knowledge-bases/:kbId — Get knowledge base
  app.get('/:kbId', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: get knowledge base' })
  })

  // POST /api/v1/knowledge-bases/:kbId/documents — Add document to KB
  app.post('/:kbId/documents', async (req, reply) => {
    // Pipeline: extract text → chunk → vectorize → store in Supabase Vector
    // Supports: PDF, text, voice note, video transcript, web link, image
    return reply.code(501).send({ message: 'TODO: add document to KB' })
  })

  // DELETE /api/v1/knowledge-bases/:kbId/documents/:docId — Remove document
  app.delete('/:kbId/documents/:docId', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: remove document from KB' })
  })

  // POST /api/v1/knowledge-bases/:kbId/query — Query personal AI
  app.post('/:kbId/query', async (req, reply) => {
    // RAG: embed question → similarity search → Claude generates answer from context
    return reply.code(501).send({ message: 'TODO: query personal AI' })
  })

  // PUT /api/v1/knowledge-bases/:kbId/access — Update KB access level
  app.put('/:kbId/access', async (req, reply) => {
    // private | trusted | public
    return reply.code(501).send({ message: 'TODO: update KB access level' })
  })
}
