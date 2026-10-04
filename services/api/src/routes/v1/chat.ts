import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eventBus } from '../../services/eventBus';

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderFp: string;
  senderName: string;
  senderRole: 'survivor' | 'rescuer' | 'nearby';
  recipientFp: string;
  content: string;
  timestamp: string;
  ttl: number;
}

// In-memory shared message store for disaster simulation & cross-device communication
export const messagesStore: ChatMessageDto[] = [
  {
    id: 'msg_init_001',
    conversationId: 'cl_pune_ghats_01',
    senderFp: '4a9b2c8f1e7d3a01',
    senderName: 'Survivor B (Priya Patil)',
    senderRole: 'nearby',
    recipientFp: 'broadcast',
    content: 'Is anyone nearby? We are at the relief shelter entrance.',
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    ttl: 5,
  },
];

export function addSystemChatMessage(msg: ChatMessageDto) {
  messagesStore.push(msg);
}

export async function chatRoutes(server: FastifyInstance) {
  // GET /v1/chat/messages
  server.get(
    '/chat/messages',
    async (
      req: FastifyRequest<{
        Querystring: { conversationId?: string; clusterId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { conversationId } = req.query;
      if (conversationId) {
        const filtered = messagesStore.filter(
          (m) =>
            m.conversationId === conversationId ||
            conversationId === 'all' ||
            m.conversationId === 'cl_pune_ghats_01' ||
            m.conversationId === 'conv_local_mesh'
        );
        return reply.send({ messages: filtered });
      }
      return reply.send({ messages: messagesStore });
    }
  );

  // POST /v1/chat/messages
  server.post(
    '/chat/messages',
    async (
      req: FastifyRequest<{
        Body: {
          conversationId?: string;
          senderFp?: string;
          senderName?: string;
          senderRole?: 'survivor' | 'rescuer' | 'nearby';
          recipientFp?: string;
          content: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const body = req.body;
      if (!body || !body.content) {
        return reply.status(400).send({ error: 'content is required' });
      }

      const newMsg: ChatMessageDto = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: body.conversationId || 'cl_pune_ghats_01',
        senderFp: body.senderFp || 'survivor_node',
        senderName: body.senderName || (body.senderRole === 'rescuer' ? 'Rescue Team Alpha' : 'Survivor'),
        senderRole: body.senderRole || 'survivor',
        recipientFp: body.recipientFp || 'broadcast',
        content: body.content,
        timestamp: new Date().toISOString(),
        ttl: 6,
      };

      messagesStore.push(newMsg);

      // Broadcast on eventBus for real-time WebSocket push
      eventBus.broadcastClusterEvent({
        type: 'chat_message' as any,
        clusterId: newMsg.conversationId,
        data: newMsg,
        timestamp: newMsg.timestamp,
      });

      return reply.status(201).send(newMsg);
    }
  );
}
