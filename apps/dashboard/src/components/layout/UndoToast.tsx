import React, { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';

export const UndoToast: React.FC = () => {
  const undoAction = useDashboardStore((s) => s.undoAction);
  const triggerUndo = useDashboardStore((s) => s.triggerUndo);
  const clearUndo = useDashboardStore((s) => s.clearUndo);
  const { t } = useTranslation();

  const [secondsRemaining, setSecondsRemaining] = useState(10);

  useEffect(() => {
    if (!undoAction) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((undoAction.expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearUndo();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [undoAction, clearUndo]);

  if (!undoAction) return null;

  return (
    <div className="undo-toast" role="status" aria-live="polite" id="undo-toast">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <strong style={{ fontSize: '0.85rem', color: '#f8fafc' }}>{undoAction.description}</strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {t.undoText} ({secondsRemaining}s)
        </span>
      </div>
      <button
        className="btn btn-primary"
        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
        onClick={triggerUndo}
        id="btn-undo-action"
      >
        <RotateCcw size={14} />
        {t.btnUndo}
      </button>
      <button
        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        onClick={clearUndo}
        aria-label="Dismiss undo notification"
      >
        <X size={16} />
      </button>
    </div>
  );
};
