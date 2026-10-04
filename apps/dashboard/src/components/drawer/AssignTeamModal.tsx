import React, { useState } from 'react';
import { X, Users, CheckCircle2 } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';

interface AssignTeamModalProps {
  clusterId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AssignTeamModal: React.FC<AssignTeamModalProps> = ({ clusterId, isOpen, onClose }) => {
  const { teams, assignTeam } = useDashboardStore();
  const { t } = useTranslation();

  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id || '');
  const [etaMinutes, setEtaMinutes] = useState(25);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;
    assignTeam(clusterId, selectedTeamId, etaMinutes);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-assign-title"
    >
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} color="var(--accent-blue)" />
            <h2 id="modal-assign-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {t.btnAssignTeam}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label" htmlFor="select-team">
                Select Tactical Response Team
              </label>
              <select
                id="select-team"
                className="form-select"
                value={selectedTeamId}
                onChange={e => setSelectedTeamId(e.target.value)}
                required
              >
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.status.toUpperCase()} - {team.member_count} responders)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="input-eta">
                {t.etaLabel}
              </label>
              <input
                id="input-eta"
                type="number"
                min="1"
                max="300"
                className="form-input"
                value={etaMinutes}
                onChange={e => setEtaMinutes(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t.btnCancel}
            </button>
            <button type="submit" className="btn btn-primary" id="btn-submit-assignment">
              <CheckCircle2 size={16} />
              {t.btnConfirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
