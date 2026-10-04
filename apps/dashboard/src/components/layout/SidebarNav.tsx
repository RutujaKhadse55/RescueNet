import React from 'react';
import { Map, Users, BarChart3, Settings, Radio } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';

export const SidebarNav: React.FC = () => {
  const { activeNav, setActiveNav } = useDashboardStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const isAdmin = user?.role === 'admin';

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.4rem 1.25rem',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
      }}
      aria-label="Primary Dashboard Navigation"
    >
      <button
        className={`nav-tab-button ${activeNav === 'map' ? 'active' : ''}`}
        onClick={() => setActiveNav('map')}
        id="nav-tab-map"
      >
        <Map size={16} />
        <span>{t.navMap}</span>
      </button>

      <button
        className={`nav-tab-button ${activeNav === 'teams' ? 'active' : ''}`}
        onClick={() => setActiveNav('teams')}
        id="nav-tab-teams"
      >
        <Users size={16} />
        <span>{t.navTeams}</span>
      </button>

      <button
        className={`nav-tab-button ${activeNav === 'metrics' ? 'active' : ''}`}
        onClick={() => setActiveNav('metrics')}
        id="nav-tab-metrics"
      >
        <BarChart3 size={16} />
        <span>{t.navMetrics}</span>
      </button>

      <button
        className={`nav-tab-button ${activeNav === 'admin' ? 'active' : ''}`}
        onClick={() => setActiveNav('admin')}
        id="nav-tab-admin"
      >
        <Settings size={16} />
        <span>{t.navAdmin}</span>
        {!isAdmin && (
          <span
            style={{
              fontSize: '0.65rem',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '0.1rem 0.35rem',
              borderRadius: '3px',
              textTransform: 'uppercase',
            }}
          >
            Audited
          </span>
        )}
      </button>

      <button
        className={`nav-tab-button ${activeNav === 'simulator' ? 'active' : ''}`}
        onClick={() => setActiveNav('simulator')}
        id="nav-tab-simulator"
        style={{
          marginLeft: 'auto',
          backgroundColor:
            activeNav === 'simulator' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: '#34d399',
          fontWeight: 600,
        }}
      >
        <Radio size={16} />
        <span>📱 Live Mesh Simulator</span>
      </button>
    </nav>
  );
};
