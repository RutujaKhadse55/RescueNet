import { FastifyInstance, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { authenticate, requireRole } from '../../auth/rbac';

export async function auditRoutes(server: FastifyInstance) {
  server.get(
    '/audit',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher'])],
      schema: {
        description:
          'Retrieves immutable system audit records for data access and state modifications',
        tags: ['Audit'],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
          },
        },
      },
    },
    async (req: any, reply: FastifyReply) => {
      const limit = req.query.limit || 100;
      const res = await db.query(`SELECT * FROM audit_log ORDER BY at DESC LIMIT $1;`, [limit]);
      return reply.send(res.rows);
    },
  );
}
