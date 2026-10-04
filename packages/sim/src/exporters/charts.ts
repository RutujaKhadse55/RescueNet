/**
 * RescueNet Simulation Chart Generator (Phase 15)
 * Generates standalone SVG charts for visual inspection and inclusion in reports.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AggregatedMetrics } from '../models/types';

export class ChartGenerator {
  /**
   * Generates headline SVG chart: Message Volume / Transmissions Comparison
   */
  public static generateVolumeChart(filePath: string, summaries: AggregatedMetrics[]): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const width = 800;
    const height = 450;
    const barWidth = 120;
    const spacing = 50;
    const startX = 100;
    const baseY = 360;

    const maxTx = Math.max(...summaries.map(s => s.transmissions.mean + s.transmissions.ci95), 100);
    const scale = 260 / maxTx;

    const colors: Record<string, string> = {
      plain_flooding: '#EF4444',
      epidemic_ttl: '#F59E0B',
      spray_and_wait: '#3B82F6',
      rescuenet_full: '#10B981',
    };

    const labels: Record<string, string> = {
      plain_flooding: 'Plain Flooding',
      epidemic_ttl: 'Epidemic TTL=5',
      spray_and_wait: 'Spray & Wait',
      rescuenet_full: 'RescueNet Full',
    };

    let barsSvg = '';
    summaries.forEach((s, idx) => {
      const x = startX + idx * (barWidth + spacing);
      const barH = s.transmissions.mean * scale;
      const y = baseY - barH;
      const color = colors[s.strategy] || '#6B7280';
      const label = labels[s.strategy] || s.strategy;

      // Error bar (95% CI)
      const errH = s.transmissions.ci95 * scale;
      const topErr = y - errH;
      const botErr = y + errH;

      barsSvg += `
        <!-- Bar: ${label} -->
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="6" fill="${color}" opacity="0.9" />
        <text x="${x + barWidth / 2}" y="${y - 12}" fill="#F8FAFC" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">
          ${Math.round(s.transmissions.mean).toLocaleString()}
        </text>
        <!-- Error Bar -->
        <line x1="${x + barWidth / 2}" y1="${topErr}" x2="${x + barWidth / 2}" y2="${botErr}" stroke="#FFFFFF" stroke-width="2" />
        <line x1="${x + barWidth / 2 - 8}" y1="${topErr}" x2="${x + barWidth / 2 + 8}" y2="${topErr}" stroke="#FFFFFF" stroke-width="2" />
        <line x1="${x + barWidth / 2 - 8}" y1="${botErr}" x2="${x + barWidth / 2 + 8}" y2="${botErr}" stroke="#FFFFFF" stroke-width="2" />
        <!-- X Axis Label -->
        <text x="${x + barWidth / 2}" y="${baseY + 25}" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">
          ${label}
        </text>
      `;
    });

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0F172A" />
  
  <!-- Title -->
  <text x="40" y="45" fill="#F8FAFC" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">
    Total Transmissions: Full RescueNet vs Plain Flooding (1,000 Nodes)
  </text>
  <text x="40" y="70" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="12">
    Measured over 30 seeds with 95% confidence intervals. Evaluates spatial clustering, Spray-and-Wait, and priority queues.
  </text>

  <!-- Baseline Axis -->
  <line x1="60" y1="${baseY}" x2="${width - 40}" y2="${baseY}" stroke="#334155" stroke-width="1.5" />

  ${barsSvg}
</svg>`;

    fs.writeFileSync(filePath, svg, 'utf8');
  }

  /**
   * Generates Density Analysis SVG chart (Connectivity vs Density)
   */
  public static generateDensityChart(
    filePath: string,
    data: { density: number; rate30m: number; rate50m: number }[]
  ): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const width = 800;
    const height = 450;

    let path30m = '';
    let path50m = '';

    const startX = 100;
    const endX = 720;
    const baseY = 380;
    const graphH = 280;

    data.forEach((pt, i) => {
      const x = startX + (i / (data.length - 1)) * (endX - startX);
      const y30 = baseY - (pt.rate30m / 100) * graphH;
      const y50 = baseY - (pt.rate50m / 100) * graphH;

      if (i === 0) {
        path30m = `M ${x} ${y30}`;
        path50m = `M ${x} ${y50}`;
      } else {
        path30m += ` L ${x} ${y30}`;
        path50m += ` L ${x} ${y50}`;
      }
    });

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0F172A" />
  
  <text x="40" y="45" fill="#F8FAFC" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">
    Connectivity vs Device Density (Phones / km²) Phase Transition
  </text>
  <text x="40" y="70" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="12">
    Compares 30 m nominal range (concrete/indoor) vs 50 m BLE range (suburban open ground).
  </text>

  <!-- Axes -->
  <line x1="${startX}" y1="${baseY}" x2="${endX}" y2="${baseY}" stroke="#334155" stroke-width="1.5" />
  <line x1="${startX}" y1="${baseY - graphH}" x2="${startX}" y2="${baseY}" stroke="#334155" stroke-width="1.5" />

  <!-- Curves -->
  <path d="${path30m}" fill="none" stroke="#F59E0B" stroke-width="3" />
  <path d="${path50m}" fill="none" stroke="#10B981" stroke-width="3" />

  <!-- Legend -->
  <circle cx="560" cy="40" r="5" fill="#F59E0B" />
  <text x="575" y="44" fill="#E2E8F0" font-family="system-ui, sans-serif" font-size="12">30 m Nominal Range</text>

  <circle cx="560" cy="65" r="5" fill="#10B981" />
  <text x="575" y="69" fill="#E2E8F0" font-family="system-ui, sans-serif" font-size="12">50 m Coded PHY Range</text>
</svg>`;

    fs.writeFileSync(filePath, svg, 'utf8');
  }
}
