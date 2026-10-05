import { create } from 'zustand';

export type Role = 'admin' | 'rescuer';

export type AdminNav = 'requests' | 'map' | 'teams';
export type RescuerNav = 'cases' | 'map' | 'messages';

export type SosStatus = 'idle' | 'sending' | 'sent' | 'assigned' | 'acknowledged' | 'rescued';

export interface ChatMessage {
  id: string;
  sender: 'survivor' | 'nearby' | 'rescuer' | 'dispatcher';
  senderName: string;
  text: string;
  timestamp: string;
  target?: 'mesh' | 'rescuer';
}

export interface ClusterMember {
  id: string;
  name: string;
  condition: string;
  distanceMeters: number;
  lat: number;
  lon: number;
  phone?: string;
  emergencyNeeds?: string[];
  battery?: number;
}

export interface SosIncident {
  id: string;
  survivorName: string;
  lat: number;
  lon: number;
  nearbyCount: number;
  urgency: 'Emergency' | 'Urgent' | 'Stable';
  timeReceived: string;
  status: 'Pending' | 'Assigned' | 'In Progress' | 'Resolved';
  assignedTeam: string | null;
  acknowledged: boolean;
  notes?: string;
  clusterRadiusMeters: number;
  clusterMembers: ClusterMember[];
}

export interface RescueTeam {
  id: string;
  name: string;
  lead: string;
  members: number;
  status: 'Available' | 'Deployed' | 'En Route';
  currentSosId?: string | null;
  vehicle: string;
}

interface RescueState {
  // Navigation & Active Role (Admin or Rescuer)
  currentRole: Role;
  setRole: (role: Role) => void;

  adminNav: AdminNav;
  setAdminNav: (nav: AdminNav) => void;

  rescuerNav: RescuerNav;
  setRescuerNav: (nav: RescuerNav) => void;

  // Admin & Incident State
  sosList: SosIncident[];
  teams: RescueTeam[];
  selectedSosId: string | null;
  selectedPersonId: string | null;
  showIndividualPins: boolean;
  showClusterBoundaries: boolean;
  toggleIndividualPins: () => void;
  toggleClusterBoundaries: () => void;

  // Rescuer State
  rescuerLocation: { lat: number; lon: number };
  navDistanceRemaining: number;
  navEtaMinutes: number;
  isNavigating: boolean;
  rescuerMessages: ChatMessage[];

  // Actions
  assignTeam: (sosId: string, teamName: string) => void;
  acknowledgeSos: (sosId: string) => void;
  markResolved: (sosId: string) => void;
  selectSos: (sosId: string | null) => void;
  selectPerson: (personId: string | null) => void;
  startNavigation: () => void;
  stepNavigation: () => void;
  sendRescuerMessage: (text: string, senderRole?: 'rescuer' | 'survivor' | 'dispatcher') => void;
  addSosIncident: (incident: Partial<SosIncident>) => void;
  syncChatFromBackend: () => Promise<void>;
  syncClustersFromBackend: () => Promise<void>;
  seedSimulation: () => Promise<void>;
  cleanSimulation: () => Promise<void>;
  simulateDisasterSos: (zoneName: string, lat: number, lon: number, peopleCount: number) => void;
  resetDemo: () => void;
}

const INITIAL_SOS_LIST: SosIncident[] = [];

const INITIAL_TEAMS: RescueTeam[] = [
  {
    id: 'team-alpha',
    name: 'Rescue Team Alpha',
    lead: 'Capt. Vikram Singh',
    members: 6,
    status: 'Available',
    vehicle: 'Tactical Rescue Truck (TR-01)',
  },
  {
    id: 'team-bravo',
    name: 'Rescue Team Bravo',
    lead: 'Lt. Sneha Joshi',
    members: 4,
    status: 'Available',
    currentSosId: null,
    vehicle: 'Amphibious Response Unit (AR-04)',
  },
  {
    id: 'team-charlie',
    name: 'Rescue Team Charlie',
    lead: 'Insp. R. K. Nair',
    members: 5,
    status: 'Available',
    vehicle: 'Mobile Medical Ambulance (MED-02)',
  },
];

const INITIAL_RESCUER_CHAT: ChatMessage[] = [];

