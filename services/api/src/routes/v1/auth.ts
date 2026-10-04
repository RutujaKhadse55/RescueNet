import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { SecurityService } from '../../auth/jwt';

export async function authRoutes(server: FastifyInstance) {
  server.post(
    '/auth/login',
    {
      schema: {
        description: 'Authenticates control room dispatcher, rescuer, or administrator',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { email: string; password: string };
      }>,
      reply: FastifyReply
    ) => {
      const { email, password } = req.body;

      const userRes = await db.query(`SELECT * FROM users WHERE email = $1;`, [email.toLowerCase()]);
      if (userRes.rows.length === 0) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const user = userRes.rows[0];
      if (!user.active) {
        return reply.status(403).send({ error: 'User account is deactivated' });
      }

      const passwordValid = await SecurityService.verifyPassword(password, user.password_hash);
      if (!passwordValid) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const payload = {
        userId: user.id,
        agencyId: user.agency_id,
        email: user.email,
        role: user.role,
      };

      const accessToken = SecurityService.generateAccessToken(payload);
      const refreshToken = SecurityService.generateRefreshToken(payload);

      return reply.send({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          agencyId: user.agency_id,
        },
      });
    }
  );

  server.post(
    '/auth/refresh',
    {
      schema: {
        description: 'Refreshes expired access token using valid refresh token',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { refreshToken: string };
      }>,
      reply: FastifyReply
    ) => {
      const { refreshToken } = req.body;

      const payload = SecurityService.verifyToken(refreshToken);
      if (!payload) {
        return reply.status(401).send({ error: 'Invalid or expired refresh token' });
      }

      const newAccessToken = SecurityService.generateAccessToken({
        userId: payload.userId,
        agencyId: payload.agencyId,
        email: payload.email,
        role: payload.role,
      });

      return reply.send({
        accessToken: newAccessToken,
      });
    }
  );
}
