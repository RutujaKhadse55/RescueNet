import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { authenticate } from '../../auth/rbac';

export async function teamsRoutes(server: FastifyInstance) {
  server.get(
    '/teams',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Lists tactical response teams and current GPS coordinates',
        tags: ['Teams'],
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const res = await db.query(`SELECT * FROM teams;`);
      return reply.send(res.rows);
    },
  );

  const positionSchema = {
    description: 'Updates tactical rescue team location',
    tags: ['Teams'],
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
      },
    },
    body: {
      type: 'object',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
    },
  };

  const optionalAuth = (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    if (req.headers.authorization) {
      authenticate(req, reply, done);
    } else {
      done();
    }
  };

  const updatePositionHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    await db.query(
      `UPDATE teams SET last_position = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, last_position_at = now() WHERE id = $3 RETURNING *;`,
      [longitude, latitude, id],
    );

    return reply.send({ id, latitude, longitude, updatedAt: new Date().toISOString() });
  };

  server.patch(
    '/teams/:id/position',
    { preHandler: [optionalAuth], schema: positionSchema },
    updatePositionHandler,
  );
  server.post(
    '/teams/:id/position',
    { preHandler: [optionalAuth], schema: positionSchema },
    updatePositionHandler,
  );
}
