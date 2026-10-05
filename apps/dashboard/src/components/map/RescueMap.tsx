import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Play, Pause, RotateCcw, Layers, Eye } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';
import { Cluster, Team, GatewayNode } from '../../types/dashboard';

export const RescueMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const clusterLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const teamsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const gatewaysLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const heatmapLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const {
    clusters,
    selectedClusterId,
    selectCluster,
    teams,
    gateways,
    activeIncident,
    layerToggles,
    setLayerToggle,
    timeSliderMinutes,
    setTimeSliderMinutes,
    isReplayPlaying,
    toggleReplayPlaying,
  } = useDashboardStore();

  const { user } = useAuthStore();
  const { t } = useTranslation();

  const isRestrictedRole = user?.role === 'viewer';

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center around Pune incident zone
    const defaultCenter: [number, number] = [18.5204, 73.8567];
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: false,
    });

    // Standard OpenStreetMap tiles (100% free, zero API key required)
    const customTileUrl = import.meta.env.VITE_MAP_TILE_URL;
    const tileUrl = customTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });

    tileLayer.on('tileerror', () => {
      tileLayer.setUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}');
    });
    tileLayer.addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Layer groups
    const boundaryGroup = L.layerGroup().addTo(map);
    const heatmapGroup = L.layerGroup().addTo(map);
    const clusterGroup = L.layerGroup().addTo(map);
    const teamsGroup = L.layerGroup().addTo(map);
    const gatewaysGroup = L.layerGroup().addTo(map);

    boundaryLayerGroupRef.current = boundaryGroup;
    heatmapLayerGroupRef.current = heatmapGroup;
    clusterLayerGroupRef.current = clusterGroup;
    teamsLayerGroupRef.current = teamsGroup;
    gatewaysLayerGroupRef.current = gatewaysGroup;

    mapInstanceRef.current = map;

    // Invalidate size after layout settles to guarantee tiles render
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const handleWindowResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleWindowResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Incident Boundary Layer
  useEffect(() => {
    const group = boundaryLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layerToggles.boundary || !activeIncident.region) return;

    const coords = activeIncident.region.coordinates[0];
    const latLngs: [number, number][] = coords.map(pt => [pt[1], pt[0]]);

    L.polygon(latLngs, {
      color: activeIncident.is_drill ? '#f59e0b' : '#3b82f6',
      fillColor: activeIncident.is_drill ? '#f59e0b' : '#3b82f6',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '4, 8',
    }).addTo(group);
  }, [activeIncident, layerToggles.boundary]);

  // Render Clusters with custom DivIcons, accuracy radius, freshness rings, and flag badges
  useEffect(() => {
    const group = clusterLayerGroupRef.current;
    const map = mapInstanceRef.current;
    if (!group || !map) return;
    group.clearLayers();

    const now = Date.now();

    clusters.forEach(cluster => {
      // Filter by replay time slider if active
      if (timeSliderMinutes > 0) {
        const elapsedMin = (now - new Date(cluster.last_seen).getTime()) / 60000;
        if (elapsedMin > timeSliderMinutes) return;
      }

      const elapsedMinutes = Math.floor((now - new Date(cluster.last_seen).getTime()) / 60000);
      const freshnessClass =
        elapsedMinutes < 15
          ? 'freshness-solid'
          : elapsedMinutes < 60
            ? 'freshness-dashed'
            : 'freshness-fading';

      // Size marker proportional to survivor count (24px to 44px)
      const size = Math.min(44, Math.max(26, 24 + cluster.declared_people * 1.5));

      // Flag icons
      const flagsHtml = [];
      if ((cluster.flags || []).includes('large_group')) flagsHtml.push('👥');
      if ((cluster.flags || []).includes('possibly_failing')) flagsHtml.push('⚠️');
      if ((cluster.flags || []).includes('low_trust')) flagsHtml.push('🛡️');
      if (activeIncident.is_drill) flagsHtml.push('🚨');

      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div
            class="cluster-marker-icon marker-${cluster.priority_band} ${freshnessClass}"
            style="width: ${size}px; height: ${size}px; font-size: ${size > 32 ? '13px' : '11px'};"
            id="map-marker-${cluster.id}"
          >
            <span>${cluster.declared_people}</span>
            ${flagsHtml.length > 0 ? `<span class="marker-flag-badge">${flagsHtml[0]}</span>` : ''}
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      // Marker
      const marker = L.marker([cluster.lat, cluster.lon], { icon: customIcon });
      marker.on('click', () => {
        selectCluster(cluster.id);
      });
      marker.addTo(group);

      // Accuracy radius circle
      L.circle([cluster.lat, cluster.lon], {
        radius: cluster.radius_m,
        color:
          cluster.priority_band === 'critical'
            ? '#ef4444'
            : cluster.priority_band === 'high'
              ? '#f97316'
              : cluster.priority_band === 'medium'
                ? '#eab308'
                : '#10b981',
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(group);
    });
  }, [clusters, activeIncident, selectCluster, timeSliderMinutes]);

  // Heatmap Layer (Report density overlay)
  useEffect(() => {
    const group = heatmapLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layerToggles.heatmap) return;

    clusters.forEach(c => {
      L.circle([c.lat, c.lon], {
        radius: c.radius_m * 3.5,
        color: 'transparent',
        fillColor: '#ef4444',
        fillOpacity: 0.08,
      }).addTo(group);
    });
  }, [clusters, layerToggles.heatmap]);

  // Tactical Teams Layer
  useEffect(() => {
    const group = teamsLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layerToggles.teams) return;

    teams.forEach(t => {
      const teamIcon = L.divIcon({
        className: 'custom-team-icon',
        html: `
          <div style="background: #2563eb; color: #fff; border: 2px solid #93c5fd; border-radius: 6px; padding: 2px 6px; font-weight: 700; font-size: 11px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 4px;">
            <span>🚑 ${t.name.split(' ')[1] || 'Team'}</span>
          </div>
        `,
        iconSize: [80, 24],
        iconAnchor: [40, 12],
      });

      L.marker([t.lat, t.lon], { icon: teamIcon })
        .bindTooltip(`<strong>${t.name}</strong><br/>Status: ${t.status}`)
        .addTo(group);
    });
  }, [teams, layerToggles.teams]);

  // Gateways Layer
  useEffect(() => {
    const group = gatewaysLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layerToggles.gateways) return;

    gateways.forEach(gw => {
      const gwIcon = L.divIcon({
        className: 'custom-gateway-icon',
        html: `
          <div style="background: #059669; color: #fff; border: 2px solid #6ee7b7; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 10px; box-shadow: 0 0 6px #059669;">
            📡
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      L.marker([gw.lat, gw.lon], { icon: gwIcon })
        .bindTooltip(
          `<strong>${gw.name}</strong><br/>Type: ${gw.type}<br/>Relayed: ${gw.packetsRelayed}`,
        )
        .addTo(group);
    });
  }, [gateways, layerToggles.gateways]);

  // Pan to selected cluster
  useEffect(() => {
    if (!selectedClusterId || !mapInstanceRef.current) return;
    const cl = clusters.find(c => c.id === selectedClusterId);
    if (cl) {
      mapInstanceRef.current.flyTo([cl.lat, cl.lon], 15, { duration: 1 });
    }
  }, [selectedClusterId, clusters]);

  // Replay animation timer
  useEffect(() => {
    if (!isReplayPlaying) return;
    const interval = setInterval(() => {
      setTimeSliderMinutes(prev => (prev >= 120 ? 0 : prev + 5));
    }, 1000);
    return () => clearInterval(interval);
  }, [isReplayPlaying, setTimeSliderMinutes]);

  return (
    <main className="map-viewport" aria-label="Incident Geospatial Map View">
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%' }}
        id="leaflet-map-container"
      />

      {/* Floating GIS Layer Toggles */}
      <div className="map-floating-overlay" role="region" aria-label="GIS Layer Controls">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '0.35rem',
          }}
        >
          <Layers size={14} color="var(--accent-blue)" />
          <strong style={{ fontSize: '0.8rem' }}>{t.layersTitle}</strong>
        </div>

        <label className="map-layer-item">
          <input
            type="checkbox"
            checked={layerToggles.teams}
            onChange={e => setLayerToggle('teams', e.target.checked)}
            id="toggle-layer-teams"
          />
          <span>
            {t.layerTeams} ({teams.length})
          </span>
        </label>

        <label className="map-layer-item">
          <input
            type="checkbox"
            checked={layerToggles.heatmap}
            onChange={e => setLayerToggle('heatmap', e.target.checked)}
            id="toggle-layer-heatmap"
          />
          <span>{t.layerHeatmap}</span>
        </label>

        <label className="map-layer-item">
          <input
            type="checkbox"
            checked={layerToggles.boundary}
            onChange={e => setLayerToggle('boundary', e.target.checked)}
            id="toggle-layer-boundary"
          />
          <span>{t.layerBoundary}</span>
        </label>

        <label className="map-layer-item">
          <input
            type="checkbox"
            checked={layerToggles.gateways}
            onChange={e => setLayerToggle('gateways', e.target.checked)}
            id="toggle-layer-gateways"
          />
          <span>
            {t.layerGateways} ({gateways.length})
          </span>
        </label>
      </div>

      {/* Time Travel Incident Replay Scrubber */}
      <div className="time-slider-floating" role="region" aria-label="Incident Replay Scrubber">
        <button
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.6rem' }}
          onClick={toggleReplayPlaying}
          title={isReplayPlaying ? 'Pause replay' : 'Play replay'}
          id="btn-toggle-replay"
        >
          {isReplayPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {timeSliderMinutes === 0 ? 'LIVE NOW' : `-${timeSliderMinutes}m`}
        </span>

        <input
          type="range"
          min="0"
          max="120"
          step="5"
          value={timeSliderMinutes}
          onChange={e => setTimeSliderMinutes(Number(e.target.value))}
          className="slider-input"
          aria-label="Filter incident telemetry by minutes elapsed"
          id="input-time-slider"
        />

        <button
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.5rem' }}
          onClick={() => setTimeSliderMinutes(0)}
          title="Reset to live telemetry"
          id="btn-reset-replay"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </main>
  );
};
