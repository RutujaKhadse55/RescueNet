import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const shortcuts = [
    { key: '?', desc: 'Show / hide this shortcuts cheat-sheet' },
    { key: 'j / k', desc: 'Select next / previous survivor cluster in queue' },
    { key: 'Enter', desc: 'Open details drawer for currently selected cluster' },
    { key: 'Esc', desc: 'Close drawer, modals, or dismiss selection' },
    { key: 'a', desc: 'Quick assign rescue team to selected cluster' },
    { key: 's', desc: 'Quick dispatch signed ACK template' },
    { key: 'm', desc: 'Focus GIS tactical map' },
    { key: 'l', desc: 'Toggle dashboard language (English / हिन्दी)' },
    { key: 't', desc: 'Toggle large type mode for control room wall displays' },
    { key: 'h', desc: 'Toggle high-contrast stress-resistant color mode' },
    { key: '1 - 4', desc: 'Switch navigation tabs (1: Map, 2: Teams, 3: Metrics, 4: Admin)' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Keyboard size={20} color="var(--accent-blue)" />
            <h2 id="shortcuts-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
              {t.shortcutsTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {shortcuts.map((s, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.4rem 0.6rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s.desc}</span>
                <kbd
                  style={{
                    background: '#1e293b',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: '#60a5fa',
                    border: '1px solid rgba(96, 165, 250, 0.3)',
                  }}
                >
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose} id="btn-close-shortcuts">
            {t.shortcutsClose}
          </button>
        </div>
      </div>
    </div>
  );
};
