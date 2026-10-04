import React, { useState } from 'react';
import { Users, MapPin, Radio, Shield, Edit3, CheckCircle2 } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';
import { Team } from '../../types/dashboard';

export const TeamsView: React.FC = () => {
  const { teams, updateTeamPosition, clusters } = useDashboardStore();
  const { t } = useTranslation();

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editLat, setEditLat] = useState(0);
  const [editLon, setEditLon] = useState(0);

  const handleStartEdit = (team: Team) => {
    setEditingTeam(team);
    setEditLat(team.lat);
    setEditLon(team.lon);
  };

  const handleSavePosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;
    updateTeamPosition(editingTeam.id, editLat, editLon);
    setEditingTeam(null);
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }} id="teams-view-container">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{t.teamsTitle}</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.teamsSubtitle}</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '1rem',
        }}
      >
        {teams.map(team => {
          const assignedClusterObjs = clusters.filter(c => team.assigned_clusters.includes(c.id));

          return (
            <div
              key={team.id}
              className="stat-card"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              id={`team-card-${team.id}`}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                    {team.name}
                  </h3>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}
                  >
                    Lead: {team.lead_name || 'Designated NDRF Officer'}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background:
                      team.status === 'assigned'
                        ? 'rgba(59, 130, 246, 0.2)'
                        : team.status === 'en_route'
                          ? 'rgba(245, 158, 11, 0.2)'
                          : 'rgba(16, 185, 129, 0.2)',
                    color:
                      team.status === 'assigned'
                        ? '#60a5fa'
                        : team.status === 'en_route'
                          ? '#f59e0b'
                          : '#10b981',
                  }}
                >
                  {team.status}
                </span>
              </div>

              {/* Location & GPS */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '0.6rem 0.8rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    GPS Position:
                  </div>
                  <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                    {team.lat.toFixed(4)}°N, {team.lon.toFixed(4)}°E
                  </div>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => handleStartEdit(team)}
                  title="Update GPS Coordinates"
                  id={`btn-edit-team-${team.id}`}
                >
                  <Edit3 size={13} /> Edit GPS
                </button>
              </div>

              {/* Workload */}
              <div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '0.3rem',
                  }}
                >
                  <strong>Workload:</strong> {team.assigned_clusters.length} Active Survivor
                  Clusters
                </div>
                {assignedClusterObjs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {assignedClusterObjs.map(cl => (
                      <div
                        key={cl.id}
                        style={{
                          fontSize: '0.75rem',
                          background: 'rgba(255, 255, 255, 0.04)',
                          padding: '0.35rem 0.6rem',
                          borderRadius: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Cluster {cl.id.slice(0, 8)}...</span>
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>
                          {cl.declared_people} survivors
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    No current assignments (Available)
                  </span>
                )}
              </div>

              {/* Equipment */}
              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.2rem',
                  }}
                >
                  Tactical Equipment:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {(team.equipment || []).map((eq, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                      }}
                    >
                      {eq}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual GPS Update Modal */}
      {editingTeam && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Update Location: {editingTeam.name}</h3>
            </div>
            <form onSubmit={handleSavePosition}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-team-lat">
                    Latitude
                  </label>
                  <input
                    id="edit-team-lat"
                    type="number"
                    step="0.0001"
                    className="form-input"
                    value={editLat}
                    onChange={e => setEditLat(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-team-lon">
                    Longitude
                  </label>
                  <input
                    id="edit-team-lon"
                    type="number"
                    step="0.0001"
                    className="form-input"
                    value={editLon}
                    onChange={e => setEditLon(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingTeam(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" id="btn-save-team-pos">
                  <CheckCircle2 size={16} /> Save Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
