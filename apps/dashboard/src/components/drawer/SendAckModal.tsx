import React, { useState } from 'react';
import { X, Send, ShieldCheck } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';

interface SendAckModalProps {
  clusterId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const SendAckModal: React.FC<SendAckModalProps> = ({ clusterId, isOpen, onClose }) => {
  const { dispatchAck } = useDashboardStore();
  const { t } = useTranslation();

  const [ackType, setAckType] = useState('help_on_way');
  const [etaMinutes, setEtaMinutes] = useState(20);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatchAck(clusterId, ackType, etaMinutes);
    onClose();
  };

  const templates = [
    { id: 'help_on_way', title: 'Help on the way', text: t.ackTemplateHelp },
    { id: 'stay_put', title: 'Stay where you are', text: t.ackTemplateStay },
    { id: 'move_rally', title: 'Move to rally point', text: t.ackTemplateMove },
    { id: 'need_info', title: 'Need more information', text: t.ackTemplateInfo },
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-ack-title"
    >
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={18} color="var(--accent-low)" />
            <h2 id="modal-ack-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {t.btnSendAck}
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
              <label className="form-label" htmlFor="select-ack-template">
                Acknowledgment Message Template
              </label>
              <select
                id="select-ack-template"
                className="form-select"
                value={ackType}
                onChange={e => setAckType(e.target.value)}
              >
                {templates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.title} - "{tpl.text.slice(0, 35)}..."
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '6px',
                padding: '0.75rem',
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
              }}
            >
              <strong>Survivor Display Text:</strong>
              <div style={{ marginTop: '0.25rem', fontStyle: 'italic', color: '#93c5fd' }}>
                "{templates.find(t => t.id === ackType)?.text}"
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="input-ack-eta">
                {t.etaLabel}
              </label>
              <input
                id="input-ack-eta"
                type="number"
                min="0"
                max="300"
                className="form-input"
                value={etaMinutes}
                onChange={e => setEtaMinutes(Number(e.target.value))}
                required
              />
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              🔒 Outbound packet will be signed with Agency Ed25519 CA Key and broadcasted over BLE
              mesh and priority SMS.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t.btnCancel}
            </button>
            <button type="submit" className="btn btn-primary" id="btn-submit-ack">
              <Send size={16} />
              {t.btnConfirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
