import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Volume2,
  VolumeX,
  Contrast,
  Type,
  Languages,
  LogOut,
  Radio,
  Keyboard,
  Clock,
} from 'lucide-react';
import { PROTOCOL_VERSION } from '@rescuenet/core';
import { useAuthStore } from '../../store/authStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTranslation } from '../../i18n/useTranslation';
import { wsManager, WsStatus } from '../../api/websocket';
import { ShortcutsModal } from './ShortcutsModal';

export const Header: React.FC = () => {
  const { user, logout, warningModalOpen, extendSession } = useAuthStore();
  const { incidents, activeIncident, setActiveIncident } = useDashboardStore();
  const {
    highContrast,
    largeType,
    soundEnabled,
    toggleHighContrast,
    toggleLargeType,
    toggleSound,
  } = useSettingsStore();
  const { t, language, toggleLanguage } = useTranslation();

  const [wsStatus, setWsStatus] = useState<WsStatus>(wsManager.getStatus());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    return wsManager.subscribeStatus(st => setWsStatus(st));
  }, []);

  return (
    <>
      <header className="app-header" role="banner">
        {/* Brand */}
        <div className="header-brand">
          <div className="brand-icon-wrapper" aria-hidden="true">
            <ShieldAlert size={22} color="var(--accent-critical)" />
          </div>
          <div>
            <div className="brand-title">{t.appName}</div>
            <div className="brand-subtitle">
              {t.commandCenter} • v{PROTOCOL_VERSION}
            </div>
          </div>
        </div>

        {/* Center: Incident Zone Switcher & Mesh Status */}
        <div className="header-center">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Incident:</span>
            <select
              className="form-select"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', maxWidth: '280px' }}
              value={activeIncident.id}
              onChange={e => setActiveIncident(e.target.value)}
              aria-label="Select disaster incident operation zone"
              id="select-incident-zone"
            >
              {incidents.map(inc => (
                <option key={inc.id} value={inc.id}>
                  {inc.name} {inc.is_drill ? '(DRILL)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="badge badge-live" title="Active BLE Mesh Network Telemetry">
            <span className="pulse-dot"></span>
            <span>{t.meshActive}</span>
          </div>

          <div
            className={`badge ${
              wsStatus === 'connected'
                ? 'badge-ws-connected'
                : wsStatus === 'reconnecting'
                  ? 'badge-ws-reconnecting'
                  : 'badge-ws-offline'
            }`}
            title={`WebSocket Gateway Link: ${wsStatus}`}
            id="ws-status-badge"
          >
            <Radio size={12} />
            <span style={{ textTransform: 'uppercase' }}>{wsStatus}</span>
          </div>
        </div>

        {/* Right Controls: Ergonomics & Auth */}
        <div className="header-controls">
          {/* Sound Alerts Toggle */}
          <button
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
            onClick={toggleSound}
            title={soundEnabled ? t.soundUnmuted : t.soundMuted}
            aria-label={soundEnabled ? t.soundUnmuted : t.soundMuted}
            id="btn-toggle-sound"
          >
            {soundEnabled ? (
              <Volume2 size={16} />
            ) : (
              <VolumeX size={16} color="var(--accent-critical)" />
            )}
          </button>

          {/* High Contrast Toggle */}
          <button
            className={`btn btn-secondary ${highContrast ? 'active' : ''}`}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
            onClick={toggleHighContrast}
            title={t.highContrast}
            aria-label={t.highContrast}
            id="btn-toggle-high-contrast"
          >
            <Contrast size={16} />
          </button>

          {/* Large Type Toggle */}
          <button
            className={`btn btn-secondary ${largeType ? 'active' : ''}`}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
            onClick={toggleLargeType}
            title={t.largeType}
            aria-label={t.largeType}
            id="btn-toggle-large-type"
          >
            <Type size={16} />
          </button>

          {/* Language Switcher */}
          <button
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
            onClick={toggleLanguage}
            title="Toggle Language (English / हिन्दी)"
            aria-label="Toggle Language"
            id="btn-toggle-language"
          >
            <Languages size={15} />
            <span style={{ fontWeight: 700 }}>{t.langToggle}</span>
          </button>

          {/* Keyboard Shortcuts Trigger */}
          <button
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
            onClick={() => setShortcutsOpen(true)}
            title={t.navShortcuts}
            aria-label={t.navShortcuts}
            id="btn-open-shortcuts"
          >
            <Keyboard size={16} />
          </button>

          {/* User Profile & Role */}
          {user && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                borderLeft: '1px solid var(--border-color)',
                paddingLeft: '0.75rem',
              }}
            >
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user.fullName}</div>
                <div
                  style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    color:
                      user.role === 'admin'
                        ? 'var(--accent-critical)'
                        : user.role === 'dispatcher'
                          ? '#60a5fa'
                          : 'var(--accent-low)',
                    fontWeight: 700,
                  }}
                  id="user-role-display"
                >
                  {user.role}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.5rem' }}
                onClick={logout}
                title={t.logoutButton}
                aria-label={t.logoutButton}
                id="btn-logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Session Expiring Modal */}
      {warningModalOpen && (
        <div className="modal-backdrop" role="alertdialog">
          <div className="modal-box">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock color="var(--accent-medium)" size={20} />
                <h3>{t.sessionExpiring}</h3>
              </div>
            </div>
            <div className="modal-body">
              <p>{t.sessionTimeoutWarning}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={extendSession} id="btn-extend-session">
                {t.stayLoggedIn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts Modal */}
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
};
