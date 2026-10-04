import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { NeighborRecord } from '../db/repositories/NeighborRepository';
import { ClusterRecord } from '../db/repositories/ClusterRepository';

export interface SurvivorNodeDetail {
  fp: string;
  name: string;
  clusterId: string;
  clusterName: string;
  triage: 'RED' | 'YELLOW' | 'GREEN';
  condition: string;
  distanceMeters: number;
  battery: number;
  rssi: number;
  needs: string[];
  convId: string;
}

interface NearbyScreenProps {
  neighbors?: NeighborRecord[];
  clusters?: ClusterRecord[];
  yourClusterId?: string | null;
  onSelectPeer?: (fp: string) => void;
  onSelectCluster?: (clusterId: string) => void;
  onStartChatWithSurvivor?: (survivor: { fp: string; name: string; clusterId: string; convId: string }) => void;
}

export const NearbyScreen: React.FC<NearbyScreenProps> = ({
  neighbors = [],
  clusters = [],
  yourClusterId,
  onSelectPeer,
  onSelectCluster,
  onStartChatWithSurvivor,
}) => {
  const { t } = useTranslation();

  // Synthetic / known nearby survivor nodes linked to common clusters
  const defaultClusterId = yourClusterId || (clusters[0]?.cluster_id) || 'cl_pune_ghats_01';

  const survivorDetails: SurvivorNodeDetail[] = [
    {
      fp: '4a9b2c8f1e7d3a01',
      name: 'Survivor B (Priya Patil)',
      clusterId: defaultClusterId,
      clusterName: 'Pune Ghats Sector 4',
      triage: 'YELLOW',
      condition: 'Injured right arm, conscious near relief entrance',
      distanceMeters: 25,
      battery: 82,
      rssi: -62,
      needs: ['First Aid', 'Water'],
      convId: 'conv_local_mesh',
    },
    {
      fp: '8f2e1a3b5c7d9e02',
      name: 'Survivor C (Amit Deshmukh)',
      clusterId: defaultClusterId,
      clusterName: 'Pune Ghats Sector 4',
      triage: 'RED',
      condition: 'Trapped under concrete beam, respiratory distress',
      distanceMeters: 38,
      battery: 45,
      rssi: -74,
      needs: ['Heavy Lifting', 'Oxygen'],
      convId: 'conv_survivor_c',
    },
    {
      fp: 'c3d4e5f6a7b8c901',
      name: 'Survivor D (Sunil Kulkarni)',
      clusterId: defaultClusterId,
      clusterName: 'Pune Ghats Sector 4',
      triage: 'GREEN',
      condition: 'Mobility impaired elderly, safe on elevated platform',
      distanceMeters: 42,
      battery: 31,
      rssi: -79,
      needs: ['Evacuation Assist'],
      convId: 'conv_survivor_d',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Nearby Survivors</Text>
          <Text style={styles.subtitle}>
            Detecting local mesh peers & disaster cluster assignments
          </Text>
        </View>
        <View style={styles.meshStatBadge}>
          <Text style={styles.meshStatText}>📡 4 Nodes Online</Text>
        </View>
      </View>

      {/* Cluster Overview Banner */}
      <View style={styles.clusterBanner}>
        <View style={styles.clusterBannerLeft}>
          <Text style={styles.clusterBannerTag}>YOUR PRIMARY CLUSTER</Text>
          <Text style={styles.clusterBannerTitle}>Cluster #{defaultClusterId}</Text>
          <Text style={styles.clusterBannerLocation}>
            Pune Ghats Sector 4 • 18.5204° N, 73.8567° E (45m Radius)
          </Text>
        </View>
        <View style={styles.clusterBannerBadge}>
          <Text style={styles.clusterBannerBadgeNum}>5</Text>
          <Text style={styles.clusterBannerBadgeLbl}>Survivors</Text>
        </View>
      </View>

      {/* Section Title */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>SURVIVORS IN YOUR VICINITY</Text>
        <Text style={styles.sectionHint}>Tap Chat to message over offline mesh</Text>
      </View>

      {/* List of Nearby Survivors with Cluster Tag and Direct Chat */}
      <View style={styles.survivorList}>
        {survivorDetails.map((survivor) => {
          const isRed = survivor.triage === 'RED';
          const isYellow = survivor.triage === 'YELLOW';

          return (
            <View key={survivor.fp} style={styles.survivorCard}>
              {/* Top Row: Name, Triage, and Cluster Tag */}
              <View style={styles.cardTopRow}>
                <View style={styles.nameCol}>
                  <Text style={styles.survivorName}>{survivor.name}</Text>
                  <Text style={styles.nodeFp}>Node #{survivor.fp.substring(0, 8)}</Text>
                </View>

                <View
                  style={[
                    styles.triageBadge,
                    isRed ? styles.triageRed : isYellow ? styles.triageYellow : styles.triageGreen,
                  ]}
                >
                  <Text style={styles.triageBadgeText}>
                    {isRed ? '🚨 CODE RED' : isYellow ? '⚠️ YELLOW' : '✓ MINOR'}
                  </Text>
                </View>
              </View>

              {/* CLUSTER MEMBERSHIP BADGE - Clear and prominent as requested */}
              <View style={styles.clusterMembershipBox}>
                <Text style={styles.clusterMembershipLabel}>📍 ASSIGNED CLUSTER:</Text>
                <Text style={styles.clusterMembershipValue}>
                  #{survivor.clusterId} ({survivor.clusterName})
                </Text>
              </View>

              {/* Condition / Status */}
              <Text style={styles.conditionText}>“{survivor.condition}”</Text>

              {/* Needs Pills */}
              <View style={styles.needsRow}>
                {survivor.needs.map((n, i) => (
                  <View key={i} style={styles.needChip}>
                    <Text style={styles.needChipText}>{n}</Text>
                  </View>
                ))}
              </View>

              {/* Telemetry Footer & Direct Chat Button */}
              <View style={styles.cardFooter}>
                <View style={styles.telemetryGroup}>
                  <Text style={styles.telemetryItem}>📶 {survivor.distanceMeters}m away</Text>
                  <Text style={styles.telemetryItem}>🔋 {survivor.battery}%</Text>
                  <Text style={styles.telemetryItem}>{survivor.rssi} dBm</Text>
                </View>

                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => {
                    if (onStartChatWithSurvivor) {
                      onStartChatWithSurvivor(survivor);
                    } else if (onSelectPeer) {
                      onSelectPeer(survivor.fp);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chatButtonText}>💬 Chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
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
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  meshStatBadge: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  meshStatText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#60a5fa',
  },
  clusterBanner: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
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
    color: '#38bdf8',
    letterSpacing: 1,
  },
  clusterBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  clusterBannerLocation: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  clusterBannerBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  clusterBannerBadgeNum: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ef4444',
  },
  clusterBannerBadgeLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
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
  survivorList: {
    gap: 12,
  },
  survivorCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: spacing.md,
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
    color: '#f8fafc',
  },
  nodeFp: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  triageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  triageRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  triageYellow: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  triageGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  triageBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
  },
  clusterMembershipBox: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
  },
  clusterMembershipLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 0.8,
  },
  clusterMembershipValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f1f5f9',
    marginTop: 1,
  },
  conditionText: {
    fontSize: 12,
    color: '#cbd5e1',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 17,
  },
  needsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  needChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  needChipText: {
    fontSize: 10,
    color: '#e2e8f0',
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  telemetryGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  telemetryItem: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  chatButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chatButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
});
