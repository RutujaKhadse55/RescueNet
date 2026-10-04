/**
 * RescueNet Homing & Final Approach Signal Processing (Phase 13)
 * Provides 1D Kalman filtering and moving average RSSI smoothing for BLE beacons.
 * Computes relative directional trends (Warmer / Colder / Steady), signal bars,
 * and audio/haptic pulse intervals for responders navigating to survivors.
 */

export type HomingTrend = 'warmer' | 'colder' | 'steady';

export interface HomingSignalState {
  rawRssi: number;
  smoothedRssi: number;
  trend: HomingTrend;
  signalBars: number; // 0 to 5 bars
  pulseIntervalMs: number; // Audio/haptic pulse frequency in ms (100ms = urgent/close, 1200ms = distant)
  sampleCount: number;
  lastUpdated: number; // Unix timestamp ms
}

/**
 * 1-Dimensional Kalman Filter optimized for noisy RF RSSI measurements.
 */
export class KalmanRssiFilter {
  private x: number; // State estimate (smoothed RSSI)
  private p: number; // Estimation error covariance
  private q: number; // Process noise covariance (inherent signal fluctuation)
  private r: number; // Measurement noise covariance (BLE multipath/shadowing noise)
  private initialized: boolean = false;

  constructor(processNoise: number = 0.12, measurementNoise: number = 3.5) {
    this.x = -85;
    this.p = 1.0;
    this.q = processNoise;
    this.r = measurementNoise;
  }

  public update(measurement: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }

    // 1. Time Update (Prediction)
    this.p = this.p + this.q;

    // 2. Measurement Update (Correction)
    const k = this.p / (this.p + this.r); // Kalman Gain
    this.x = this.x + k * (measurement - this.x);
    this.p = (1 - k) * this.p;

    return this.x;
  }

  public getEstimate(): number {
    return this.x;
  }

  public reset(initialVal?: number): void {
    this.initialized = false;
    this.p = 1.0;
    if (initialVal !== undefined) {
      this.x = initialVal;
      this.initialized = true;
    }
  }
}

/**
 * 5-8 Second Moving Average Window for robust trend comparison
 */
export class MovingAverageRssiFilter {
  private windowSize: number;
  private samples: { rssi: number; time: number }[] = [];

  constructor(windowSeconds: number = 6) {
    this.windowSize = windowSeconds * 1000;
  }

  public addSample(rssi: number, timeMs: number = Date.now()): number {
    this.samples.push({ rssi, time: timeMs });
    // Remove expired samples
    const cutoff = timeMs - this.windowSize;
    this.samples = this.samples.filter((s) => s.time >= cutoff);

    const sum = this.samples.reduce((acc, s) => acc + s.rssi, 0);
    return sum / (this.samples.length || 1);
  }

  public getAverage(): number {
    if (this.samples.length === 0) return -100;
    const sum = this.samples.reduce((acc, s) => acc + s.rssi, 0);
    return sum / this.samples.length;
  }

  public clear(): void {
    this.samples = [];
  }
}

/**
 * HomingEngine coordinates Kalman smoothing, moving-average trends,
 * signal bar discretization, and audio/haptic pulse rates.
 */
export class HomingEngine {
  private kalman: KalmanRssiFilter;
  private movingAvg: MovingAverageRssiFilter;
  private previousBaselineRssi: number | null = null;
  private sampleCounter: number = 0;
  private lastState: HomingSignalState;

  constructor() {
    this.kalman = new KalmanRssiFilter(0.15, 3.0);
    this.movingAvg = new MovingAverageRssiFilter(6);
    this.lastState = {
      rawRssi: -100,
      smoothedRssi: -100,
      trend: 'steady',
      signalBars: 0,
      pulseIntervalMs: 1200,
      sampleCount: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Processes a newly scanned BLE RSSI reading from the target beacon.
   */
  public processRssi(rawRssi: number, timestampMs: number = Date.now()): HomingSignalState {
    this.sampleCounter++;

    // 1. Smooth measurement via Kalman filter
    const smoothed = this.kalman.update(rawRssi);

    // 2. Feed moving average for trend comparison
    const windowAvg = this.movingAvg.addSample(smoothed, timestampMs);

    // 3. Compute directional trend (Warmer / Colder / Steady)
    let trend: HomingTrend = 'steady';
    if (this.previousBaselineRssi === null) {
      this.previousBaselineRssi = windowAvg;
    } else {
      const delta = windowAvg - this.previousBaselineRssi;
      const TREND_THRESHOLD = 1.5; // dBm threshold

      if (delta >= TREND_THRESHOLD) {
        trend = 'warmer';
      } else if (delta <= -TREND_THRESHOLD) {
        trend = 'colder';
      } else {
        trend = 'steady';
      }

      // Slowly adapt baseline (leaky integrator)
      this.previousBaselineRssi = this.previousBaselineRssi * 0.85 + windowAvg * 0.15;
    }

    // 4. Compute signal strength bars (0 to 5)
    // -50 dBm or stronger: 5 bars (within 1-2m range)
    // -95 dBm or weaker: 0 bars (threshold of detection)
    let signalBars = 0;
    if (smoothed >= -55) signalBars = 5;
    else if (smoothed >= -68) signalBars = 4;
    else if (smoothed >= -78) signalBars = 3;
    else if (smoothed >= -88) signalBars = 2;
    else if (smoothed >= -96) signalBars = 1;
    else signalBars = 0;

    // 5. Compute audio/haptic pulse interval
    // Interval scales smoothly from 1200ms (at -96 dBm) down to 100ms (at -45 dBm)
    const clampedRssi = Math.min(-45, Math.max(-96, smoothed));
    const normalized = (clampedRssi - (-96)) / (-45 - (-96)); // 0.0 (weak) to 1.0 (strong)
    const pulseIntervalMs = Math.round(1200 - normalized * 1100); // 1200ms -> 100ms

    this.lastState = {
      rawRssi,
      smoothedRssi: Math.round(smoothed * 10) / 10,
      trend,
      signalBars,
      pulseIntervalMs,
      sampleCount: this.sampleCounter,
      lastUpdated: timestampMs,
    };

    return this.lastState;
  }

  public getState(): HomingSignalState {
    return this.lastState;
  }

  public reset(): void {
    this.kalman.reset();
    this.movingAvg.clear();
    this.previousBaselineRssi = null;
    this.sampleCounter = 0;
    this.lastState = {
      rawRssi: -100,
      smoothedRssi: -100,
      trend: 'steady',
      signalBars: 0,
      pulseIntervalMs: 1200,
      sampleCount: 0,
      lastUpdated: Date.now(),
    };
  }
}
