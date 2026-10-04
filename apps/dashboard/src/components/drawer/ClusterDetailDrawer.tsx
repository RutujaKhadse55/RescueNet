import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Users,
  MapPin,
  Battery,
  AlertTriangle,
  Send,
  UserPlus,
  GitMerge,
  StickyNote,
  MessageSquare,
  Radio,
  FileCode,
  Layers,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';
import { MiniMap } from '../map/MiniMap';
import { AssignTeamModal } from './AssignTeamModal';
import { SendAckModal } from './SendAckModal';
import { FalseAlarmModal } from './FalseAlarmModal';
import { MergeSplitModal } from './MergeSplitModal';
import { AddNoteModal } from './AddNoteModal';

export const ClusterDetailDrawer: React.FC = () => {
  const { clusters, selectedClusterId, selectCluster, changeClusterState, requestSecondTeam } =
    useDashboardStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'overview' | 'score' | 'trust' | 'timeline' | 'packets' | 'chat'>('overview');

  // Modals state
  const [assignOpen, setAssignOpen] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [falseAlarmOpen, setFalseAlarmOpen] = useState(false);
  const [mergeSplitOpen, setMergeSplitOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);

  const cluster = clusters.find((c) => c.id === selectedClusterId);
  if (!cluster) return null;

  const isViewer = user?.role === 'viewer';
  const canDispatch = user?.role === 'admin' || user?.role === 'dispatcher' || user?.role === 'rescuer';

  const formatCoords = (lat: number, lon: number) => {
    if (isViewer) {
      return `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E ${t.privacyRestricted}`;
    }
    return `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E (±${cluster.radius_m}m)`;
  };

  return (
    <>
      <aside
        className="detail-drawer"
        role="dialog"
        aria-modal="false"
        aria-labelledby="drawer-cluster-title"
        id="cluster-detail-drawer"
      >
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`card-score-badge ${cluster.priority_band}`}>
                {cluster.priority_band.toUpperCase()} {cluster.priority_score.toFixed(2)}
              </span>
              <h2 id="drawer-cluster-title" className="drawer-title">
                Cluster {cluster.id.slice(0, 8)}...
              </h2>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              State: <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }} id="drawer-cluster-state">{cluster.state.toUpperCase()}</strong>
              {cluster.assigned_team_name && (
                <span> • Assigned: <strong style={{ color: '#60a5fa' }}>{cluster.assigned_team_name}</strong></span>
              )}
            </div>
          </div>
          <button
            onClick={() => selectCluster(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="Close cluster drawer"
            id="btn-close-drawer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`drawer-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            id="tab-overview"
          >
            {t.tabOverview}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'score'}
            className={`drawer-tab ${activeTab === 'score' ? 'active' : ''}`}
            onClick={() => setActiveTab('score')}
            id="tab-score-breakdown"
          >
            {t.tabScoreBreakdown}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'trust'}
            className={`drawer-tab ${activeTab === 'trust' ? 'active' : ''}`}
            onClick={() => setActiveTab('trust')}
            id="tab-trust"
          >
            {t.tabTrust}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'timeline'}
            className={`drawer-tab ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
            id="tab-timeline"
          >
            {t.tabTimeline} ({(cluster.timeline || []).length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'packets'}
            className={`drawer-tab ${activeTab === 'packets' ? 'active' : ''}`}
            onClick={() => setActiveTab('packets')}
            id="tab-packets"
          >
            {t.tabPackets} ({(cluster.rawPackets || []).length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'chat'}
            className={`drawer-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
            id="tab-chat"
          >
            {t.tabChat}
          </button>
        </div>

        {/* Content */}
        <div className="drawer-content">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Stat tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                <div className="stat-card">
                  <div className="stat-card-title">{t.peopleCount}</div>
                  <div className="stat-card-value" style={{ color: '#ef4444' }}>
                    {cluster.declared_people}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {cluster.member_count} member beacons
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-card-title">Best Battery</div>
                  <div className="stat-card-value" style={{ color: cluster.best_battery < 30 ? '#ef4444' : '#10b981' }}>
                    {cluster.best_battery}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Mesh gateway uplink
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-card-title">Trust Score</div>
                  <div className="stat-card-value" style={{ color: '#3b82f6' }}>
                    {Math.round(cluster.trust_score * 100)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Ed25519 signature valid
                  </div>
                </div>
              </div>

              {/* Location & Floor */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <MapPin size={16} color="var(--accent-blue)" />
                  <strong style={{ fontSize: '0.85rem' }}>Geospatial Location & Floor Hint</strong>
                </div>
                <div style={{ fontSize: '0.85rem', fontFamily: isViewer ? 'inherit' : 'var(--font-mono)', color: isViewer ? '#f59e0b' : '#f8fafc' }} id="display-cluster-coords">
                  {formatCoords(cluster.lat, cluster.lon)}
                </div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.3rem', color: 'var(--text-primary)' }}>
                  <strong>Floor/Structure:</strong> {cluster.floor_hint || 'Ground level'}
                </div>
                {isViewer && (
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.4rem' }}>
                    🔒 {t.privacyNotice}
                  </div>
                )}
              </div>

              {/* Mini Map showing beacon dispersion */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  {t.memberLocations}
                </div>
                <MiniMap
                  centerLat={cluster.lat}
                  centerLon={cluster.lon}
                  radiusMeters={cluster.radius_m}
                  members={cluster.members || []}
                />
              </div>

              {/* Notes */}
              {(cluster.notes || []).length > 0 && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                  }}
                >
                  <strong style={{ fontSize: '0.8rem', color: '#f59e0b' }}>Tactical Notes:</strong>
                  <ul style={{ paddingLeft: '1.2rem', marginTop: '0.3rem', fontSize: '0.8rem' }}>
                    {cluster.notes!.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SCORE BREAKDOWN (Five Weighted Terms) */}
          {activeTab === 'score' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Composite priority formula incorporates survivor group scale, physical injury triage, signal staleness, emergency supply needs, and geographic uncertainty:
              </div>

              {/* 1. Severity Term */}
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>1. Triage Severity (35% weight)</strong>
                  <span className="card-score-badge critical">
                    +{(cluster.components?.severityWeighted ?? 0.35).toFixed(2)}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Max status triage rating ({cluster.max_status === 3 ? 'Critical' : cluster.max_status === 2 ? 'Trapped' : cluster.max_status === 1 ? 'Injured' : 'Safe'}). Directly weights immediate life threat.
                </p>
              </div>

              {/* 2. Survivor Count Term */}
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>2. Survivor Group Scale (25% weight)</strong>
                  <span className="card-score-badge high">
                    +{(cluster.components?.survivorCountWeighted ?? 0.18).toFixed(2)}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  {cluster.declared_people} declared individuals. Logarithmic scaling prioritizes multi-victim clusters over isolated beacons.
                </p>
              </div>

              {/* 3. Time Elapsed Staleness Term */}
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>3. Time Elapsed / Battery Staleness (15% weight)</strong>
                  <span className="card-score-badge medium">
                    +{(cluster.components?.timeSinceLastSeenWeighted ?? 0.14).toFixed(2)}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Time elapsed since last beacon sync. Rising staleness elevates urgency before phone batteries deplete completely.
                </p>
              </div>

              {/* 4. Declared Needs Term */}
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>4. Declared Emergency Needs (15% weight)</strong>
                  <span className="card-score-badge medium">
                    +{(cluster.components?.declaredNeedsWeighted ?? 0.12).toFixed(2)}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Aggregated needs bitmask (Medical trauma, Potable drinking water, Evacuation gear, Mobility impairments).
                </p>
              </div>

              {/* 5. Location Uncertainty Penalty */}
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>5. Location Uncertainty Penalty (-10% weight)</strong>
                  <span className="card-score-badge low">
                    {(cluster.components?.locationUncertaintyDeduction ?? -0.02).toFixed(2)}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Accuracy radius penalty ({cluster.radius_m}m). Tightly clustered GPS pings gain priority confidence over broad fuzzy estimates.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: TRUST BREAKDOWN */}
          {activeTab === 'trust' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(cluster.trustBreakdown || []).map((signal, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-card)',
                    border: `1px solid ${signal.passed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.4)'}`,
                    borderRadius: '8px',
                    padding: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    {signal.passed ? <ShieldCheck size={18} color="#10b981" /> : <ShieldAlert size={18} color="#ef4444" />}
                    <strong style={{ fontSize: '0.85rem' }}>{signal.signal_type.replace(/_/g, ' ').toUpperCase()}</strong>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: signal.passed ? '#10b981' : '#ef4444' }}>
                      {Math.round(signal.score * 100)}%
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{signal.details}</p>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: TIMELINE */}
          {activeTab === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {(cluster.timeline || []).map((evt, idx) => (
                <div
                  key={idx}
                  style={{
                    borderLeft: '2px solid var(--accent-blue)',
                    paddingLeft: '0.75rem',
                    paddingBottom: '0.5rem',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {new Date(evt.created_at).toLocaleTimeString()} • {evt.actor_name || 'System Ingest'}
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                    {evt.event_type.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{evt.notes}</div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 5: RAW PACKETS */}
          {activeTab === 'packets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {(cluster.rawPackets || []).map((pkt, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '0.6rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#60a5fa' }}>
                    <span>PKT: {pkt.packetId}</span>
                    <span>Hops: {pkt.hopCount}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Channel: {pkt.channel} | Device: {pkt.uplinkingDeviceId}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 6: CHAT */}
          {activeTab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {(cluster.chatMessages || []).length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No encrypted mesh chat messages for this cluster.</p>
              ) : (
                cluster.chatMessages!.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: msg.sender_type === 'victim' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      border: `1px solid ${msg.sender_type === 'victim' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                      borderRadius: '8px',
                      padding: '0.6rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <strong>{msg.sender_name} ({msg.sender_type})</strong>
                      <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Action Controls (Human in the Loop) */}
        {canDispatch && (
          <div className="drawer-actions-bar">
            {/* Assign Team Button */}
            <button
              className="btn btn-primary"
              onClick={() => setAssignOpen(true)}
              id="btn-open-assign-modal"
            >
              <UserPlus size={15} />
              {t.btnAssignTeam}
            </button>

            {/* Send Signed ACK */}
            <button
              className="btn btn-secondary"
              onClick={() => setAckOpen(true)}
              id="btn-open-ack-modal"
            >
              <Send size={15} />
              {t.btnSendAck}
            </button>

            {/* Flag False Alarm */}
            <button
              className="btn btn-secondary"
              style={{ color: '#fca5a5' }}
              onClick={() => setFalseAlarmOpen(true)}
              id="btn-open-false-alarm-modal"
            >
              <AlertTriangle size={15} />
              {t.btnMarkFalseAlarm}
            </button>

            {/* Merge / Split */}
            <button
              className="btn btn-secondary"
              onClick={() => setMergeSplitOpen(true)}
              id="btn-open-merge-split-modal"
            >
              <GitMerge size={15} />
              {t.btnMergeSplit}
            </button>

            {/* Add Tactical Note */}
            <button
              className="btn btn-secondary"
              onClick={() => setAddNoteOpen(true)}
              id="btn-open-add-note-modal"
            >
              <StickyNote size={15} />
              {t.btnAddNote}
            </button>

            {/* Request Second Team (>10 survivors) */}
            {cluster.declared_people >= 10 && (
              <button
                className="btn btn-secondary"
                style={{ gridColumn: 'span 2', color: '#fde047' }}
                onClick={() => requestSecondTeam(cluster.id)}
                id="btn-request-second-team"
              >
                <Users size={15} />
                {t.btnRequestSecondTeam}
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Action Modals */}
      <AssignTeamModal clusterId={cluster.id} isOpen={assignOpen} onClose={() => setAssignOpen(false)} />
      <SendAckModal clusterId={cluster.id} isOpen={ackOpen} onClose={() => setAckOpen(false)} />
      <FalseAlarmModal clusterId={cluster.id} isOpen={falseAlarmOpen} onClose={() => setFalseAlarmOpen(false)} />
      <MergeSplitModal clusterId={cluster.id} isOpen={mergeSplitOpen} onClose={() => setMergeSplitOpen(false)} />
      <AddNoteModal clusterId={cluster.id} isOpen={addNoteOpen} onClose={() => setAddNoteOpen(false)} />
    </>
  );
};
