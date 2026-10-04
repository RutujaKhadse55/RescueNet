import { create } from 'zustand';
import {
  Cluster,
  ClusterState,
  Incident,
  Team,
  GatewayNode,
  OperationalStats,
  AuditLogEntry,
  PriorityWeightsConfig,
  SmsGatewayNumber,
  UndoAction,
  PriorityBand,
} from '../types/dashboard';
import {
  SEED_CLUSTERS,
  SEED_INCIDENTS,
  SEED_TEAMS,
  SEED_GATEWAYS,
  SEED_STATS,
  SEED_AUDIT_LOGS,
  SEED_SMS_NUMBERS,
  DEFAULT_PRIORITY_WEIGHTS,
} from '../api/seedData';
import { playCriticalClusterAlert, playDispatchChime } from '../utils/soundEffects';
import { useSettingsStore } from './settingsStore';

export interface DashboardState {
  incidents: Incident[];
  activeIncident: Incident;
  clusters: Cluster[];
  selectedClusterId: string | null;
  teams: Team[];
  gateways: GatewayNode[];
  stats: OperationalStats;
  auditLogs: AuditLogEntry[];
  priorityWeights: PriorityWeightsConfig;
  smsNumbers: SmsGatewayNumber[];
  activeNav: 'map' | 'teams' | 'metrics' | 'admin' | 'simulator';
  layerToggles: {
    teams: boolean;
    heatmap: boolean;
    boundary: boolean;
    gateways: boolean;
  };
  filterState: string;
  filterFlags: string[];
  filterNeeds: number;
  searchQuery: string;
  timeSliderMinutes: number; // 0 = live, > 0 = replay offset
  isReplayPlaying: boolean;
  criticalAlertFlash: boolean;
  undoAction: UndoAction | null;

  // Actions
  setActiveNav: (nav: 'map' | 'teams' | 'metrics' | 'admin' | 'simulator') => void;
  setActiveIncident: (incidentId: string) => void;
  selectCluster: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setFilterState: (st: string) => void;
  setFilterFlagToggle: (flag: string) => void;
  setFilterNeedsToggle: (mask: number) => void;
  setLayerToggle: (layer: keyof DashboardState['layerToggles'], enabled: boolean) => void;
  setTimeSliderMinutes: (mins: number) => void;
  toggleReplayPlaying: () => void;
  clearCriticalFlash: () => void;

  // Mutating Actions
  assignTeam: (clusterId: string, teamId: string, etaMinutes: number, userId?: string) => void;
  changeClusterState: (clusterId: string, state: ClusterState, reason?: string, userId?: string) => void;
  dispatchAck: (clusterId: string, ackType: string, etaMinutes: number, userId?: string) => void;
  addNote: (clusterId: string, noteText: string, userId?: string) => void;
  mergeClusters: (sourceId: string, targetId: string, userId?: string) => void;
  splitCluster: (clusterId: string, userId?: string) => void;
  requestSecondTeam: (clusterId: string, userId?: string) => void;
  updateTeamPosition: (teamId: string, lat: number, lon: number) => void;
  receiveWebSocketEvent: (event: any) => void;
  triggerUndo: () => void;
  clearUndo: () => void;

  // Admin Actions
  updatePriorityWeights: (weights: PriorityWeightsConfig) => void;
  purgeRetentionData: () => { purgedCount: number };
  addSmsNumber: (phone: string, provider: string) => void;
  removeSmsNumber: (id: string) => void;
  rotateCaKey: () => string;
}

const STORAGE_KEY_CLUSTERS = 'rescuenet_dashboard_clusters';

function safeSetStorage(key: string, val: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
    }
  } catch {
    // fallback
  }
}

