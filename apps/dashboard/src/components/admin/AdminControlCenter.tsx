import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  MapPin,
  Users,
  Clock,
  UserCheck,
  CheckCircle2,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Layers,
  Phone,
  Radio,
  Activity,
  Compass,
  Check,
} from 'lucide-react';
import L from 'leaflet';
import { useRescueStore, AdminNav, SosIncident, ClusterMember } from '../../store/rescueStore';

export const AdminControlCenter: React.FC = () => {
  const {
    adminNav,
    setAdminNav,
    sosList,
    teams,
    selectedSosId,
    selectedPersonId,
    selectSos,
    selectPerson,
    assignTeam,
    showIndividualPins,
    showClusterBoundaries,
    toggleIndividualPins,
    toggleClusterBoundaries,
  } = useRescueStore();

  const [assignModalIncident, setAssignModalIncident] = useState<SosIncident | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('Rescue Team Alpha');
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>('SOS #1024');

  // Leaflet map reference & state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const clusterCirclesRef = useRef<{ [key: string]: L.Circle }>({});
  const clusterBadgesRef = useRef<{ [key: string]: L.Marker }>({});
  const peopleMarkersRef = useRef<{ [key: string]: L.Marker[] }>({});

  const activeIncident = sosList.find((s) => s.id === selectedSosId) || sosList[0];

  // Helper to fit map bounds accurately
  const fitMapToAllIncidents = (mapToFit?: L.Map | null) => {
    const targetMap = mapToFit || mapInstanceRef.current || mapInstance;
    if (!targetMap || sosList.length === 0) return;

    try {
      const bounds = L.latLngBounds([]);
      sosList.forEach((inc) => {
        bounds.extend([inc.lat, inc.lon]);
        if (inc.clusterMembers) {
          inc.clusterMembers.forEach((p) => bounds.extend([p.lat, p.lon]));
        }
      });

      if (bounds.isValid()) {
        targetMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    } catch {
      // Fallback
    }
  };

  // 1. Initialize Map with reliable OpenStreetMap tiles
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up previous map if exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    const defaultCenter: [number, number] = [18.5204, 73.8567];
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 15,
      zoomControl: true,
    });

    // Standard OpenStreetMap tiles (100% reliable, zero API key needed)
    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });

    tileLayer.on('tileerror', () => {
      tileLayer.setUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}');
    });

    tileLayer.addTo(map);

    mapInstanceRef.current = map;
    setMapInstance(map);

    // Ensure map tiles calculate correct pixel sizes
    const t1 = setTimeout(() => {
      map.invalidateSize();
      fitMapToAllIncidents(map);
    }, 100);

    const t2 = setTimeout(() => {
      map.invalidateSize();
    }, 400);

    const handleWindowResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleWindowResize);
      map.remove();
      mapInstanceRef.current = null;
      setMapInstance(null);
    };
  }, [adminNav]);

  // 2. Render Clusters AND Individual People on the Map
  useEffect(() => {
    if (!mapInstance) return;
    const map = mapInstance;

    // Clean up previous elements
    Object.values(clusterCirclesRef.current).forEach((c) => c.remove());
    clusterCirclesRef.current = {};

    Object.values(clusterBadgesRef.current).forEach((b) => b.remove());
    clusterBadgesRef.current = {};

    Object.values(peopleMarkersRef.current).forEach((markers) => {
      markers.forEach((m) => m.remove());
    });
    peopleMarkersRef.current = {};

    sosList.forEach((incident) => {
      const isSelected = incident.id === selectedSosId;
      const isResolved = incident.status === 'Resolved';
      const isAssigned = incident.status === 'Assigned' || incident.status === 'In Progress';
      const themeColor = isResolved ? '#16a34a' : isAssigned ? '#2563eb' : '#dc2626';

      const radius = incident.clusterRadiusMeters || 45;
      const members: ClusterMember[] = incident.clusterMembers || [];

      // A. Render Cluster Boundary Zone Circle
      if (showClusterBoundaries) {
        const circle = L.circle([incident.lat, incident.lon], {
          radius: radius,
          color: themeColor,
          fillColor: themeColor,
          fillOpacity: isSelected ? 0.16 : 0.08,
          weight: isSelected ? 2.5 : 1.5,
          dashArray: isSelected ? undefined : '5, 5',
        }).addTo(map);

        circle.on('click', () => {
          selectSos(incident.id);
        });

        clusterCirclesRef.current[incident.id] = circle;
      }

      // B. Render Cluster Summary Badge Pin
      const clusterBadgeIcon = L.divIcon({
        className: 'cluster-label-badge',
        html: `
          <div style="background: white; border: 2px solid ${themeColor}; border-radius: 999px; padding: 3px 8px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15); display: flex; align-items: center; gap: 6px; transform: translate(-50%, -100%); cursor: pointer;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${themeColor};"></div>
            <span style="font-weight: 800; font-size: 11px; color: #0f172a; white-space: nowrap;">Cluster ${incident.id}</span>
            <span style="background: ${isResolved ? '#f0fdf4' : isAssigned ? '#eff6ff' : '#fef2f2'}; color: ${themeColor}; padding: 1px 6px; border-radius: 999px; font-weight: 800; font-size: 10px;">
              ${members.length} People
            </span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, -8],
      });

      const badgeMarker = L.marker([incident.lat + 0.00045, incident.lon], { icon: clusterBadgeIcon }).addTo(map);
      badgeMarker.on('click', () => {
        selectSos(incident.id);
      });
      clusterBadgesRef.current[incident.id] = badgeMarker;

      // C. Render Individual People Pins Inside This Cluster
      if (showIndividualPins) {
        const personMarkers: L.Marker[] = [];

        members.forEach((person, idx) => {
          const isLead = idx === 0;
          const isPersonSelected = selectedPersonId === person.id;
          const personPinColor = isLead ? themeColor : '#0284c7';

          const personIcon = L.divIcon({
            className: 'individual-person-pin',
            html: `
              <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; transform: translate(-50%, -50%);">
                <div style="background: ${isPersonSelected ? '#0f172a' : personPinColor}; color: white; width: ${isLead ? '28px' : '22px'}; height: ${isLead ? '28px' : '22px'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: ${isLead ? '11px' : '10px'}; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.25);">
                  ${isLead ? '★' : `${idx + 1}`}
                </div>
                <div style="background: white; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 4px; margin-top: 2px; font-size: 9px; font-weight: 700; color: #0f172a; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                  ${person.name.split(' ')[0]}
                </div>
              </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

          const pMarker = L.marker([person.lat, person.lon], { icon: personIcon }).addTo(map);

          pMarker.bindPopup(`
            <div style="font-family: inherit; font-size: 12px; color: #0f172a; min-width: 180px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="color: ${personPinColor}; font-size: 13px;">${person.name}</strong>
                ${isLead ? '<span style="background: #fef2f2; color: #dc2626; font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 4px;">LEAD</span>' : ''}
              </div>
              <div style="font-size: 11px; color: #475569; margin-bottom: 3px;"><b>Condition:</b> ${person.condition}</div>
              <div style="font-size: 11px; color: #475569; margin-bottom: 3px;"><b>Cluster:</b> ${incident.id} (${incident.survivorName})</div>
              ${person.phone ? `<div style="font-size: 11px; color: #475569; margin-bottom: 3px;"><b>Phone:</b> ${person.phone}</div>` : ''}
              <div style="font-size: 10px; color: #64748b; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 3px;">
                Offset: ${person.distanceMeters}m from beacon • Battery: ${person.battery || 70}%
              </div>
            </div>
          `);

          pMarker.on('click', () => {
            selectSos(incident.id);
            selectPerson(person.id);
          });

          personMarkers.push(pMarker);
        });

        peopleMarkersRef.current[incident.id] = personMarkers;
      }
    });
  }, [mapInstance, sosList, selectedSosId, selectedPersonId, showClusterBoundaries, showIndividualPins, selectSos, selectPerson]);

  // Center on selected incident smoothly
  useEffect(() => {
    if (!selectedSosId || !mapInstance) return;
    const incident = sosList.find((s) => s.id === selectedSosId);
    if (incident && mapInstance) {
      mapInstance.flyTo([incident.lat, incident.lon], 16, { duration: 0.6 });
    }
  }, [selectedSosId, mapInstance, sosList]);

  const handleConfirmAssignment = () => {
    if (!assignModalIncident) return;
    assignTeam(assignModalIncident.id, selectedTeamName);
    setAssignModalIncident(null);
  };

  const navTabs: { id: AdminNav; label: string; icon: React.ReactNode }[] = [
    { id: 'requests', label: 'SOS Incident Queue', icon: <ShieldAlert size={16} /> },
    { id: 'map', label: 'Full Dispatch Map', icon: <MapPin size={16} /> },
    { id: 'teams', label: 'Rescue Response Teams', icon: <Users size={16} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: '#f8fafc' }}>
      
      {/* ========================================================
          1. SUB-NAV / CONTROL BAR (PROFESSIONAL LIGHT THEME)
      ======================================================== */}
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={18} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
              Command & Control Dispatch
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Live Incident Triage, Survivor Cluster Monitoring & Team Assignment
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div
          style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            gap: '3px',
          }}
        >
          {navTabs.map((tab) => {
            const isActive = adminNav === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setAdminNav(tab.id)}
                id={`admin-nav-${tab.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.85rem',
                  background: isActive ? '#ffffff' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: isActive ? '#0f172a' : '#64748b',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================
          2. MAIN CONTENT AREA
      ======================================================== */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ========================================================
            VIEW 1: SOS REQUESTS (SPLIT LIST + MAP)
        ======================================================== */}
        {(adminNav === 'requests' || adminNav === 'map') && (
          <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            
            {/* LEFT PANEL: SOS INCIDENTS LIST */}
            <div
              style={{
                width: adminNav === 'map' ? '360px' : '460px',
                minWidth: '340px',
                background: '#ffffff',
                borderRight: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                zIndex: 10,
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '0.85rem 1.15rem',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#fafaf9',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                    Active Incidents & Clusters
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Click an incident to view cluster and individual people
                  </div>
                </div>
                <span
                  style={{
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  {sosList.filter((s) => s.status !== 'Resolved').length} Unresolved
                </span>
              </div>

              {/* Scrollable Incident Cards List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {sosList.map((item) => {
                  const isSelected = item.id === selectedSosId;
                  const isEmergency = item.urgency === 'Emergency';
                  const isAssigned = item.status === 'Assigned' || item.status === 'In Progress';
                  const isResolved = item.status === 'Resolved';
                  const isExpanded = expandedClusterId === item.id;
                  const members = item.clusterMembers || [];

                  return (
                    <div
                      key={item.id}
                      onClick={() => selectSos(item.id)}
                      id={`sos-card-${item.id.replace(/[^a-zA-Z0-9]/g, '')}`}
                      style={{
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        border: isSelected
                          ? '2px solid #2563eb'
                          : isEmergency && !isAssigned && !isResolved
                          ? '1px solid #fca5a5'
                          : '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                        boxShadow: isSelected
                          ? '0 4px 14px rgba(37, 99, 235, 0.12)'
                          : '0 1px 3px rgba(0, 0, 0, 0.04)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Top Header: ID, Urgency, Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>
                            {item.id}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ({item.survivorName})
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            background: isResolved
                              ? '#f0fdf4'
                              : isAssigned
                              ? '#eff6ff'
                              : '#fef2f2',
                            color: isResolved ? '#16a34a' : isAssigned ? '#2563eb' : '#dc2626',
                            border: isResolved
                              ? '1px solid #86efac'
                              : isAssigned
                              ? '1px solid #bfdbfe'
                              : '1px solid #fca5a5',
                          }}
                        >
                          {item.status}
                        </span>
                      </div>

                      {/* Location & Time */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', color: '#334155' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <MapPin size={14} color="#dc2626" />
                            <span>📍 <b>{item.lat.toFixed(4)}, {item.lon.toFixed(4)}</b></span>
                          </div>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#64748b', fontSize: '0.72rem' }}>
                            <Clock size={12} />
                            <span>{item.timeReceived}</span>
                          </span>
                        </div>

                        {/* Cluster Info */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#0369a1', fontWeight: 700 }}>
                            <Users size={14} color="#0284c7" />
                            <span>👥 Cluster: {members.length} survivors nearby</span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Radius ~{item.clusterRadiusMeters}m
                          </span>
                        </div>
                      </div>

                      {/* INDIVIDUAL PEOPLE EXPANDABLE DRAWER */}
                      <div
                        style={{
                          background: '#fafaf9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedClusterId(isExpanded ? null : item.id);
                          }}
                          style={{
                            padding: '0.45rem 0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            cursor: 'pointer',
                            background: isExpanded ? '#f1f5f9' : '#fafaf9',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Users size={13} color="#2563eb" />
                            <span>Individual People in Cluster ({members.length})</span>
                          </span>
                          {isExpanded ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
                        </div>

                        {isExpanded && (
                          <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid #e2e8f0' }}>
                            {members.map((person, idx) => {
                              const isSelectedPerson = selectedPersonId === person.id;
                              return (
                                <div
                                  key={person.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectPerson(person.id);
                                    if (mapInstanceRef.current) {
                                      mapInstanceRef.current.flyTo([person.lat, person.lon], 17, { duration: 0.5 });
                                    }
                                  }}
                                  style={{
                                    background: isSelectedPerson ? '#eff6ff' : '#ffffff',
                                    border: isSelectedPerson ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    padding: '0.45rem 0.6rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.2rem',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>
                                      {idx + 1}. {person.name}
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                                      {person.distanceMeters === 0 ? 'Center' : `+${person.distanceMeters}m`}
                                    </span>
                                  </div>
                                  <div style={{ color: '#475569', fontSize: '0.7rem' }}>
                                    {person.condition}
                                  </div>
                                  {person.emergencyNeeds && person.emergencyNeeds.length > 0 && (
                                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
                                      {person.emergencyNeeds.map((need) => (
                                        <span
                                          key={need}
                                          style={{
                                            background: '#fef2f2',
                                            color: '#dc2626',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                          }}
                                        >
                                          {need}
                                        </span>
                                      ))}
                                      {person.phone && (
                                        <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                          <Phone size={10} />
                                          {person.phone}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Team Assignment & Action */}
                      <div
                        style={{
                          borderTop: '1px solid #e2e8f0',
                          paddingTop: '0.6rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem' }}>
                          Assigned Team:{' '}
                          <strong style={{ color: item.assignedTeam ? '#2563eb' : '#dc2626' }}>
                            {item.assignedTeam || 'None (Pending)'}
                          </strong>
                        </div>

                        {!isResolved && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignModalIncident(item);
                            }}
                            id={`btn-assign-team-${item.id.replace(/[^a-zA-Z0-9]/g, '')}`}
                            style={{
                              padding: '0.4rem 0.85rem',
                              background: isAssigned ? '#f1f5f9' : '#dc2626',
                              color: isAssigned ? '#0f172a' : '#ffffff',
                              border: isAssigned ? '1px solid #cbd5e1' : 'none',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: isAssigned ? 'none' : '0 2px 6px rgba(220, 38, 38, 0.25)',
                            }}
                          >
                            <UserCheck size={14} />
                            <span>{isAssigned ? 'REASSIGN TEAM' : 'ASSIGN TEAM'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT PANEL: FULL GIS DISPATCH MAP */}
            <div style={{ flex: 1, position: 'relative', height: '100%', background: '#f1f5f9' }}>
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} id="admin-dispatch-map" />

              {/* Floating Map Controls at Top Left */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '0.6rem 0.85rem',
                  zIndex: 500,
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showClusterBoundaries}
                    onChange={toggleClusterBoundaries}
                  />
                  <span>Cluster Zones</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showIndividualPins}
                    onChange={toggleIndividualPins}
                  />
                  <span>Individual People Pins</span>
                </label>

                {/* Map Zoom Fix / Fit All Incidents Button */}
                <button
                  onClick={() => fitMapToAllIncidents()}
                  title="Fit and center all incidents on map (Fix Zoom)"
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <Maximize2 size={12} />
                  <span>Fit All</span>
                </button>
              </div>

              {/* Selected Incident Telemetry Card at Bottom Left of Map */}
              {activeIncident && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '16px',
                    left: '16px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '0.85rem 1.15rem',
                    zIndex: 500,
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                    maxWidth: '380px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0f172a' }}>
                      {activeIncident.id}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: activeIncident.status === 'Resolved' ? '#f0fdf4' : '#eff6ff',
                        color: activeIncident.status === 'Resolved' ? '#16a34a' : '#2563eb',
                      }}
                    >
                      {activeIncident.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                    <b>Survivor Cluster:</b> {activeIncident.clusterMembers.length} people nearby • 📍 {activeIncident.lat.toFixed(4)}, {activeIncident.lon.toFixed(4)}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Assigned: <strong style={{ color: activeIncident.assignedTeam ? '#2563eb' : '#dc2626' }}>{activeIncident.assignedTeam || 'None'}</strong>
                  </div>

                  {activeIncident.status !== 'Resolved' && (
                    <button
                      onClick={() => setAssignModalIncident(activeIncident)}
                      style={{
                        marginTop: '0.2rem',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.4rem',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {activeIncident.assignedTeam ? 'Reassign Team' : 'Assign Team to this Cluster'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 2: RESCUE TEAMS LIST
        ======================================================== */}
        {adminNav === 'teams' && (
          <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', maxWidth: '880px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                Field Rescue Teams
              </h2>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                Deployment availability, team leadership, and vehicle readiness
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {teams.map((t) => {
                const isAvailable = t.status === 'Available';
                return (
                  <div
                    key={t.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#0f172a' }}>
                        {t.name}
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: isAvailable ? '#f0fdf4' : '#eff6ff',
                          color: isAvailable ? '#16a34a' : '#2563eb',
                          border: isAvailable ? '1px solid #86efac' : '1px solid #bfdbfe',
                        }}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                      <div><b>Lead:</b> {t.lead}</div>
                      <div><b>Strength:</b> {t.members} trained rescuers</div>
                      <div><b>Vehicle:</b> {t.vehicle}</div>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                      Active Assignment:{' '}
                      <strong style={{ color: t.currentSosId ? '#2563eb' : '#64748b' }}>
                        {t.currentSosId || 'Standing by (No Active Case)'}
                      </strong>
                    </div>

                    <button
                      onClick={() => setAdminNav('requests')}
                      style={{
                        marginTop: '0.25rem',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        color: '#0f172a',
                        padding: '0.45rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      View Incident Queue
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ========================================================
          ASSIGN RESCUE TEAM MODAL (CLEAN LIGHT PROFESSIONAL)
      ======================================================== */}
      {assignModalIncident && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              padding: '1.5rem',
              width: '92%',
              maxWidth: '460px',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.16)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.15rem',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                  Assign Rescue Team
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.15rem' }}>
                  Target: <b>{assignModalIncident.id}</b> ({assignModalIncident.clusterMembers.length} survivors in cluster)
                </div>
              </div>
              <button
                onClick={() => setAssignModalIncident(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Select Team Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                Select Available Field Unit:
              </div>

              {teams.map((t) => {
                const isSelected = selectedTeamName === t.name;
                const isAvailable = t.status === 'Available';
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTeamName(t.name)}
                    style={{
                      background: isSelected ? '#eff6ff' : '#fafaf9',
                      border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Lead: {t.lead} • {t.members} Rescuers
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '4px',
                        background: isAvailable ? '#f0fdf4' : '#eff6ff',
                        color: isAvailable ? '#16a34a' : '#2563eb',
                      }}
                    >
                      {t.status}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.25rem' }}>
              <button
                onClick={() => setAssignModalIncident(null)}
                style={{
                  flex: 1,
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  padding: '0.65rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmAssignment}
                id="btn-confirm-assign-team"
                style={{
                  flex: 1.5,
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  padding: '0.65rem',
                  borderRadius: '8px',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                }}
              >
                <Check size={16} />
                <span>DISPATCH TEAM</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminControlCenter;
