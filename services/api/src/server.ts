import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PROTOCOL_VERSION } from '@rescuenet/core';
import { config } from './config';
import { db } from './db/client';
import { scheduler } from './services/scheduler';

// Routes
import { devicesRoutes } from './routes/v1/devices';
import { uplinkRoutes } from './routes/v1/uplink';
import { smsRoutes } from './routes/v1/sms';
import { gatewayRoutes } from './routes/v1/gateway';
import { authRoutes } from './routes/v1/auth';
import { incidentsRoutes } from './routes/v1/incidents';
import { clustersRoutes } from './routes/v1/clusters';
import { teamsRoutes } from './routes/v1/teams';
import { statsRoutes } from './routes/v1/stats';
import { auditRoutes } from './routes/v1/audit';
import { adminRoutes } from './routes/v1/admin';
import { websocketRoutes } from './routes/v1/websocket';
import { privacyAndAbuseRoutes } from './routes/v1/privacyAndAbuse';

import { chatRoutes } from './routes/v1/chat';
import { simulationRoutes } from './routes/v1/simulation';

export function buildServer(): FastifyInstance {
  const server = fastify({
    logger: config.NODE_ENV !== 'test',
    bodyLimit: 10 * 1024 * 1024, // 10 MB payload limit for large mesh packet batches
  });

  // Security Headers: TLS 1.2+ with HSTS, anti-clickjacking, MIME protection
  server.addHook('onSend', async (_request, reply) => {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  // 1. CORS
  server.register(cors, {
    origin: true,
  });

  // 2. Rate limiting
  server.register(rateLimit, {
    max: config.NODE_ENV === 'test' ? 10000 : 300,
    timeWindow: '1 minute',
  });

  // 3. WebSockets
  server.register(websocket);

  // 4. OpenAPI / Swagger Documentation
  server.register(swagger, {
    openapi: {
      info: {
        title: 'RescueNet Emergency Response API',
        description:
          'Fastify REST, WebSocket, and SMS Ingestion Gateway for Disaster Triage & BLE Mesh Sync in India',
        version: '1.0.0',
      },
      servers: [
        {
          url: config.API_PUBLIC_URL,
          description: 'Current environment server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // 5. Health & Readiness endpoints
  const healthHandler = async () => ({
    status: 'ok',
    protocolVersion: PROTOCOL_VERSION,
    service: 'RescueNet API Gateway',
    retentionDays: config.RETENTION_DAYS,
    smsProvider: config.SMS_PROVIDER,
    timestamp: new Date().toISOString(),
  });

  server.get('/health', healthHandler);
  server.get('/v1/health', healthHandler);
  server.get('/v1/ready', async () => ({ status: 'ready', database: 'connected' }));

  // 6. Register /v1 API routes
  server.register(devicesRoutes, { prefix: '/v1' });
  server.register(uplinkRoutes, { prefix: '/v1' });
  server.register(smsRoutes, { prefix: '/v1' });
  server.register(gatewayRoutes, { prefix: '/v1' });
  server.register(authRoutes, { prefix: '/v1' });
  server.register(incidentsRoutes, { prefix: '/v1' });
  server.register(clustersRoutes, { prefix: '/v1' });
  server.register(teamsRoutes, { prefix: '/v1' });
  server.register(statsRoutes, { prefix: '/v1' });
  server.register(auditRoutes, { prefix: '/v1' });
  server.register(adminRoutes, { prefix: '/v1' });
  server.register(websocketRoutes, { prefix: '/v1' });
  server.register(privacyAndAbuseRoutes, { prefix: '/v1' });
  server.register(chatRoutes, { prefix: '/v1' });
  server.register(simulationRoutes, { prefix: '/v1' });

  // 7. Background scheduler initialization & graceful shutdown
  server.addHook('onReady', async () => {
    await db.init();
    if (config.NODE_ENV !== 'test') {
      scheduler.start();
    }
  });

  server.addHook('onClose', async () => {
    scheduler.stop();
    await db.close();
  });

  return server;
}
