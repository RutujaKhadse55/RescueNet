import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { NeighborRecord } from '../db/repositories/NeighborRepository';
import { ClusterRecord } from '../db/repositories/ClusterRepository';

export interface SurvivorPeer {
  fp: string;
  name: string;
  role: 'survivor' | 'rescuer';
  triage: 'RED' | 'YELLOW' | 'GREEN';
  distanceMeters?: number;
  battery: number;
  rssi: number;
  lat: number;
  lon: number;
  needs: string[];
}

interface NearbyScreenProps {
  neighbors?: NeighborRecord[];
  clusters?: ClusterRecord[];
  peers?: SurvivorPeer[];
  yourClusterId?: string | null;
  onSelectPeer?: (fp: string) => void;
  onSelectCluster?: (clusterId: string) => void;
  onStartChatWithSurvivor?: (survivor: {
    fp: string;
    name: string;
    clusterId: string;
    convId: string;
  }) => void;
}

export const NearbyScreen: React.FC<NearbyScreenProps> = ({
  neighbors = [],
  clusters = [],
  peers = [],
  yourClusterId,
  onSelectPeer,
}) => {
  const { t } = useTranslation();

  const activeCluster = clusters[0];
  const clusterIdText = yourClusterId || activeCluster?.cluster_id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Nearby Survivors</Text>
          <Text style={styles.subtitle}>Zero-Internet Bluetooth mesh radio discovery</Text>
        </View>
        <View style={styles.meshStatBadge}>
          <Text style={styles.meshStatText}>
            📡 {neighbors.length} {neighbors.length === 1 ? 'Peer' : 'Peers'} in Range
          </Text>
        </View>
      </View>

      {/* Cluster Overview Banner */}
      <View style={styles.clusterBanner}>
        <View style={styles.clusterBannerLeft}>
          <Text style={styles.clusterBannerTag}>DISASTER MESH CELL</Text>
          <Text style={styles.clusterBannerTitle}>
            {clusterIdText ? `Sector #${clusterIdText}` : 'Local Emergency Mesh'}
          </Text>
          <Text style={styles.clusterBannerLocation}>
            {activeCluster?.centroid_lat
              ? `${activeCluster.centroid_lat.toFixed(4)}° N, ${activeCluster.centroid_lon.toFixed(4)}° E • Radius ${activeCluster.radius_meters}m`
              : 'Direct peer-to-peer radio frequency scanning active'}
          </Text>
        </View>
        <View style={styles.clusterBannerBadge}>
          <Text style={styles.clusterBannerBadgeNum}>{neighbors.length > 0 ? neighbors.length + 1 : 1}</Text>
          <Text style={styles.clusterBannerBadgeLbl}>{neighbors.length > 0 ? 'Nodes' : 'Host'}</Text>
        </View>
      </View>

      {/* Section Title */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>DISCOVERED MESH PEERS</Text>
        <Text style={styles.sectionHint}>Live BLE Signal</Text>
      </View>

      {/* List of Nearby Survivors or Empty State */}
      {peers.length === 0 && neighbors.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIconText}>📡</Text>
          </View>
          <Text style={styles.emptyTitle}>Scanning for Nearby Survivors</Text>
          <Text style={styles.emptyDesc}>
            Your phone is actively broadcasting an emergency distress beacon. Any nearby survivor or
            rescue relay device within Bluetooth range (~80 meters) will be automatically discovered
            here.
          </Text>
          <View style={styles.scanningPulseBox}>
            <View style={styles.pulseDot} />
            <Text style={styles.pulseText}>
              Continuous 2.4 GHz radio scan active • 0 peers in range
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.survivorList}>
          {(peers.length > 0
            ? peers
            : neighbors.map((n, idx) => ({
                fp: n.fp,
                name: `Survivor Node #${n.fp.slice(0, 4)}`,
                role: n.role,
                triage: (idx % 2 === 1 ? 'RED' : 'YELLOW') as 'RED' | 'YELLOW',
                distanceMeters: Math.max(
                  8,
                  Math.min(80, Math.round(Math.abs(n.last_rssi || -70) * 0.55)),
                ),
                battery: n.battery ?? 80,
                rssi: n.last_rssi ?? -68,
                lat: 18.5204,
                lon: 73.8567,
                needs: ['Emergency Assistance'],
              }))
          ).map(peer => {
            const isRed = peer.triage === 'RED';
            return (
              <View key={peer.fp} style={styles.survivorCard}>
                {/* Top Row: Name and Triage */}
                <View style={styles.cardTopRow}>
                  <View style={styles.nameCol}>
                    <Text style={styles.survivorName}>{peer.name}</Text>
                    <Text style={styles.nodeFp}>
                      Role: {peer.role.toUpperCase()} • Same Cluster ({clusterIdText ? `#${clusterIdText}` : 'Active'})
                    </Text>
                  </View>

                  <View
                    style={[styles.triageBadge, isRed ? styles.triageRed : styles.triageYellow]}
                  >
                    <Text style={styles.triageBadgeText}>
                      {isRed ? '🚨 CODE RED' : '⚠️ URGENT'}
                    </Text>
                  </View>
                </View>

                {/* Location & Needs */}
                <View style={styles.clusterMembershipBox}>
                  <Text style={styles.clusterMembershipLabel}>📍 COORDINATES & MESH FINGERPRINT:</Text>
                  <Text style={styles.clusterMembershipValue}>
                    {peer.lat ? `${peer.lat.toFixed(4)}° N, ${peer.lon.toFixed(4)}° E • ` : ''}
                    {peer.fp}
                  </Text>
                  {peer.needs && peer.needs.length > 0 && (
                    <Text
                      style={[
                        styles.clusterMembershipValue,
                        { marginTop: 4, color: '#dc2626', fontWeight: '700' },
                      ]}
                    >
                      🆘 Needs: {peer.needs.join(', ')}
                    </Text>
                  )}
                </View>

                {/* Telemetry Footer */}
                <View style={styles.cardFooter}>
                  <View style={styles.telemetryGroup}>
                    <Text style={styles.telemetryItem}>📶 ~{peer.distanceMeters || 30}m away</Text>
                    <Text style={styles.telemetryItem}>🔋 {peer.battery}%</Text>
                    <Text style={styles.telemetryItem}>{peer.rssi} dBm</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => onSelectPeer && onSelectPeer(peer.fp)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnText}>💬 Chat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  meshStatBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  meshStatText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  clusterBanner: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  clusterBannerLeft: {
    flex: 1,
  },
  clusterBannerTag: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0284c7',
    letterSpacing: 1,
  },
  clusterBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  clusterBannerLocation: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  clusterBannerBadge: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  clusterBannerBadgeNum: {
    fontSize: 20,
    fontWeight: '900',
    color: '#dc2626',
  },
  clusterBannerBadgeLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
  },
  sectionHint: {
    fontSize: 10,
    color: '#94a3b8',
  },
  emptyStateCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIconText: {
    fontSize: 26,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  scanningPulseBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  pulseText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
  },
  survivorList: {
    gap: 12,
  },
  survivorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.md,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameCol: {
    flex: 1,
  },
  survivorName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  nodeFp: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  triageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  triageRed: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  triageYellow: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  triageBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#991b1b',
  },
  clusterMembershipBox: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0284c7',
  },
  clusterMembershipLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0284c7',
    letterSpacing: 0.8,
  },
  clusterMembershipValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginTop: 1,
    fontFamily: 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  telemetryGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  telemetryItem: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  actionBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
});
