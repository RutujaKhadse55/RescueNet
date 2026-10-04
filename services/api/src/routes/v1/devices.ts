import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { db } from '../../db/client';
import { config } from '../../config';

export async function devicesRoutes(server: FastifyInstance) {
  // Device registration
  server.post(
    '/devices/register',
    {
      schema: {
        description: 'Registers a new survivor phone or rescuer node',
        tags: ['Device'],
        body: {
          type: 'object',
          properties: {
            pubkey: { type: 'string' },
            master_public_key: { type: 'string' },
            keyPool: { type: 'array', items: { type: 'string' } },
            ephemeral_public_keys: { type: 'array', items: { type: 'string' } },
            chain_of_custody_signatures: { type: 'array', items: { type: 'string' } },
            platform: { type: 'string' },
            appVersion: { type: 'string' },
          },
        },
      },
    },
    async (req: any, reply: FastifyReply) => {
      const masterKey = req.body.pubkey || req.body.master_public_key;
      if (!masterKey) {
        return reply
          .status(400)
          .send({ error: 'Missing public key (pubkey or master_public_key)' });
      }
      const keyPool = req.body.keyPool || req.body.ephemeral_public_keys || [];
      const platform = req.body.platform || 'android';
      const appVersion = req.body.appVersion || '1.0.0';

      const pubkeyBuf = Buffer.from(masterKey, 'hex');
      const fpBuf = crypto.createHash('blake2b512').update(pubkeyBuf).digest().subarray(0, 8);
      const smsSecret = crypto.randomBytes(32);
      const deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      await db.query(
        `INSERT INTO devices (id, pubkey, fp, sms_secret, platform, app_version, trust_score, registered_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0.7, now());`,
        [deviceId, pubkeyBuf, fpBuf, smsSecret, platform, appVersion],
      );

      // Pre-register key pool if provided
      if (Array.isArray(keyPool)) {
        for (const k of keyPool) {
          const kBuf = Buffer.from(k, 'hex');
          const kFp = crypto.createHash('blake2b512').update(kBuf).digest().subarray(0, 8);
          await db.query(
            `INSERT INTO device_key_pool (device_id, pubkey, fp, valid_from, valid_to)
             VALUES ($1, $2, $3, now(), now() + interval '30 days');`,
            [deviceId, kBuf, kFp],
          );
        }
      }

      // Fetch SMS control-room numbers
      const smsRes = await db.query(
        `SELECT e164, label FROM sms_gateway_numbers WHERE active = true ORDER BY priority ASC;`,
      );

      return reply.status(201).send({
        deviceId,
        smsSecret: smsSecret.toString('hex'),
        agencyCaKey: config.AGENCY_CA_PUBLIC_KEY,
        controlRoomSmsNumbers: smsRes.rows.map(r => r.e164),
        config: {
          clustering: {
            epsMeters: 40,
            minPts: 1,
            splitDistanceMeters: 80,
            splitAltitudeMeters: 3.0,
          },
          retention: {
            sosSeconds: 72 * 3600,
            chatSeconds: 6 * 3600,
            locationSeconds: 30 * 60,
          },
          quietHours: {
            enabled: true,
            startHourUtc: 18,
            endHourUtc: 0,
          },
        },
      });
    },
  );

  // Configuration endpoint
  server.get(
    '/config',
    {
      schema: {
        description: 'Returns operational parameters and retention policies',
        tags: ['Device'],
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        version: '1.0.0',
        agencyCaPublicKey: config.AGENCY_CA_PUBLIC_KEY,
        revocationList: {
          agencyId: '1',
          revokedCredentialIds: [],
          revokedPublicKeysHex: [],
          updatedAt: Math.floor(Date.now() / 1000),
        },
        clustering: {
          epsMeters: 40,
          minPts: 1,
          splitDistanceMeters: 80,
          splitAltitudeMeters: 3.0,
          reclusterIntervalMs: 120_000,
          congestionThresholdRatio: 0.7,
        },
        priority: {
          stalenessCapMinutes: 120,
          largeGroupThreshold: 10,
        },
        retentionDays: config.RETENTION_DAYS,
        smsProvider: config.SMS_PROVIDER,
      });
    },
  );
}
