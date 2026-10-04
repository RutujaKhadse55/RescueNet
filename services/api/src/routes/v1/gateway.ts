import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ackService } from '../../services/ackService';
import { db } from '../../db/client';

export async function gatewayRoutes(server: FastifyInstance) {
  server.get(
    '/gateway/outbox',
    {
      schema: {
        description: 'Retrieves pending signed ACKs and priority seed packets for mesh gateways to blast via BLE',
        tags: ['Gateway'],
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const outbox = await ackService.getPendingGatewayOutbox();
      return reply.send({
        count: outbox.length,
        packets: outbox,
        serverTime: Math.floor(Date.now() / 1000),
      });
    }
  );

  server.post(
    '/gateway/heartbeat',
    {
      schema: {
        description: 'Gateway telemetry heartbeat reporting battery, location, and radio mesh density',
        tags: ['Gateway'],
        body: {
          type: 'object',
          required: ['gatewayId'],
          properties: {
            gatewayId: { type: 'string' },
            batteryPercent: { type: 'number' },
            connectedPeers: { type: 'number' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { gatewayId: string; batteryPercent?: number; connectedPeers?: number; latitude?: number; longitude?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { gatewayId, batteryPercent } = req.body;

      await db.query(
        `UPDATE devices SET last_seen_at = now(), is_gateway = true WHERE id = $1;`,
        [gatewayId]
      );

      return reply.send({
        status: 'ok',
        acknowledged: true,
        batteryPercent: batteryPercent ?? 100,
        serverTime: Math.floor(Date.now() / 1000),
      });
    }
  );
}
