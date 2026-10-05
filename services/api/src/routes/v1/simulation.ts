import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client';
import { eventBus } from '../../services/eventBus';
import { messagesStore, clearMessagesStore, addSystemChatMessage } from './chat';
import { latestLiveFix } from '../../services/ingestService';

export interface SimulatedPeer {
  fp: string;
  name: string;
  role: 'survivor' | 'rescuer';
  triage: 'RED' | 'YELLOW' | 'GREEN';
  distanceMeters: number;
  battery: number;
  rssi: number;
  lat: number;
  lon: number;
  needs: string[];
}

export let simulatedPeersStore: SimulatedPeer[] = [];
export let isSimulationActive = false;

export async function simulationRoutes(server: FastifyInstance) {
  // GET /v1/simulation/status
  server.get('/simulation/status', async (_req, reply: FastifyReply) => {
    return reply.send({
      active: isSimulationActive,
      peersCount: simulatedPeersStore.length,
      messagesCount: messagesStore.length,
      peers: simulatedPeersStore,
    });
  });

  // GET /v1/simulation/peers (Consumed by mobile app and dashboard)
  server.get('/simulation/peers', async (_req, reply: FastifyReply) => {
    return reply.send({
      active: isSimulationActive,
      peers: simulatedPeersStore,
    });
  });

  // POST /v1/simulation/seed
  server.post(
    '/simulation/seed',
    async (
      req: FastifyRequest<{
        Body?: {
          lat?: number;
          lon?: number;
          clusterId?: string;
          clusterName?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const body = req.body || {};

      // 1. Determine anchor GPS coordinates:
      // Priority 1: explicitly passed coords in request
      // Priority 2: latest live GPS fix from mobile device SOS uplink
      // Priority 3: latest packet in database/memoryDb
      // Priority 4: default disaster zone coordinates (Pune 18.5204, 73.8567)
      let anchorLat = typeof body.lat === 'number' ? body.lat : (latestLiveFix?.lat ?? 18.5204);
      let anchorLon = typeof body.lon === 'number' ? body.lon : (latestLiveFix?.lon ?? 73.8567);

      if (!body.lat && !latestLiveFix) {
        try {
          const memDb = (db as any).packets;
          if (memDb && memDb.size > 0) {
            const allPackets = Array.from(memDb.values()) as any[];
            const lastWithCoords = allPackets.reverse().find((p: any) => p.lat && p.lon);
            if (lastWithCoords) {
              anchorLat = Number(lastWithCoords.lat);
              anchorLon = Number(lastWithCoords.lon);
            }
          } else {
            const packets = await db.query(
              `SELECT lat, lon FROM packets WHERE lat IS NOT NULL ORDER BY created_at DESC LIMIT 1;`,
            );
            if (packets.rows && packets.rows[0] && packets.rows[0].lat && packets.rows[0].lon) {
              anchorLat = Number(packets.rows[0].lat);
              anchorLon = Number(packets.rows[0].lon);
            }
          }
        } catch {}
      }

      const clusterId = body.clusterId || 'cl_pune_ghats_01';
      const clusterName = body.clusterName || 'Sector 4 Relief Zone';

      // 2. Generate simulated nearby survivor devices tightly clustered around the anchor GPS
      simulatedPeersStore = [
        {
          fp: '4a9b2c8f1e7d3a01',
          name: 'Survivor Node #4a9b',
          role: 'survivor',
          triage: 'YELLOW',
          distanceMeters: 28,
          battery: 84,
          rssi: -62,
          lat: +(anchorLat + 0.00025).toFixed(6),
          lon: +(anchorLon + 0.00032).toFixed(6),
          needs: ['First Aid Kit', 'Clean Drinking Water'],
        },
        {
          fp: '8f2e1a3b5c7d9e02',
          name: 'Survivor Node #8f2e',
          role: 'survivor',
          triage: 'RED',
          distanceMeters: 42,
          battery: 52,
          rssi: -74,
          lat: +(anchorLat - 0.00035).toFixed(6),
          lon: +(anchorLon - 0.00028).toFixed(6),
          needs: ['Debris Extraction', 'Oxygen Cylinder'],
        },
      ];

      isSimulationActive = true;

      // 3. Upsert 4 realistic simulation clusters into Database (1 Pending near user, 1 Assigned, 1 Pending, 1 Solved/Resolved)
      const clusterRows = [
        {
          id: clusterId,
          incident_id: '22222222-2222-2222-2222-222222222222',
          external_id: clusterId,
          name: clusterName,
          centroid_lat: anchorLat,
          centroid_lon: anchorLon,
          radius_m: 45,
          survivor_count: 3,
          priority_score: 0.95,
          state: 'active', // Pending (unassigned)
          priority_breakdown: { triageRed: 1, triageYellow: 1, hazardProximity: 0.8 },
          flags: ['immediate_threat', 'medical_urgency'],
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'cl_pune_bridge_02',
          incident_id: '22222222-2222-2222-2222-222222222222',
          external_id: 'cl_pune_bridge_02',
          name: 'Shivaji Nagar Bridge Structural Damage',
          centroid_lat: +(anchorLat + 0.0072).toFixed(6),
          centroid_lon: +(anchorLon + 0.0065).toFixed(6),
          radius_m: 50,
          survivor_count: 4,
          priority_score: 0.82,
          state: 'assigned', // Assigned
          assigned_team: 'Rescue Team Bravo',
          priority_breakdown: { triageRed: 1, triageYellow: 2, hazardProximity: 0.7 },
          flags: ['structural_collapse', 'evacuation_needed'],
          created_at: new Date(Date.now() - 1000 * 600),
          updated_at: new Date(),
        },
        {
          id: 'cl_pune_hills_03',
          incident_id: '22222222-2222-2222-2222-222222222222',
          external_id: 'cl_pune_hills_03',
          name: 'Kothrud Hillside Flash Debris',
          centroid_lat: +(anchorLat - 0.0068).toFixed(6),
          centroid_lon: +(anchorLon - 0.0074).toFixed(6),
          radius_m: 35,
          survivor_count: 2,
          priority_score: 0.74,
          state: 'active', // Pending
          priority_breakdown: { triageRed: 0, triageYellow: 1, hazardProximity: 0.6 },
          flags: ['debris_hazard'],
          created_at: new Date(Date.now() - 1000 * 300),
          updated_at: new Date(),
        },
        {
          id: 'cl_pune_market_04',
          incident_id: '22222222-2222-2222-2222-222222222222',
          external_id: 'cl_pune_market_04',
          name: 'Old City Market Underground Shelter',
          centroid_lat: +(anchorLat + 0.0035).toFixed(6),
          centroid_lon: +(anchorLon - 0.0058).toFixed(6),
          radius_m: 60,
          survivor_count: 5,
          priority_score: 0.35,
          state: 'closed', // Solved / Resolved
          assigned_team: 'Rescue Team Charlie',
          priority_breakdown: { triageRed: 0, triageYellow: 0, hazardProximity: 0.1 },
          flags: ['evacuation_completed', 'medical_cleared'],
          created_at: new Date(Date.now() - 1000 * 1800),
          updated_at: new Date(),
        },
      ];

      // Save clusters
      for (const row of clusterRows) {
        try {
          await db.query(
            `INSERT INTO clusters (id, incident_id, external_id, centroid_lat, centroid_lon, radius_m, survivor_count, priority_score, state, priority_breakdown, flags, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
             ON CONFLICT (id) DO UPDATE SET
               centroid_lat = EXCLUDED.centroid_lat,
               centroid_lon = EXCLUDED.centroid_lon,
               survivor_count = EXCLUDED.survivor_count,
               priority_score = EXCLUDED.priority_score,
               state = EXCLUDED.state,
               updated_at = now();`,
            [
              row.id,
              row.incident_id,
              row.external_id,
              row.centroid_lat,
              row.centroid_lon,
              row.radius_m,
              row.survivor_count,
              row.priority_score,
              row.state,
              JSON.stringify(row.priority_breakdown),
              row.flags,
            ],
          );
        } catch {}

        const memDb = (db as any).clusters;
        if (memDb && typeof memDb.set === 'function') {
          memDb.set(row.id, {
            ...row,
            name: row.name,
            member_count: row.survivor_count,
            declared_people: row.survivor_count,
            state: row.state,
            assigned_team: (row as any).assigned_team,
          });
        }
      }

      // 4. Initialize realistic survivor-to-survivor chatter between nearby peers
      // (Notice: Team Alpha is NOT included here; it will ONLY appear once rescuer is assigned!)
      clearMessagesStore();

      addSystemChatMessage({
        id: `msg_${Date.now()}_1`,
        conversationId: clusterId,
        senderFp: '4a9b2c8f1e7d3a01',
        senderName: 'Survivor Node #4a9b',
        senderRole: 'survivor',
        recipientFp: 'broadcast',
        content: `Is anyone nearby? 2 of us are sheltered on the terrace. Water level is rising slowly.`,
        timestamp: new Date(Date.now() - 1000 * 90).toISOString(),
        ttl: 5,
      });

      addSystemChatMessage({
        id: `msg_${Date.now()}_2`,
        conversationId: clusterId,
        senderFp: '8f2e1a3b5c7d9e02',
        senderName: 'Survivor Node #8f2e',
        senderRole: 'survivor',
        recipientFp: 'broadcast',
        content: `We are ~40m south behind the masonry wall. 1 person has a severe leg injury.`,
        timestamp: new Date(Date.now() - 1000 * 45).toISOString(),
        ttl: 5,
      });

      // 5. Broadcast real-time cluster event over WebSocket
      eventBus.broadcastClusterEvent({
        type: 'cluster_created',
        clusterId: clusterId,
        data: clusterRows[0] ?? {},
        timestamp: new Date().toISOString(),
      });

      return reply.send({
        status: 'seeded',
        clusterId,
        clusterName,
        anchorLocation: { lat: anchorLat, lon: anchorLon },
        clustersCount: clusterRows.length,
        survivorsCount: 3,
        messagesCount: messagesStore.length,
        peers: simulatedPeersStore,
      });
    },
  );

  // POST /v1/simulation/clean
  server.post('/simulation/clean', async (_req, reply: FastifyReply) => {
    isSimulationActive = false;
    simulatedPeersStore = [];
    clearMessagesStore();

    try {
      await db.query(
        `DELETE FROM clusters WHERE external_id LIKE 'cl_pune_%' OR state = 'active';`,
      );
    } catch {
      const memDb = (db as any).clusters;
      if (memDb && typeof memDb.clear === 'function') {
        memDb.clear();
      }
    }

    eventBus.broadcastClusterEvent({
      type: 'cluster_updated',
      clusterId: 'cl_pune_ghats_01',
      data: { state: 'closed', survivor_count: 0 },
      timestamp: new Date().toISOString(),
    });

    return reply.send({
      status: 'cleaned',
      message: 'All simulation demo data wiped cleanly.',
      active: false,
    });
  });
}
