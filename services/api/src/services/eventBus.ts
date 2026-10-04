import { EventEmitter } from 'events';

export interface ClusterEventPayload {
  type: 'cluster_created' | 'cluster_updated' | 'state_changed' | 'ack_delivery';
  clusterId: string;
  data: Record<string, any>;
  timestamp: string;
}

class EventBus extends EventEmitter {
  public broadcastClusterEvent(payload: ClusterEventPayload): void {
    this.emit('cluster_event', payload);
  }
}

export const eventBus = new EventBus();
