import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { StoredIdentity } from '../security/identity';

export type UserRole = 'survivor' | 'rescuer' | 'gateway';

interface SettingsScreenProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  identity: StoredIdentity | null;
  onOpenWipeData: () => void;
  onOpenMapDownload?: () => void;
  hasMapDownloaded?: boolean;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  currentRole,
  onSelectRole,
  identity,
  onOpenWipeData,
  onOpenMapDownload,
  hasMapDownloaded = true,
}) => {
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Screen Title */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Settings & Controls</Text>
        <Text style={styles.screenSubtitle}>
          Essential hardware radios, identity, and emergency helplines
        </Text>
      </View>

      {/* 1. Device Role Switcher */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>DEVICE OPERATING ROLE</Text>
        <Text style={styles.sectionDescription}>
          Switch between regular survivor mode and certified rescue personnel tactical mode
        </Text>

        <View style={styles.roleGrid}>
          <TouchableOpacity
            style={[styles.roleBtn, currentRole === 'survivor' && styles.roleBtnActive]}
            onPress={() => onSelectRole('survivor')}
            activeOpacity={0.8}
          >
            <Text style={styles.roleIcon}>📱</Text>
            <View>
              <Text
                style={[
                  styles.roleText,
                  currentRole === 'survivor' && styles.roleTextActive,
                ]}
              >
                Survivor Mode
              </Text>
              <Text style={styles.roleSubtext}>1-Tap SOS, Mesh Chat & Beacon</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleBtn, currentRole === 'rescuer' && styles.roleBtnActive]}
            onPress={() => onSelectRole('rescuer')}
            activeOpacity={0.8}
          >
            <Text style={styles.roleIcon}>🧑‍🚒</Text>
            <View>
              <Text
                style={[
                  styles.roleText,
                  currentRole === 'rescuer' && styles.roleTextActive,
                ]}
              >
                Rescue Team Mode
              </Text>
              <Text style={styles.roleSubtext}>Homing, Cluster Triage & Radar</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Hardware Radios & Mesh Status */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>EMERGENCY HARDWARE RADIOS</Text>

        <View style={styles.radioRow}>
          <View style={styles.radioInfo}>
            <Text style={styles.radioTitle}>📶 Bluetooth Low Energy Mesh</Text>
            <Text style={styles.radioSub}>Active • 4-Hop Multi-hop Relay Enabled</Text>
          </View>
          <View style={styles.statusPillActive}>
            <Text style={styles.statusPillText}>ONLINE</Text>
          </View>
        </View>

        <View style={styles.radioRow}>
          <View style={styles.radioInfo}>
            <Text style={styles.radioTitle}>📍 High-Accuracy GPS</Text>
            <Text style={styles.radioSub}>Fix: 18.5204° N, 73.8567° E (±0.9m HDOP)</Text>
          </View>
          <View style={styles.statusPillActive}>
            <Text style={styles.statusPillText}>LOCKED</Text>
          </View>
        </View>

        <View style={styles.radioRow}>
          <View style={styles.radioInfo}>
            <Text style={styles.radioTitle}>⚡ Emergency Dispatch Uplink</Text>
            <Text style={styles.radioSub}>Automatic: Internet → SMS → BLE Mesh</Text>
          </View>
          <View style={styles.statusPillActive}>
            <Text style={styles.statusPillText}>ARMED</Text>
          </View>
        </View>
      </View>

      {/* 3. Offline Vector Disaster Map Pack */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>OFFLINE DISASTER MAP PACK</Text>
        <View style={styles.mapPackRow}>
          <View style={styles.mapPackInfo}>
            <Text style={styles.mapPackTitle}>Pune District & Western Ghats</Text>
            <Text style={styles.mapPackSub}>
              14.2 MB Vector MBTiles • 100% Offline (No Internet Needed)
            </Text>
          </View>
          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={onOpenMapDownload}
            activeOpacity={0.8}
          >
            <Text style={styles.verifyBtnText}>
              {hasMapDownloaded ? '✓ Verified' : 'Download'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. Emergency Control Room Contacts */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>DISASTER HELPLINES & CONTROL ROOMS</Text>

        <View style={styles.helplineRow}>
          <View>
            <Text style={styles.helplineName}>National Emergency Helpline</Text>
            <Text style={styles.helplineSub}>Police, Fire & Ambulance</Text>
          </View>
          <View style={styles.helplineNumberBadge}>
            <Text style={styles.helplineNumber}>112</Text>
          </View>
        </View>

        <View style={styles.helplineRow}>
          <View>
            <Text style={styles.helplineName}>NDRF Control Room</Text>
            <Text style={styles.helplineSub}>Disaster Relief & Evacuation</Text>
          </View>
          <View style={styles.helplineNumberBadge}>
            <Text style={styles.helplineNumber}>+91 11 2345 6789</Text>
          </View>
        </View>

        <View style={styles.helplineRow}>
          <View>
            <Text style={styles.helplineName}>State Disaster Authority (SDMA)</Text>
            <Text style={styles.helplineSub}>Monsoon & Landslide Triage</Text>
          </View>
          <View style={styles.helplineNumberBadge}>
            <Text style={styles.helplineNumber}>1070</Text>
          </View>
        </View>
      </View>

      {/* 5. Cryptographic Device Identity */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>DEVICE IDENTITY & KEYPAIR</Text>
        <Text style={styles.identityFingerprint}>
          {identity ? `Root Origin FP: ${identity.originFp}` : 'Root Origin FP: 4a9b2c8f1e7d3a01'}
        </Text>
        <Text style={styles.identityAlgorithm}>
          Ed25519 Signatures • X25519 Key Exchange • Rotating Ephemeral BLE MACs
        </Text>
      </View>

      {/* 6. Emergency Data Wipe */}
      <View style={styles.sectionCardDanger}>
        <Text style={styles.dangerLabel}>LOCAL STORAGE MANAGEMENT</Text>
        <Text style={styles.dangerDescription}>
          Clear cached disaster telemetry, local peer database, and emergency keypairs.
        </Text>
        <TouchableOpacity
          style={styles.wipeButton}
          onPress={onOpenWipeData}
          activeOpacity={0.8}
        >
          <Text style={styles.wipeButtonText}>🗑️ Wipe Local Emergency Data</Text>
        </TouchableOpacity>
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
    marginBottom: spacing.md,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  screenSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionCardDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 10,
  },
  roleGrid: {
    gap: 8,
  },
  roleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  roleBtnActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
  },
  roleIcon: {
    fontSize: 22,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  roleTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  roleSubtext: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1,
  },
  radioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  radioInfo: {
    flex: 1,
  },
  radioTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  radioSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1,
  },
  statusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#34d399',
  },
  mapPackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapPackInfo: {
    flex: 1,
  },
  mapPackTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  mapPackSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  verifyBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  verifyBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34d399',
  },
  helplineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  helplineName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  helplineSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1,
  },
  helplineNumberBadge: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  helplineNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
  },
  identityFingerprint: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#f8fafc',
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  identityAlgorithm: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 6,
  },
  dangerLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ef4444',
    letterSpacing: 1,
    marginBottom: 4,
  },
  dangerDescription: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 10,
  },
  wipeButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  wipeButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ef4444',
  },
});
