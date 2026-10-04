import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { layout, spacing } from '../theme';
import {
  haversineDistanceMeters,
  createAndSignAck,
  PacketFlags,
} from '@rescuenet/core';
import { DatabaseManager } from '../db/DatabaseManager';
import { MeshEngine } from '../mesh/MeshEngine';
import { RescuerCredentialService } from '../rescuer/RescuerCredentialService';
import { HomingService, HomingTarget } from '../rescuer/HomingService';
import { LocationProvider } from '../location/LocationProvider';
import { ClusterRecord } from '../db/repositories/ClusterRepository';
import { HomingScreen } from './HomingScreen';

interface RescuerHomeScreenProps {
  db: DatabaseManager;
  meshEngine: MeshEngine;
  rescuerService: RescuerCredentialService;
  homingService: HomingService;
  locationProvider: LocationProvider;
  onExitRescuerMode?: () => void;
}

interface EnrichedCluster extends ClusterRecord {
  distanceMeters?: number;
}

export const RescuerHomeScreen: React.FC<RescuerHomeScreenProps> = ({
  db,
  meshEngine,
  rescuerService,
  homingService,
  locationProvider,
  onExitRescuerMode,
}) => {
  const [clusters, setClusters] = useState<EnrichedCluster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeHomingTarget, setActiveHomingTarget] = useState<HomingTarget | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const cred = rescuerService.getActiveCredential();

  const loadClusters = useCallback(async () => {
    setLoading(true);
    try {
      const records = await db.clusters.getAllClusters();
      const currentLoc = locationProvider.getLastKnownLocation();

      const enriched: EnrichedCluster[] = records.map((c) => {
        let distanceMeters: number | undefined;
        if (currentLoc && currentLoc.latitude && currentLoc.longitude) {
          distanceMeters = Math.round(
            haversineDistanceMeters(
              { latitude: currentLoc.latitude, longitude: currentLoc.longitude },
              { latitude: c.centroid_lat, longitude: c.centroid_lon }
            )
          );
        }
        return {
          ...c,
          distanceMeters,
        };
      });

      // Sort by priority (descending) and then distance (ascending)
      enriched.sort((a, b) => {
        const pDiff = (b.priority_score || 0) - (a.priority_score || 0);
        if (Math.abs(pDiff) > 5) return pDiff;
        if (a.distanceMeters !== undefined && b.distanceMeters !== undefined) {
          return a.distanceMeters - b.distanceMeters;
        }
        return 0;
      });

      setClusters(enriched);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [db, locationProvider]);

  useEffect(() => {
    loadClusters();
    const interval = setInterval(loadClusters, 10000);
    return () => clearInterval(interval);
  }, [loadClusters]);

  // Sends an authenticated Rescuer ACK with the given status code
  const sendRescuerAck = async (
    cluster: EnrichedCluster,
    status: number, // 1: Ack/Enroute, 3: Reached, 4: Closed
    newDbState: ClusterRecord['state']
  ) => {
    if (!cred) {
      Alert.alert('Unauthorized', 'Valid rescuer credential required to broadcast field actions.');
      return;
    }

    const keyPair = meshEngine.getKeyPair();
    if (!keyPair) {
      Alert.alert('Key Error', 'Mesh cryptographic key pair is not configured.');
      return;
    }

    setActionInProgress(cluster.cluster_id);
    try {
      const targetBuffer = new Uint8Array(8);
      const cleanHex = cluster.cluster_id.replace(/[^a-f0-9]/gi, '').padEnd(16, '0').slice(0, 16);
      targetBuffer.set(Buffer.from(cleanHex, 'hex'));

      const agencyIdNum = parseInt(cred.agencyId, 10) || 1;

      // Create signed ACK with FROM_RESCUER flag
      const ackBytes = await createAndSignAck(
        {
          flags: PacketFlags.FROM_RESCUER,
          targetPacketId: targetBuffer,
          arrivalMinutes: status === 1 ? 15 : 0,
          status,
          agencyId: agencyIdNum,
          keyPair,
        },
        db.getCrypto()
      );

      // Store in local mesh engine for relay
      await meshEngine.createAndStorePacket(ackBytes);

      // Update cluster status
      await db.clusters.updateStatus(cluster.cluster_id, newDbState);
      await db.events.logEvent('rescuer_action_dispatched', {
        clusterId: cluster.cluster_id,
        status,
        newState: newDbState,
      });

      // Reload
      await loadClusters();
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Failed to dispatch rescuer packet');
    } finally {
      setActionInProgress(null);
    }
  };

  const getPriorityBadgeStyle = (score: number) => {
    if (score >= 75) return styles.badgeCritical;
    if (score >= 50) return styles.badgeHigh;
    if (score >= 25) return styles.badgeMed;
    return styles.badgeLow;
  };

  const getPriorityLabel = (score: number) => {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  };

  // If Homing Mode is active, render full-screen Homing Screen
  if (activeHomingTarget) {
    return (
      <HomingScreen
        homingService={homingService}
        target={activeHomingTarget}
        onClose={() => {
          setActiveHomingTarget(null);
          loadClusters();
        }}
        onFoundSuccess={() => {
          setActiveHomingTarget(null);
          loadClusters();
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Rescuer Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerRoleBadge}>AUTHORIZED RESPONDER</Text>
          <Text style={styles.rescuerName}>
            {cred?.rescuerName || 'Field Rescuer'} (Badge: {cred?.badgeNumber || 'N/A'})
          </Text>
          <Text style={styles.agencyInfo}>Agency: {cred?.agencyId || 'RescueNet Control'}</Text>
        </View>
        {onExitRescuerMode ? (
          <TouchableOpacity
            style={styles.exitBtn}
            onPress={onExitRescuerMode}
            testID="exit-rescuer-mode-btn"
          >
            <Text style={styles.exitBtnText}>Standard Mode</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Cluster List Header */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.listTitle}>Nearby Survivor Clusters ({clusters.length})</Text>
        <TouchableOpacity onPress={loadClusters} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading && clusters.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Syncing mesh cluster signals...</Text>
        </View>
      ) : clusters.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>No active survivor clusters nearby</Text>
          <Text style={styles.emptySubtitle}>
            All reported incidents have been resolved or are out of local radio range.
          </Text>
        </View>
      ) : (
        <FlatList
          data={clusters}
          keyExtractor={(item) => item.cluster_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isProcessing = actionInProgress === item.cluster_id;
            return (
              <View style={styles.card} testID={`rescuer-cluster-card-${item.cluster_id}`}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.priorityBadge, getPriorityBadgeStyle(item.priority_score)]}>
                      <Text style={styles.priorityBadgeText}>
                        {getPriorityLabel(item.priority_score)} ({item.priority_score})
                      </Text>
                    </View>
                    <Text style={styles.clusterIdText}>
                      Cluster #{item.cluster_id.slice(0, 8)}
                    </Text>
                  </View>
                  <View style={[styles.stateBadge, getStateStyle(item.state)]}>
                    <Text style={styles.stateBadgeText}>{item.state.toUpperCase()}</Text>
                  </View>
                </View>

                {/* Card Details */}
                <View style={styles.cardDetailsRow}>
                  <Text style={styles.detailItem}>
                    👥 <Text style={styles.detailBold}>{item.member_count}</Text> survivors
                  </Text>
                  {item.distanceMeters !== undefined ? (
                    <Text style={styles.detailItem}>
                      📍 <Text style={styles.detailBold}>
                        {item.distanceMeters > 1000
                          ? `${(item.distanceMeters / 1000).toFixed(1)} km`
                          : `${item.distanceMeters} m`}
                      </Text> away
                    </Text>
                  ) : null}
                  <Text style={styles.detailItem}>
                    🌐 Radius: {Math.round(item.radius_meters)}m
                  </Text>
                </View>

                {/* Quick Rescuer Actions */}
                <View style={styles.actionsRow}>
                  {/* Acknowledge cluster */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnAck, isProcessing && styles.btnDisabled]}
                    onPress={() => sendRescuerAck(item, 1, 'en_route')}
                    disabled={isProcessing}
                    testID={`ack-cluster-btn-${item.cluster_id}`}
                  >
                    <Text style={styles.actionBtnText}>ACK Cluster</Text>
                  </TouchableOpacity>

                  {/* Mark reached */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnReached, isProcessing && styles.btnDisabled]}
                    onPress={() => sendRescuerAck(item, 3, 'reached')}
                    disabled={isProcessing}
                    testID={`reached-cluster-btn-${item.cluster_id}`}
                  >
                    <Text style={styles.actionBtnText}>Mark Reached</Text>
                  </TouchableOpacity>

                  {/* Mark closed */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnClosed, isProcessing && styles.btnDisabled]}
                    onPress={() => sendRescuerAck(item, 4, 'closed')}
                    disabled={isProcessing}
                    testID={`close-cluster-btn-${item.cluster_id}`}
                  >
                    <Text style={styles.actionBtnText}>Close</Text>
                  </TouchableOpacity>

                  {/* Start Homing */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnHoming, isProcessing && styles.btnDisabled]}
                    onPress={() =>
                      setActiveHomingTarget({
                        targetId: item.cluster_id,
                        originFpPrefix: item.cluster_id.slice(0, 8),
                        title: `Cluster #${item.cluster_id.slice(0, 8)} (${item.member_count} survivors)`,
                      })
                    }
                    disabled={isProcessing}
                    testID={`start-homing-btn-${item.cluster_id}`}
                  >
                    <Text style={styles.homingBtnText}>🎯 Homing</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const getStateStyle = (state: ClusterRecord['state']) => {
  switch (state) {
    case 'reached':
      return { backgroundColor: '#065F46' };
    case 'closed':
      return { backgroundColor: '#334155' };
    case 'en_route':
      return { backgroundColor: '#1E3A8A' };
    case 'assigned':
      return { backgroundColor: '#78350F' };
    default:
      return { backgroundColor: '#4C1D95' };
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: spacing.md,
    borderRadius: layout.borderRadiusMd,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerLeft: {
    flex: 1,
  },
  headerRoleBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#38BDF8',
    letterSpacing: 1,
    marginBottom: 2,
  },
  rescuerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  agencyInfo: {
    fontSize: 12,
    color: '#94A3B8',
  },
  exitBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  exitBtnText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  refreshText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  card: {
    backgroundColor: '#131D31',
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  badgeCritical: {
    backgroundColor: '#7F1D1D',
  },
  badgeHigh: {
    backgroundColor: '#7C2D12',
  },
  badgeMed: {
    backgroundColor: '#78350F',
  },
  badgeLow: {
    backgroundColor: '#064E3B',
  },
  priorityBadgeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: 'bold',
  },
  clusterIdText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  stateBadgeText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: spacing.xs,
  },
  detailItem: {
    fontSize: 13,
    color: '#94A3B8',
    marginRight: spacing.md,
    marginBottom: 4,
  },
  detailBold: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  btnAck: {
    backgroundColor: '#2563EB',
  },
  btnReached: {
    backgroundColor: '#059669',
  },
  btnClosed: {
    backgroundColor: '#475569',
  },
  btnHoming: {
    backgroundColor: '#D97706',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  homingBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: spacing.md,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    color: '#10B981',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
