import { FastifyReply, FastifyRequest } from 'fastify'

// Minimal security headers for the JSON API (no helmet dep needed).
// Pure hook — unit-tested with fastify.inject, no env required.
export async function securityHeaders(_req: FastifyRequest, reply: FastifyReply) {
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  // API serves data, never UI: lock down everything a response could load.
  reply.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
}
