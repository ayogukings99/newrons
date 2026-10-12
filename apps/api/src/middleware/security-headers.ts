import { FastifyReply, FastifyRequest } from 'fastify'

// Minimal security headers for the JSON API (no helmet dep needed).
// Pure hook — unit-tested with fastify.inject, no env required.
export async function securityHeaders(req: FastifyRequest, reply: FastifyReply) {
  // HSTS only where TLS terminates (prod); Chrome honors it on localhost
  // and would wedge local http:// dev loops with no easy reset.
  // NB: Fastify's hostname may carry the port (e.g. 'localhost:80' under inject).
  const host = (req.hostname ?? '').toLowerCase().replace(/:\d+$/, '');
  if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('192.168.') && !host.endsWith('.local')) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  // API serves data, never UI: lock down everything a response could load.
  reply.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
}
