import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { ClusterService } from '../../services/clusterService';
import { authenticate, requireRole } from '../../auth/rbac';

export async function incidentsRoutes(server: FastifyInstance) {
  // List incidents
  server.get(
    '/incidents',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Lists active and historical disaster incidents',
        tags: ['Incidents'],
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const res = await db.query(`SELECT * FROM incidents ORDER BY opened_at DESC;`);
      return reply.send(res.rows);
    }
  );

  // Create incident
  server.post(
    '/incidents',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher'])],
      schema: {
        description: 'Creates a new crisis operation zone or drill',
        tags: ['Incidents'],
        body: {
          type: 'object',
          required: ['name', 'hazard'],
          properties: {
            name: { type: 'string' },
            hazard: { type: 'string' },
            region: { type: 'object' },
            isDrill: { type: 'boolean' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { name, hazard, region, isDrill } = req.body;
      const agencyId = req.user?.agencyId || '11111111-1111-1111-1111-111111111111';
      const id = `inc_${Date.now()}`;

      const res = await db.query(
        `INSERT INTO incidents (id, agency_id, name, hazard, region, is_drill, opened_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         RETURNING *;`,
        [id, agencyId, name, hazard, region ? JSON.stringify(region) : null, Boolean(isDrill)]
      );

      return reply.status(201).send(res.rows[0]);
    }
  );

  // Update incident
  server.patch(
    '/incidents/:id',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher'])],
      schema: {
        description: 'Updates disaster incident state or bounds',
        tags: ['Incidents'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['open', 'closed'] },
            region: { type: 'object' },
            isDrill: { type: 'boolean' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const { status } = req.body;

      const res = await db.query(
        `UPDATE incidents SET status = $1, closed_at = CASE WHEN $1 = 'closed' THEN now() ELSE null END WHERE id = $2 RETURNING *;`,
        [status, id]
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Incident not found' });
      }

      return reply.send(res.rows[0]);
    }
  );

  // Get clusters for incident with filters
  server.get(
    '/incidents/:id/clusters',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Retrieves clusters for an incident with status/priority filtering, sorted by priority',
        tags: ['Incidents'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            state: { type: 'string' },
            minPriority: { type: 'number' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const { state, minPriority, search } = req.query;

      const clusters = await ClusterService.getClusters({
        incidentId: id,
        state,
        minPriority,
        search,
      });

      return reply.send(clusters);
    }
  );
}
