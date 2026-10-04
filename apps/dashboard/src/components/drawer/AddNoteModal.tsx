import React, { useState } from 'react';
import { X, StickyNote } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';

interface AddNoteModalProps {
  clusterId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AddNoteModal: React.FC<AddNoteModalProps> = ({ clusterId, isOpen, onClose }) => {
  const { addNote } = useDashboardStore();
  const { t } = useTranslation();

  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    addNote(clusterId, note.trim());
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-note-title">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <StickyNote size={18} color="#f59e0b" />
            <h2 id="modal-note-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {t.btnAddNote}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label" htmlFor="input-cluster-note">
                Operational Observation / Medical Flag
              </label>
              <textarea
                id="input-cluster-note"
                className="form-textarea"
                rows={4}
                placeholder="e.g. Survivor communicated via mesh ping that building stairwell is flooded; rooftop ladder required."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t.btnCancel}
            </button>
            <button type="submit" className="btn btn-primary" id="btn-submit-note">
              Save Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