export const useRescueStore = create<RescueState>((set, get) => ({
  // Defaults to Admin / Control Center
  currentRole: 'admin',
  setRole: role => set({ currentRole: role }),

  adminNav: 'requests',
  setAdminNav: nav => set({ adminNav: nav }),

  rescuerNav: 'cases',
  setRescuerNav: nav => set({ rescuerNav: nav }),

  // Incident & Admin State
  sosList: INITIAL_SOS_LIST,
  teams: INITIAL_TEAMS,
  selectedSosId: null,
  selectedPersonId: null,
  showIndividualPins: true,
  showClusterBoundaries: true,
  toggleIndividualPins: () => set(state => ({ showIndividualPins: !state.showIndividualPins })),
  toggleClusterBoundaries: () =>
    set(state => ({ showClusterBoundaries: !state.showClusterBoundaries })),

  // Rescuer State
  rescuerLocation: { lat: 18.5235, lon: 73.8595 },
  navDistanceRemaining: 420,
  navEtaMinutes: 3,
  isNavigating: false,
  rescuerMessages: INITIAL_RESCUER_CHAT,

  assignTeam: (sosId, teamName) => {
    set(state => {
      const updatedSos = state.sosList.map(s => {
        if (s.id === sosId) {
          return { ...s, assignedTeam: teamName, status: 'Assigned' as const };
        }
        if (s.assignedTeam === teamName && s.status !== 'Resolved') {
          return { ...s, assignedTeam: null, status: 'Pending' as const };
        }
        return s;
      });

      const updatedTeams = state.teams.map(t =>
        t.name === teamName ? { ...t, status: 'Deployed' as const, currentSosId: sosId } : t,
      );

      // Find the raw cluster ID from sosList to call backend
      const incident = state.sosList.find(s => s.id === sosId);

      // Notify survivor over shared chat endpoint
      if (typeof window !== 'undefined') {
        fetch('/v1/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: 'cl_pune_ghats_01',
            senderFp: 'team_alpha',
            senderName: teamName,
            senderRole: 'rescuer',
            content: `🚨 ${teamName} has been assigned to your cluster! We are en route with rescue gear. Maintain your position and conserve battery.`,
          }),
        }).catch(() => {});

        // Persist assignment to backend: try cluster IDs derived from sosId
        // sosId looks like "SOS #1234" → we need the cluster's backend ID
        // We'll call /v1/clusters to find the cluster matching this incident's lat/lon
        if (incident) {
          fetch('/v1/clusters')
            .then(r => r.json())
            .then((clusters: any[]) => {
              // Find cluster whose centroid matches this incident (within 10m)
              const match = clusters.find((c: any) => {
                const clat = Number(c.centroid_lat ?? c.lat);
                const clon = Number(c.centroid_lon ?? c.lon);
                const dlat = Math.abs(clat - incident.lat);
                const dlon = Math.abs(clon - incident.lon);
                return dlat < 0.001 && dlon < 0.001;
              });
              if (match) {
                fetch(`/v1/clusters/${match.id}/set-team`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ teamName }),
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      }

      return {
        sosList: updatedSos,
        teams: updatedTeams,
      };
    });
  },

  acknowledgeSos: sosId => {
    set(state => {
      const updatedSos = state.sosList.map(s =>
        s.id === sosId ? { ...s, acknowledged: true, status: 'In Progress' as const } : s,
      );

      const ackMsg: ChatMessage = {
        id: `ack_${Date.now()}`,
        sender: 'rescuer',
        senderName: 'Rescue Team Alpha',
        text: 'Rescue team has received your SOS. Help is on the way.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        target: 'rescuer',
      };

      return {
        sosList: updatedSos,
        rescuerMessages: [...state.rescuerMessages, ackMsg],
      };
    });
  },

  markResolved: sosId => {
    set(state => {
      const updatedSos = state.sosList.map(s =>
        s.id === sosId ? { ...s, status: 'Resolved' as const } : s,
      );

      const target = state.sosList.find(s => s.id === sosId);
      const teamNameToFree = target?.assignedTeam;

      const updatedTeams = state.teams.map(t =>
        t.name === teamNameToFree ? { ...t, status: 'Available' as const, currentSosId: null } : t,
      );

      return {
        sosList: updatedSos,
        teams: updatedTeams,
        isNavigating: false,
        navDistanceRemaining: 0,
      };
    });
  },

  selectSos: sosId => set({ selectedSosId: sosId, selectedPersonId: null }),
  selectPerson: personId => set({ selectedPersonId: personId }),

  startNavigation: () => {
    set({ isNavigating: true });
  },

  stepNavigation: () => {
    set(state => {
      if (!state.isNavigating) return state;
      const nextDist = Math.max(0, state.navDistanceRemaining - 90);
      const nextEta = Math.max(0, Math.ceil(nextDist / 120));
      return {
        navDistanceRemaining: nextDist,
        navEtaMinutes: nextEta,
        rescuerLocation: {
          lat: state.rescuerLocation.lat + (18.5204 - state.rescuerLocation.lat) * 0.35,
          lon: state.rescuerLocation.lon + (73.8567 - state.rescuerLocation.lon) * 0.35,
        },
      };
    });
  },

  sendRescuerMessage: (text, senderRole) => {
    const role = senderRole || (get().currentRole === 'rescuer' ? 'rescuer' : 'dispatcher');
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newMsg: ChatMessage = {
      id: msgId,
      sender: role,
      senderName:
        role === 'rescuer'
          ? 'NDRF Tactical Team Alpha'
          : role === 'dispatcher'
            ? 'NDRF Command Dispatcher'
            : 'Survivor',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      target: 'rescuer',
    };
    set(state => ({ rescuerMessages: [...state.rescuerMessages, newMsg] }));

    if (typeof window !== 'undefined') {
      // Send ONCE to chat endpoint with exact message ID (prevents duplication loops)
      fetch('/v1/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msgId,
          conversationId: 'cl_pune_ghats_01',
          senderFp:
            role === 'rescuer'
              ? 'team_alpha'
              : role === 'dispatcher'
                ? 'dispatcher_hq'
                : 'survivor_node',
          senderName: newMsg.senderName,
          senderRole: role === 'dispatcher' ? 'rescuer' : role,
          recipientFp: 'broadcast',
          content: text,
        }),
      }).catch(() => {});
    }
  },

  syncChatFromBackend: async () => {
    try {
      const res = await fetch('/v1/chat/messages?conversationId=all');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          if (data.messages.length === 0) {
            if (get().rescuerMessages.length > 0) {
              set({ rescuerMessages: [] });
            }
          } else {
            const current = get().rescuerMessages;
            const currentIds = new Set(current.map(m => m.id));
            const newOnes = data.messages
              .filter((m: any) => {
                if (currentIds.has(m.id)) return false;
                // Deduplicate if identical content from same sender was received within 5 seconds
                const isDuplicateContent = current.some(
                  c =>
                    c.text === m.content &&
                    (c.sender === m.senderRole || (c.sender === 'rescuer' && m.senderRole === 'rescuer')),
                );
                return !isDuplicateContent;
              })
              .map((m: any) => ({
                id: m.id,
                sender: (m.senderRole === 'rescuer' ? 'rescuer' : 'survivor') as
                  'rescuer' | 'survivor',
                senderName:
                  m.senderName ||
                  (m.senderRole === 'rescuer' ? 'NDRF Tactical Team Alpha' : 'Survivor'),
                text: m.content,
                timestamp: new Date(m.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                target: 'rescuer' as const,
              }));
            if (newOnes.length > 0) {
              set({ rescuerMessages: [...current, ...newOnes] });
            }
          }
        }
      }
    } catch {
      // offline / mock mode
    }
  },

  syncClustersFromBackend: async () => {
    try {
      // Also check simulation peers to attach realistic individual member pins
      let simPeers: any[] = [];
      try {
        const pRes = await fetch('/v1/simulation/peers');
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData.active && Array.isArray(pData.peers)) {
            simPeers = pData.peers;
          }
        }
      } catch {}

      const res = await fetch('/v1/clusters');
      if (res.ok) {
        const clusters = await res.json();
        if (Array.isArray(clusters)) {
          if (clusters.length === 0 && simPeers.length === 0) {
            // Cleaned state - remove seeded clusters
            set(state => ({
              sosList: state.sosList.filter(
                s => !s.id.includes('ghat') && !s.notes?.includes('Relief Zone'),
              ),
            }));
          } else if (clusters.length > 0) {
            clusters.forEach((c: any) => {
              // Always cast to number — the mock DB may return string values from in-memory maps
              const lat = Number(c.centroid_lat ?? c.lat ?? 18.5204);
              const lon = Number(c.centroid_lon ?? c.lon ?? 73.8567);

              if (isNaN(lat) || isNaN(lon)) {
                console.warn(
                  '[RescueStore] Skipping cluster with invalid coordinates:',
                  c.id,
                  c.centroid_lat,
                  c.centroid_lon,
                );
                return;
              }

              const id = `SOS #${String(c.id).slice(-4)}`;
              const clusterName = c.name || `Sector ${String(c.id).slice(-4)}`;
              const isResolved = c.state === 'closed' || c.state === 'resolved';
              const isAssigned =
                c.state === 'assigned' ||
                c.state === 'en_route' ||
                c.state === 'reached' ||
                Boolean(c.assigned_team);
              const assignedTeam = c.assigned_team || null;

              // Preserve local assignment: if this incident is already locally marked Assigned,
              // keep it even if the backend still returns an old state
              const existingLocal = get().sosList.find(s => s.id === id);
              const preserveLocalAssignment =
                existingLocal?.status === 'Assigned' || existingLocal?.status === 'In Progress';

              const members: ClusterMember[] = [];
              if (
                c.id === 'cl_pune_ghats_01' ||
                (!c.id.includes('bridge') && !c.id.includes('hills') && !c.id.includes('market'))
              ) {
                members.push({
                  id: `surv-lead-${c.id}`,
                  name: 'Survivor Lead (Mobile)',
                  condition: 'Emergency SOS Broadcast Active',
                  distanceMeters: 0,
                  lat,
                  lon,
                  battery: 88,
                  emergencyNeeds: ['Rescue Extraction', 'Radio Relay'],
                });
                if (simPeers.length > 0) {
                  simPeers.forEach((p: any, idx: number) => {
                    members.push({
                      id: `sim-peer-${p.fp}`,
                      name: p.name || `Survivor Node #${p.fp.slice(0, 4)}`,
                      condition:
                        p.triage === 'RED'
                          ? 'Critical Trapped - Needs Extraction'
                          : 'Stable - Sheltered on Terrace',
                      distanceMeters: p.distanceMeters || (idx + 1) * 20,
                      lat: Number(p.lat),
                      lon: Number(p.lon),
                      battery: p.battery || 75,
                      emergencyNeeds: p.needs || ['Assistance'],
                    });
                  });
                }
              } else {
                const count = c.survivor_count || 3;
                for (let i = 0; i < count; i++) {
                  members.push({
                    id: `sim-${c.id}-${i}`,
                    name: `Survivor ${i + 1} (${clusterName.split(' ')[0]})`,
                    condition: isResolved
                      ? 'Safely evacuated to medical shelter'
                      : i === 0
                        ? 'Conscious, awaiting evacuation'
                        : 'Stable sheltered on roof',
                    distanceMeters: i * 18,
                    lat: +(lat + i * 0.00015).toFixed(6),
                    lon: +(lon + i * 0.00012).toFixed(6),
                    battery: Math.max(30, 85 - i * 12),
                    emergencyNeeds: isResolved ? ['Cleared'] : ['Water', 'Evacuation Assist'],
                  });
                }
              }

              // Deduplicate cluster if a primary cluster already exists within 35 meters
              const isDuplicateLocation = clusters.some(
                other =>
                  other.id === 'cl_pune_ghats_01' &&
                  c.id !== 'cl_pune_ghats_01' &&
                  Math.abs(Number(other.centroid_lat ?? other.lat) - lat) < 0.0006 &&
                  Math.abs(Number(other.centroid_lon ?? other.lon) - lon) < 0.0006,
              );
              if (isDuplicateLocation) return;

              get().addSosIncident({
                id,
                survivorName: `${clusterName} (${c.survivor_count || members.length} survivors)`,
                lat,
                lon,
                nearbyCount: members.length,
                urgency:
                  c.priority_score > 0.85
                    ? 'Emergency'
                    : c.priority_score > 0.6
                      ? 'Urgent'
                      : 'Stable',
                status: isResolved ? 'Resolved' : isAssigned ? 'Assigned' : 'Pending',
                assignedTeam: isResolved ? null : assignedTeam,
                acknowledged: isAssigned || isResolved,
                notes: `${clusterName} • ${members.length} survivors mesh connected`,
                clusterRadiusMeters: c.radius_m || 45,
                clusterMembers: members,
              });
            });
          }
        }
      }
    } catch {
      // offline / mock fallback
    }
  },

  seedSimulation: async () => {
    try {
      const res = await fetch('/v1/simulation/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await get().syncClustersFromBackend();
        await get().syncChatFromBackend();
      }
    } catch (e) {
      console.error('[RescueStore] seedSimulation failed:', e);
    }
  },

  cleanSimulation: async () => {
    try {
      await fetch('/v1/simulation/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      set(state => ({
        sosList: state.sosList.filter(
          s => !s.id.includes('ghat') && !s.notes?.includes('Relief Zone'),
        ),
        rescuerMessages: [],
        selectedSosId: null,
      }));
      await get().syncClustersFromBackend();
      await get().syncChatFromBackend();
    } catch (e) {
      console.error('[RescueStore] cleanSimulation failed:', e);
    }
  },

  simulateDisasterSos: (zoneName: string, lat: number, lon: number, peopleCount: number) => {
    const id = `SOS #${Math.floor(2000 + Math.random() * 8000)}`;
    const members: ClusterMember[] = Array.from({ length: peopleCount }).map((_, i) => ({
      id: `p-${Date.now()}-${i}`,
      name: i === 0 ? `Survivor Lead (${zoneName})` : `Survivor ${String.fromCharCode(65 + i)}`,
      condition:
        i === 0
          ? 'Urgent evacuation needed, water rising'
          : i === 1
            ? 'Mild trauma, conscious'
            : 'Safe on elevated platform',
      distanceMeters: i * 15,
      lat: +(lat + (Math.random() - 0.5) * 0.002).toFixed(6),
      lon: +(lon + (Math.random() - 0.5) * 0.002).toFixed(6),
      emergencyNeeds: i === 0 ? ['Boat', 'Medical Kit'] : ['Evacuation Assist'],
      battery: Math.floor(40 + Math.random() * 55),
    }));

    get().addSosIncident({
      id,
      survivorName: `${zoneName} Cluster (${peopleCount} survivors)`,
      lat,
      lon,
      nearbyCount: peopleCount,
      urgency: 'Emergency',
      timeReceived: 'Just now',
      status: 'Pending',
      notes: `Simulated live emergency SOS cluster in ${zoneName}. Coordinates: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E.`,
      clusterRadiusMeters: 35 + peopleCount * 5,
      clusterMembers: members,
    });

    // Also dispatch message over backend chat
    if (typeof window !== 'undefined') {
      fetch('/v1/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'cl_pune_ghats_01',
          senderFp: `sim_node_${Date.now()}`,
          senderName: `Survivor (${zoneName})`,
          senderRole: 'survivor',
          content: `🚨 SOS broadcast from ${zoneName}: ${peopleCount} survivors trapped. Immediate tactical assistance required at ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E!`,
        }),
      }).catch(() => {});
    }
  },

  addSosIncident: inc => {
    set(state => {
      const existing = state.sosList.find(s => s.id === inc.id);
      if (existing) {
        // Preserve local assignment if backend hasn't acknowledged it yet
        const mergedStatus =
          (existing.status === 'Assigned' || existing.status === 'In Progress') &&
          (inc.status === 'Pending' || inc.status === undefined)
            ? existing.status
            : (inc.status ?? existing.status);
        const mergedTeam =
          existing.assignedTeam && !inc.assignedTeam
            ? existing.assignedTeam
            : (inc.assignedTeam ?? existing.assignedTeam);

        return {
          sosList: state.sosList.map(s =>
            s.id === inc.id ? { ...s, ...inc, status: mergedStatus, assignedTeam: mergedTeam } : s,
          ),
        };
      }
      const full: SosIncident = {
        id: inc.id || `SOS #${Math.floor(1000 + Math.random() * 9000)}`,
        survivorName: inc.survivorName || 'Survivor (Emulator)',
        lat: Number(inc.lat ?? 18.5204),
        lon: Number(inc.lon ?? 73.8567),
        nearbyCount: inc.nearbyCount ?? 1,
        urgency: inc.urgency ?? 'Emergency',
        timeReceived: inc.timeReceived || 'Just now',
        status: inc.status ?? 'Pending',
        assignedTeam: inc.assignedTeam ?? null,
        acknowledged: inc.acknowledged ?? false,
        notes: inc.notes || 'Emergency SOS received via RescueNet APK uplink',
        clusterRadiusMeters: inc.clusterRadiusMeters ?? 25,
        clusterMembers: inc.clusterMembers || [
          {
            id: `p-${Date.now()}`,
            name: 'Survivor Node (Emulator)',
            condition: 'Live SOS beacon received via Backend Uplink',
            distanceMeters: 0,
            lat: Number(inc.lat ?? 18.5204),
            lon: Number(inc.lon ?? 73.8567),
            battery: 88,
            emergencyNeeds: ['Emergency Assistance'],
          },
        ],
      };
      return {
        sosList: [full, ...state.sosList],
        selectedSosId: full.id,
      };
    });
  },

  resetDemo: () => {
    set({
      currentRole: 'admin',
      adminNav: 'requests',
      rescuerNav: 'cases',
      sosList: INITIAL_SOS_LIST,
      teams: INITIAL_TEAMS,
      selectedSosId: null,
      selectedPersonId: null,
      rescuerLocation: { lat: 18.5235, lon: 73.8595 },
      navDistanceRemaining: 420,
      navEtaMinutes: 3,
      isNavigating: false,
      rescuerMessages: INITIAL_RESCUER_CHAT,
    });
  },
}));

// Automatic background chat and clusters polling for real-time synchronization
if (typeof window !== 'undefined') {
  setInterval(() => {
    useRescueStore
      .getState()
      .syncChatFromBackend()
      .catch(() => {});
    useRescueStore
      .getState()
      .syncClustersFromBackend()
      .catch(() => {});
  }, 2000);
}
