import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { layout, spacing } from '../theme';
import { HomingSignalState, HomingTrend } from '@rescuenet/core';
import { HomingService, HomingTarget } from '../rescuer/HomingService';

interface HomingScreenProps {
  homingService: HomingService;
  target: HomingTarget;
  onClose: () => void;
  onFoundSuccess?: () => void;
}

export const HomingScreen: React.FC<HomingScreenProps> = ({
  homingService,
  target,
  onClose,
  onFoundSuccess,
}) => {
  const [signalState, setSignalState] = useState<HomingSignalState>(homingService.getState());
  const [pulseCount, setPulseCount] = useState<number>(0);
  const [isSubmittingFound, setIsSubmittingFound] = useState<boolean>(false);
  const [foundSuccessMessage, setFoundSuccessMessage] = useState<string | null>(null);

  // Pulse animation
  const pulseAnim = useRef(
    Animated && typeof Animated.Value === 'function'
      ? new Animated.Value(1)
      : ({ setValue: () => {} } as any)
  ).current;

  useEffect(() => {
    // Start homing session
    homingService.startHoming(target).catch(() => {});

    // Listen to signal state changes
    homingService.onStateChange((state) => {
      setSignalState(state);
    });

    // Listen to pulse ticks
    homingService.onPulse((_type, _interval) => {
      setPulseCount((c) => c + 1);

      // Trigger short haptic vibration on real device
      if (Platform && Platform.OS !== 'web' && Vibration && typeof Vibration.vibrate === 'function') {
        try {
          Vibration.vibrate(30);
        } catch {}
      }

      // Visual pulse expansion
      if (pulseAnim && typeof pulseAnim.setValue === 'function') {
        pulseAnim.setValue(1.3);
        if (typeof Animated.timing === 'function') {
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 250,
            useNativeDriver: false,
          }).start();
        }
      }
    });

    return () => {
      homingService.stopHoming();
    };
  }, [homingService, target]);

  const handleFoundThem = async () => {
    setIsSubmittingFound(true);
    const res = await homingService.markFound();
    setIsSubmittingFound(false);

    if (res.success) {
      setFoundSuccessMessage('Cluster marked REACHED! Signed acknowledgment broadcasted.');
      setTimeout(() => {
        onFoundSuccess?.();
        onClose();
      }, 1500);
    }
  };

  const getTrendColor = (trend: HomingTrend) => {
    switch (trend) {
      case 'warmer':
        return '#10B981'; // Green
      case 'colder':
        return '#EF4444'; // Red
      case 'steady':
      default:
        return '#F59E0B'; // Amber
    }
  };

  const getTrendIcon = (trend: HomingTrend) => {
    switch (trend) {
      case 'warmer':
        return '▲';
      case 'colder':
        return '▼';
      case 'steady':
      default:
        return '▶';
    }
  };

  const getTrendLabel = (trend: HomingTrend) => {
    switch (trend) {
      case 'warmer':
        return 'WARMER (CLOSER)';
      case 'colder':
        return 'COLDER (MOVE BACK)';
      case 'steady':
      default:
        return 'STEADY SIGNAL';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>Homing Mode (Final Approach)</Text>
          <Text style={styles.targetName}>Target: {target.title}</Text>
          {target.originFpPrefix ? (
            <Text style={styles.targetFp}>Prefix: {target.originFpPrefix.toUpperCase()}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} testID="homing-close-btn">
          <Text style={styles.closeBtnText}>Exit</Text>
        </TouchableOpacity>
      </View>

      {/* Main Trend HUD */}
      <View style={styles.hudContainer}>
        <View
          style={[
            styles.trendCircle,
            { borderColor: getTrendColor(signalState.trend) },
          ]}
        >
          <Text style={[styles.trendIcon, { color: getTrendColor(signalState.trend) }]}>
            {getTrendIcon(signalState.trend)}
          </Text>
          <Text style={[styles.trendLabel, { color: getTrendColor(signalState.trend) }]}>
            {getTrendLabel(signalState.trend)}
          </Text>
        </View>

        {/* Signal Strength Segmented Bars (0 to 5) */}
        <View style={styles.barsContainer} testID="homing-signal-bars">
          {[1, 2, 3, 4, 5].map((barIdx) => {
            const isActive = signalState.signalBars >= barIdx;
            return (
              <View
                key={barIdx}
                style={[
                  styles.barSegment,
                  isActive
                    ? [styles.barActive, { backgroundColor: getTrendColor(signalState.trend) }]
                    : styles.barInactive,
                ]}
              />
            );
          })}
        </View>
        <Text style={styles.barsLabel}>
          Signal Strength: {signalState.signalBars} / 5 Bars ({signalState.smoothedRssi} dBm)
        </Text>

        {/* Audio / Haptic Pulse Status */}
        <View style={styles.pulseContainer}>
          <View
            style={[
              styles.pulseDot,
              { backgroundColor: getTrendColor(signalState.trend) },
            ]}
          />
          <Text style={styles.pulseText}>
            Audio / Haptic Pulse: {signalState.pulseIntervalMs} ms rate (Tick #{pulseCount})
          </Text>
        </View>
      </View>

      {/* Prominent Rubble & No-Metres Disclaimer */}
      <View style={styles.rubbleNoteBox}>
        <Text style={styles.rubbleNoteTitle}>⚠️ RELATIVE GUIDANCE ONLY</Text>
        <Text style={styles.rubbleNoteBody}>
          RSSI is heavily distorted by concrete, rebar, and rubble multipath. Do not display
          or rely on calculated metres. Follow the relative trend arrow and use audio calls.
        </Text>
      </View>

      {/* Success banner */}
      {foundSuccessMessage ? (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{foundSuccessMessage}</Text>
        </View>
      ) : null}

      {/* Action Footer: Found Them Button */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={[styles.foundBtn, isSubmittingFound && styles.btnDisabled]}
          onPress={handleFoundThem}
          disabled={isSubmittingFound}
          testID="homing-found-them-btn"
        >
          <Text style={styles.foundBtnText}>
            {isSubmittingFound ? 'Broadcasting...' : '🎯 Found Them (Mark Reached)'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: spacing.sm,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  targetName: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
  },
  targetFp: {
    fontSize: 12,
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: layout.borderRadiusMd,
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  hudContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  trendCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    marginBottom: spacing.md,
  },
  trendIcon: {
    fontSize: 64,
    fontWeight: '900',
    marginBottom: 4,
  },
  trendLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  barsContainer: {
    flexDirection: 'row',
    width: 220,
    height: 24,
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
  },
  barSegment: {
    flex: 1,
    marginHorizontal: 3,
    borderRadius: 4,
  },
  barActive: {
    opacity: 1,
  },
  barInactive: {
    backgroundColor: '#334155',
    opacity: 0.4,
  },
  barsLabel: {
    fontSize: 13,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  pulseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.xs,
  },
  pulseText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  rubbleNoteBox: {
    backgroundColor: '#3B1812',
    borderColor: '#78350F',
    borderWidth: 1,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  rubbleNoteTitle: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  rubbleNoteBody: {
    color: '#FEF3C7',
    fontSize: 12,
    lineHeight: 17,
  },
  successBanner: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  successText: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionContainer: {
    paddingVertical: spacing.sm,
  },
  foundBtn: {
    backgroundColor: '#10B981',
    paddingVertical: spacing.md,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  foundBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
