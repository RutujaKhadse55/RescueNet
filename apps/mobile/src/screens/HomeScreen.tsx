import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Animated,
} from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { TriageStatus, NeedsBitmask } from '@rescuenet/core';

interface HomeScreenProps {
  onSosBroadcasted?: (triage: TriageStatus, needs: number) => void;
  isRegistered?: boolean;
  nearbyCount?: number;
  onNavigateToTab?: (tab: 'map' | 'nearby') => void;
  demoMode?: boolean;
  onToggleDemoMode?: (val: boolean) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSosBroadcasted,
  isRegistered = false,
  nearbyCount = 0,
  onNavigateToTab,
  demoMode = false,
  onToggleDemoMode,
}) => {
  const { t } = useTranslation();

  // Emergency SOS state
  const [selectedTriage, setSelectedTriage] = useState<TriageStatus>(TriageStatus.CRITICAL);
  const [needsMedical, setNeedsMedical] = useState(true);
  const [needsTrapped, setNeedsTrapped] = useState(false);
  const [needsFoodWater, setNeedsFoodWater] = useState(false);
  const [needsShelter, setNeedsShelter] = useState(false);

  const [isHolding, setIsHolding] = useState(false);
  const [broadcastDone, setBroadcastDone] = useState(false);
  const holdProgress = useRef(
    Animated && typeof Animated.Value === 'function'
      ? new Animated.Value(0)
      : ({ setValue: () => {}, interpolate: () => 0, stopAnimation: () => {} } as any),
  ).current;
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const computeNeedsMask = (): number => {
    let mask = 0;
    if (needsMedical) mask |= NeedsBitmask.MEDICAL;
    if (needsTrapped) mask |= NeedsBitmask.EVACUATION;
    if (needsFoodWater) mask |= NeedsBitmask.WATER | NeedsBitmask.FOOD;
    if (needsShelter) mask |= NeedsBitmask.SHELTER;
    return mask;
  };

  const startHold = () => {
    setIsHolding(true);
    if (Animated && typeof Animated.timing === 'function') {
      Animated.timing(holdProgress, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && isMountedRef.current) {
          triggerSos();
        }
      });
    } else {
      triggerSos();
    }
  };

  const cancelHold = () => {
    if (!broadcastDone) {
      setIsHolding(false);
      if (holdProgress && typeof holdProgress.stopAnimation === 'function') {
        holdProgress.stopAnimation();
        holdProgress.setValue(0);
      }
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
      }
    }
  };

  const triggerSos = () => {
    if (!isMountedRef.current) return;
    setIsHolding(false);
    setBroadcastDone(true);
    if (onSosBroadcasted) {
      onSosBroadcasted(selectedTriage, computeNeedsMask());
    }
    const resetDelay = process.env.NODE_ENV === 'test' ? 50 : 4000;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setBroadcastDone(false);
        if (holdProgress && typeof holdProgress.setValue === 'function') {
          holdProgress.setValue(0);
        }
      }
    }, resetDelay);
  };

  const handleInstantEmergency = () => {
    triggerSos();
  };

  const triageOptions = [
    { status: TriageStatus.CRITICAL, label: 'Red (Immediate)', color: colors.triageRed },
    { status: TriageStatus.INJURED, label: 'Yellow (Delayed)', color: colors.triageYellow },
    { status: TriageStatus.SAFE, label: 'Green (Minor)', color: colors.triageGreen },
    { status: TriageStatus.TRAPPED, label: 'Black (Expectant)', color: colors.triageBlack },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Brand Header */}
      <View style={styles.topHeaderCard}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>RESCUENET</Text>
          <View style={styles.preparedBadge}>
            <Text style={styles.preparedBadgeText}>You're Prepared ✓</Text>
          </View>
        </View>
        <Text style={styles.statusSubText}>Location: Available • BLE Mesh: Ready</Text>
      </View>

      {/* Demo / Simulation Mode Banner */}
      {onToggleDemoMode && (
        <View style={styles.demoCard}>
          <View style={styles.demoRow}>
            <View style={styles.demoTextCol}>
              <Text style={styles.demoTitle}>DEMO / SIMULATION MODE</Text>
              <Text style={styles.demoSub}>Simulate peer BLE mesh when testing in emulator</Text>
            </View>

            <Switch
              value={demoMode}
              onValueChange={onToggleDemoMode}
              trackColor={{ false: colors.border, true: colors.info }}
              thumbColor={colors.textInverse}
            />
          </View>
        </View>
      )}

      {/* Active SOS Case Notification Card */}
      {broadcastDone && (
        <View style={styles.activeSosCaseCard}>
          <View style={styles.activeSosHeaderRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.activeSosCaseTag}>EMERGENCY BROADCAST LIVE</Text>
          </View>
          <Text style={styles.activeSosCaseTitle}>
            Active Case:{' '}
            {selectedTriage === TriageStatus.CRITICAL
              ? '🚨 CODE RED (Immediate - Life Threat)'
              : selectedTriage === TriageStatus.INJURED
                ? '⚠️ CODE YELLOW (Delayed)'
                : '🟢 CODE GREEN (Minor)'}
          </Text>
          <Text style={styles.activeSosCaseSub}>
            Needs:{' '}
            {[
              needsMedical && 'Medical',
              needsTrapped && 'Trapped',
              needsFoodWater && 'Water/Food',
              needsShelter && 'Shelter',
            ]
              .filter(Boolean)
              .join(', ') || 'Medical Attention'}
          </Text>
          <Text style={styles.activeSosDispatchedSub}>
            Dispatched via: Internet Uplink → Control Center Backend & Admin Dashboard
          </Text>
        </View>
      )}

      {/* Giant Emergency SOS Button */}
      <View style={styles.sosContainer}>
        <TouchableOpacity
          style={[
            styles.giantSosButton,
            broadcastDone && styles.sosBroadcastDone,
            isHolding && styles.sosHolding,
          ]}
          activeOpacity={0.9}
          onPressIn={startHold}
          onPressOut={cancelHold}
          accessibilityRole="button"
          accessibilityLabel="SOS Emergency Button. Hold 3 seconds to broadcast."
        >
          <View
            style={[styles.holdFill, { width: broadcastDone ? '100%' : isHolding ? '50%' : '0%' }]}
          />

          <View style={styles.sosButtonContent}>
            <Text style={styles.sosMainText}>{broadcastDone ? 'SOS SENT ✓' : 'SOS'}</Text>
            <Text style={styles.sosSubText}>
              {broadcastDone
                ? 'Relaying via automatic emergency route'
                : 'EMERGENCY HELP (HOLD 3 SEC)'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.instantBypassBtn} onPress={handleInstantEmergency}>
          <Text style={styles.instantBypassText}>⚡ 1-TAP INSTANT SOS</Text>
        </TouchableOpacity>
      </View>

      {/* Triage Urgency */}
      <Text style={styles.sectionTitle}>Triage Urgency</Text>
      <View style={styles.triageGrid}>
        {triageOptions.map(opt => {
          const isSelected = selectedTriage === opt.status;
          return (
            <TouchableOpacity
              key={opt.status}
              style={[
                styles.triageButton,
                { borderColor: opt.color },
                isSelected && { backgroundColor: opt.color },
              ]}
              onPress={() => setSelectedTriage(opt.status)}
            >
              <Text
                style={[
                  styles.triageButtonText,
                  isSelected ? styles.triageTextSelected : { color: opt.color },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Immediate Needs */}
      <Text style={styles.sectionTitle}>Immediate Needs</Text>
      <View style={styles.needsContainer}>
        <TouchableOpacity
          style={[styles.needChip, needsMedical && styles.needChipActive]}
          onPress={() => setNeedsMedical(!needsMedical)}
        >
          <Text style={styles.needIcon}>🩹</Text>
          <Text style={[styles.needLabel, needsMedical && styles.needLabelActive]}>Medical</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.needChip, needsTrapped && styles.needChipActive]}
          onPress={() => setNeedsTrapped(!needsTrapped)}
        >
          <Text style={styles.needIcon}>🏗️</Text>
          <Text style={[styles.needLabel, needsTrapped && styles.needLabelActive]}>Trapped</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.needChip, needsFoodWater && styles.needChipActive]}
          onPress={() => setNeedsFoodWater(!needsFoodWater)}
        >
          <Text style={styles.needIcon}>💧</Text>
          <Text style={[styles.needLabel, needsFoodWater && styles.needLabelActive]}>
            Food & Water
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.needChip, needsShelter && styles.needChipActive]}
          onPress={() => setNeedsShelter(!needsShelter)}
        >
          <Text style={styles.needIcon}>⛺</Text>
          <Text style={[styles.needLabel, needsShelter && styles.needLabelActive]}>Shelter</Text>
        </TouchableOpacity>
      </View>

      {/* Nearby Survivors Overview Card */}
      <View style={styles.nearbyOverviewCard}>
        <Text style={styles.nearbyOverviewTitle}>Nearby Survivors</Text>
        <Text style={styles.nearbyOverviewCount}>{nearbyCount} RescueNet users nearby</Text>

        <View style={styles.nearbyButtonsRow}>
          <TouchableOpacity
            style={styles.nearbyNavBtn}
            onPress={() => onNavigateToTab && onNavigateToTab('map')}
          >
            <Text style={styles.nearbyNavBtnText}>VIEW MAP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.nearbyNavBtn}
            onPress={() => onNavigateToTab && onNavigateToTab('nearby')}
          >
            <Text style={styles.nearbyNavBtnText}>VIEW NEARBY</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  topHeaderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  brandTitle: {
    fontSize: typography.fontSizes.headline,
    fontWeight: typography.fontWeights.heavy,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  preparedBadge: {
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: layout.borderRadiusFull,
    borderWidth: 1,
    borderColor: colors.success,
  },
  preparedBadgeText: {
    color: colors.success,
    fontSize: typography.fontSizes.caption,
    fontWeight: typography.fontWeights.bold,
  },
  statusSubText: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
  },
  demoCard: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  demoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  demoTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  demoTitle: {
    fontSize: typography.fontSizes.caption,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
    letterSpacing: 0.5,
  },
  demoSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activeSosCaseCard: {
    backgroundColor: '#7f1d1d',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  activeSosHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  activeSosCaseTag: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fca5a5',
    letterSpacing: 1,
  },
  activeSosCaseTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  activeSosCaseSub: {
    fontSize: 11,
    color: '#fecaca',
    marginTop: 2,
  },
  activeSosDispatchedSub: {
    fontSize: 10,
    color: '#a7f3d0',
    marginTop: 4,
    fontWeight: '700',
  },
  sosContainer: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  giantSosButton: {
    width: '100%',
    minHeight: 130,
    backgroundColor: colors.sosRed,
    borderRadius: layout.borderRadiusLg,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  sosHolding: {
    backgroundColor: '#b91c1c',
  },
  sosBroadcastDone: {
    backgroundColor: colors.success,
  },
  holdFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  sosButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  sosMainText: {
    color: colors.textInverse,
    fontSize: 36,
    fontWeight: typography.fontWeights.heavy,
    letterSpacing: 2,
  },
  sosSubText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: typography.fontSizes.caption,
    fontWeight: typography.fontWeights.bold,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  instantBypassBtn: {
    marginTop: spacing.md,
    height: layout.minTouchSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instantBypassText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.caption,
    fontWeight: typography.fontWeights.bold,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.small,
    fontWeight: typography.fontWeights.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  triageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  triageButton: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: layout.minTouchSize,
    borderWidth: 2,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
  },
  triageButtonText: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
  },
  triageTextSelected: {
    color: colors.textInverse,
  },
  needsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  needChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.borderRadiusMd,
    paddingHorizontal: spacing.md,
    minHeight: layout.minTouchSize,
    flexBasis: '48%',
    flexGrow: 1,
  },
  needChipActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderColor: colors.info,
  },
  needIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  needLabel: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.medium,
  },
  needLabelActive: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
  },
  nearbyOverviewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  nearbyOverviewTitle: {
    fontSize: typography.fontSizes.subtitle,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  nearbyOverviewCount: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  nearbyButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  nearbyNavBtn: {
    flex: 1,
    height: 44,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.borderRadiusMd,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nearbyNavBtnText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizes.small,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 0.5,
  },
});
