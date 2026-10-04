import { useDashboardStore } from '../store/dashboardStore';
import { useAuthStore } from '../store/authStore';
import { useRescueStore } from '../store/rescueStore';

export type WsStatus = 'connected' | 'reconnecting' | 'offline';

class WebSocketManager {
  private socket: WebSocket | null = null;
  private reconnectTimer: any = null;
  private status: WsStatus = 'offline';
  private listeners: ((status: WsStatus) => void)[] = [];

  public getStatus(): WsStatus {
    return this.status;
  }

  public subscribeStatus(listener: (status: WsStatus) => void): () => void {
    this.listeners.push(listener);
    listener(this.status);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private setStatus(newStatus: WsStatus) {
    this.status = newStatus;
    this.listeners.forEach((l) => l(newStatus));
  }

  public connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    let token = useAuthStore.getState().token;
    if (!token && typeof window !== 'undefined') {
      fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dispatcher@rescuenet.gov.in', password: 'any' }),
      })
        .then((res) => res.json())
        .then((auth) => {
          if (auth.accessToken) {
            useAuthStore.getState().login('dispatcher@rescuenet.gov.in', 'dispatcher', auth.accessToken);
            this.connect();
          }
        })
        .catch(() => {});
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/v1/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    try {
      this.setStatus('reconnecting');
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.setStatus('connected');
        if (token) {
          this.socket?.send(JSON.stringify({ type: 'auth', token }));
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          useDashboardStore.getState().receiveWebSocketEvent(data);

          if (
            data.type === 'new_cluster' ||
            data.type === 'cluster_created' ||
            data.type === 'cluster_updated'
          ) {
            const clusterData = data.data || {};
            const clusterId = data.clusterId || `cl_${Date.now()}`;
            useRescueStore.getState().addSosIncident({
              id: `SOS #${String(clusterId).slice(-4)}`,
              survivorName: `Survivor (${clusterData.declared_people || 1} people)`,
              lat: clusterData.lat || 18.5204,
              lon: clusterData.lon || 73.8567,
              nearbyCount: clusterData.member_count || 1,
              urgency:
                clusterData.max_status === 3
                  ? 'Emergency'
                  : clusterData.max_status === 2
                  ? 'Urgent'
                  : 'Stable',
              timeReceived: 'Just now',
              status: 'Pending',
              notes: `Live emergency SOS received from Android Survivor App via Backend Uplink. Needs mask: ${
                clusterData.needs_mask || 1
              }`,
              clusterRadiusMeters: clusterData.radius_m || 25,
            });
          }

          if (data.type === 'chat_message' && data.data) {
            const chatPayload = data.data;
            const currentMessages = useRescueStore.getState().rescuerMessages;
            const alreadyExists = currentMessages.some((m) => m.id === chatPayload.id);
            if (!alreadyExists && chatPayload.content) {
              const newMsg = {
                id: chatPayload.id || `msg_${Date.now()}`,
                sender: (chatPayload.senderRole === 'rescuer' ? 'rescuer' : 'survivor') as 'rescuer' | 'survivor',
                senderName: chatPayload.senderName || (chatPayload.senderRole === 'rescuer' ? 'Rescue Team Alpha' : 'Survivor'),
                text: chatPayload.content,
                timestamp: new Date(chatPayload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                target: 'rescuer' as const,
              };
              useRescueStore.setState({ rescuerMessages: [...currentMessages, newMsg] });
            }
          }
        } catch {
          // malformed packet
        }
      };

      this.socket.onerror = () => {
        this.setStatus('offline');
      };

      this.socket.onclose = () => {
        this.setStatus('offline');
        this.scheduleReconnect();
      };
    } catch {
      this.setStatus('offline');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (useAuthStore.getState().isAuthenticated) {
        this.connect();
      }
    }, 5000);
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('offline');
  }

  /**
   * Dispatches a synthetic new critical cluster event.
   * Enables reproducible Playwright e2e tests & control-room simulation drills.
   */
  public simulateCriticalCluster(customData?: any): void {
    const payload = {
      type: 'new_cluster',
      clusterId: customData?.id || `cl_crit_${Date.now()}`,
      data: {
        lat: 18.5283,
        lon: 73.8492,
        radius_m: 25.0,
        member_count: 5,
        declared_people: 14,
        max_status: 3, // Critical
        needs_mask: 3, // Medical + Water
        best_battery: 79,
        floor_hint: 'Basement flood shelter under medical center',
        priority_score: 0.96,
        flags: ['large_group', 'water_rising'],
        ...customData,
      },
    };
    useDashboardStore.getState().receiveWebSocketEvent(payload);
  }
}

export const wsManager = new WebSocketManager();
