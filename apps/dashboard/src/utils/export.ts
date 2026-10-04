import { Cluster, OperationalStats } from '../types/dashboard';

/**
 * Exports cluster queue data as CSV file
 */
export function exportClustersToCsv(clusters: Cluster[]): void {
  const headers = [
    'Cluster ID',
    'Priority Score',
    'Priority Band',
    'Survivors',
    'Status',
    'State',
    'Assigned Team',
    'ETA (min)',
    'Latitude',
    'Longitude',
    'Radius (m)',
    'Floor Hint',
    'Flags',
    'Last Seen',
  ];

  const rows = clusters.map(c => [
    c.id,
    c.priority_score.toFixed(2),
    c.priority_band.toUpperCase(),
    c.declared_people,
    getStatusLabel(c.max_status),
    c.state,
    c.assigned_team_name || 'None',
    c.eta_minutes ?? '',
    c.lat.toFixed(5),
    c.lon.toFixed(5),
    c.radius_m,
    `"${(c.floor_hint || '').replace(/"/g, '""')}"`,
    `"${(c.flags || []).join(';')}"`,
    c.last_seen,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `rescuenet_triage_export_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers printable Situation Report (PDF)
 */
export function exportSituationReport(clusters: Cluster[], stats: OperationalStats): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const criticalClusters = clusters.filter(c => c.priority_band === 'critical');
  const assignedCount = clusters.filter(
    c => c.state === 'assigned' || c.state === 'en_route',
  ).length;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>RescueNet Operational Situation Report (SITREP)</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
          h1 { border-bottom: 2px solid #ef4444; padding-bottom: 8px; margin-bottom: 4px; }
          .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
          .stat-box { border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #fafafa; }
          .stat-val { font-size: 24px; font-weight: bold; color: #1e3a8a; }
          .stat-lbl { font-size: 12px; color: #555; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f1f5f9; }
          .critical { color: #b91c1c; font-weight: bold; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h1>RescueNet Incident Command SITREP</h1>
          <button onclick="window.print()" style="padding: 8px 16px; cursor: pointer; background: #2563eb; color: #fff; border:none; border-radius:4px; font-weight:bold;">Print / Save as PDF</button>
        </div>
        <div class="meta">
          <strong>Generated:</strong> ${new Date().toLocaleString()} | <strong>Classification:</strong> OFFICIAL - TACTICAL DISASTER RESPONSE ONLY
        </div>

        <div class="summary-grid">
          <div class="stat-box">
            <div class="stat-val">${stats.totalSurvivors}</div>
            <div class="stat-lbl">Total Survivors</div>
          </div>
          <div class="stat-box">
            <div class="stat-val" style="color: #ef4444;">${criticalClusters.length}</div>
            <div class="stat-lbl">Critical Clusters</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${assignedCount}</div>
            <div class="stat-lbl">Teams Deployed</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${stats.packetDeliveryRate}%</div>
            <div class="stat-lbl">Mesh Packet Delivery</div>
          </div>
        </div>

        <h3>Active Survivor Clusters Priority Queue</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Priority Score</th>
              <th>Band</th>
              <th>People</th>
              <th>Status</th>
              <th>State</th>
              <th>Assigned Team</th>
              <th>Floor / Location</th>
            </tr>
          </thead>
          <tbody>
            ${clusters
              .map(
                c => `
              <tr>
                <td><code>${c.id.slice(0, 8)}...</code></td>
                <td><strong>${c.priority_score.toFixed(2)}</strong></td>
                <td class="${c.priority_band}">${c.priority_band.toUpperCase()}</td>
                <td>${c.declared_people}</td>
                <td>${getStatusLabel(c.max_status)}</td>
                <td>${c.state}</td>
                <td>${c.assigned_team_name || 'Unassigned'}</td>
                <td>${c.floor_hint || 'N/A'}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function getStatusLabel(status: number): string {
  switch (status) {
    case 3:
      return 'Critical';
    case 2:
      return 'Trapped';
    case 1:
      return 'Injured';
    case 0:
    default:
      return 'Safe';
  }
}
