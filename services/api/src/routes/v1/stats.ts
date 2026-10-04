import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { authenticate } from '../../auth/rbac';

export async function statsRoutes(server: FastifyInstance) {
  server.get(
    '/stats',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Returns operational control room overview statistics',
        tags: ['Stats'],
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const clustersRes = await db.query(`SELECT * FROM clusters;`);
      const packetsRes = await db.query(`SELECT * FROM packets;`);
      const devicesRes = await db.query(`SELECT * FROM devices;`);

      const totalClusters = clustersRes.rows.length;
      const activeClusters = clustersRes.rows.filter(
        (c) => c.state !== 'closed' && c.state !== 'false_alarm'
      ).length;
      const totalSurvivors = clustersRes.rows.reduce(
        (sum, c) => sum + (c.declared_people || 1),
        0
      );

      return reply.send({
        totalClusters,
        activeClusters,
        totalSurvivors,
        totalPacketsIngested: packetsRes.rows.length,
        registeredDevices: devicesRes.rows.length,
        timestamp: new Date().toISOString(),
      });
    }
  );
}
