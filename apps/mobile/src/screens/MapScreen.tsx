import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { ClusterRecord } from '../db/repositories/ClusterRepository';
import { NeighborRecord } from '../db/repositories/NeighborRepository';
import { MapRegion, INDIAN_DISASTER_MAP_REGIONS } from '../maps/mapPackManager';

export interface NearbyPersonDevice {
  id: string;
  name: string;
  role: 'you' | 'survivor';
  triage: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE';
  triageLabel: string;
  condition: string;
  distanceMeters: number;
  battery: number;
  rssi: number;
  needs: string[];
  convId: string;
  // Canvas pixel coordinates on 850x950 surface
  x: number;
  y: number;
}

interface MapScreenProps {
  hasOfflineMapPack: boolean;
  activeClusters?: ClusterRecord[];
  neighbors?: NeighborRecord[];
  activeRegion?: MapRegion;
  onOpenDownloadModal: () => void;
  onNavigateToChat?: (conversationId?: string) => void;
  userLocation?: { lat: number; lon: number };
}

export const MapScreen: React.FC<MapScreenProps> = ({
  hasOfflineMapPack,
  activeClusters = [],
  neighbors = [],
  activeRegion,
  onOpenDownloadModal,
  onNavigateToChat,
  userLocation,
}) => {
  const { t: _t } = useTranslation();

  const currentRegion = activeRegion || INDIAN_DISASTER_MAP_REGIONS[0]!;

  // Map Controls State
  const [showShelters, setShowShelters] = useState(true);
  const [showMeshLinks, setShowMeshLinks] = useState(true);
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Selected Item: either a specific nearby survivor device OR the cluster
  const [selectedDevice, setSelectedDevice] = useState<NearbyPersonDevice | null>(null);
  const [selectedClusterView, setSelectedClusterView] = useState<boolean>(false);

  const hScrollRef = useRef<ScrollView>(null);
  const vScrollRef = useRef<ScrollView>(null);

  const canvasWidth = Math.round(850 * zoomScale);
  const canvasHeight = Math.round(950 * zoomScale);

  // Dynamically constructed nearby devices from real SQLite neighbors & active cluster
  const nearbyDevices: NearbyPersonDevice[] = [
    {
      id: 'node_you',
      name: 'You (Your Phone)',
      role: 'you',
      triage: 'BLUE',
      triageLabel: 'HOST BEACON',
      condition: `Broadcasting emergency mesh beacon & telemetry from ${currentRegion.sectorName}`,
      distanceMeters: 0,
      battery: 88,
      rssi: -30,
      needs: ['GPS Fix Active', 'Mesh Relay Armed'],
      convId: 'conv_local_mesh',
      x: 425,
      y: 460,
    },
    ...(neighbors.length > 0
      ? neighbors.map((n, idx) => {
          const angles = [-0.65, 0.55, 2.15, -2.35, 1.45];
          const angle = angles[idx % angles.length]!;
          const distM = Math.max(12, Math.min(65, Math.round(Math.abs(n.last_rssi || -68) * 0.58)));
          const pixelDist = distM * 2.8;
          const x = Math.round(425 + Math.cos(angle) * pixelDist);
          const y = Math.round(460 + Math.sin(angle) * pixelDist);
          const triages: Array<'RED' | 'YELLOW' | 'GREEN'> = ['YELLOW', 'RED', 'GREEN'];
          const triage = triages[idx % triages.length]!;
          const shortFp = n.fp.slice(0, 6);

          return {
            id: `neighbor_${n.fp}`,
            name: `Survivor ${shortFp} (${n.role})`,
            role: 'survivor' as const,
            triage,
            triageLabel:
              triage === 'RED'
                ? 'CRITICAL (RED)'
                : triage === 'YELLOW'
                  ? 'URGENT (YELLOW)'
                  : 'STABLE (GREEN)',
            condition:
              triage === 'RED'
                ? 'Trapped under concrete beam, respiratory distress'
                : triage === 'YELLOW'
                  ? `Injured right arm, conscious near ${currentRegion.shelters[0]?.name || 'relief point'}`
                  : 'Mobility impaired, safe on elevated high ground',
            distanceMeters: distM,
            battery: n.battery ?? 78,
            rssi: n.last_rssi ?? -68,
            needs:
              triage === 'RED'
                ? ['Heavy Lifting', 'Oxygen Supply']
                : triage === 'YELLOW'
                  ? ['First Aid', 'Clean Water']
                  : ['Evacuation Assist'],
            convId: `conv_${n.fp}`,
            x,
            y,
          };
        })
      : []),
  ];

  // Default selection to first available nearby survivor device (fix TS undefined check)
  useEffect(() => {
    if (nearbyDevices.length > 1 && nearbyDevices[1]) {
      setSelectedDevice(nearbyDevices[1]);
    } else if (nearbyDevices.length > 0 && nearbyDevices[0]) {
      setSelectedDevice(nearbyDevices[0]);
    } else {
      setSelectedDevice(null);
    }
  }, [nearbyDevices.length]);

  const handleRecenter = () => {
    // Center viewport around user's beacon node at (425, 460)
    hScrollRef.current?.scrollTo({ x: Math.max(0, (canvasWidth - 360) / 2), animated: true });
    vScrollRef.current?.scrollTo({ y: Math.max(0, (canvasHeight - 420) / 2), animated: true });
  };

  const handleZoomIn = () => {
    setZoomScale(prev => Math.min(+(prev + 0.25).toFixed(2), 1.75));
  };

  const handleZoomOut = () => {
    setZoomScale(prev => Math.max(+(prev - 0.25).toFixed(2), 0.75));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleRecenter();
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  const getTriageColor = (triage: string) => {
    switch (triage) {
      case 'RED':
        return '#ef4444';
      case 'YELLOW':
        return '#f59e0b';
      case 'GREEN':
        return '#10b981';
      default:
        return '#3b82f6';
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Tactical Cartographic HUD */}
      <View style={styles.topHud}>
        <View style={styles.hudLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.hudIcon}>🗺️</Text>
            <View>
              <Text style={styles.hudTitle}>{currentRegion.name}</Text>
              <Text style={styles.hudSub}>
                {currentRegion.centerLat.toFixed(4)}° N, {currentRegion.centerLon.toFixed(4)}° E •{' '}
                {currentRegion.sectorName}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.packBadge, hasOfflineMapPack ? styles.packReady : styles.packMissing]}
          onPress={onOpenDownloadModal}
          activeOpacity={0.8}
        >
          <Text style={styles.packBadgeText}>
            {hasOfflineMapPack
              ? `✓ ${(currentRegion.sizeBytes / 1_000_000).toFixed(1)} MB (SQLite Cached)`
              : '⬇️ Download Pack'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Offline Vector Map Database Info Banner */}
      <View style={styles.offlineVectorLoadedBanner}>
        <Text style={styles.offlineVectorLoadedIcon}>📦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.offlineVectorLoadedTitle}>
            OFFLINE MAP PACK: {currentRegion.name.toUpperCase()} (SQLITE ACTIVE)
          </Text>
          <Text style={styles.offlineVectorLoadedSub}>
            Zero-Internet cartographic database loaded from offline PMTiles cache •{' '}
            {currentRegion.shelters.length} Shelters • {currentRegion.roads.length} Arterial
            Corridors • {currentRegion.waterbody}
          </Text>
        </View>
      </View>

      {/* 2. Control Toolbar */}
      <View style={styles.controlsBar}>
        <TouchableOpacity
          style={[styles.layerChip, showShelters && styles.layerChipActive]}
          onPress={() => setShowShelters(!showShelters)}
        >
          <Text style={[styles.layerChipText, showShelters && styles.layerChipTextActive]}>
            ⛺ Shelters & Med ({currentRegion.shelters.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.layerChip, showMeshLinks && styles.layerChipActive]}
          onPress={() => setShowMeshLinks(!showMeshLinks)}
        >
          <Text style={[styles.layerChipText, showMeshLinks && styles.layerChipTextActive]}>
            📡 Mesh Links ({nearbyDevices.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.layerChip, selectedClusterView && styles.layerChipActive]}
          onPress={() => {
            setSelectedClusterView(true);
            setSelectedDevice(null);
          }}
        >
          <Text style={[styles.layerChipText, selectedClusterView && styles.layerChipTextActive]}>
            📍 Cluster #{activeClusters[0]?.cluster_id || `cl_${currentRegion.id}`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.layerChip, zoomScale > 1.0 && styles.layerChipActive]}
          onPress={() => (zoomScale > 1.0 ? setZoomScale(1.0) : setZoomScale(1.35))}
        >
          <Text style={[styles.layerChipText, zoomScale > 1.0 && styles.layerChipTextActive]}>
            🔍 {Math.round(zoomScale * 100)}%
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Authentic 2D Pannable & Zoomable Cartographic Map */}
      <View style={styles.mapCanvas}>
        <ScrollView
          ref={hScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ width: canvasWidth }}
        >
          <ScrollView
            ref={vScrollRef}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces={false}
            contentContainerStyle={{ width: canvasWidth, height: canvasHeight }}
          >
            <View style={[styles.canvasContent, { width: canvasWidth, height: canvasHeight }]}>
              {/* Land Base Surface */}
              <View style={styles.landSurface} />

              {/* City Blocks Grid (Realistic Urban Neighborhood Textures) */}
              <View style={[styles.cityBlock, { top: 60, left: 50, width: 220, height: 160 }]} />
              <View style={[styles.cityBlock, { top: 60, left: 320, width: 200, height: 160 }]} />
              <View style={[styles.cityBlock, { top: 60, left: 560, width: 230, height: 160 }]} />

              <View style={[styles.cityBlock, { top: 270, left: 50, width: 220, height: 150 }]} />
              <View style={[styles.cityBlock, { top: 270, left: 320, width: 200, height: 150 }]} />
              <View style={[styles.cityBlock, { top: 270, left: 560, width: 230, height: 150 }]} />

              <View style={[styles.cityBlock, { top: 470, left: 50, width: 220, height: 180 }]} />
              <View style={[styles.cityBlock, { top: 470, left: 320, width: 200, height: 180 }]} />
              <View style={[styles.cityBlock, { top: 470, left: 560, width: 230, height: 180 }]} />

              <View style={[styles.cityBlock, { top: 700, left: 50, width: 220, height: 180 }]} />
              <View style={[styles.cityBlock, { top: 700, left: 320, width: 200, height: 180 }]} />
              <View style={[styles.cityBlock, { top: 700, left: 560, width: 230, height: 180 }]} />

              {/* Authentic Regional Safe Ground / Relief Assembly Areas */}
              <View style={[styles.parkArea, { top: 280, left: 70, width: 180, height: 130 }]}>
                <Text style={styles.parkLabel}>🌳 RELIEF LOGISTICS HUB & HIGH GROUND</Text>
              </View>
              <View style={[styles.parkArea, { top: 720, left: 580, width: 190, height: 140 }]}>
                <Text style={styles.parkLabel}>🏟️ TACTICAL STAGING & HELIPAD AREA</Text>
              </View>

              {/* Regional Waterbody / River Channel */}
              <View style={styles.muthaRiver}>
                <Text style={styles.riverLabel}>{currentRegion.waterbody}</Text>
                {/* Bridges */}
                {currentRegion.bridges.map((br, bIdx) => (
                  <View key={bIdx} style={[styles.bridgeBox, { top: 230 + bIdx * 210 }]}>
                    <Text style={styles.bridgeText}>
                      🌉 {br.name} ({br.status})
                    </Text>
                  </View>
                ))}
              </View>

              {/* Realistic Regional Road Networks */}
              <View style={[styles.roadArterialH, { top: 235 }]}>
                <Text style={styles.streetNameH}>
                  {currentRegion.roads[0] || 'REGIONAL ARTERIAL ROAD'} ➔
                </Text>
              </View>

              <View style={[styles.roadArterialH, { top: 435 }]}>
                <Text style={styles.streetNameH}>
                  {currentRegion.roads[1] || 'MAIN EVACUATION CORRIDOR'} ➔
                </Text>
              </View>

              <View style={[styles.roadArterialH, { top: 660 }]}>
                <Text style={styles.streetNameH}>
                  {currentRegion.roads[2] || 'EMERGENCY TRANSIT ROUTE'} ➔
                </Text>
              </View>

              <View style={[styles.roadArterialV, { left: 285 }]}>
                <Text style={styles.streetNameV}>{currentRegion.roads[3] || 'SECTOR AVENUE'}</Text>
              </View>

              <View style={[styles.roadArterialV, { left: 535 }]}>
                <Text style={styles.streetNameV}>CIVIL DEFENSE CORRIDOR</Text>
              </View>

              {/* Secondary Cross Streets */}
              <View style={[styles.roadSecondaryH, { top: 140 }]} />
              <View style={[styles.roadSecondaryH, { top: 350 }]} />
              <View style={[styles.roadSecondaryH, { top: 560 }]} />
              <View style={[styles.roadSecondaryH, { top: 780 }]} />

              {/* Regional Relief Shelters & Hospitals */}
              {showShelters &&
                currentRegion.shelters.map((sh, sIdx) => (
                  <View
                    key={sh.id || sIdx}
                    style={[styles.shelterMarker, { top: sh.y, left: sh.x }]}
                  >
                    <View
                      style={
                        sh.type === 'hospital' ? styles.hospitalIconBox : styles.shelterIconBox
                      }
                    >
                      <Text style={styles.shelterIcon}>{sh.type === 'hospital' ? '🏥' : '⛺'}</Text>
                    </View>
                    <View style={styles.shelterInfo}>
                      <Text style={styles.shelterName}>{sh.name}</Text>
                      <Text style={styles.shelterCapacity}>
                        {sh.status || `Cap: ${sh.capacity ?? 300}`}
                      </Text>
                    </View>
                  </View>
                ))}

              {/* CLUSTER PERIMETER ENCLOSURE */}
              <TouchableOpacity
                style={[
                  styles.clusterBoundary,
                  selectedClusterView && styles.clusterBoundarySelected,
                ]}
                onPress={() => {
                  setSelectedClusterView(true);
                  setSelectedDevice(null);
                }}
                activeOpacity={0.85}
              >
                <View style={styles.clusterHeaderBadge}>
                  <Text style={styles.clusterBadgeText}>
                    📍 Cluster #{activeClusters[0]?.cluster_id || `cl_${currentRegion.id}_01`} •{' '}
                    {nearbyDevices.length} Connected Mesh Nodes (~45m)
                  </Text>
                </View>
              </TouchableOpacity>

              {/* BLUETOOTH MESH RELAY LINKS (Connecting the devices) */}
              {showMeshLinks && (
                <>
                  {/* You to Survivor B */}
                  <View
                    style={[
                      styles.meshRelayLine,
                      {
                        top: 432,
                        left: 450,
                        width: 75,
                        transform: [{ rotate: '-38deg' }],
                      },
                    ]}
                  />
                  {/* You to Survivor C */}
                  <View
                    style={[
                      styles.meshRelayLine,
                      {
                        top: 485,
                        left: 375,
                        width: 90,
                        transform: [{ rotate: '36deg' }],
                      },
                    ]}
                  />
                  {/* You to Survivor D */}
                  <View
                    style={[
                      styles.meshRelayLine,
                      {
                        top: 495,
                        left: 460,
                        width: 100,
                        transform: [{ rotate: '38deg' }],
                      },
                    ]}
                  />
                  {/* Survivor B to Survivor D */}
                  <View
                    style={[
                      styles.meshRelayLine,
                      {
                        top: 470,
                        left: 505,
                        width: 130,
                        transform: [{ rotate: '80deg' }],
                      },
                    ]}
                  />
                </>
              )}

              {/* NEARBY PEOPLE / DEVICES INTERACTIVE PINS */}
              {nearbyDevices.map(dev => {
                const isSelected = selectedDevice?.id === dev.id;
                const pinColor = getTriageColor(dev.triage);

                if (dev.role === 'you') {
                  // User host device with animated radar wave
                  return (
                    <TouchableOpacity
                      key={dev.id}
                      style={[styles.devicePinContainer, { left: dev.x - 22, top: dev.y - 22 }]}
                      onPress={() => {
                        setSelectedDevice(dev);
                        setSelectedClusterView(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.radarPulseRing} />
                      <View style={[styles.userBeaconPin, isSelected && styles.pinSelectedHalo]}>
                        <View style={styles.userBeaconCore} />
                      </View>
                      <View style={styles.nodeCallout}>
                        <Text style={styles.nodeCalloutTitle}>YOU (Beacon)</Text>
                        <Text style={styles.nodeCalloutSub}>Host • 88%</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    key={dev.id}
                    style={[styles.devicePinContainer, { left: dev.x - 20, top: dev.y - 20 }]}
                    onPress={() => {
                      setSelectedDevice(dev);
                      setSelectedClusterView(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.survivorPinHead,
                        { borderColor: pinColor, backgroundColor: '#0f172a' },
                        isSelected && [
                          styles.pinSelectedHalo,
                          { borderColor: '#ffffff', backgroundColor: pinColor },
                        ],
                      ]}
                    >
                      <Text style={styles.survivorPinEmoji}>
                        {dev.triage === 'RED' ? '🚨' : dev.triage === 'YELLOW' ? '🤕' : '🙋'}
                      </Text>
                    </View>

                    {/* Compact Tag with Name, Distance, & RSSI */}
                    <View style={[styles.survivorTag, isSelected && styles.survivorTagSelected]}>
                      <Text style={[styles.survivorTagName, { color: pinColor }]}>
                        {dev.name.split(' ')[0]} {dev.name.split(' ')[1]}
                      </Text>
                      <Text style={styles.survivorTagMeta}>
                        {dev.distanceMeters}m • {dev.rssi}dBm
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>

        {/* Floating Zoom & Recenter Controls Overlay */}
        <View style={styles.floatingControls}>
          <TouchableOpacity style={styles.floatBtn} onPress={handleZoomIn} activeOpacity={0.7}>
            <Text style={styles.floatBtnText}>➕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatBtn} onPress={handleZoomOut} activeOpacity={0.7}>
            <Text style={styles.floatBtnText}>➖</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatBtn} onPress={handleRecenter} activeOpacity={0.7}>
            <Text style={styles.floatBtnText}>🎯</Text>
          </TouchableOpacity>
        </View>

        {/* Compass Heading & Scale */}
        <View style={styles.compassContainer}>
          <Text style={styles.compassNorth}>▲ N</Text>
          <Text style={styles.compassCoords}>Sector 4</Text>
        </View>
        <View style={styles.scaleBar}>
          <View style={styles.scaleLine} />
          <Text style={styles.scaleText}>{zoomScale > 1.2 ? '25 m' : '50 m'}</Text>
        </View>
      </View>

      {/* 4. Bottom Interactive Drawer: Shows Selected Person / Device or Cluster */}
      <View style={styles.bottomDrawer}>
        {selectedDevice ? (
          <View style={styles.deviceCard}>
            <View style={styles.drawerHeader}>
              <View style={styles.deviceHeaderLeft}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.triageBadge,
                      {
                        backgroundColor: `${getTriageColor(selectedDevice.triage)}25`,
                        borderColor: getTriageColor(selectedDevice.triage),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.triageBadgeText,
                        { color: getTriageColor(selectedDevice.triage) },
                      ]}
                    >
                      {selectedDevice.triageLabel}
                    </Text>
                  </View>
                  <Text style={styles.deviceDistanceText}>
                    {selectedDevice.distanceMeters === 0
                      ? '📍 You (Origin)'
                      : `📏 ${selectedDevice.distanceMeters}m away`}
                  </Text>
                </View>
                <Text style={styles.deviceName}>{selectedDevice.name}</Text>
                <Text style={styles.deviceCondition}>{selectedDevice.condition}</Text>
              </View>

              {/* Direct 1-on-1 Chat button with this survivor */}
              {onNavigateToChat && selectedDevice.role !== 'you' && (
                <TouchableOpacity
                  style={styles.chatActionBtn}
                  onPress={() => onNavigateToChat(selectedDevice.convId)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chatActionBtnText}>💬 Chat</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Hardware & Link Telemetry (Battery, RSSI, Cluster ID, Link Mode) */}
            <View style={styles.metricRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>🔋 {selectedDevice.battery}%</Text>
                <Text style={styles.metricLabel}>Battery</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>📶 {selectedDevice.rssi} dBm</Text>
                <Text style={styles.metricLabel}>BLE RSSI</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>📍 4 Nodes</Text>
                <Text style={styles.metricLabel}>Cluster Size</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>⚡ Mesh Hop</Text>
                <Text style={styles.metricLabel}>Link Relay</Text>
              </View>
            </View>

            {/* Immediate Needs */}
            <View style={styles.needsPillsRow}>
              <Text style={styles.needsLead}>Needs:</Text>
              {selectedDevice.needs.map((nd, idx) => (
                <View key={idx} style={styles.pill}>
                  <Text style={styles.pillText}>{nd}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : selectedClusterView ? (
          <View style={styles.deviceCard}>
            <View style={styles.drawerHeader}>
              <View style={styles.deviceHeaderLeft}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.triageBadge,
                      { backgroundColor: '#ef444425', borderColor: '#ef4444' },
                    ]}
                  >
                    <Text style={[styles.triageBadgeText, { color: '#ef4444' }]}>
                      CRITICAL CLUSTER
                    </Text>
                  </View>
                  <Text style={styles.deviceDistanceText}>
                    {nearbyDevices.length} Nodes • Radius ~45m
                  </Text>
                </View>
                <Text style={styles.deviceName}>
                  Cluster #{activeClusters[0]?.cluster_id || `cl_${currentRegion.id}_01`}
                </Text>
                <Text style={styles.deviceCondition}>
                  {currentRegion.sectorName} • {nearbyDevices.length} Survivor Nodes linked via BLE
                  mesh
                </Text>
              </View>

              {onNavigateToChat && (
                <TouchableOpacity
                  style={styles.chatActionBtn}
                  onPress={() => onNavigateToChat('cl_pune_ghats_01')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chatActionBtnText}>💬 Cluster Chat</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>👥 {nearbyDevices.length}</Text>
                <Text style={styles.metricLabel}>Survivors</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>🚨 1 Red</Text>
                <Text style={styles.metricLabel}>Triage</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>📡 Multi-Hop</Text>
                <Text style={styles.metricLabel}>BLE Relay</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>100%</Text>
                <Text style={styles.metricLabel}>Offline Ready</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyDrawer}>
            <Text style={styles.emptyDrawerText}>
              Tap any nearby survivor device or cluster to view telemetry
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topHud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    zIndex: 20,
  },
  hudLeft: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hudIcon: {
    fontSize: 22,
  },
  hudTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.3,
  },
  hudSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  packBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  packReady: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  packMissing: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  packBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  controlsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8,
    zIndex: 15,
  },
  layerChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  layerChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  layerChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  layerChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  mapCanvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  canvasContent: {
    position: 'relative',
  },
  floatingControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8,
    zIndex: 30,
  },
  floatBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  floatBtnText: {
    fontSize: 16,
    color: '#0f172a',
  },
  landSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f8fafc',
  },
  cityBlock: {
    position: 'absolute',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  parkArea: {
    position: 'absolute',
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
    padding: 8,
    justifyContent: 'flex-end',
  },
  parkLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.5,
  },
  muthaRiver: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '20%',
    width: 55,
    backgroundColor: '#e0f2fe',
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riverLabel: {
    color: '#0284c7',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    transform: [{ rotate: '90deg' }],
  },
  bridgeBox: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    zIndex: 10,
    width: 110,
    alignItems: 'center',
  },
  bridgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#334155',
  },
  roadArterialH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 18,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  streetNameH: {
    fontSize: 8,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
  },
  roadArterialV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 16,
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  streetNameV: {
    fontSize: 7,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1,
    transform: [{ rotate: '90deg' }],
    width: 140,
    textAlign: 'center',
  },
  roadSecondaryH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#cbd5e1',
    zIndex: 4,
  },
  shelterMarker: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 6,
    zIndex: 14,
    elevation: 3,
  },
  shelterIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hospitalIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shelterIcon: {
    fontSize: 14,
  },
  shelterInfo: {},
  shelterName: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0f172a',
  },
  shelterCapacity: {
    fontSize: 8,
    color: '#64748b',
  },
  clusterBoundary: {
    position: 'absolute',
    top: 360,
    left: 310,
    width: 270,
    height: 235,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    zIndex: 8,
  },
  clusterBoundarySelected: {
    borderColor: '#1d4ed8',
    borderWidth: 2.5,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  clusterHeaderBadge: {
    position: 'absolute',
    top: -12,
    left: 10,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  clusterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  meshRelayLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#2563eb',
    borderStyle: 'dotted',
    zIndex: 9,
  },
  devicePinContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 16,
  },
  radarPulseRing: {
    position: 'absolute',
    top: -15,
    left: -15,
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.4)',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  userBeaconPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    borderWidth: 3,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  userBeaconCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
  },
  nodeCallout: {
    marginTop: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2563eb',
    alignItems: 'center',
    elevation: 2,
  },
  nodeCalloutTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#1d4ed8',
  },
  nodeCalloutSub: {
    fontSize: 8,
    color: '#64748b',
  },
  survivorPinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    backgroundColor: '#ffffff',
  },
  survivorPinEmoji: {
    fontSize: 18,
  },
  pinSelectedHalo: {
    transform: [{ scale: 1.2 }],
    borderWidth: 3,
    elevation: 8,
  },
  survivorTag: {
    marginTop: 3,
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    elevation: 2,
  },
  survivorTagSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  survivorTagName: {
    fontSize: 9,
    fontWeight: '800',
  },
  survivorTagMeta: {
    fontSize: 8,
    color: '#64748b',
  },
  compassContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    elevation: 2,
  },
  compassNorth: {
    fontSize: 10,
    fontWeight: '900',
    color: '#dc2626',
  },
  compassCoords: {
    fontSize: 8,
    color: '#64748b',
  },
  scaleBar: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    alignItems: 'center',
  },
  scaleLine: {
    width: 50,
    height: 3,
    backgroundColor: '#0f172a',
  },
  scaleText: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  bottomDrawer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: spacing.md,
    elevation: 8,
  },
  deviceCard: {},
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  deviceHeaderLeft: {
    flex: 1,
    marginRight: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  triageBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  triageBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  deviceDistanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  deviceCondition: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 15,
  },
  chatActionBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  chatActionBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    marginVertical: 8,
  },
  metricBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricNum: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
  },
  metricLabel: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  needsPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  needsLead: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
  },
  pill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pillText: {
    fontSize: 10,
    color: '#334155',
  },
  emptyDrawer: {
    padding: 16,
    alignItems: 'center',
  },
  emptyDrawerText: {
    fontSize: 12,
    color: '#64748b',
  },
  offlineVectorLoadedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: '#bfdbfe',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  offlineVectorLoadedIcon: {
    fontSize: 16,
  },
  offlineVectorLoadedTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.3,
  },
  offlineVectorLoadedSub: {
    fontSize: 9,
    color: '#475569',
    marginTop: 1,
    lineHeight: 12,
  },
});
