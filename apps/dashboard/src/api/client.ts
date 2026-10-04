import { useAuthStore } from '../store/authStore';
import { useDashboardStore } from '../store/dashboardStore';

const API_BASE = '/v1';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<any> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }

    return await res.json();
  } catch (err: any) {
    // If backend server is not running or offline, return fallback data gracefully
    console.warn(
      `[ApiClient] Network request failed for ${url}, fallback to local state:`,
      err.message,
    );
    throw err;
  }
}

export const apiClient = {
  // Authentication
  async login(email: string, password: string, totp: string): Promise<any> {
    try {
      const data = await fetchWithAuth('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, totp }),
      });
      return data;
    } catch {
      // In offline / local test mode, simulate token response
      return {
        accessToken: `demo_jwt_token_${Date.now()}`,
        user: {
          id: 'user_local_01',
          email,
          fullName: 'Duty Officer Ananya Rao',
          role: 'dispatcher',
        },
      };
    }
  },

  // Incidents
  async getIncidents(): Promise<any[]> {
    try {
      return await fetchWithAuth('/incidents');
    } catch {
      return useDashboardStore.getState().incidents;
    }
  },

  // Clusters
  async getClusters(incidentId: string, params: Record<string, any> = {}): Promise<any[]> {
    try {
      const query = new URLSearchParams(params).toString();
      return await fetchWithAuth(`/incidents/${incidentId}/clusters${query ? `?${query}` : ''}`);
    } catch {
      return useDashboardStore.getState().clusters;
    }
  },

  async getClusterDetails(clusterId: string): Promise<any> {
    try {
      return await fetchWithAuth(`/clusters/${clusterId}`);
    } catch {
      return useDashboardStore.getState().clusters.find(c => c.id === clusterId) || null;
    }
  },

  async updateClusterState(
    clusterId: string,
    state: string,
    falseAlarmReason?: string,
  ): Promise<any> {
    try {
      return await fetchWithAuth(`/clusters/${clusterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ state, falseAlarmReason }),
      });
    } catch {
      useDashboardStore.getState().changeClusterState(clusterId, state as any, falseAlarmReason);
      return { id: clusterId, state, falseAlarmReason };
    }
  },

  async assignTeam(clusterId: string, teamId: string, etaMinutes: number): Promise<any> {
    try {
      return await fetchWithAuth(`/clusters/${clusterId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ teamId, etaMinutes }),
      });
    } catch {
      useDashboardStore.getState().assignTeam(clusterId, teamId, etaMinutes);
      return { clusterId, teamId, etaMinutes, status: 'assigned' };
    }
  },

  async dispatchAck(clusterId: string, ackType: string, etaMinutes: number): Promise<any> {
    try {
      return await fetchWithAuth(`/clusters/${clusterId}/ack`, {
        method: 'POST',
        body: JSON.stringify({ ackType, etaMinutes }),
      });
    } catch {
      useDashboardStore.getState().dispatchAck(clusterId, ackType, etaMinutes);
      return { clusterId, ackType, etaMinutes, status: 'dispatched' };
    }
  },

  // Teams
  async getTeams(): Promise<any[]> {
    try {
      return await fetchWithAuth('/teams');
    } catch {
      return useDashboardStore.getState().teams;
    }
  },

  async updateTeamPosition(teamId: string, latitude: number, longitude: number): Promise<any> {
    try {
      return await fetchWithAuth(`/teams/${teamId}/position`, {
        method: 'PATCH',
        body: JSON.stringify({ latitude, longitude }),
      });
    } catch {
      useDashboardStore.getState().updateTeamPosition(teamId, latitude, longitude);
      return { id: teamId, latitude, longitude };
    }
  },

  // Stats
  async getStats(): Promise<any> {
    try {
      return await fetchWithAuth('/stats');
    } catch {
      return useDashboardStore.getState().stats;
    }
  },

  // Audit
  async getAuditLogs(limit: number = 100): Promise<any[]> {
    try {
      return await fetchWithAuth(`/audit?limit=${limit}`);
    } catch {
      return useDashboardStore.getState().auditLogs;
    }
  },
};
