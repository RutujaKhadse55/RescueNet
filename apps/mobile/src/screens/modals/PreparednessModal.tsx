import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { colors, layout, spacing, typography } from '../../theme';
import { useTranslation } from '../../i18n/LanguageContext';
import { ReadinessEvaluation } from '../../preparedness/readinessScore';
import { BleRangeTester, RangeTestResult } from '../../preparedness/rangeTest';
import { DrillModeManager } from '../../preparedness/drillMode';
import { MonsoonReminderService } from '../../preparedness/monsoonAlert';

interface PreparednessModalProps {
  visible: boolean;
  evaluation: ReadinessEvaluation;
  drillManager: DrillModeManager;
  onClose: () => void;
  onOpenMapDownload: () => void;
  onOpenPermissions: () => void;
}

export const PreparednessModal: React.FC<PreparednessModalProps> = ({
  visible,
  evaluation,
  drillManager,
  onClose,
  onOpenMapDownload,
  onOpenPermissions,
}) => {
  const { t } = useTranslation();
  const [drillActive, setDrillActive] = useState(drillManager.isDrillActive());
  const [rangeTestState, setRangeTestState] = useState<RangeTestResult | null>(null);
  const [testingRange, setTestingRange] = useState(false);

  const monsoonAlert = MonsoonReminderService.checkMonsoonSeason();

  const handleToggleDrill = (val: boolean) => {
    setDrillActive(val);
    drillManager.setDrillActive(val);
  };

  const handleStartRangeTest = async () => {
    setTestingRange(true);
    const result = await BleRangeTester.runTest(-74, 5);
    setRangeTestState(result);
    setTestingRange(false);
  };

  const tierColor =
    evaluation.tier === 'Disaster Ready'
      ? colors.success
      : evaluation.tier === 'High'
        ? colors.info
        : evaluation.tier === 'Moderate'
          ? colors.warning
          : colors.error;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('prep.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {/* Readiness Score Card */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreCircleWrapper}>
              <View style={[styles.scoreCircle, { borderColor: tierColor }]}>
                <Text style={styles.scoreNumber}>{evaluation.score}</Text>
                <Text style={styles.scoreMax}>/ 100</Text>
              </View>
            </View>
            <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
              <Text style={styles.tierText}>{evaluation.tier.toUpperCase()}</Text>
            </View>
            <Text style={styles.scoreSubtext}>
              {evaluation.missingCount === 0
                ? 'Your device is fully hardened for offline disaster survival.'
                : `${evaluation.missingCount} recommended steps to complete full disaster preparedness.`}
            </Text>
          </View>

          {/* Monsoon Season Warning Banner */}
          <View style={styles.monsoonCard}>
            <Text style={styles.monsoonTitle}>🌧️ {monsoonAlert.alertTitle}</Text>
            <Text style={styles.monsoonBody}>{monsoonAlert.alertMessage}</Text>
          </View>

          {/* Drill Mode Toggle */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.cardTitle}>{t('prep.drill_mode')}</Text>
                <Text style={styles.cardDesc}>{t('prep.drill_mode_desc')}</Text>
              </View>
              <Switch
                value={drillActive}
                onValueChange={handleToggleDrill}
                trackColor={{ false: colors.border, true: colors.warning }}
                thumbColor={colors.textPrimary}
              />
            </View>
          </View>

          {/* BLE Range Test */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('prep.range_test')}</Text>
            <Text style={styles.cardDesc}>{t('prep.range_test_desc')}</Text>

            {rangeTestState && (
              <View style={styles.testResultBox}>
                <Text style={styles.testResultHeader}>Range Test Completed</Text>
                <Text style={styles.testMetric}>Success Rate: {rangeTestState.successRate}%</Text>
                <Text style={styles.testMetric}>Signal RSSI: {rangeTestState.averageRssi} dBm</Text>
                <Text style={styles.testMetric}>
                  Est. Line-of-Sight Distance: ~{rangeTestState.estimatedDistanceMeters} meters
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.actionButton, testingRange && styles.buttonDisabled]}
              onPress={handleStartRangeTest}
              disabled={testingRange}
            >
              <Text style={styles.actionButtonText}>
                {testingRange ? 'Pinging Partner Phone...' : t('prep.start_range_test')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Checklist Items */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Preparedness Checklist</Text>
            <View style={styles.checklist}>
              {evaluation.items.map(item => (
                <View key={item.id} style={styles.checklistItem}>
                  <Text style={styles.checkIcon}>{item.achieved ? '✅' : '❌'}</Text>
                  <View style={styles.checkTextCol}>
                    <Text style={[styles.checkName, item.achieved && styles.checkNameDone]}>
                      {item.name} (+{item.points} pts)
                    </Text>
                    <Text style={styles.checkDesc}>{item.description}</Text>
                  </View>
                  {!item.achieved && item.id === 'map_pack_downloaded' && (
                    <TouchableOpacity style={styles.miniBtn} onPress={onOpenMapDownload}>
                      <Text style={styles.miniBtnText}>Download</Text>
                    </TouchableOpacity>
                  )}
                  {!item.achieved && item.id === 'permissions' && (
                    <TouchableOpacity style={styles.miniBtn} onPress={onOpenPermissions}>
                      <Text style={styles.miniBtnText}>Fix</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
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
  headerTitle: {
    fontSize: typography.fontSizes.title,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  closeButton: {
    width: layout.minTouchSize,
    height: layout.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.headline,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreCircleWrapper: {
    marginBottom: spacing.md,
  },
  scoreCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  scoreNumber: {
    fontSize: typography.fontSizes.display,
    fontWeight: typography.fontWeights.heavy,
    color: colors.textPrimary,
  },
  scoreMax: {
    fontSize: typography.fontSizes.caption,
    color: colors.textMuted,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: layout.borderRadiusFull,
    marginBottom: spacing.sm,
  },
  tierText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.heavy,
    fontSize: typography.fontSizes.caption,
    letterSpacing: 1,
  },
  scoreSubtext: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  monsoonCard: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: layout.borderRadiusMd,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
  },
  monsoonTitle: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
    marginBottom: 4,
  },
  monsoonBody: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: typography.fontSizes.subtitle,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  actionButton: {
    height: layout.minTouchSize,
    backgroundColor: colors.info,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.body,
  },
  testResultBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  testResultHeader: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
    marginBottom: 4,
  },
  testMetric: {
    fontSize: typography.fontSizes.caption,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  checklist: {
    marginTop: spacing.xs,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkIcon: {
    fontSize: 16,
    marginRight: spacing.md,
  },
  checkTextCol: {
    flex: 1,
  },
  checkName: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
  checkNameDone: {
    color: colors.textSecondary,
  },
  checkDesc: {
    fontSize: typography.fontSizes.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  miniBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: layout.borderRadiusSm,
    borderWidth: 1,
    borderColor: colors.info,
  },
  miniBtnText: {
    color: colors.info,
    fontSize: typography.fontSizes.caption,
    fontWeight: typography.fontWeights.bold,
  },
});
