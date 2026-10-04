import { SimulationNetwork } from '../src/index';
import { PROTOCOL_VERSION } from '@rescuenet/core';

describe('packages/sim foundation', () => {
  it('should initialize simulation topology correctly', () => {
    const sim = new SimulationNetwork({
      nodeCount: 200,
      areaWidthMeters: 1000,
      areaHeightMeters: 1000,
      packetLossRate: 0.05,
      gatewayCount: 5,
    });

    expect(sim.getNodeCount()).toBe(200);
    expect(sim.getGateways().length).toBe(5);

    const summary = sim.getSummary();
    expect(summary.version).toBe(PROTOCOL_VERSION);
    expect(summary.totalNodes).toBe(200);
  });
});
