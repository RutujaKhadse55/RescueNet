/**
 * RescueNet Simulation Engine
 * Simulates BLE mesh propagation, packet loss, and battery drain across 200 to 1,000 nodes.
 */

import { PROTOCOL_VERSION, PacketType } from '@rescuenet/core';

export interface SimNodeConfig {
  id: string;
  x: number;
  y: number;
  batteryLevel: number;
  isGateway: boolean;
  isRescuer: boolean;
  bleRangeMeters: number;
}

export interface SimTopologyConfig {
  nodeCount: number;
  areaWidthMeters: number;
  areaHeightMeters: number;
  packetLossRate: number;
  gatewayCount: number;
}

export class SimulationNetwork {
  private nodes: Map<string, SimNodeConfig> = new Map();

  constructor(public readonly config: SimTopologyConfig) {
    this.initializeTopology();
  }

  private initializeTopology(): void {
    for (let i = 0; i < this.config.nodeCount; i++) {
      const isGateway = i < this.config.gatewayCount;
      const node: SimNodeConfig = {
        id: `node_${i.toString().padStart(4, '0')}`,
        x: Math.random() * this.config.areaWidthMeters,
        y: Math.random() * this.config.areaHeightMeters,
        batteryLevel: 100,
        isGateway,
        isRescuer: false,
        bleRangeMeters: 50,
      };
      this.nodes.set(node.id, node);
    }
  }

  public getNodeCount(): number {
    return this.nodes.size;
  }

  public getGateways(): SimNodeConfig[] {
    return Array.from(this.nodes.values()).filter(n => n.isGateway);
  }

  public getSummary() {
    return {
      version: PROTOCOL_VERSION,
      supportedPacketTypes: Object.keys(PacketType),
      totalNodes: this.nodes.size,
      gateways: this.getGateways().length,
      lossRate: this.config.packetLossRate,
    };
  }
}

export * from './models/types';
export * from './models/radio';
export * from './models/mobility';
export * from './models/battery';
export * from './strategies';
export * from './simulator';
export * from './exporters/csv';
export * from './exporters/charts';

