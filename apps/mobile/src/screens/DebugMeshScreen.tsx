import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { IBleTransport, GattExchangeStats, BleNeighbor } from '../native/RescueBle';
import { MeshEngine } from '../mesh/MeshEngine';
import { MeshMetrics, MeshPolicy, DEFAULT_MESH_POLICY } from '../mesh/types';

interface DebugMeshScreenProps {
  transport: IBleTransport;
  neighbors: BleNeighbor[];
  onSendTestPacket: (targetDeviceId: string) => Promise<void>;
  onClose: () => void;
  engine?: MeshEngine;
}

export const DebugMeshScreen: React.FC<DebugMeshScreenProps> = ({
  transport,
  neighbors,
  onSendTestPacket,
  onClose,
  engine,
}) => {
  const [stats, setStats] = useState<GattExchangeStats>({
    bytesSent: 0,
    bytesReceived: 0,
    mtu: 247,
    phy: '2M',
    gatt133Errors: 0,
    connectAttempts: 0,
    successfulExchanges: 0,
    activeConnections: 0,
  });

  const [meshMetrics, setMeshMetrics] = useState<MeshMetrics>({
    packetsSeen: 0,
    packetsForwarded: 0,
    packetsDeduplicated: 0,
    packetsRejected: 0,
    rejectionCounts: {
      bad_version: 0,
      future_timestamp: 0,
      expired_timestamp: 0,
      invalid_signature: 0,
      replay_seq: 0,
      replay_nonce: 0,
      rate_limit_exceeded: 0,
      ttl_exhausted: 0,
      hop_limit_reached: 0,
      corrupted_packet: 0,
    },
    bytesSent: 0,
    bytesReceived: 0,
    contactsCount: 0,
    contactsPerHour: 0,
    estimatedBatteryMah: 0,
  });

  const [policy, setPolicy] = useState<MeshPolicy>(DEFAULT_MESH_POLICY);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [csvExported, setCsvExported] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const s = await transport.getExchangeStats();
      setStats(s);

      if (engine) {
        setMeshMetrics(engine.getMetrics());
        setPolicy(engine.getPolicy());
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [transport, engine]);

  const handleSendTest = async (deviceId: string) => {
    setTestStatus(`Sending test packet to ${deviceId.substring(0, 8)}...`);
    try {
      await onSendTestPacket(deviceId);
      setTestStatus(`✓ Packet sent to ${deviceId.substring(0, 8)}`);
    } catch (e) {
      setTestStatus(`✗ Failed: ${(e as Error).message}`);
    }
  };

  const handleExportCsv = () => {
    if (engine) {
      const csv = engine.exportMetricsCsv();
      setCsvExported(csv);
      Alert.alert('Metrics CSV Exported', `Generated ${csv.split('\n').length} CSV records.`);
    } else {
      Alert.alert('Metrics CSV Exported', 'Live snapshot generated.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mesh Radio Telemetry</Text>
          <Text style={styles.subtitle}>Store-and-Forward Engine & GATT Diagnostics</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Store-and-Forward Metrics Card (Phase 7 Observability) */}
        <View style={styles.metricsCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeader}>STORE-AND-FORWARD ENGINE</Text>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportCsv}>
              <Text style={styles.exportBtnText}>Export CSV</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{meshMetrics.packetsSeen}</Text>
              <Text style={styles.metricLbl}>Packets Seen</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={[styles.metricVal, { color: colors.success }]}>
                {meshMetrics.packetsForwarded}
              </Text>
              <Text style={styles.metricLbl}>Forwarded</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={[styles.metricVal, { color: colors.info }]}>
                {meshMetrics.packetsDeduplicated}
              </Text>
              <Text style={styles.metricLbl}>Deduplicated</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={[styles.metricVal, meshMetrics.packetsRejected > 0 && styles.errVal]}>
                {meshMetrics.packetsRejected}
              </Text>
              <Text style={styles.metricLbl}>Rejected</Text>
            </View>
          </View>

          <View style={styles.byteRow}>
            <Text style={styles.byteText}>
              Sent: {(meshMetrics.bytesSent / 1024).toFixed(1)} KB
            </Text>
            <Text style={styles.byteText}>
              Recv: {(meshMetrics.bytesReceived / 1024).toFixed(1)} KB
            </Text>
            <Text style={styles.byteText}>Contacts: {meshMetrics.contactsCount}</Text>
          </View>
        </View>

        {/* Adaptive Duty Cycle Policy Card (Phase 7 Knob Exposure) */}
        <View style={styles.metricsCard}>
          <Text style={styles.cardHeader}>ADAPTIVE DUTY CYCLE POLICY</Text>
          <View style={styles.policyRow}>
            <Text style={styles.policyLabel}>Active Scan Duration:</Text>
            <Text style={styles.policyValue}>{policy.scanActiveMs} ms</Text>
          </View>
          <View style={styles.policyRow}>
            <Text style={styles.policyLabel}>Standard Interval:</Text>
            <Text style={styles.policyValue}>{policy.scanIntervalMs / 1000} s</Text>
          </View>
          <View style={styles.policyRow}>
            <Text style={styles.policyLabel}>Urgent Mode Interval:</Text>
            <Text style={styles.policyValue}>{policy.scanIntervalActiveMs / 1000} s</Text>
          </View>
          <View style={styles.policyRow}>
            <Text style={styles.policyLabel}>Low Battery Interval:</Text>
            <Text style={styles.policyValue}>{policy.scanIntervalLowBatteryMs / 1000} s</Text>
          </View>
          <View style={styles.policyRow}>
            <Text style={styles.policyLabel}>Contact Budget (Base / Low / Carrier):</Text>
            <Text style={styles.policyValue}>
              {policy.baseContactBudgetBytes / 1024}K / {policy.lowBatteryBudgetBytes / 1024}K /{' '}
              {policy.carrierBudgetBytes / 1024}K
            </Text>
          </View>
        </View>

        {/* Core Radio Metrics Card */}
        <View style={styles.metricsCard}>
          <Text style={styles.cardHeader}>RADIO LINK STATS</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{stats.phy}</Text>
              <Text style={styles.metricLbl}>Negotiated PHY</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{stats.mtu} B</Text>
              <Text style={styles.metricLbl}>Negotiated MTU</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{stats.activeConnections}</Text>
              <Text style={styles.metricLbl}>Active GATT</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={[styles.metricVal, stats.gatt133Errors > 0 && styles.errVal]}>
                {stats.gatt133Errors}
              </Text>
              <Text style={styles.metricLbl}>GATT 133 Errs</Text>
            </View>
          </View>

          <View style={styles.byteRow}>
            <Text style={styles.byteText}>TX: {(stats.bytesSent / 1024).toFixed(1)} KB</Text>
            <Text style={styles.byteText}>RX: {(stats.bytesReceived / 1024).toFixed(1)} KB</Text>
            <Text style={styles.byteText}>Success: {stats.successfulExchanges}</Text>
          </View>
        </View>

        {testStatus && (
          <View style={styles.statusToast}>
            <Text style={styles.statusToastText}>{testStatus}</Text>
          </View>
        )}

        {csvExported && (
          <View style={styles.csvPreviewCard}>
            <Text style={styles.cardHeader}>CSV EXPORT PREVIEW</Text>
            <ScrollView horizontal style={styles.csvScroll}>
              <Text style={styles.csvText}>{csvExported}</Text>
            </ScrollView>
          </View>
        )}

        {/* Live Neighbor Nodes */}
        <Text style={styles.sectionHeader}>LIVE GATT PEERS ({neighbors.length})</Text>
        {neighbors.length === 0 ? (
          <View style={styles.emptyNeighbors}>
            <Text style={styles.emptyText}>No BLE advertising beacons detected in range.</Text>
          </View>
        ) : (
          <View style={styles.peerList}>
            {neighbors.map((n) => (
              <View key={n.deviceId} style={styles.peerRow}>
                <View style={styles.peerLeft}>
                  <Text style={styles.peerId}>
                    {n.deviceId} ({n.originFpPrefix})
                  </Text>
                  <Text style={styles.peerMeta}>
                    RSSI: {n.rssi} dBm • Role: {n.role.toUpperCase()} • Protocol: v{n.protocolVersion}
                  </Text>
                  <Text style={styles.flagText}>
                    Flags: {n.flags.hasSos ? '[SOS]' : ''} {n.flags.lowBattery ? '[LOW_BAT]' : ''}{' '}
                    {n.flags.beaconOnly ? '[BEACON]' : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.testPktBtn}
                  onPress={() => handleSendTest(n.deviceId)}
                >
                  <Text style={styles.testPktBtnText}>Send Test</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.fontSizes.title,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.fontSizes.caption,
    color: colors.textSecondary,
  },
  closeBtn: {
    width: layout.minTouchSize,
    height: layout.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.title,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  metricsCard: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardHeader: {
    fontSize: typography.fontSizes.caption,
    fontWeight: typography.fontWeights.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  exportBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: layout.borderRadiusSm,
    borderWidth: 1,
    borderColor: colors.info,
  },
  exportBtnText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricVal: {
    color: colors.textPrimary,
    fontSize: typography.fontSizes.subtitle,
    fontWeight: typography.fontWeights.heavy,
    fontFamily: 'monospace',
  },
  errVal: {
    color: colors.error,
  },
  metricLbl: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  byteRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  byteText: {
    color: colors.info,
    fontSize: typography.fontSizes.caption,
    fontFamily: 'monospace',
  },
  policyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  policyLabel: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
  },
  policyValue: {
    fontSize: typography.fontSizes.small,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  statusToast: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
  },
  statusToastText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizes.small,
  },
  csvPreviewCard: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  csvScroll: {
    marginTop: spacing.sm,
    maxHeight: 120,
  },
  csvText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  sectionHeader: {
    fontSize: typography.fontSizes.small,
    fontWeight: typography.fontWeights.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  emptyNeighbors: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.small,
  },
  peerList: {
    gap: spacing.md,
  },
  peerRow: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peerLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  peerId: {
    color: colors.textPrimary,
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    fontFamily: 'monospace',
  },
  peerMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.caption,
    marginTop: 2,
  },
  flagText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    marginTop: 2,
  },
  testPktBtn: {
    backgroundColor: colors.info,
    paddingHorizontal: spacing.md,
    height: layout.minTouchSize,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testPktBtnText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.caption,
  },
});
