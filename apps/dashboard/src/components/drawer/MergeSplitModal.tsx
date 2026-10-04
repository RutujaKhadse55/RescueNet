import React, { useState } from 'react';
import { X, GitMerge, Split } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';

interface MergeSplitModalProps {
  clusterId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const MergeSplitModal: React.FC<MergeSplitModalProps> = ({ clusterId, isOpen, onClose }) => {
  const { clusters, mergeClusters, splitCluster } = useDashboardStore();
  const { t } = useTranslation();

  const [mode, setMode] = useState<'merge' | 'split'>('merge');
  const otherClusters = clusters.filter(c => c.id !== clusterId && c.state !== 'closed');
  const [targetId, setTargetId] = useState(otherClusters[0]?.id || '');

  if (!isOpen) return null;

  const handleMerge = () => {
    if (!targetId) return;
    mergeClusters(clusterId, targetId);
    onClose();
  };

  const handleSplit = () => {
    splitCluster(clusterId);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-merge-title"
    >
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {mode === 'merge' ? (
              <GitMerge size={18} color="var(--accent-blue)" />
            ) : (
              <Split size={18} color="#a855f7" />
            )}
            <h2 id="modal-merge-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {t.btnMergeSplit}
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

        <div className="modal-body">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <button
              type="button"
              className={`btn ${mode === 'merge' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('merge')}
            >
              <GitMerge size={14} /> Merge Clusters
            </button>
            <button
              type="button"
              className={`btn ${mode === 'split' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('split')}
            >
              <Split size={14} /> Split Cluster
            </button>
          </div>

          {mode === 'merge' ? (
            <div className="form-group">
              <label className="form-label" htmlFor="select-target-cluster">
                Select Cluster to Merge Into:
              </label>
              {otherClusters.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  No other active clusters available to merge with.
                </p>
              ) : (
                <select
                  id="select-target-cluster"
                  className="form-select"
                  value={targetId}
                  onChange={e => setTargetId(e.target.value)}
                >
                  {otherClusters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.id.slice(0, 10)}... ({c.declared_people} people -{' '}
                      {c.floor_hint || 'Ground'})
                    </option>
                  ))}
                </select>
              )}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Merging will close this cluster and transfer its beacon members to the target
                cluster.
              </span>
            </div>
          ) : (
            <div>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  marginBottom: '0.5rem',
                }}
              >
                Split cluster members into two localized tactical zones.
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Useful when field reconnaissance identifies survivors spread across multiple
                building wings or floors.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t.btnCancel}
          </button>
          {mode === 'merge' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleMerge}
              disabled={!targetId}
              id="btn-confirm-merge"
            >
              Confirm Merge
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSplit}
              id="btn-confirm-split"
            >
              Confirm Split
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
