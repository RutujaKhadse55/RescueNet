/**
 * RescueNet Simulation CSV Exporter (Phase 15)
 */

import * as fs from 'fs';
import * as path from 'path';
import { AggregatedMetrics, RunMetrics } from '../models/types';

export class CsvExporter {
  public static exportRunMetrics(filePath: string, runs: RunMetrics[]): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const headers = [
      'strategy',
      'seed',
      'total_generated',
      'delivered_to_gateway',
      'delivery_rate_percent',
      'latency_median_sec',
      'latency_p95_sec',
      'total_transmissions',
      'total_bytes_sent_mb',
      'avg_battery_drain_percent',
      'duplicate_deliveries_at_gateway',
      'time_to_first_cluster_sec',
    ].join(',');

    const rows = runs.map((r) =>
      [
        r.strategy,
        r.seed,
        r.totalGenerated,
        r.deliveredToGateway,
        r.deliveryRatePercent,
        r.deliveryLatencyMedianSec,
        r.deliveryLatencyP95Sec,
        r.totalTransmissions,
        r.totalBytesSentMb,
        r.avgBatteryDrainPercent,
        r.duplicateDeliveriesAtGateway,
        r.timeToFirstClusterSec,
      ].join(',')
    );

    fs.writeFileSync(filePath, [headers, ...rows].join('\n'), 'utf8');
  }

  public static exportAggregatedMetrics(filePath: string, summaries: AggregatedMetrics[]): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const headers = [
      'strategy',
      'runs',
      'delivery_rate_mean',
      'delivery_rate_ci95',
      'latency_median_mean',
      'latency_median_ci95',
      'latency_p95_mean',
      'latency_p95_ci95',
      'transmissions_mean',
      'transmissions_ci95',
      'bytes_sent_mb_mean',
      'bytes_sent_mb_ci95',
      'battery_drain_pct_mean',
      'battery_drain_pct_ci95',
      'duplicates_mean',
      'duplicates_ci95',
      'time_to_first_cluster_mean',
      'time_to_first_cluster_ci95',
    ].join(',');

    const rows = summaries.map((s) =>
      [
        s.strategy,
        s.runs,
        s.deliveryRate.mean,
        s.deliveryRate.ci95,
        s.latencyMedian.mean,
        s.latencyMedian.ci95,
        s.latencyP95.mean,
        s.latencyP95.ci95,
        s.transmissions.mean,
        s.transmissions.ci95,
        s.bytesSentMb.mean,
        s.bytesSentMb.ci95,
        s.batteryDrainPercent.mean,
        s.batteryDrainPercent.ci95,
        s.duplicateDeliveries.mean,
        s.duplicateDeliveries.ci95,
        s.timeToFirstCluster.mean,
        s.timeToFirstCluster.ci95,
      ].join(',')
    );

    fs.writeFileSync(filePath, [headers, ...rows].join('\n'), 'utf8');
  }
}
