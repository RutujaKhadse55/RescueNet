import { FastifyInstance, FastifyReply } from 'fastify';
import { ClusterService } from '../../services/clusterService';
import { ackService } from '../../services/ackService';
import { authenticate, requireRole } from '../../auth/rbac';
import { addSystemChatMessage } from './chat';

export async function clustersRoutes(server: FastifyInstance) {
  // Get cluster details
  server.get(
    '/clusters/:id',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Retrieves cluster detail with members, timeline, and trust signals (logs coordinate access)',
        tags: ['Clusters'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const details = await ClusterService.getClusterDetails(
        id,
        req.user?.userId,
        req.ip
      );

      if (!details) {
        return reply.status(404).send({ error: 'Cluster not found' });
      }

      return reply.send(details);
    }
  );

  // Update cluster state / merge / false alarm
  server.patch(
    '/clusters/:id',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher', 'rescuer'])],
      schema: {
        description: 'Updates cluster triage state, merges clusters, or flags false alarm',
        tags: ['Clusters'],
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
            state: {
              type: 'string',
              enum: ['new', 'assigned', 'en_route', 'reached', 'closed', 'false_alarm'],
            },
            falseAlarmReason: { type: 'string' },
            mergeWithId: { type: 'string' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const updated = await ClusterService.updateCluster(id, req.body, req.user?.userId);

      if (!updated) {
        return reply.status(404).send({ error: 'Cluster not found' });
      }

      return reply.send(updated);
    }
  );

  // Assign team
  server.post(
    '/clusters/:id/assign',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher'])],
      schema: {
        description: 'Assigns a tactical rescue team to a survivor cluster',
        tags: ['Clusters'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['teamId'],
          properties: {
            teamId: { type: 'string' },
            etaMinutes: { type: 'number' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const { teamId, etaMinutes } = req.body;

      const assignment = await ClusterService.assignTeam(
        id,
        teamId,
        req.user!.userId,
        etaMinutes ?? 30
      );

      // Broadcast team assignment to survivor chat stream so the survivor's app unlocks the team
      addSystemChatMessage({
        id: `msg_assign_${Date.now()}`,
        conversationId: 'cl_pune_ghats_01',
        senderFp: 'team_alpha',
        senderName: 'Rescue Team Alpha (Capt. Vikram)',
        senderRole: 'rescuer',
        recipientFp: 'broadcast',
        content: `NDRF Rescue Team Alpha has been dispatched to Sector 4! Approaching coordinates (ETA ${etaMinutes ?? 15}m). Medical and extraction gear ready. Stay where you are!`,
        timestamp: new Date().toISOString(),
        ttl: 6,
      });

      return reply.status(200).send(assignment);
    }
  );

  // Dispatch signed ACK
  server.post(
    '/clusters/:id/ack',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher', 'rescuer'])],
      schema: {
        description: 'Generates a signed binary ACK packet and enqueues an outbound SMS to survivors',
        tags: ['Clusters'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['ackType'],
          properties: {
            ackType: {
              type: 'string',
              enum: ['help_on_way', 'reached', 'need_info', 'stay_put', 'evacuate'],
            },
            etaMinutes: { type: 'number' },
            messageCode: { type: 'number' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const { ackType, etaMinutes, messageCode } = req.body;

      try {
        const result = await ackService.createAcknowledgment({
          clusterId: id,
          senderUserId: req.user!.userId,
          ackType,
          etaMinutes,
          messageCode,
        });

        return reply.status(201).send(result);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    }
  );
}
