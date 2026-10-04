import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors, spacing } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { ClusterRecord } from '../db/repositories/ClusterRepository';

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
  onOpenDownloadModal: () => void;
  onNavigateToChat?: (conversationId?: string) => void;
}

export const MapScreen: React.FC<MapScreenProps> = ({
  hasOfflineMapPack,
  activeClusters = [],
  onOpenDownloadModal,
  onNavigateToChat,
}) => {
  const { t: _t } = useTranslation();

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

  // Exact nearby people and devices within the local cluster
  const nearbyDevices: NearbyPersonDevice[] = [
    {
      id: 'node_you',
      name: 'You (Your Phone)',
      role: 'you',
      triage: 'BLUE',
      triageLabel: 'HOST BEACON',
      condition: 'Broadcasting emergency mesh beacon & telemetry',
      distanceMeters: 0,
      battery: 88,
      rssi: -30,
      needs: ['GPS Fix Active', 'Mesh Relay Armed'],
      convId: 'conv_local_mesh',
      x: 425,
      y: 460,
    },
    {
      id: 'node_survivor_b',
      name: 'Survivor B (Priya Patil)',
      role: 'survivor',
      triage: 'YELLOW',
      triageLabel: 'URGENT (YELLOW)',
      condition: 'Injured right arm, conscious near relief entrance',
      distanceMeters: 25,
      battery: 82,
      rssi: -62,
      needs: ['First Aid', 'Clean Water'],
      convId: 'conv_local_mesh',
      x: 495,
      y: 405,
    },
    {
      id: 'node_survivor_c',
      name: 'Survivor C (Amit Deshmukh)',
      role: 'survivor',
      triage: 'RED',
      triageLabel: 'CRITICAL (RED)',
      condition: 'Trapped under concrete beam, respiratory distress',
      distanceMeters: 38,
      battery: 45,
      rssi: -74,
      needs: ['Heavy Lifting', 'Oxygen Supply'],
      convId: 'conv_survivor_c',
      x: 350,
      y: 515,
    },
    {
      id: 'node_survivor_d',
      name: 'Survivor D (Sunil Kulkarni)',
      role: 'survivor',
      triage: 'GREEN',
      triageLabel: 'STABLE (GREEN)',
      condition: 'Mobility impaired elderly, safe on elevated platform',
      distanceMeters: 42,
      battery: 31,
      rssi: -79,
      needs: ['Evacuation Assist'],
      convId: 'conv_survivor_d',
      x: 520,
      y: 535,
    },
  ];

  // Default selection to Survivor B so user sees nearby device card right away
  useEffect(() => {
    setSelectedDevice(nearbyDevices[1]);
  }, []);

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
      case 'RED': return '#ef4444';
      case 'YELLOW': return '#f59e0b';
      case 'GREEN': return '#10b981';
      default: return '#3b82f6';
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
              <Text style={styles.hudTitle}>Pune City Cartographic Map</Text>
              <Text style={styles.hudSub}>
                18.5204° N, 73.8567° E • Deccan / Shivaji Nagar Sector
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
            {hasOfflineMapPack ? '✓ 14.2 MB Offline' : '⬇️ Download Pack'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. Control Toolbar (Cleaned: No Flood Hazard) */}
      <View style={styles.controlsBar}>
        <TouchableOpacity
          style={[styles.layerChip, showShelters && styles.layerChipActive]}
          onPress={() => setShowShelters(!showShelters)}
        >
          <Text style={[styles.layerChipText, showShelters && styles.layerChipTextActive]}>
            ⛺ Shelters & Med
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
            📍 Cluster #cl_pune_ghats
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

              {/* Authentic Green Parks (Sambhaji Park & Deccan Gymkhana Grounds) */}
              <View style={[styles.parkArea, { top: 280, left: 70, width: 180, height: 130 }]}>
                <Text style={styles.parkLabel}>🌳 SAMBHAJI PARK & BOTANICAL GARDENS</Text>
              </View>
              <View style={[styles.parkArea, { top: 720, left: 580, width: 190, height: 140 }]}>
                <Text style={styles.parkLabel}>🏟️ DECCAN GYMKHANA SPORTS COMPLEX</Text>
              </View>

              {/* Mutha River Cartographic Channel (Realistic Blue River Ribbon) */}
              <View style={styles.muthaRiver}>
                <Text style={styles.riverLabel}>MUTHA RIVER</Text>
                {/* Bridges */}
                <View style={[styles.bridgeBox, { top: 230 }]}>
                  <Text style={styles.bridgeText}>🌉 Z-Bridge (Open)</Text>
                </View>
                <View style={[styles.bridgeBox, { top: 430 }]}>
                  <Text style={styles.bridgeText}>🌉 Balgandharva Bridge</Text>
                </View>
                <View style={[styles.bridgeBox, { top: 650 }]}>
                  <Text style={styles.bridgeText}>🌉 Shivaji Bridge (Lakdi Pul)</Text>
                </View>
              </View>

              {/* Realistic Road Networks with Street Names & Directional Markings */}
              {/* JM Road Arterial (East-West Major 4-Lane Highway) */}
              <View style={[styles.roadArterialH, { top: 235 }]}>
                <Text style={styles.streetNameH}>JANGALI MAHARAJ (JM) ROAD ➔</Text>
              </View>

              {/* FC Road Arterial (East-West Major Corridor) */}
              <View style={[styles.roadArterialH, { top: 435 }]}>
                <Text style={styles.streetNameH}>FERGUSSON COLLEGE (FC) ROAD ➔</Text>
              </View>

              {/* Karve Road Arterial */}
              <View style={[styles.roadArterialH, { top: 660 }]}>
                <Text style={styles.streetNameH}>KARVE ROAD RELIEF CORRIDOR ➔</Text>
              </View>

              {/* Ghole Road (North-South Avenue) */}
              <View style={[styles.roadArterialV, { left: 285 }]}>
                <Text style={styles.streetNameV}>GHOLE ROAD</Text>
              </View>

              {/* Bhandarkar Road (North-South Avenue) */}
              <View style={[styles.roadArterialV, { left: 535 }]}>
                <Text style={styles.streetNameV}>BHANDARKAR ROAD</Text>
              </View>

              {/* Secondary Cross Streets */}
              <View style={[styles.roadSecondaryH, { top: 140 }]} />
              <View style={[styles.roadSecondaryH, { top: 350 }]} />
              <View style={[styles.roadSecondaryH, { top: 560 }]} />
              <View style={[styles.roadSecondaryH, { top: 780 }]} />

              {/* Relief Shelters & Hospitals */}
              {showShelters && (
                <>
                  <View style={[styles.shelterMarker, { top: 120, left: 350 }]}>
                    <View style={styles.shelterIconBox}>
                      <Text style={styles.shelterIcon}>⛺</Text>
                    </View>
                    <View style={styles.shelterInfo}>
                      <Text style={styles.shelterName}>Shivajinagar Camp</Text>
                      <Text style={styles.shelterCapacity}>Safe • Cap: 450</Text>
                    </View>
                  </View>

                  <View style={[styles.shelterMarker, { top: 740, left: 330 }]}>
                    <View style={styles.hospitalIconBox}>
                      <Text style={styles.shelterIcon}>🏥</Text>
                    </View>
                    <View style={styles.shelterInfo}>
                      <Text style={styles.shelterName}>Sahyadri Hospital Hub</Text>
                      <Text style={styles.shelterCapacity}>Trauma ICU • 4 Doctors</Text>
                    </View>
                  </View>
                </>
              )}

              {/* CLUSTER PERIMETER ENCLOSURE (Groups the 4 nearby devices) */}
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
                    📍 Cluster #cl_pune_ghats_01 • 4 Connected Mesh Nodes (~45m)
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
              {nearbyDevices.map((dev) => {
                const isSelected = selectedDevice?.id === dev.id;
                const pinColor = getTriageColor(dev.triage);

                if (dev.role === 'you') {
                  // User host device with animated radar wave
                  return (
                    <TouchableOpacity
                      key={dev.id}
                      style={[
                        styles.devicePinContainer,
                        { left: dev.x - 22, top: dev.y - 22 },
                      ]}
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
                    style={[
                      styles.devicePinContainer,
                      { left: dev.x - 20, top: dev.y - 20 },
                    ]}
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
                        isSelected && [styles.pinSelectedHalo, { borderColor: '#ffffff', backgroundColor: pinColor }],
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
                      { backgroundColor: `${getTriageColor(selectedDevice.triage)}25`, borderColor: getTriageColor(selectedDevice.triage) },
                    ]}
                  >
                    <Text style={[styles.triageBadgeText, { color: getTriageColor(selectedDevice.triage) }]}>
                      {selectedDevice.triageLabel}
                    </Text>
                  </View>
                  <Text style={styles.deviceDistanceText}>
                    {selectedDevice.distanceMeters === 0 ? '📍 You (Origin)' : `📏 ${selectedDevice.distanceMeters}m away`}
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
                  <View style={[styles.triageBadge, { backgroundColor: '#ef444425', borderColor: '#ef4444' }]}>
                    <Text style={[styles.triageBadgeText, { color: '#ef4444' }]}>CRITICAL CLUSTER</Text>
                  </View>
                  <Text style={styles.deviceDistanceText}>4 Nodes • Radius 45m</Text>
                </View>
                <Text style={styles.deviceName}>Cluster #cl_pune_ghats_01</Text>
                <Text style={styles.deviceCondition}>Pune Ghats Sector 4 • 4 Survivor Nodes linked via BLE mesh</Text>
              </View>

              {onNavigateToChat && (
                <TouchableOpacity
                  style={styles.chatActionBtn}
                  onPress={() => onNavigateToChat('conv_local_mesh')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chatActionBtnText}>💬 Cluster Chat</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricNum}>👥 4</Text>
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
            <Text style={styles.emptyDrawerText}>Tap any nearby survivor device or cluster to view telemetry</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  topHud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
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
    color: '#f8fafc',
    letterSpacing: 0.3,
  },
  hudSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  packBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  packReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
  },
  packMissing: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
  },
  packBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34d399',
  },
  controlsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 8,
    zIndex: 15,
  },
  layerChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  layerChipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#3b82f6',
  },
  layerChipText: {
    fontSize: 11,
    color: '#94a3b8',
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
    backgroundColor: '#090d16',
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
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  floatBtnText: {
    fontSize: 16,
    color: '#ffffff',
  },
  landSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d1527',
  },
  cityBlock: {
    position: 'absolute',
    backgroundColor: '#131f37',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e2e4a',
  },
  parkArea: {
    position: 'absolute',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    padding: 8,
    justifyContent: 'flex-end',
  },
  parkLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#6ee7b7',
    letterSpacing: 0.5,
  },
  muthaRiver: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '20%',
    width: 55,
    backgroundColor: 'rgba(2, 132, 199, 0.35)',
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riverLabel: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    transform: [{ rotate: '90deg' }],
  },
  bridgeBox: {
    position: 'absolute',
    backgroundColor: '#1e293b',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    zIndex: 10,
    width: 110,
    alignItems: 'center',
  },
  bridgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#e2e8f0',
  },
  roadArterialH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 18,
    backgroundColor: '#334155',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  streetNameH: {
    fontSize: 8,
    fontWeight: '800',
    color: '#facc15',
    letterSpacing: 1.5,
  },
  roadArterialV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 16,
    backgroundColor: '#334155',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  streetNameV: {
    fontSize: 7,
    fontWeight: '800',
    color: '#cbd5e1',
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
    backgroundColor: '#1e293b',
    zIndex: 4,
  },
  shelterMarker: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
    zIndex: 14,
  },
  shelterIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#065f46',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hospitalIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#991b1b',
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
    color: '#f8fafc',
  },
  shelterCapacity: {
    fontSize: 8,
    color: '#94a3b8',
  },
  clusterBoundary: {
    position: 'absolute',
    top: 360,
    left: 310,
    width: 270,
    height: 235,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.65)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    zIndex: 8,
  },
  clusterBoundarySelected: {
    borderColor: '#3b82f6',
    borderWidth: 2.5,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  clusterHeaderBadge: {
    position: 'absolute',
    top: -12,
    left: 10,
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  clusterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#93c5fd',
  },
  meshRelayLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: 'rgba(56, 189, 248, 0.65)',
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
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  userBeaconPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284c7',
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
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#0284c7',
    alignItems: 'center',
  },
  nodeCalloutTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#38bdf8',
  },
  nodeCalloutSub: {
    fontSize: 8,
    color: '#cbd5e1',
  },
  survivorPinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
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
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  survivorTagSelected: {
    borderColor: '#ffffff',
    backgroundColor: '#1e293b',
  },
  survivorTagName: {
    fontSize: 9,
    fontWeight: '800',
  },
  survivorTagMeta: {
    fontSize: 8,
    color: '#94a3b8',
  },
  compassContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  compassNorth: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ef4444',
  },
  compassCoords: {
    fontSize: 8,
    color: '#94a3b8',
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
    backgroundColor: '#e2e8f0',
  },
  scaleText: {
    fontSize: 8,
    color: '#cbd5e1',
    marginTop: 2,
  },
  bottomDrawer: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    padding: spacing.md,
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
    color: '#38bdf8',
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  deviceCondition: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 2,
    lineHeight: 15,
  },
  chatActionBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#60a5fa',
  },
  chatActionBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 8,
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
    color: '#f8fafc',
  },
  metricLabel: {
    fontSize: 8,
    color: '#94a3b8',
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
    color: '#94a3b8',
  },
  pill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pillText: {
    fontSize: 10,
    color: '#cbd5e1',
  },
  emptyDrawer: {
    padding: 16,
    alignItems: 'center',
  },
  emptyDrawerText: {
    fontSize: 12,
    color: '#64748b',
  },
});
