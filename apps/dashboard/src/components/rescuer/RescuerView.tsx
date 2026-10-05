import React, { useState, useEffect, useRef } from 'react';
import {
  Compass,
  MapPin,
  CheckCircle2,
  Navigation,
  MessageSquare,
  Send,
  Clock,
  Users,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  Maximize2,
  Phone,
} from 'lucide-react';
import L from 'leaflet';
import { useRescueStore, RescuerNav, SosIncident } from '../../store/rescueStore';

export const RescuerView: React.FC = () => {
  const {
    rescuerNav,
    setRescuerNav,
    sosList,
    acknowledgeSos,
    markResolved,
    rescuerMessages,
    sendRescuerMessage,
    rescuerLocation,
    navDistanceRemaining,
    navEtaMinutes,
    isNavigating,
    startNavigation,
    stepNavigation,
  } = useRescueStore();

  const myTeamName = 'Rescue Team Alpha';
  // Tactical Unit assignedCases: Ensure at most 1 active assignment for this unit
  const assignedCases = React.useMemo(() => {
    const list = sosList.filter(
      s => s.assignedTeam === myTeamName && s.status !== 'Resolved',
    );
    if (list.length > 1) {
      const primary =
        list.find(s => s.id.includes('s_01') || s.notes?.includes('Relief Zone')) || list[0]!;
      return [primary];
    }
    return list;
  }, [sosList, myTeamName]);

  const [activeCase, setActiveCase] = useState<SosIncident | null>(assignedCases[0] ?? null);
  const [chatInput, setChatInput] = useState('');

  // Leaflet map reference
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Sync activeCase if assignedCases change
  useEffect(() => {
    if (assignedCases.length > 0 && !activeCase) {
      setActiveCase(assignedCases[0] ?? null);
    } else if (activeCase) {
      const refreshed = sosList.find(s => s.id === activeCase.id);
      if (refreshed) setActiveCase(refreshed);
    }
  }, [sosList, assignedCases, activeCase]);

  // Fit bounds helper to fix zoom issues
  const fitRouteBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || !activeCase) return;

    const bounds = L.latLngBounds([
      [rescuerLocation.lat, rescuerLocation.lon],
      [activeCase.lat, activeCase.lon],
    ]);

    if (activeCase.clusterMembers) {
      activeCase.clusterMembers.forEach(m => bounds.extend([m.lat, m.lon]));
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  };

  // Leaflet Map for Navigation / Location
  useEffect(() => {
    if (rescuerNav !== 'map' || !mapContainerRef.current || !activeCase) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    const map = L.map(mapContainerRef.current, {
      center: [
        (activeCase.lat + rescuerLocation.lat) / 2,
        (activeCase.lon + rescuerLocation.lon) / 2,
      ],
      zoom: 16,
      zoomControl: false,
    });

    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });

    tileLayer.on('tileerror', () => {
      tileLayer.setUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      );
    });

    tileLayer.addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Rescuer Marker (Green)
    const rescuerIcon = L.divIcon({
      className: 'rescuer-marker',
      html: `
        <div style="background: #16a34a; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; border: 3px solid white; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.4);">
          TEAM
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    L.marker([rescuerLocation.lat, rescuerLocation.lon], { icon: rescuerIcon })
      .bindPopup(`<strong>Rescue Team Alpha (Your Location)</strong><br/>En route to cluster`)
      .addTo(map);

    // Survivor Cluster Lead Marker (Red)
    const survivorIcon = L.divIcon({
      className: 'survivor-target-marker',
      html: `
        <div style="background: #dc2626; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; border: 3px solid white; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);">
          SOS
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    L.marker([activeCase.lat, activeCase.lon], { icon: survivorIcon })
      .bindPopup(
        `<strong>Target: ${activeCase.id}</strong><br/>${activeCase.survivorName}<br/>👥 ${activeCase.nearbyCount} survivors in cluster`,
      )
      .addTo(map);

    // Draw route line between rescuer and survivor
    L.polyline(
      [
        [rescuerLocation.lat, rescuerLocation.lon],
        [activeCase.lat, activeCase.lon],
      ],
      {
        color: '#16a34a',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.9,
      },
    ).addTo(map);

    // Draw survivor cluster radius
    L.circle([activeCase.lat, activeCase.lon], {
      radius: activeCase.clusterRadiusMeters || 45,
      color: '#dc2626',
      fillColor: '#dc2626',
      fillOpacity: 0.12,
      weight: 1.5,
    }).addTo(map);

    // Render individual people pins in cluster
    if (activeCase.clusterMembers) {
      activeCase.clusterMembers.forEach((m, idx) => {
        if (idx === 0) return; // Lead already rendered
        const peerIcon = L.divIcon({
          className: 'peer-cluster-marker',
          html: `
            <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%);">
              <div style="background: #0284c7; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
                ${idx + 1}
              </div>
              <div style="background: white; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 4px; font-size: 8px; font-weight: 700; color: #0f172a; white-space: nowrap;">
                ${m.name.split(' ')[0]}
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([m.lat, m.lon], { icon: peerIcon })
          .bindPopup(`<strong>${m.name}</strong><br/>${m.condition}`)
          .addTo(map);
      });
    }

    mapInstanceRef.current = map;

    // Fix map sizing and zoom bounds with progressive invalidation
    const timer1 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        fitRouteBounds();
      }
    }, 100);

    const timer2 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        fitRouteBounds();
      }
    }, 350);

    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [rescuerNav, activeCase, rescuerLocation]);

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendRescuerMessage(chatInput, 'rescuer');
    setChatInput('');
  };

  const navTabs: { id: RescuerNav; label: string; icon: React.ReactNode }[] = [
    { id: 'cases', label: 'Assigned Incidents', icon: <CheckCircle2 size={16} /> },
    { id: 'map', label: 'Tactical Route & Cluster Map', icon: <MapPin size={16} /> },
    { id: 'messages', label: 'Direct Survivor Comms', icon: <MessageSquare size={16} /> },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: '820px',
        margin: '0 auto',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)',
        overflow: 'hidden',
      }}
    >
      {/* 1. Header (Light Professional Theme) */}
      <div
        style={{
          padding: '0.85rem 1.25rem',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Compass size={18} color="#16a34a" />
          </div>
          <div>
            <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0f172a' }}>
              Rescuer Tactical Terminal
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Dispatched Unit: <b>{myTeamName}</b> • Exclusive Assigned Incidents
            </div>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '0.25rem 0.65rem',
            borderRadius: '999px',
            background: assignedCases.length > 0 ? '#eff6ff' : '#f1f5f9',
            color: assignedCases.length > 0 ? '#2563eb' : '#64748b',
            border: assignedCases.length > 0 ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
          }}
        >
          {assignedCases.length} Active Assignment{assignedCases.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* 2. Sub-Navigation Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          background: '#fafaf9',
          borderBottom: '1px solid #e2e8f0',
        }}
        role="navigation"
        aria-label="Rescuer Navigation"
      >
        {navTabs.map(tab => {
          const isActive = rescuerNav === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setRescuerNav(tab.id)}
              id={`rescuer-nav-${tab.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                padding: '0.75rem 0.5rem',
                background: isActive ? '#ffffff' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '3px solid #16a34a' : '3px solid transparent',
                color: isActive ? '#16a34a' : '#64748b',
                fontWeight: isActive ? 800 : 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Main Body Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: '#f8fafc',
        }}
      >
        {/* ========================================================
            TAB 1: ASSIGNED CASES & CLUSTERS
        ======================================================== */}
        {rescuerNav === 'cases' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignedCases.length === 0 ? (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '12px',
                  padding: '3rem 1.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.85rem',
                }}
              >
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '50%' }}>
                  <CheckCircle2 size={36} color="#16a34a" />
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  No Active Assignments for Team Alpha
                </div>
                <div
                  style={{
                    fontSize: '0.82rem',
                    color: '#64748b',
                    maxWidth: '420px',
                    lineHeight: 1.5,
                  }}
                >
                  Your team is currently standing by. Switch to the <b>Admin / Control Center</b>{' '}
                  tab to dispatch <b>Rescue Team Alpha</b> to pending survivor clusters.
                </div>
              </div>
            ) : (
              assignedCases.map(incident => {
                const isSelected = activeCase?.id === incident.id;
                const members = incident.clusterMembers || [];

                return (
                  <div
                    key={incident.id}
                    onClick={() => setActiveCase(incident)}
                    style={{
                      background: '#ffffff',
                      border: isSelected ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.9rem',
                      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    {/* Header: ID, Urgency & Status */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '1.2rem',
                          fontWeight: 900,
                          color: '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <span>🚨</span>
                        <span>{incident.id}</span>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                          ({incident.survivorName})
                        </span>
                      </div>

                      <span
                        style={{
                          background: '#f0fdf4',
                          color: '#16a34a',
                          border: '1px solid #86efac',
                          borderRadius: '6px',
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                        }}
                      >
                        ASSIGNED TO YOUR UNIT
                      </span>
                    </div>

                    {/* Incident Telemetry Card */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        fontSize: '0.82rem',
                        color: '#334155',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <MapPin size={15} color="#dc2626" />
                        <span>
                          <b>Survivor Location:</b> {incident.lat.toFixed(4)},{' '}
                          {incident.lon.toFixed(4)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          color: '#0369a1',
                          fontWeight: 700,
                        }}
                      >
                        <Users size={15} color="#0284c7" />
                        <span>
                          👥 <b>Cluster Size: {members.length} people trapped nearby</b>
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          color: '#64748b',
                        }}
                      >
                        <Clock size={15} />
                        <span>
                          ⏱ <b>SOS received:</b> {incident.timeReceived}
                        </span>
                      </div>
                      {incident.notes && (
                        <div
                          style={{
                            background: '#fafaf9',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.75rem',
                            color: '#475569',
                            fontStyle: 'italic',
                          }}
                        >
                          "{incident.notes}"
                        </div>
                      )}
                    </div>

                    {/* PEOPLE IN THIS CLUSTER BREAKDOWN */}
                    <div
                      style={{
                        background: '#fafaf9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.65rem 0.85rem',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          color: '#0f172a',
                          marginBottom: '0.4rem',
                        }}
                      >
                        Survivors Awaiting Extraction ({members.length}):
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {members.map((m, idx) => (
                          <div
                            key={m.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.72rem',
                              color: '#334155',
                              borderBottom:
                                idx < members.length - 1 ? '1px dashed #e2e8f0' : 'none',
                              paddingBottom: '3px',
                            }}
                          >
                            <span>
                              <b>
                                {idx + 1}. {m.name}
                              </b>{' '}
                              — {m.condition}
                            </span>
                            <span style={{ color: '#64748b' }}>
                              {m.distanceMeters === 0 ? 'Center' : `${m.distanceMeters}m`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 4 Required Actions: VIEW LOCATION | NAVIGATE | ACKNOWLEDGE | CHAT */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.65rem',
                        borderTop: '1px solid #e2e8f0',
                        paddingTop: '0.85rem',
                      }}
                    >
                      {/* VIEW LOCATION */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setActiveCase(incident);
                          setRescuerNav('map');
                        }}
                        id="btn-rescuer-view-location"
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          color: '#0f172a',
                          padding: '0.65rem',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <MapPin size={15} color="#2563eb" />
                        <span>VIEW LOCATION</span>
                      </button>

                      {/* NAVIGATE */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setActiveCase(incident);
                          startNavigation();
                          setRescuerNav('map');
                        }}
                        id="btn-rescuer-navigate"
                        style={{
                          background: '#f0fdf4',
                          border: '1px solid #86efac',
                          color: '#16a34a',
                          padding: '0.65rem',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <Navigation size={15} color="#16a34a" />
                        <span>NAVIGATE</span>
                      </button>

                      {/* ACKNOWLEDGE */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          acknowledgeSos(incident.id);
                        }}
                        disabled={incident.acknowledged}
                        id="btn-rescuer-acknowledge"
                        style={{
                          background: incident.acknowledged ? '#f1f5f9' : '#dc2626',
                          border: incident.acknowledged ? '1px solid #cbd5e1' : 'none',
                          color: incident.acknowledged ? '#64748b' : '#ffffff',
                          padding: '0.65rem',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          cursor: incident.acknowledged ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <Check size={15} />
                        <span>{incident.acknowledged ? 'ACKNOWLEDGED' : 'ACKNOWLEDGE SOS'}</span>
                      </button>

                      {/* CHAT */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setActiveCase(incident);
                          setRescuerNav('messages');
                        }}
                        id="btn-rescuer-chat"
                        style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#2563eb',
                          padding: '0.65rem',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <MessageSquare size={15} />
                        <span>CHAT WITH SURVIVOR</span>
                      </button>
                    </div>

                    {/* Complete Extraction Button */}
                    <div
                      style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}
                    >
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          markResolved(incident.id);
                        }}
                        id="btn-rescuer-mark-resolved"
                        style={{
                          background: '#16a34a',
                          color: 'white',
                          border: 'none',
                          padding: '0.45rem 1rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                        }}
                      >
                        <ShieldCheck size={15} />
                        <span>RESOLVE RESCUE (SURVIVORS EVACUATED)</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ========================================================
            TAB 2: TACTICAL ROUTE & MAP VIEW (WITH ZOOM FIX)
        ======================================================== */}
        {rescuerNav === 'map' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', height: '100%' }}>
            {/* Live Navigation Telemetry Banner */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #86efac',
                borderRadius: '10px',
                padding: '0.75rem 1.15rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>
                  TACTICAL INTERCEPT ROUTE
                </div>
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    color: '#0f172a',
                    marginTop: '0.1rem',
                  }}
                >
                  Target: <b>{activeCase?.id || 'None'}</b> ({activeCase?.clusterMembers.length}{' '}
                  people)
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#16a34a' }}>
                    {navDistanceRemaining} m
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    ETA ~{navEtaMinutes} min
                  </div>
                </div>

                <button
                  onClick={stepNavigation}
                  title="Simulate advancing rescuer towards target coordinates"
                  style={{
                    background: '#16a34a',
                    color: 'white',
                    border: 'none',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <Navigation size={13} />
                  <span>Advance Intercept</span>
                </button>

                <button
                  onClick={fitRouteBounds}
                  title="Fit route & survivor on map"
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Maximize2 size={13} />
                </button>
              </div>
            </div>

            {/* Interactive Leaflet Map */}
            <div
              style={{
                flex: 1,
                minHeight: '320px',
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #cbd5e1',
                position: 'relative',
              }}
            >
              <div
                ref={mapContainerRef}
                style={{ width: '100%', height: '100%' }}
                id="rescuer-route-map"
              />

              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: '#ffffff',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  color: '#0f172a',
                  zIndex: 400,
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <div>
                  🟢 Unit Alpha:{' '}
                  <b>
                    {rescuerLocation.lat.toFixed(4)}, {rescuerLocation.lon.toFixed(4)}
                  </b>
                </div>
                <div>
                  🔴 Cluster Target:{' '}
                  <b>
                    {activeCase
                      ? `${activeCase.lat.toFixed(4)}, ${activeCase.lon.toFixed(4)}`
                      : 'N/A'}
                  </b>
                </div>
              </div>
            </div>

            {/* Acknowledge Button */}
            {activeCase && !activeCase.acknowledged && (
              <button
                onClick={() => acknowledgeSos(activeCase.id)}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                }}
              >
                <Check size={18} />
                <span>ACKNOWLEDGE SOS ("Help is on the way")</span>
              </button>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 3: DIRECT SURVIVOR COMMUNICATION
        ======================================================== */}
        {rescuerNav === 'messages' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
            {/* Header info */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.8rem',
              }}
            >
              <div>
                Active Channel:{' '}
                <strong style={{ color: '#0f172a' }}>
                  {activeCase ? `${activeCase.survivorName} (${activeCase.id})` : 'Survivor A'}
                </strong>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>
                ● Tactical Radio Link Connected
              </span>
            </div>

            {/* Message Feed */}
            <div
              style={{
                flex: 1,
                minHeight: '240px',
                background: '#fafaf9',
                borderRadius: '10px',
                padding: '0.85rem',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                border: '1px solid #e2e8f0',
              }}
            >
              {rescuerMessages.map(msg => {
                const isMe = msg.sender === 'rescuer';
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      background: isMe ? '#16a34a' : '#ffffff',
                      color: isMe ? '#ffffff' : '#0f172a',
                      border: isMe ? 'none' : '1px solid #e2e8f0',
                      borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      padding: '0.6rem 0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: isMe ? '#dcfce7' : '#2563eb',
                      }}
                    >
                      {msg.senderName}
                    </div>
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>{msg.text}</div>
                    <div
                      style={{
                        fontSize: '0.62rem',
                        color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                        alignSelf: 'flex-end',
                      }}
                    >
                      {msg.timestamp}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Tactical Replies */}
            <div
              style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem' }}
            >
              {[
                'We have received your SOS. Stay at your current location if safe.',
                'En route, ETA ~3 minutes. Can you hear our siren?',
                'Stay sheltered away from crumbling walls.',
                'We have medical personnel and stretchers on site.',
              ].map(chip => (
                <button
                  key={chip}
                  onClick={() => setChatInput(chip)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    borderRadius: '999px',
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.72rem',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                placeholder="Send tactical instructions to survivors..."
                style={{
                  flex: 1,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  color: '#0f172a',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSendChat}
                style={{
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0 1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RescuerView;
