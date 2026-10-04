export interface RangeTestResult {
  pingsSent: number;
  pingsReceived: number;
  successRate: number; // 0 - 100%
  averageRssi: number; // e.g. -74 dBm
  estimatedDistanceMeters: number; // based on log-distance path loss
  status: 'idle' | 'testing' | 'completed' | 'failed';
}

export class BleRangeTester {
  /**
   * Estimates distance from RSSI and txPower (-59 dBm reference at 1m, path loss exponent n=2.5)
   */
  public static calculateDistance(
    rssi: number,
    txPowerAt1m: number = -59,
    n: number = 2.5,
  ): number {
    if (rssi === 0) return -1;
    const ratio = (txPowerAt1m - rssi) / (10 * n);
    return Math.round(Math.pow(10, ratio) * 10) / 10;
  }

  /**
   * Simulates a 2-phone range test handshake for Phase 4 validation.
   * (Wired directly to native BLE hardware in Phase 6/7)
   */
  public static async runTest(
    simulatedRssi: number = -76,
    pingCount: number = 5,
    onProgress?: (current: number, total: number) => void,
  ): Promise<RangeTestResult> {
    let received = 0;
    for (let i = 1; i <= pingCount; i++) {
      await new Promise(resolve => setTimeout(resolve, 80));
      // Simulate minor signal jitter
      const jitter = (Math.random() - 0.5) * 6;
      const currentRssi = simulatedRssi + jitter;
      if (currentRssi > -98) {
        received++;
      }
      if (onProgress) {
        onProgress(i, pingCount);
      }
    }

    const successRate = Math.round((received / pingCount) * 100);
    const estimatedDistanceMeters = BleRangeTester.calculateDistance(simulatedRssi);

    return {
      pingsSent: pingCount,
      pingsReceived: received,
      successRate,
      averageRssi: Math.round(simulatedRssi),
      estimatedDistanceMeters,
      status: successRate > 50 ? 'completed' : 'failed',
    };
  }
}
