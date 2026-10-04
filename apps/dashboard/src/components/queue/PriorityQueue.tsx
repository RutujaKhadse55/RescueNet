import React from 'react';
import {
  Users,
  Search,
  Activity,
  Droplets,
  HeartPulse,
  UtensilsCrossed,
  Home,
  Truck,
  AlertTriangle,
  Clock,
  Shield,
  Radio,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTranslation } from '../../i18n/useTranslation';
import { Cluster, PriorityBand } from '../../types/dashboard';
import { NeedsBitmask } from '@rescuenet/core';

export const PriorityQueue: React.FC = () => {
  const {
    clusters,
    selectedClusterId,
    selectCluster,
    searchQuery,
    setSearchQuery,
    filterState,
    setFilterState,
    filterFlags,
    setFilterFlagToggle,
    filterNeeds,
    setFilterNeedsToggle,
    timeSliderMinutes,
  } = useDashboardStore();

  const { t } = useTranslation();

  // Filter clusters
  const filteredClusters = clusters.filter(c => {
    // 1. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = c.id.toLowerCase().includes(q);
      const matchFloor = (c.floor_hint || '').toLowerCase().includes(q);
      const matchTeam = (c.assigned_team_name || '').toLowerCase().includes(q);
      if (!matchId && !matchFloor && !matchTeam) return false;
    }

    // 2. State Filter
    if (filterState !== 'all' && c.state !== filterState) {
      return false;
    }

    // 3. Flags Filter
    if (filterFlags.length > 0) {
      const hasFlags = filterFlags.every(f => (c.flags || []).includes(f));
      if (!hasFlags) return false;
    }

    // 4. Needs Bitmask Filter
    if (filterNeeds !== 0) {
      if ((c.needs_mask & filterNeeds) === 0) return false;
    }

    // 5. Replay time scrubber filter
    if (timeSliderMinutes > 0) {
      const elapsedMin = (Date.now() - new Date(c.last_seen).getTime()) / 60000;
      if (elapsedMin > timeSliderMinutes) return false;
    }

    return true;
  });

  // Render needs icons from bitmask
  const renderNeedsIcons = (mask: number) => {
    return (
      <div className="card-needs-icons" title="Declared Survivor Needs">
        {(mask & NeedsBitmask.MEDICAL) !== 0 && (
          <span title="Medical Trauma">
            <HeartPulse size={14} color="#ef4444" />
          </span>
        )}
        {(mask & NeedsBitmask.WATER) !== 0 && (
          <span title="Drinking Water">
            <Droplets size={14} color="#3b82f6" />
          </span>
        )}
        {(mask & NeedsBitmask.FOOD) !== 0 && (
          <span title="Food Supply">
            <UtensilsCrossed size={14} color="#f59e0b" />
          </span>
        )}
        {(mask & NeedsBitmask.SHELTER) !== 0 && (
          <span title="Shelter">
            <Home size={14} color="#a855f7" />
          </span>
        )}
        {(mask & NeedsBitmask.EVACUATION) !== 0 && (
          <span title="Evacuation Rescue">
            <Truck size={14} color="#ec4899" />
          </span>
        )}
      </div>
    );
  };

  const formatAge = (isoString: string) => {
    const elapsedSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (elapsedSec < 60) return `${elapsedSec}s ago`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    if (elapsedMin < 60) return `${elapsedMin}m ago`;
    const elapsedHours = Math.floor(elapsedMin / 60);
    return `${elapsedHours}h ago`;
  };

  return (
    <aside className="queue-panel" aria-label="Survivor Priority Queue">
      {/* Header & Search */}
      <div className="queue-header">
        <div className="queue-title-row">
          <div>
            <h2 className="queue-title" id="queue-heading">
              {t.queueTitle} ({filteredClusters.length})
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.queueSubtitle}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            color="var(--text-muted)"
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <input
            type="search"
            className="queue-search-input"
            style={{ paddingLeft: '32px' }}
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search clusters by id or location"
            id="input-search-queue"
          />
        </div>

        {/* State filter row */}
        <div className="queue-filter-row" role="radiogroup" aria-label="Filter by state">
          {['all', 'new', 'assigned', 'en_route', 'reached', 'closed', 'false_alarm'].map(st => (
            <button
              key={st}
              className={`filter-chip ${filterState === st ? 'active' : ''}`}
              onClick={() => setFilterState(st)}
              id={`filter-state-${st}`}
            >
              {st === 'all'
                ? t.filterAll
                : st === 'new'
                  ? t.stateNew
                  : st === 'assigned'
                    ? t.stateAssigned
                    : st === 'en_route'
                      ? t.stateEnRoute
                      : st === 'reached'
                        ? t.stateReached
                        : st === 'closed'
                          ? t.stateClosed
                          : t.stateFalseAlarm}
            </button>
          ))}
        </div>

        {/* Needs & flags chips */}
        <div className="queue-filter-row">
          <button
            className={`filter-chip ${(filterNeeds & NeedsBitmask.MEDICAL) !== 0 ? 'active' : ''}`}
            onClick={() => setFilterNeedsToggle(NeedsBitmask.MEDICAL)}
            title="Filter Medical Needs"
            id="filter-need-medical"
          >
            + Medical
          </button>
          <button
            className={`filter-chip ${(filterNeeds & NeedsBitmask.WATER) !== 0 ? 'active' : ''}`}
            onClick={() => setFilterNeedsToggle(NeedsBitmask.WATER)}
            title="Filter Water Needs"
            id="filter-need-water"
          >
            + Water
          </button>
          <button
            className={`filter-chip ${(filterNeeds & NeedsBitmask.EVACUATION) !== 0 ? 'active' : ''}`}
            onClick={() => setFilterNeedsToggle(NeedsBitmask.EVACUATION)}
            title="Filter Evacuation"
            id="filter-need-evac"
          >
            + Evac
          </button>
          <button
            className={`filter-chip ${filterFlags.includes('large_group') ? 'active' : ''}`}
            onClick={() => setFilterFlagToggle('large_group')}
            title="Filter Large Groups"
            id="filter-flag-large-group"
          >
            👥 Large Group
          </button>
          <button
            className={`filter-chip ${filterFlags.includes('possibly_failing') ? 'active' : ''}`}
            onClick={() => setFilterFlagToggle('possibly_failing')}
            title="Filter Stale/Failing Beacons"
            id="filter-flag-failing"
          >
            ⚠️ Stale Ping
          </button>
        </div>
      </div>

      {/* Cluster List */}
      <div
        className="queue-list"
        role="list"
        aria-labelledby="queue-heading"
        id="cluster-queue-list"
      >
        {filteredClusters.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            {t.noClustersFound}
          </div>
        ) : (
          filteredClusters.map(cluster => {
            const isSelected = selectedClusterId === cluster.id;
            return (
              <div
                key={cluster.id}
                role="listitem"
                tabIndex={0}
                className={`cluster-card ${cluster.priority_band} ${isSelected ? 'selected' : ''}`}
                onClick={() => selectCluster(cluster.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    selectCluster(cluster.id);
                  }
                }}
                aria-label={`Cluster ${cluster.id.slice(0, 8)}, Score ${cluster.priority_score.toFixed(
                  2,
                )}, ${cluster.declared_people} survivors, Status ${cluster.state}`}
                id={`cluster-card-${cluster.id}`}
              >
                {/* Top Row: Score & State */}
                <div className="card-top-row">
                  <span className={`card-score-badge ${cluster.priority_band}`}>
                    {cluster.priority_band.toUpperCase()} {cluster.priority_score.toFixed(2)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      color:
                        cluster.state === 'assigned'
                          ? '#60a5fa'
                          : cluster.state === 'en_route'
                            ? '#f59e0b'
                            : cluster.state === 'reached'
                              ? '#10b981'
                              : cluster.state === 'false_alarm'
                                ? 'var(--text-muted)'
                                : 'var(--accent-critical)',
                    }}
                  >
                    {cluster.state.replace('_', ' ')}
                  </span>
                </div>

                {/* Body Row: People count & Needs */}
                <div className="card-body-row">
                  <div className="card-people-count">
                    <Users size={18} color="var(--text-primary)" />
                    <span>{cluster.declared_people}</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 400,
                      }}
                    >
                      survivors ({cluster.member_count} pings)
                    </span>
                  </div>
                  {renderNeedsIcons(cluster.needs_mask)}
                </div>

                {/* Floor / Location */}
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cluster.floor_hint || 'Ground sector location'}
                </div>

                {/* Footer: Freshness, Team, Flags */}
                <div className="card-footer-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={12} />
                    <span>{formatAge(cluster.last_seen)}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {cluster.assigned_team_name ? (
                      <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                        {cluster.assigned_team_name}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                    )}
                  </div>

                  <div className="card-flags">
                    {(cluster.flags || []).includes('large_group') && (
                      <span title="Large Survivor Group (>=10)">👥</span>
                    )}
                    {(cluster.flags || []).includes('possibly_failing') && (
                      <span title="Stale / Battery Depleting Beacon">⚠️</span>
                    )}
                    {(cluster.flags || []).includes('low_trust') && (
                      <span title="Low Cryptographic Trust">🛡️</span>
                    )}
                    {cluster.best_battery < 30 && (
                      <span title="Battery Critically Low" style={{ color: '#ef4444' }}>
                        ⚡{cluster.best_battery}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
