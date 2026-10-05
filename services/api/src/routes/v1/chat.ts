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
export let messagesStore: ChatMessageDto[] = [];

export function addSystemChatMessage(msg: ChatMessageDto) {
  messagesStore.push(msg);
}

export function clearMessagesStore() {
  messagesStore = [];
}

export async function chatRoutes(server: FastifyInstance) {
  // GET /v1/chat/messages
  server.get(
    '/chat/messages',
    async (
      req: FastifyRequest<{
        Querystring: { conversationId?: string; clusterId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      // Deduplicate messagesStore by content + sender within 5 seconds
      const uniqueMessages: ChatMessageDto[] = [];
      const seen = new Set<string>();
      for (const m of messagesStore) {
        const timeKey = Math.floor(new Date(m.timestamp).getTime() / 5000);
        const key = `${m.senderRole}_${m.content}_${timeKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueMessages.push(m);
        }
      }
      messagesStore = uniqueMessages;

      const { conversationId } = req.query;
      if (conversationId && conversationId !== 'all') {
        const filtered = messagesStore.filter(
          m =>
            m.conversationId === conversationId ||
            m.recipientFp === 'broadcast' ||
            m.conversationId === 'cl_pune_ghats_01' ||
            m.conversationId === 'conv_local_mesh',
        );
        return reply.send({ messages: filtered });
      }
      return reply.send({ messages: messagesStore });
    },
  );

  // POST /v1/chat/messages
  server.post(
    '/chat/messages',
    async (
      req: FastifyRequest<{
        Body: {
          id?: string;
          conversationId?: string;
          senderFp?: string;
          senderName?: string;
          senderRole?: 'survivor' | 'rescuer' | 'nearby';
          recipientFp?: string;
          content: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const body = req.body;
      if (!body || !body.content) {
        return reply.status(400).send({ error: 'content is required' });
      }

      // Deduplication check: prevent identical messages from same sender within 4 seconds
      const isDuplicate = messagesStore.some(
        m =>
          (body.id && m.id === body.id) ||
          (m.content === body.content &&
            m.senderRole === (body.senderRole || 'survivor') &&
            Math.abs(Date.now() - new Date(m.timestamp).getTime()) < 4000),
      );
      if (isDuplicate) {
        const existing = messagesStore.find(
          m => m.content === body.content && m.senderRole === (body.senderRole || 'survivor'),
        );
        return reply.status(200).send(existing || { status: 'duplicate_ignored' });
      }

      const newMsg: ChatMessageDto = {
        id: body.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: body.conversationId || 'cl_pune_ghats_01',
        senderFp: body.senderFp || 'survivor_node',
        senderName:
          body.senderName || (body.senderRole === 'rescuer' ? 'Rescue Team Alpha' : 'Survivor'),
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
    },
  );
}
