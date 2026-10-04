import React, { useState } from 'react';
import { X, AlertOctagon } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';

interface FalseAlarmModalProps {
  clusterId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const FalseAlarmModal: React.FC<FalseAlarmModalProps> = ({ clusterId, isOpen, onClose }) => {
  const { changeClusterState } = useDashboardStore();
  const { t } = useTranslation();

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t.falseAlarmReasonRequired);
      return;
    }
    changeClusterState(clusterId, 'false_alarm', reason.trim());
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-fa-title"
    >
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertOctagon size={18} color="var(--accent-critical)" />
            <h2 id="modal-fa-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {t.btnMarkFalseAlarm}
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
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--accent-critical)',
                  borderRadius: '6px',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8rem',
                  color: '#fca5a5',
                }}
                role="alert"
                id="false-alarm-error"
              >
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="input-false-alarm-reason">
                {t.falseAlarmReasonRequired}
              </label>
              <textarea
                id="input-false-alarm-reason"
                className="form-textarea"
                rows={3}
                placeholder={t.falseAlarmReasonPlaceholder}
                value={reason}
                onChange={e => {
                  setReason(e.target.value);
                  setError(null);
                }}
                required
              />
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Note: Marking as false alarm will close the triage incident and log an immutable entry
              into the operational audit log.
            </p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t.btnCancel}
            </button>
            <button type="submit" className="btn btn-danger" id="btn-submit-false-alarm">
              {t.btnConfirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
