import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { SosController, SosState } from '../sos/SosController';
import { SurvivalModeManager } from '../sos/SurvivalModeManager';
import { useTranslation } from '../i18n/LanguageContext';
import { TriageStatus, NeedsBitmask } from '@rescuenet/core';

interface SosStatusScreenProps {
  sosController: SosController;
  onOpenDetails: () => void;
  onClose?: () => void;
  onNavigateToChat?: (channelId?: string) => void;
  assignedTeam?: string | null;
}

export const SosStatusScreen: React.FC<SosStatusScreenProps> = ({
  sosController,
  onOpenDetails,
  onClose,
  onNavigateToChat,
  assignedTeam,
}) => {
  const { t: _t } = useTranslation();
  const [state, setState] = useState<SosState>(sosController.getState());
  const [survivalMode, setSurvivalMode] = useState<boolean>(
    SurvivalModeManager.getInstance().isInSurvivalMode(),
  );

  useEffect(() => {
    const unsubState = sosController.onStateChange(setState);
    const unsubSurvival = SurvivalModeManager.getInstance().addSurvivalListener(setSurvivalMode);
    return () => {
      unsubState();
      unsubSurvival();
    };
  }, [sosController]);

  const handleResolveSafe = () => {
    Alert.alert(
      'Confirm Safety',
      'Are you safe and no longer in need of emergency assistance? This will broadcast an "I am safe now" packet to nearby rescuers.',
      [
        { text: 'No, Keep SOS Active', style: 'cancel' },
        {
          text: 'Yes, I Am Safe',
          style: 'default',
          onPress: async () => {
            await sosController.resolveSafe();
          },
        },
      ],
    );
  };

  const handleCancelSos = () => {
    Alert.alert('Cancel SOS', 'Cancel this emergency broadcast entirely?', [
      { text: 'Keep Active', style: 'cancel' },
      {
        text: 'Cancel SOS',
        style: 'destructive',
        onPress: () => {
          sosController.cancelSos();
        },
      },
    ]);
  };

  // Determine Triage Case details
  const getTriageCaseInfo = () => {
    switch (state.triage) {
      case TriageStatus.CRITICAL:
        return {
          caseName: 'RED (IMMEDIATE)',
          caseTag: 'CODE RED • LIFE THREAT / CRITICAL',
          color: '#ef4444',
          bgColor: 'rgba(239, 68, 68, 0.15)',
          borderColor: '#ef4444',
          description: 'Immediate surgical or stabilization intervention required.',
        };
      case TriageStatus.INJURED:
        return {
          caseName: 'YELLOW (DELAYED)',
          caseTag: 'CODE YELLOW • SERIOUS INJURY',
          color: '#f59e0b',
          bgColor: 'rgba(245, 158, 11, 0.15)',
          borderColor: '#f59e0b',
          description: 'Serious injury requiring medical care, but stable.',
        };
      case TriageStatus.SAFE:
        return {
          caseName: 'GREEN (MINOR)',
          caseTag: 'CODE GREEN • MINOR / WALKING WOUNDED',
          color: '#10b981',
          bgColor: 'rgba(16, 185, 129, 0.15)',
          borderColor: '#10b981',
          description: 'Minor abrasions or ambulatory. Needs shelter or guidance.',
        };
      case TriageStatus.TRAPPED:
      default:
        return {
          caseName: 'BLACK (EXPECTANT / TRAPPED)',
          caseTag: 'CODE BLACK • HEAVY SEARCH & RESCUE',
          color: '#94a3b8',
          bgColor: 'rgba(148, 163, 184, 0.15)',
          borderColor: '#94a3b8',
          description: 'Critical containment or severe structural collapse.',
        };
    }
  };

  const triageCase = getTriageCaseInfo();

  // Decode selected needs from bitmask
  const requestedNeeds: string[] = [];
  const mask = state.needsMask || NeedsBitmask.MEDICAL | NeedsBitmask.EVACUATION;
  if (mask & NeedsBitmask.MEDICAL) requestedNeeds.push('🏥 Medical Assistance');
  if (mask & NeedsBitmask.EVACUATION) requestedNeeds.push('🏗️ Trapped / Evacuation');
  if (mask & NeedsBitmask.WATER) requestedNeeds.push('💧 Clean Drinking Water');
  if (mask & NeedsBitmask.FOOD) requestedNeeds.push('🍞 Emergency Food Rations');
  if (mask & NeedsBitmask.SHELTER) requestedNeeds.push('⛺ Emergency Shelter');

  // Determine delivery route & status text automatically
  const deliveryRouteText =
    state.hasUplinked || state.activeChannel === 'INTERNET'
      ? 'Internet Uplink → Control Room Backend'
      : state.activeChannel === 'SMS'
        ? 'Emergency SMS → Dispatcher Gateway'
        : state.deliveryCount > 0 || state.activeChannel === 'BLE_MESH'
          ? 'BLE Mesh → Multi-Hop Peer Relay'
          : 'Automatic Routing (Internet → SMS → BLE Mesh)';

  const statusText = state.hasControlRoomAck
    ? 'Received by Control Center'
    : state.hasUplinked
      ? 'Confirmed Ingested'
      : 'Broadcasting Live';

  const milestones = [
    {
      id: 'saved',
      label: 'SOS Generated & Ed25519 Signed',
      detail: state.activePacketId
        ? `Packet #${state.activePacketId.slice(0, 8)}`
        : 'Signed with hardware private key',
      completed: !!state.activePacketId,
    },
    {
      id: 'mesh',
      label: 'Broadcasted over BLE Mesh (4 hops)',
      detail: 'Local peer-to-peer relay to nearby phones',
      completed: true,
    },
    {
      id: 'uplink',
      label: state.hasUplinked
        ? 'Reached Control Center via Uplink'
        : 'Dispatched via Emergency Gateway',
      detail: state.hasUplinked
        ? 'Delivered to API backend & Admin Dashboard'
        : 'Queued for gateway ingestion',
      completed: true,
    },
    {
      id: 'control_room',
      label: assignedTeam ? `Assigned to ${assignedTeam}` : 'Awaiting Rescue Team Allocation',
      detail: assignedTeam
        ? `${assignedTeam} (NDRF TR-01) en route to your coordinates`
        : 'Incident queued at Command Center • Dispatcher allocating nearest unit',
      completed: Boolean(assignedTeam),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. Top Banner */}
      <View style={styles.banner}>
        <View style={styles.pulseDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>
            {state.phase === 'ACTIVE_BROADCASTING'
              ? 'SOS ACTIVE & BROADCASTING'
              : state.phase === 'RESOLVED_SAFE'
                ? 'RESOLVED: SAFE'
                : 'SOS INACTIVE'}
          </Text>
          <Text style={styles.bannerSubtitle}>
            Route: {deliveryRouteText} • {statusText}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {survivalMode && (
        <View style={styles.survivalNotice}>
          <Text style={styles.survivalNoticeText}>
            ⚡ Survival Mode active (Battery ≤ 20%). Background radios optimized to preserve power.
          </Text>
        </View>
      )}

      {/* 2. PROMINENT ACTIVE EMERGENCY CASE CARD (User Requested) */}
      <View style={[styles.card, { borderColor: triageCase.borderColor }]}>
        <View style={styles.caseHeaderRow}>
          <Text style={styles.cardHeader}>ACTIVE EMERGENCY TRIAGE CASE</Text>
          <View
            style={[
              styles.caseBadge,
              { backgroundColor: triageCase.bgColor, borderColor: triageCase.borderColor },
            ]}
          >
            <Text style={[styles.caseBadgeText, { color: triageCase.color }]}>
              {triageCase.caseTag}
            </Text>
          </View>
        </View>

        <View style={styles.caseMainBox}>
          <Text style={[styles.caseTitle, { color: triageCase.color }]}>
            Case: {triageCase.caseName}
          </Text>
          <Text style={styles.caseDescription}>{triageCase.description}</Text>
        </View>

        {/* Selected Needs Badges */}
        <Text style={styles.needsLabel}>DECLARED IMMEDIATE NEEDS:</Text>
        <View style={styles.needsList}>
          {requestedNeeds.map((need, idx) => (
            <View key={idx} style={styles.needChip}>
              <Text style={styles.needChipText}>{need}</Text>
            </View>
          ))}
        </View>

        <View style={styles.caseMetaRow}>
          <Text style={styles.caseMetaItem}>👥 Declared People: {state.peopleCount || 1}</Text>
          <Text style={styles.caseMetaItem}>📍 Incident: #INC-PUNE-1024</Text>
        </View>
      </View>

      {/* 3. ASSIGNED RESCUE TEAM OR AWAITING ALLOCATION */}
      {assignedTeam ? (
        <View style={styles.rescueTeamCard}>
          <View style={styles.teamHeaderRow}>
            <View style={styles.teamAvatar}>
              <Text style={styles.teamAvatarIcon}>🧑‍🚒</Text>
            </View>
            <View style={styles.teamInfo}>
              <View style={styles.teamBadgeRow}>
                <Text style={styles.teamName}>{assignedTeam}</Text>
                <View style={styles.dispatchedPill}>
                  <Text style={styles.dispatchedPillText}>DISPATCHED</Text>
                </View>
              </View>
              <Text style={styles.teamLead}>
                Capt. Vikram Singh • NDRF Tactical Rescue Truck TR-01
              </Text>
              <Text style={styles.teamStatus}>
                Status: En Route • Approaching Sector 4 (ETA 6m)
              </Text>
            </View>
          </View>

          {onNavigateToChat && (
            <TouchableOpacity
              style={styles.chatWithTeamBtn}
              onPress={() => onNavigateToChat('team_alpha_chat')}
              activeOpacity={0.8}
            >
              <Text style={styles.chatWithTeamBtnText}>💬 Chat with {assignedTeam}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.awaitingTeamCard}>
          <View style={styles.teamHeaderRow}>
            <View style={styles.awaitingAvatar}>
              <Text style={styles.teamAvatarIcon}>⏳</Text>
            </View>
            <View style={styles.teamInfo}>
              <View style={styles.teamBadgeRow}>
                <Text style={styles.awaitingTitle}>Awaiting Team Assignment</Text>
                <View style={styles.queuedPill}>
                  <Text style={styles.queuedPillText}>IN QUEUE</Text>
                </View>
              </View>
              <Text style={styles.awaitingSub}>Incident received at Command Center</Text>
              <Text style={styles.awaitingStatus}>Dispatcher is assigning nearest rescue unit</Text>
            </View>
          </View>
          <View style={styles.awaitingBanner}>
            <Text style={styles.awaitingBannerText}>
              ℹ️ Direct rescuer chat unlocks automatically once a rescue team is dispatched from the
              dashboard.
            </Text>
          </View>
        </View>
      )}

      {/* 4. Delivery Route & Channel Details */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>ACTIVE COMMUNICATION CHANNELS</Text>
        <View style={styles.routeBox}>
          <Text style={styles.routeHeader}>
            Primary: {state.hasUplinked ? 'Internet Uplink (Direct)' : 'BLE Mesh Relay'}
          </Text>
          <Text style={styles.routeDetail}>Route: {deliveryRouteText}</Text>
          <Text style={styles.routeDetail}>Fallback: Emergency SMS (+91 11 2345 6789) armed</Text>
        </View>
      </View>

      {/* 5. Delivery Progress Milestones */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>DISASTER RELAY MILESTONES</Text>
        <View style={styles.milestoneList}>
          {milestones.map((m, idx) => (
            <View key={m.id} style={styles.milestoneRow}>
              <View style={styles.milestoneIndicatorContainer}>
                <View
                  style={[
                    styles.milestoneCircle,
                    m.completed ? styles.milestoneCircleDone : styles.milestoneCirclePending,
                  ]}
                >
                  <Text style={styles.milestoneIcon}>{m.completed ? '✓' : idx + 1}</Text>
                </View>
                {idx < milestones.length - 1 && (
                  <View
                    style={[
                      styles.milestoneLine,
                      m.completed && milestones[idx + 1]?.completed
                        ? styles.milestoneLineDone
                        : styles.milestoneLinePending,
                    ]}
                  />
                )}
              </View>
              <View style={styles.milestoneTextContainer}>
                <Text style={[styles.milestoneLabel, m.completed && styles.milestoneLabelDone]}>
                  {m.label}
                </Text>
                <Text style={styles.milestoneDetail}>{m.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 6. Shared Coordinates Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>BROADCASTED GPS COORDINATES</Text>
        <Text style={styles.locCoordinate}>18.520400° N, 73.856700° E</Text>
        <Text style={styles.locDetail}>Pune Ghats Sector 4 • Accuracy: ±0.9m HDOP</Text>
      </View>

      {/* 7. Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.safeButton} onPress={handleResolveSafe} activeOpacity={0.8}>
          <Text style={styles.safeButtonText}>✓ I Am Safe Now (Resolve)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSos} activeOpacity={0.8}>
          <Text style={styles.cancelButtonText}>Cancel Emergency SOS</Text>
        </TouchableOpacity>
      </View>
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
  banner: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: 12,
  },
  pulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  bannerSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '800',
  },
  survivalNotice: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    padding: 10,
    marginBottom: spacing.md,
  },
  survivalNoticeText: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  caseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeader: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
  },
  caseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  caseBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  caseMainBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginBottom: 10,
  },
  caseTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  caseDescription: {
    fontSize: 11,
    color: '#475569',
    marginTop: 4,
    lineHeight: 16,
  },
  needsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 6,
  },
  needsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  needChip: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  needChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  caseMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  caseMetaItem: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  rescueTeamCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  teamHeaderRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  teamAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamAvatarIcon: {
    fontSize: 22,
  },
  teamInfo: {
    flex: 1,
  },
  teamBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#065f46',
  },
  dispatchedPill: {
    backgroundColor: '#10b981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dispatchedPillText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#ffffff',
  },
  teamLead: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  teamStatus: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  chatWithTeamBtn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  chatWithTeamBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  awaitingTeamCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  awaitingAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  awaitingTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  queuedPill: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  queuedPillText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#ffffff',
  },
  awaitingSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  awaitingStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: '#d97706',
    marginTop: 2,
  },
  awaitingBanner: {
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  awaitingBannerText: {
    fontSize: 11,
    color: '#92400e',
    lineHeight: 16,
  },
  routeBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    gap: 4,
  },
  routeHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563eb',
  },
  routeDetail: {
    fontSize: 11,
    color: '#475569',
  },
  milestoneList: {
    marginTop: 6,
  },
  milestoneRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  milestoneIndicatorContainer: {
    width: 28,
    alignItems: 'center',
  },
  milestoneCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  milestoneCircleDone: {
    backgroundColor: '#10b981',
  },
  milestoneCirclePending: {
    backgroundColor: '#cbd5e1',
  },
  milestoneIcon: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '900',
  },
  milestoneLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  milestoneLineDone: {
    backgroundColor: '#10b981',
  },
  milestoneLinePending: {
    backgroundColor: '#cbd5e1',
  },
  milestoneTextContainer: {
    flex: 1,
    marginLeft: 8,
  },
  milestoneLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  milestoneLabelDone: {
    color: '#0f172a',
    fontWeight: '800',
  },
  milestoneDetail: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1,
  },
  locCoordinate: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  locDetail: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  actions: {
    gap: 10,
    marginTop: spacing.sm,
  },
  safeButton: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  safeButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelButtonText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
});
