import React from 'react';
import {
  BarChart3,
  Clock,
  Radio,
  FileSpreadsheet,
  FileText,
  ShieldAlert,
  Percent,
  Activity,
  Layers,
  Zap,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';
import { exportClustersToCsv, exportSituationReport } from '../../utils/export';

export const MetricsView: React.FC = () => {
  const { stats, clusters } = useDashboardStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const isAdmin = user?.role === 'admin';

  const channelTotal =
    stats.channelBreakdown.bleMesh +
    stats.channelBreakdown.sms +
    stats.channelBreakdown.directInternet +
    stats.channelBreakdown.gateway;

  const getPercent = (val: number) => {
    return channelTotal > 0 ? ((val / channelTotal) * 100).toFixed(1) : '0';
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }} id="metrics-view-container">
      {/* Header & Export controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{t.metricsTitle}</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.metricsSubtitle}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* CSV Export */}
          <button
            className="btn btn-secondary"
            onClick={() => exportClustersToCsv(clusters)}
            disabled={!isAdmin}
            title={isAdmin ? t.btnExportCsv : 'Export restricted to administrator role'}
            id="btn-export-csv"
          >
            <FileSpreadsheet size={16} color="var(--accent-low)" />
            {t.btnExportCsv}
          </button>

          {/* PDF Export */}
          <button
            className="btn btn-primary"
            onClick={() => exportSituationReport(clusters, stats)}
            disabled={!isAdmin}
            title={isAdmin ? t.btnExportPdf : 'Export restricted to administrator role'}
            id="btn-export-pdf"
          >
            <FileText size={16} />
            {t.btnExportPdf}
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '6px',
            padding: '0.6rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8rem',
            color: '#fef08a',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ShieldAlert size={16} color="#eab308" />
          <span>
            Notice: Exporting operational triage records is restricted to Administrator roles for
            survivor privacy protection.
          </span>
        </div>
      )}

      {/* Grid of Key Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Metric 1: Time to first contact */}
        <div className="stat-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Clock size={16} color="#60a5fa" />
            <span className="stat-card-title">Time to 1st Rescuer Contact</span>
          </div>
          <div className="stat-card-value" style={{ color: '#60a5fa' }}>
            {stats.timeToFirstContactMin}m
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Average across all clusters
          </div>
        </div>

        {/* Metric 2: Packet delivery rate */}
        <div className="stat-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Zap size={16} color="#10b981" />
            <span className="stat-card-title">Mesh Packet Delivery Rate</span>
          </div>
          <div className="stat-card-value" style={{ color: '#10b981' }}>
            {stats.packetDeliveryRate}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Spray-and-Wait mesh efficiency
          </div>
        </div>

        {/* Metric 3: Duplicate SOS reduction */}
        <div className="stat-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Layers size={16} color="#a855f7" />
            <span className="stat-card-title">Duplicate SOS Reduction</span>
          </div>
          <div className="stat-card-value" style={{ color: '#a855f7' }}>
            {stats.duplicateSosReduction}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Spatial DBSCAN de-duplication
          </div>
        </div>

        {/* Metric 4: False alarm rate */}
        <div className="stat-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Percent size={16} color="#f59e0b" />
            <span className="stat-card-title">False-Alarm Rate</span>
          </div>
          <div className="stat-card-value" style={{ color: '#f59e0b' }}>
            {stats.falseAlarmRate}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Validated through dispatch verify
          </div>
        </div>

        {/* Metric 5: ACK delivery latency */}
        <div className="stat-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Activity size={16} color="#38bdf8" />
            <span className="stat-card-title">ACK Delivery Latency</span>
          </div>
          <div className="stat-card-value" style={{ color: '#38bdf8' }}>
            {stats.ackDeliveryLatencySec}s
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Average round-trip dispatch
          </div>
        </div>

        {/* Metric 6: Active Gateways */}
        <div className="stat-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Radio size={16} color="#34d399" />
            <span className="stat-card-title">Active Field Gateways</span>
          </div>
          <div className="stat-card-value" style={{ color: '#34d399' }}>
            {stats.activeGateways}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            SMS modems & relay nodes
          </div>
        </div>
      </div>

      {/* Reports by Channel Breakdown */}
      <div className="stat-card" style={{ padding: '1.25rem' }}>
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Radio size={18} color="var(--accent-blue)" />
          Reports Ingested by Physical Channel (Total: {channelTotal.toLocaleString()} packets)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* BLE Mesh */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                marginBottom: '0.3rem',
              }}
            >
              <span>Offline BLE Peer-to-Peer Mesh (Nearby Phone Relays)</span>
              <strong>
                {stats.channelBreakdown.bleMesh} ({getPercent(stats.channelBreakdown.bleMesh)}%)
              </strong>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${getPercent(stats.channelBreakdown.bleMesh)}%`,
                  height: '100%',
                  background: '#3b82f6',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>

          {/* Direct Internet */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                marginBottom: '0.3rem',
              }}
            >
              <span>Direct Fastify HTTPS Uplink (Field WiFi / Restored Cell)</span>
              <strong>
                {stats.channelBreakdown.directInternet} (
                {getPercent(stats.channelBreakdown.directInternet)}%)
              </strong>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${getPercent(stats.channelBreakdown.directInternet)}%`,
                  height: '100%',
                  background: '#10b981',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>

          {/* SMS Fallback */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                marginBottom: '0.3rem',
              }}
            >
              <span>SMS Cellular Fallback (140-byte Binary GSM 7-bit)</span>
              <strong>
                {stats.channelBreakdown.sms} ({getPercent(stats.channelBreakdown.sms)}%)
              </strong>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${getPercent(stats.channelBreakdown.sms)}%`,
                  height: '100%',
                  background: '#f59e0b',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>

          {/* LoRa / Sat Gateways */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                marginBottom: '0.3rem',
              }}
            >
              <span>Dedicated LoRaWAN & Satellite Gateway Masts</span>
              <strong>
                {stats.channelBreakdown.gateway} ({getPercent(stats.channelBreakdown.gateway)}%)
              </strong>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${getPercent(stats.channelBreakdown.gateway)}%`,
                  height: '100%',
                  background: '#a855f7',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
