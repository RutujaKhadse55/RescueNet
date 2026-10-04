import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
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
  const [enableOptionalChat, setEnableOptionalChat] = useState(false);
  const [enableLiveLocationSharing, setEnableLiveLocationSharing] = useState(false);
  const [optInName, setOptInName] = useState('');
  const [optInPhone, setOptInPhone] = useState('');

  const handleFinish = () => {
    onConsentGiven({
      shareGpsLocation,
      shareTriageStatus,
      shareBatteryLevel,
      enableOptionalChat,
      enableLiveLocationSharing,
      optInName: optInName.trim() || undefined,
      optInPhone: optInPhone.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={() => {}}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('consent.title')}</Text>
          <View style={styles.headerRightRow}>
            <Text style={styles.stepIndicator}>Step {currentStep} of 4</Text>
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
                  <Text style={styles.switchSubtext}>Red, Yellow, Green status</Text>
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
                  <Text style={styles.switchSubtext}>Helps search teams prioritize dying nodes</Text>
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
            </View>
          )}

          {currentStep === 3 && (
            <View style={styles.stepCard}>
              <View style={styles.iconCircle}>
                <Text style={styles.stepIcon}>💬</Text>
              </View>
              <Text style={styles.stepTitle}>{t('consent.step3_title')}</Text>
              <Text style={styles.stepDescription}>{t('consent.step3_body')}</Text>

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.switchLabel}>Enable Peer-to-Peer Chat</Text>
                  <Text style={styles.switchSubtext}>Optional messaging with nearby survivors</Text>
                </View>
                <Switch
                  value={enableOptionalChat}
                  onValueChange={setEnableOptionalChat}
                  trackColor={{ false: colors.border, true: colors.info }}
                  thumbColor={colors.textPrimary}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.switchLabel}>Enable Continuous Live Location</Text>
                  <Text style={styles.switchSubtext}>Transmits location beacons periodically</Text>
                </View>
                <Switch
                  value={enableLiveLocationSharing}
                  onValueChange={setEnableLiveLocationSharing}
                  trackColor={{ false: colors.border, true: colors.info }}
                  thumbColor={colors.textPrimary}
                />
              </View>
            </View>
          )}

          {currentStep === 4 && (
            <View style={styles.stepCard}>
              <View style={styles.iconCircle}>
                <Text style={styles.stepIcon}>👤</Text>
              </View>
              <Text style={styles.stepTitle}>Opt-In Identity & Deletion</Text>
              <Text style={styles.stepDescription}>{t('consent.step4_body')}</Text>

              <Text style={styles.inputLabel}>{t('consent.opt_in_name')}</Text>
              <TextInput
                style={styles.textInput}
                value={optInName}
                onChangeText={setOptInName}
                placeholder="e.g. Ramesh Patil"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Optional Full Name input"
              />

              <Text style={styles.inputLabel}>{t('consent.opt_in_phone')}</Text>
              <TextInput
                style={styles.textInput}
                value={optInPhone}
                onChangeText={setOptInPhone}
                placeholder="+91 98765 43210"
                keyboardType="phone-pad"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Optional Phone Number input"
              />

              <Text style={styles.versionBadge}>{t('consent.version_label')}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {currentStep > 1 && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setCurrentStep((s) => s - 1)}
              accessibilityLabel="Previous consent step"
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {currentStep < 4 ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setCurrentStep((s) => s + 1)}
              accessibilityLabel="Continue to next consent step"
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
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
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  stepIndicator: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skipHeaderBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  skipHeaderBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.xl,
  },
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  stepIcon: {
    fontSize: 28,
  },
  stepTitle: {
    fontSize: typography.fontSizes.headline,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  stepDescription: {
    fontSize: typography.fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  switchTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  switchLabel: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
  switchSubtext: {
    fontSize: typography.fontSizes.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  infoBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
    marginTop: spacing.md,
  },
  infoTitle: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: typography.fontSizes.small,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  textInput: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.borderRadiusMd,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.fontSizes.body,
    minHeight: layout.minTouchSize,
  },
  versionBadge: {
    fontSize: typography.fontSizes.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  secondaryButton: {
    flex: 1,
    height: layout.minTouchSize,
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.semibold,
    fontSize: typography.fontSizes.body,
  },
  primaryButton: {
    flex: 2,
    height: layout.minTouchSize,
    borderRadius: layout.borderRadiusMd,
    backgroundColor: colors.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeButton: {
    backgroundColor: colors.success,
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.body,
  },
});
