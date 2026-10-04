import { FastifyInstance } from 'fastify';
import { SecurityService } from '../../auth/jwt';
import { eventBus, ClusterEventPayload } from '../../services/eventBus';

export async function websocketRoutes(server: FastifyInstance) {
  server.get('/ws', { websocket: true }, (rawSocket: any, req: any) => {
    const ws = rawSocket?.socket || rawSocket;
    let userRole = 'viewer';

    // Check if token passed as query param
    const query = req.query as any;
    if (query?.token) {
      const payload = SecurityService.verifyToken(query.token);
      if (payload) {
        userRole = payload.role;
      }
    }

    const listener = (event: ClusterEventPayload) => {
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify(event));
      }
    };

    eventBus.on('cluster_event', listener);

    ws.on('message', (message: Buffer) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'auth' && parsed.token) {
          const payload = SecurityService.verifyToken(parsed.token);
          if (payload) {
            userRole = payload.role;
            ws.send(JSON.stringify({ type: 'authenticated', role: userRole }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JWT token' }));
          }
        }
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      eventBus.off('cluster_event', listener);
    });
  });
}
