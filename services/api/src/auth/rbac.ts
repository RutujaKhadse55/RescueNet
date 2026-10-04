import { FastifyRequest, FastifyReply } from 'fastify';
import { SecurityService, TokenPayload } from './jwt';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = SecurityService.verifyToken(token);
  if (!payload) {
    reply.status(401).send({ error: 'Invalid or expired authentication token' });
    return;
  }

  req.user = payload;
  done();
}

export function requireRole(allowedRoles: Array<'admin' | 'dispatcher' | 'rescuer' | 'viewer'>) {
  return (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    if (!req.user) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      reply.status(403).send({ error: 'Forbidden: Insufficient permissions for this role' });
      return;
    }

    done();
  };
}
