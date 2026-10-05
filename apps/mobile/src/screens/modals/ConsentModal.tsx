import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import { colors, layout, spacing, typography } from '../../theme';
import { useTranslation } from '../../i18n/LanguageContext';
import { ConsentData } from '../../db/repositories/ConsentRepository';

interface ConsentModalProps {
  visible: boolean;
  onConsentGiven: (data: ConsentData) => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({ visible, onConsentGiven }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Consent preferences
  const [shareGpsLocation, setShareGpsLocation] = useState(true);
  const [shareTriageStatus, setShareTriageStatus] = useState(true);
  const [shareBatteryLevel, setShareBatteryLevel] = useState(true);
  const [enableOptionalChat] = useState(true);
  const [enableLiveLocationSharing] = useState(true);

  const handleFinish = () => {
    onConsentGiven({
      shareGpsLocation,
      shareTriageStatus,
      shareBatteryLevel,
      enableOptionalChat,
      enableLiveLocationSharing,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={() => {}}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('consent.title')}</Text>
          <View style={styles.headerRightRow}>
            <Text style={styles.stepIndicator}>Step {currentStep} of 2</Text>
            <TouchableOpacity style={styles.skipHeaderBtn} onPress={handleFinish}>
              <Text style={styles.skipHeaderBtnText}>Skip ➔</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {currentStep === 1 && (
            <View style={styles.stepCard}>
              <View style={styles.iconCircle}>
                <Text style={styles.stepIcon}>📍</Text>
              </View>
              <Text style={styles.stepTitle}>{t('consent.step1_title')}</Text>
              <Text style={styles.stepDescription}>{t('consent.step1_body')}</Text>

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.switchLabel}>Share Emergency GPS Fix</Text>
                  <Text style={styles.switchSubtext}>Latitude & longitude coordinates</Text>
                </View>
                <Switch
                  value={shareGpsLocation}
                  onValueChange={setShareGpsLocation}
                  trackColor={{ false: colors.border, true: colors.success }}
                  thumbColor={colors.textPrimary}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.switchLabel}>Share Triage Urgency</Text>
                  <Text style={styles.switchSubtext}>Red, Yellow, Green emergency status</Text>
                </View>
                <Switch
                  value={shareTriageStatus}
                  onValueChange={setShareTriageStatus}
                  trackColor={{ false: colors.border, true: colors.success }}
                  thumbColor={colors.textPrimary}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.switchLabel}>Share Battery Level</Text>
                  <Text style={styles.switchSubtext}>
                    Helps search teams prioritize dying nodes
                  </Text>
                </View>
                <Switch
                  value={shareBatteryLevel}
                  onValueChange={setShareBatteryLevel}
                  trackColor={{ false: colors.border, true: colors.success }}
                  thumbColor={colors.textPrimary}
                />
              </View>
            </View>
          )}

          {currentStep === 2 && (
            <View style={styles.stepCard}>
              <View style={styles.iconCircle}>
                <Text style={styles.stepIcon}>🛡️</Text>
              </View>
              <Text style={styles.stepTitle}>{t('consent.step2_title')}</Text>
              <Text style={styles.stepDescription}>{t('consent.step2_body')}</Text>

              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Zero-Knowledge Relaying</Text>
                <Text style={styles.infoText}>
                  Intermediate civilian phones only verify digital signatures and decrement TTL.
                  Private chat messages and sensitive payloads are encrypted end-to-end with
                  X25519/ChaCha20-Poly1305.
                </Text>
              </View>

              <Text style={styles.versionBadge}>{t('consent.version_label')}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {currentStep > 1 && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setCurrentStep(1)}
              accessibilityLabel="Previous consent step"
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {currentStep === 1 ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setCurrentStep(2)}
              accessibilityLabel="Continue to next consent step"
            >
              <Text style={styles.primaryButtonText}>Continue ➔</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, styles.agreeButton]}
              onPress={handleFinish}
              accessibilityLabel="Accept consent policy and proceed"
            >
              <Text style={styles.primaryButtonText}>{t('consent.accept_btn')}</Text>
            </TouchableOpacity>
          )}
        </View>
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
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSizes.title,
    fontWeight: typography.fontWeights.heavy,
    color: colors.textPrimary,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepIndicator: {
    fontSize: typography.fontSizes.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.bold,
  },
  skipHeaderBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: layout.borderRadiusSm,
  },
  skipHeaderBtnText: {
    fontSize: typography.fontSizes.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.bold,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.xl,
  },
  stepCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  stepIcon: {
    fontSize: 28,
  },
  stepTitle: {
    fontSize: typography.fontSizes.headline,
    fontWeight: typography.fontWeights.heavy,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  stepDescription: {
    fontSize: typography.fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  switchTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  switchLabel: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  switchSubtext: {
    fontSize: typography.fontSizes.small,
    color: colors.textMuted,
  },
  infoBox: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoTitle: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
    marginBottom: 4,
  },
  infoText: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  versionBadge: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: typography.fontSizes.body,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.bold,
  },
  primaryButton: {
    flex: 2,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.borderRadiusMd,
    backgroundColor: colors.info,
  },
  agreeButton: {
    backgroundColor: colors.success,
  },
  primaryButtonText: {
    fontSize: typography.fontSizes.body,
    color: '#ffffff',
    fontWeight: typography.fontWeights.heavy,
  },
});
