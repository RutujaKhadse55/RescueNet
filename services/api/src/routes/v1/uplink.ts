import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ingestService } from '../../services/ingestService';

export async function uplinkRoutes(server: FastifyInstance) {
  server.post(
    '/uplink',
    {
      schema: {
        description: 'Idempotent bulk upload of mesh packets from connected survivor phones or gateways',
        tags: ['Uplink'],
        body: {
          type: 'object',
          required: ['packets'],
          properties: {
            deviceId: { type: 'string' },
            packets: {
              type: 'array',
              items: { type: 'string', description: 'Hex or Base64 encoded binary packet' },
            },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { deviceId?: string; packets: string[] };
      }>,
      reply: FastifyReply
    ) => {
      const { deviceId, packets } = req.body;

      if (!Array.isArray(packets)) {
        return reply.status(400).send({ error: 'packets must be an array of encoded strings' });
      }

      // Convert hex/base64 strings to Uint8Array
      const rawBytePackets: Uint8Array[] = [];
      for (const p of packets) {
        if (typeof p !== 'string') continue;
        const clean = p.trim();
        if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
          const bytes = new Uint8Array(clean.length / 2);
          for (let i = 0; i < clean.length; i += 2) {
            bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
          }
          rawBytePackets.push(bytes);
        } else {
          // Attempt Base64
          try {
            const buf = Buffer.from(clean, 'base64');
            rawBytePackets.push(new Uint8Array(buf));
          } catch {
            // Skip invalid
          }
        }
      }

      const result = await ingestService.ingestBatch(rawBytePackets, 'internet', deviceId);

      return reply.status(200).send(result);
    }
  );
}
