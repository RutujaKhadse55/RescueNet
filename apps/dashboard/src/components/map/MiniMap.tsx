import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { ClusterMember } from '../../types/dashboard';

interface MiniMapProps {
  centerLat: number;
  centerLon: number;
  members: ClusterMember[];
  radiusMeters: number;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  centerLat,
  centerLon,
  members,
  radiusMeters,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLon],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
    });

    const mapsApiKey = import.meta.env.VITE_MAPS_API_KEY;
    const customTileUrl = import.meta.env.VITE_MAP_TILE_URL;
    let tileUrl = customTileUrl || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    if (mapsApiKey) {
      if (tileUrl.includes('{apiKey}')) {
        tileUrl = tileUrl.replace('{apiKey}', mapsApiKey);
      } else if (!tileUrl.includes('api_key=') && !tileUrl.includes('key=')) {
        tileUrl += (tileUrl.includes('?') ? '&' : '?') + `api_key=${mapsApiKey}`;
      }
    }

    L.tileLayer(tileUrl, {
      maxZoom: 19,
    }).addTo(map);

    // Accuracy Circle
    L.circle([centerLat, centerLon], {
      radius: radiusMeters,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      weight: 1,
    }).addTo(map);

    // Member markers
    members.forEach(m => {
      const memberIcon = L.divIcon({
        className: 'mini-member-icon',
        html: `
          <div style="background: #ef4444; border: 2px solid #fff; border-radius: 50%; width: 14px; height: 14px; box-shadow: 0 0 6px #ef4444;"></div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([m.lat, m.lon], { icon: memberIcon })
        .bindTooltip(
          `Device: ${m.device_id}<br/>Battery: ${m.battery}%<br/>People: ${m.reported_people}`,
        )
        .addTo(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [centerLat, centerLon, members, radiusMeters]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '180px',
        width: '100%',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
      }}
      id="cluster-mini-map"
    />
  );
};