function loadStoredClusters(): Cluster[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY_CLUSTERS) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return SEED_CLUSTERS;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  incidents: SEED_INCIDENTS,
  activeIncident: SEED_INCIDENTS[0]!,
  clusters: loadStoredClusters(),
  selectedClusterId: null,
  teams: SEED_TEAMS,
  gateways: SEED_GATEWAYS,
  stats: SEED_STATS,
  auditLogs: SEED_AUDIT_LOGS,
  priorityWeights: DEFAULT_PRIORITY_WEIGHTS,
  smsNumbers: SEED_SMS_NUMBERS,
  activeNav: 'map',
  layerToggles: {
    teams: true,
    heatmap: true,
    boundary: true,
    gateways: true,
  },
  filterState: 'all',
  filterFlags: [],
  filterNeeds: 0,
  searchQuery: '',
  timeSliderMinutes: 0,
  isReplayPlaying: false,
  criticalAlertFlash: false,
  undoAction: null,

  setActiveNav: (nav) => set({ activeNav: nav }),

  setActiveIncident: (incidentId) => {
    const inc = get().incidents.find((i) => i.id === incidentId);
    if (inc) {
      set({ activeIncident: inc, selectedClusterId: null });
    }
  },

  selectCluster: (id) => {
    set({ selectedClusterId: id });
    if (id) {
      // Audit log coordinate inspection
      const cl = get().clusters.find((c) => c.id === id);
      if (cl) {
        const entry: AuditLogEntry = {
          id: `aud_${Date.now()}`,
          action: 'view_precise_coordinates',
          target_type: 'cluster',
          target_id: id,
          user_id: 'current_user',
          user_name: 'Current Responder',
          user_role: 'dispatcher',
          client_ip: '127.0.0.1',
          metadata: { lat: cl.lat, lon: cl.lon, floor: cl.floor_hint },
          at: new Date().toISOString(),
        };
        set((state) => ({ auditLogs: [entry, ...state.auditLogs] }));
      }
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterState: (st) => set({ filterState: st }),

  setFilterFlagToggle: (flag) => {
    const current = get().filterFlags;
    const next = current.includes(flag) ? current.filter((f) => f !== flag) : [...current, flag];
    set({ filterFlags: next });
  },

  setFilterNeedsToggle: (mask) => {
    const current = get().filterNeeds;
    const next = (current & mask) !== 0 ? current & ~mask : current | mask;
    set({ filterNeeds: next });
  },

  setLayerToggle: (layer, enabled) => {
    set((state) => ({
      layerToggles: { ...state.layerToggles, [layer]: enabled },
    }));
  },

  setTimeSliderMinutes: (mins) => set({ timeSliderMinutes: mins }),

  toggleReplayPlaying: () => {
    set((state) => ({ isReplayPlaying: !state.isReplayPlaying }));
  },

  clearCriticalFlash: () => set({ criticalAlertFlash: false }),

  assignTeam: (clusterId, teamId, etaMinutes, userId) => {
    const team = get().teams.find((t) => t.id === teamId);
    const cluster = get().clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    const previousState = cluster.state;
    const previousTeamId = cluster.assigned_team_id;

    const updatedClusters = get().clusters.map((c) => {
      if (c.id === clusterId) {
        return {
          ...c,
          state: 'assigned' as ClusterState,
          assigned_team_id: teamId,
          assigned_team_name: team ? team.name : 'Tactical Team',
          eta_minutes: etaMinutes,
          timeline: [
            ...(c.timeline || []),
            {
              id: `evt_${Date.now()}`,
              cluster_id: clusterId,
              event_type: 'team_assigned' as const,
              actor_name: 'Control Room Dispatcher',
              notes: `Assigned to ${team ? team.name : teamId} (ETA ${etaMinutes}m)`,
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return c;
    });

    const updatedTeams = get().teams.map((t) => {
      if (t.id === teamId) {
        return {
          ...t,
          status: 'assigned' as const,
          assigned_clusters: Array.from(new Set([...t.assigned_clusters, clusterId])),
        };
      }
      return t;
    });

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'assign_team',
      target_type: 'cluster',
      target_id: clusterId,
      user_id: userId || 'dispatcher',
      user_name: 'Control Room Dispatcher',
      user_role: 'dispatcher',
      client_ip: '127.0.0.1',
      metadata: { teamId, etaMinutes },
      at: new Date().toISOString(),
    };

    const undo: UndoAction = {
      id: `undo_${Date.now()}`,
      type: 'assign_team',
      clusterId,
      previousState,
      previousTeamId,
      description: `Assigned ${team?.name || 'team'} (ETA ${etaMinutes}m)`,
      expiresAt: Date.now() + 10000,
    };

    set({
      clusters: updatedClusters,
      teams: updatedTeams,
      auditLogs: [auditEntry, ...get().auditLogs],
      undoAction: undo,
    });

    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
    if (useSettingsStore.getState().soundEnabled) {
      playDispatchChime();
    }
  },

  changeClusterState: (clusterId, newState, reason, userId) => {
    const cluster = get().clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    const previousState = cluster.state;

    const updatedClusters = get().clusters.map((c) => {
      if (c.id === clusterId) {
        return {
          ...c,
          state: newState,
          false_alarm_reason: newState === 'false_alarm' ? reason : c.false_alarm_reason,
          timeline: [
            ...(c.timeline || []),
            {
              id: `evt_${Date.now()}`,
              cluster_id: clusterId,
              event_type: newState === 'false_alarm' ? ('false_alarm' as const) : ('state_changed' as const),
              actor_name: 'Duty Officer',
              notes:
                newState === 'false_alarm'
                  ? `Flagged False Alarm: ${reason}`
                  : `Triage state updated to ${newState}`,
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return c;
    });

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: newState === 'false_alarm' ? 'mark_false_alarm' : 'change_state',
      target_type: 'cluster',
      target_id: clusterId,
      user_id: userId || 'dispatcher',
      user_name: 'Duty Officer',
      user_role: 'dispatcher',
      client_ip: '127.0.0.1',
      metadata: { newState, reason },
      at: new Date().toISOString(),
    };

    const undo: UndoAction = {
      id: `undo_${Date.now()}`,
      type: 'state_change',
      clusterId,
      previousState,
      description: `Cluster state set to ${newState.toUpperCase()}`,
      expiresAt: Date.now() + 10000,
    };

    set({
      clusters: updatedClusters,
      auditLogs: [auditEntry, ...get().auditLogs],
      undoAction: undo,
    });

    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
    if (useSettingsStore.getState().soundEnabled) {
      playDispatchChime();
    }
  },

  dispatchAck: (clusterId, ackType, etaMinutes, userId) => {
    const cluster = get().clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    const previousState = cluster.state;

    const updatedClusters = get().clusters.map((c) => {
      if (c.id === clusterId) {
        return {
          ...c,
          timeline: [
            ...(c.timeline || []),
            {
              id: `evt_${Date.now()}`,
              cluster_id: clusterId,
              event_type: 'ack_sent' as const,
              actor_name: 'Control Room Dispatcher',
              notes: `Dispatched signed ACK template "${ackType}" with ${etaMinutes}m ETA via BLE mesh and SMS.`,
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return c;
    });

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'dispatch_ack',
      target_type: 'cluster',
      target_id: clusterId,
      user_id: userId || 'dispatcher',
      user_name: 'Control Room Dispatcher',
      user_role: 'dispatcher',
      client_ip: '127.0.0.1',
      metadata: { ackType, etaMinutes },
      at: new Date().toISOString(),
    };

    const undo: UndoAction = {
      id: `undo_${Date.now()}`,
      type: 'send_ack',
      clusterId,
      previousState,
      description: `Dispatched ACK template "${ackType}" (${etaMinutes}m ETA)`,
      expiresAt: Date.now() + 10000,
    };

    set({
      clusters: updatedClusters,
      auditLogs: [auditEntry, ...get().auditLogs],
      undoAction: undo,
    });

    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
    if (useSettingsStore.getState().soundEnabled) {
      playDispatchChime();
    }
  },

  addNote: (clusterId, noteText, userId) => {
    const updatedClusters = get().clusters.map((c) => {
      if (c.id === clusterId) {
        return {
          ...c,
          notes: [...(c.notes || []), noteText],
          timeline: [
            ...(c.timeline || []),
            {
              id: `evt_${Date.now()}`,
              cluster_id: clusterId,
              event_type: 'note_added' as const,
              actor_name: 'Responder',
              notes: noteText,
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return c;
    });

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'add_note',
      target_type: 'cluster',
      target_id: clusterId,
      user_id: userId || 'rescuer',
      client_ip: '127.0.0.1',
      metadata: { note: noteText },
      at: new Date().toISOString(),
    };

    set({
      clusters: updatedClusters,
      auditLogs: [auditEntry, ...get().auditLogs],
    });
    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
  },

  mergeClusters: (sourceId, targetId, userId) => {
    const updatedClusters = get().clusters.map((c) => {
      if (c.id === sourceId) {
        return {
          ...c,
          state: 'closed' as ClusterState,
          merged_into: targetId,
          timeline: [
            ...(c.timeline || []),
            {
              id: `evt_${Date.now()}`,
              cluster_id: sourceId,
              event_type: 'merged' as const,
              actor_name: 'Control Room Dispatcher',
              notes: `Merged into survivor cluster ${targetId}`,
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return c;
    });

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'merge_clusters',
      target_type: 'cluster',
      target_id: sourceId,
      user_id: userId || 'dispatcher',
      client_ip: '127.0.0.1',
      metadata: { mergedInto: targetId },
      at: new Date().toISOString(),
    };

    set({
      clusters: updatedClusters,
      auditLogs: [auditEntry, ...get().auditLogs],
    });
    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
  },

  splitCluster: (clusterId, userId) => {
    const cluster = get().clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    const newSubCluster: Cluster = {
      ...cluster,
      id: `split_${Date.now()}`,
      declared_people: Math.ceil(cluster.declared_people / 2),
      member_count: Math.ceil(cluster.member_count / 2),
      lat: cluster.lat + 0.0015,
      lon: cluster.lon + 0.0015,
      radius_m: 20,
      notes: [`Split division from parent cluster ${cluster.id}`],
      timeline: [
        {
          id: `evt_${Date.now()}`,
          cluster_id: `split_${Date.now()}`,
          event_type: 'created' as const,
          notes: `Split sub-cluster created from parent ${cluster.id}`,
          created_at: new Date().toISOString(),
        },
      ],
    };

    const updatedClusters = [
      ...get().clusters.map((c) =>
        c.id === clusterId
          ? {
              ...c,
              declared_people: Math.floor(c.declared_people / 2),
              member_count: Math.floor(c.member_count / 2),
            }
          : c
      ),
      newSubCluster,
    ];

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'split_cluster',
      target_type: 'cluster',
      target_id: clusterId,
      user_id: userId || 'dispatcher',
      client_ip: '127.0.0.1',
      metadata: { newSubClusterId: newSubCluster.id },
      at: new Date().toISOString(),
    };

    set({
      clusters: updatedClusters,
      auditLogs: [auditEntry, ...get().auditLogs],
    });
    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
  },

  requestSecondTeam: (clusterId, userId) => {
    const updatedClusters = get().clusters.map((c) => {
      if (c.id === clusterId) {
        return {
          ...c,
          flags: Array.from(new Set([...c.flags, 'second_team_requested'])),
          notes: [...(c.notes || []), 'Second tactical team requested due to group scale (>10 survivors).'],
          timeline: [
            ...(c.timeline || []),
            {
              id: `evt_${Date.now()}`,
              cluster_id: clusterId,
              event_type: 'state_changed' as const,
              actor_name: 'Duty Officer',
              notes: 'Second rescue squad requested.',
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return c;
    });

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'request_second_team',
      target_type: 'cluster',
      target_id: clusterId,
      user_id: userId || 'dispatcher',
      client_ip: '127.0.0.1',
      metadata: { reason: 'Survivor group size > 10' },
      at: new Date().toISOString(),
    };

    set({
      clusters: updatedClusters,
      auditLogs: [auditEntry, ...get().auditLogs],
    });
    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
  },

  updateTeamPosition: (teamId, lat, lon) => {
    const updatedTeams = get().teams.map((t) => {
      if (t.id === teamId) {
        return {
          ...t,
          lat,
          lon,
          last_position_at: new Date().toISOString(),
        };
      }
      return t;
    });
    set({ teams: updatedTeams });
  },

  receiveWebSocketEvent: (event) => {
    if (!event || !event.type) return;

    if (event.type === 'new_cluster' || event.type === 'cluster_created') {
      const newCluster: Cluster = {
        id: event.clusterId || `cl_ws_${Date.now()}`,
        incident_id: get().activeIncident.id,
        lat: event.data?.lat || 18.528,
        lon: event.data?.lon || 73.851,
        radius_m: event.data?.radius_m || 30.0,
        member_count: event.data?.member_count || 4,
        declared_people: event.data?.declared_people || 9,
        max_status: event.data?.max_status !== undefined ? event.data.max_status : 3, // Critical
        needs_mask: event.data?.needs_mask || 3,
        best_battery: event.data?.best_battery || 78,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        floor_hint: event.data?.floor_hint || 'Flood shelter staging ground',
        trust_score: event.data?.trust_score || 0.94,
        priority_score: event.data?.priority_score || 0.92,
        priority_band: 'critical' as PriorityBand,
        flags: event.data?.flags || ['large_group', 'water_rising'],
        state: 'new' as ClusterState,
        members: event.data?.members || [],
        timeline: [
          {
            id: `evt_${Date.now()}`,
            cluster_id: event.clusterId || `cl_ws_${Date.now()}`,
            event_type: 'created',
            notes: 'Live telemetry received via WebSocket mesh gateway sync.',
            created_at: new Date().toISOString(),
          },
        ],
      };

      const updated = [newCluster, ...get().clusters];
      set({
        clusters: updated,
        criticalAlertFlash: true,
      });
      safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updated));

      if (useSettingsStore.getState().soundEnabled) {
        playCriticalClusterAlert();
      }
    } else if (event.type === 'state_changed') {
      const updated = get().clusters.map((c) => {
        if (c.id === event.clusterId) {
          return {
            ...c,
            state: event.data?.state || c.state,
            assigned_team_id: event.data?.teamId || c.assigned_team_id,
            eta_minutes: event.data?.etaMinutes || c.eta_minutes,
          };
        }
        return c;
      });
      set({ clusters: updated });
      safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updated));
    }
  },

  triggerUndo: () => {
    const { undoAction, clusters, teams } = get();
    if (!undoAction) return;

    if (Date.now() > undoAction.expiresAt) {
      set({ undoAction: null });
      return;
    }

    const updatedClusters = clusters.map((c) => {
      if (c.id === undoAction.clusterId) {
        return {
          ...c,
          state: undoAction.previousState,
          assigned_team_id: undoAction.previousTeamId ?? null,
          assigned_team_name: undoAction.previousTeamId ? c.assigned_team_name : null,
          timeline: [
            ...(c.timeline || []),
            {
              id: `evt_${Date.now()}`,
              cluster_id: c.id,
              event_type: 'state_changed' as const,
              actor_name: 'Human Undo',
              notes: `Action undone: restored to previous state ${undoAction.previousState}`,
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return c;
    });

    const updatedTeams = teams.map((t) => {
      if (undoAction.previousTeamId && t.id === undoAction.previousTeamId) {
        return t;
      }
      return {
        ...t,
        assigned_clusters: t.assigned_clusters.filter((id) => id !== undoAction.clusterId),
      };
    });

    set({
      clusters: updatedClusters,
      teams: updatedTeams,
      undoAction: null,
    });
    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(updatedClusters));
  },

  clearUndo: () => set({ undoAction: null }),

  updatePriorityWeights: (weights) => {
    set({ priorityWeights: weights });
  },

  purgeRetentionData: () => {
    const now = Date.now();
    const thresholdMs = 14 * 24 * 3600 * 1000; // 14 days
    const beforeCount = get().clusters.length;
    const filtered = get().clusters.filter((c) => {
      const age = now - new Date(c.last_seen).getTime();
      return age < thresholdMs || c.state !== 'closed';
    });

    const purgedCount = beforeCount - filtered.length;
    set({ clusters: filtered });
    safeSetStorage(STORAGE_KEY_CLUSTERS, JSON.stringify(filtered));

    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'manual_data_purge',
      target_type: 'system',
      target_id: null,
      user_id: 'admin',
      client_ip: '127.0.0.1',
      metadata: { purgedRecords: purgedCount, retentionPolicy: '14_days' },
      at: new Date().toISOString(),
    };
    set((state) => ({ auditLogs: [auditEntry, ...state.auditLogs] }));

    return { purgedCount };
  },

  addSmsNumber: (phone, provider) => {
    const newNumber: SmsGatewayNumber = {
      id: `sms_${Date.now()}`,
      phone_number: phone,
      provider,
      active: true,
      created_at: new Date().toISOString(),
    };
    set((state) => ({ smsNumbers: [...state.smsNumbers, newNumber] }));
  },

  removeSmsNumber: (id) => {
    set((state) => ({
      smsNumbers: state.smsNumbers.filter((n) => n.id !== id),
    }));
  },

  rotateCaKey: () => {
    const newKey = `MCowBQYDK2VwAyEA${Math.random().toString(36).substring(2, 15)}RotatedCaKey2026=`;
    const auditEntry: AuditLogEntry = {
      id: `aud_${Date.now()}`,
      action: 'rotate_ca_key',
      target_type: 'agency',
      target_id: '11111111-1111-1111-1111-111111111111',
      user_id: 'admin',
      client_ip: '127.0.0.1',
      metadata: { newCaKeyFingerprint: newKey.slice(0, 16) },
      at: new Date().toISOString(),
    };
    set((state) => ({ auditLogs: [auditEntry, ...state.auditLogs] }));
    return newKey;
  },
}));
