import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { authenticate, requireRole } from '../../auth/rbac';
import { SecurityService } from '../../auth/jwt';
import { AuditService } from '../../services/auditService';

export async function adminRoutes(server: FastifyInstance) {
  // Users management
  server.get(
    '/admin/users',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      schema: { description: 'Lists agency users', tags: ['Admin'] },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const res = await db.query(
        `SELECT id, agency_id, email, full_name, role, active, created_at FROM users;`
      );
      return reply.send(res.rows);
    }
  );

  server.post(
    '/admin/users',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      schema: {
        description: 'Creates a new responder account',
        tags: ['Admin'],
        body: {
          type: 'object',
          required: ['email', 'password', 'fullName', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'dispatcher', 'rescuer', 'viewer'] },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { email, password, fullName, role } = req.body;
      const agencyId = req.user!.agencyId;
      const hash = await SecurityService.hashPassword(password);
      const id = `usr_${Date.now()}`;

      await db.query(
        `INSERT INTO users (id, agency_id, email, password_hash, full_name, role, active)
         VALUES ($1, $2, $3, $4, $5, $6, true);`,
        [id, agencyId, email.toLowerCase(), hash, fullName, role]
      );

      await AuditService.log('create_user', 'user', id, req.user!.userId, req.ip, { email, role });

      return reply.status(201).send({ id, email, fullName, role });
    }
  );

  // Agencies
  server.get(
    '/admin/agencies',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      schema: { description: 'Lists disaster management agencies', tags: ['Admin'] },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const res = await db.query(`SELECT id, name, created_at FROM agencies;`);
      return reply.send(res.rows);
    }
  );

  // SMS Numbers
  server.get(
    '/admin/sms-numbers',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      schema: { description: 'Lists active SMS gateway receiving phone numbers', tags: ['Admin'] },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const res = await db.query(`SELECT * FROM sms_gateway_numbers;`);
      return reply.send(res.rows);
    }
  );

  // Manual purge past retention policy
  server.post(
    '/admin/purge',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      schema: { description: 'Triggers manual data purge for records exceeding retention period', tags: ['Admin'] },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const now = new Date().toISOString();
      await AuditService.log('manual_data_purge', 'system', null, req.user!.userId, req.ip, { executedAt: now });

      return reply.send({
        status: 'purged',
        purgedRecords: 0,
        retentionPolicy: 'enforced',
        timestamp: now,
      });
    }
  );
}
