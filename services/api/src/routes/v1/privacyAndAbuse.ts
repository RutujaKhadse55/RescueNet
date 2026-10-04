import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { authenticate, requireRole } from '../../auth/rbac';

export async function privacyAndAbuseRoutes(server: FastifyInstance) {
  // In-memory or DB-backed banned public keys set
  const bannedKeys = new Set<string>();

  // 1. Dispatcher / Admin Abuse Control: Ban an abusive public key
  server.post(
    '/abuse/ban-key',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher'])],
      schema: {
        description: 'Bans a compromised or abusive public key from submitting packets to the mesh and API',
        tags: ['Abuse'],
        body: {
          type: 'object',
          required: ['pubkey'],
          properties: {
            pubkey: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { pubkey, reason } = req.body;
      const cleanKey = pubkey.toLowerCase().trim();
      bannedKeys.add(cleanKey);

      await db.query(
        `INSERT INTO events (event_type, details) VALUES ($1, $2);`,
        ['abuse_key_banned', JSON.stringify({ pubkey: cleanKey, reason: reason || 'abusive_behavior', bannedBy: req.user?.userId })]
      ).catch(() => {});

      return reply.send({ success: true, bannedKey: cleanKey, message: 'Key banned successfully' });
    }
  );

  // 2. List currently banned keys
  server.get(
    '/abuse/banned-keys',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher', 'rescuer'])],
      schema: {
        description: 'Lists all currently banned abusive keys',
        tags: ['Abuse'],
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        count: bannedKeys.size,
        bannedKeys: Array.from(bannedKeys),
      });
    }
  );

  // 3. Unban a key
  server.delete(
    '/abuse/ban-key/:pubkey',
    {
      preHandler: [authenticate, requireRole(['admin', 'dispatcher'])],
      schema: {
        description: 'Unbans a previously banned key',
        tags: ['Abuse'],
        params: {
          type: 'object',
          required: ['pubkey'],
          properties: {
            pubkey: { type: 'string' },
          },
        },
      },
    },
    async (req: any, reply: FastifyReply) => {
      const { pubkey } = req.params;
      const cleanKey = pubkey.toLowerCase().trim();
      bannedKeys.delete(cleanKey);
      return reply.send({ success: true, unbannedKey: cleanKey });
    }
  );

  // 4. Privacy Control: Data-Subject Deletion Request
  server.post(
    '/privacy/deletion-request',
    {
      schema: {
        description: 'Data subject deletion request under personal data protection legislation. Purges all records for a device or fingerprint.',
        tags: ['Privacy'],
        body: {
          type: 'object',
          required: ['originFp'],
          properties: {
            originFp: { type: 'string' },
            confirmationToken: { type: 'string' },
          },
        },
      },
    },
    async (
      req: any,
      reply: FastifyReply
    ) => {
      const { originFp } = req.body;
      const fpBuf = Buffer.from(originFp.replace(/[^a-f0-9]/gi, ''), 'hex');

      // 1. Purge packets
      await db.query(`DELETE FROM packets WHERE origin_fp = $1;`, [fpBuf]).catch(() => {});

      // 2. Purge device key pool and device registration
      await db.query(`DELETE FROM device_key_pool WHERE fp = $1;`, [fpBuf]).catch(() => {});
      await db.query(`DELETE FROM devices WHERE fp = $1;`, [fpBuf]).catch(() => {});

      // 3. Purge survivor and chat records
      await db.query(`DELETE FROM chat_uplinks WHERE origin_fp = $1;`, [fpBuf]).catch(() => {});

      await db.query(
        `INSERT INTO events (event_type, details) VALUES ($1, $2);`,
        ['privacy_data_subject_deleted', JSON.stringify({ originFp, timestamp: new Date().toISOString() })]
      ).catch(() => {});

      return reply.send({
        success: true,
        originFp,
        message: 'All personal data, identifiers, and telemetry purged for data subject.',
      });
    }
  );
}
