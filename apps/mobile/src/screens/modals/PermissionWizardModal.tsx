import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, layout, spacing, typography } from '../../theme';
import { useTranslation } from '../../i18n/LanguageContext';
import { PermissionService } from '../../permissions/permissionService';
import { PermissionCategory } from '../../permissions/types';

interface PermissionWizardModalProps {
  visible: boolean;
  permissionService: PermissionService;
  onClose: () => void;
  onOpenOemGuide: () => void;
}

const CATEGORIES: Array<{
  key: PermissionCategory;
  titleKey: string;
  descKey: string;
  icon: string;
}> = [
  { key: 'bluetooth', titleKey: 'perm.ble_title', descKey: 'perm.ble_desc', icon: '📡' },
  { key: 'location', titleKey: 'perm.location_title', descKey: 'perm.location_desc', icon: '📍' },
  { key: 'alerts', titleKey: 'perm.notif_title', descKey: 'perm.notif_desc', icon: '🔔' },
  { key: 'sms', titleKey: 'perm.sms_title', descKey: 'perm.sms_desc', icon: '✉️' },
  { key: 'battery', titleKey: 'perm.battery_title', descKey: 'perm.battery_desc', icon: '🔋' },
];

export const PermissionWizardModal: React.FC<PermissionWizardModalProps> = ({
  visible,
  permissionService,
  onClose,
  onOpenOemGuide,
}) => {
  const { t } = useTranslation();
  const [activeCategoryIdx, setActiveCategoryIdx] = useState(0);
  const [, setRefreshCount] = useState(0);

  const activeCategory = CATEGORIES[activeCategoryIdx] || CATEGORIES[0]!;
  const permissions = permissionService.getPermissionsByCategory(activeCategory.key);

  const handleGrant = async () => {
    await permissionService.requestCategory(activeCategory.key);
    setRefreshCount(k => k + 1);

    if (activeCategoryIdx < CATEGORIES.length - 1) {
      setActiveCategoryIdx(idx => idx + 1);
    } else {
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('perm.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Category progress indicator */}
        <View style={styles.categoryTabs}>
          {CATEGORIES.map((cat, idx) => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryTab, idx === activeCategoryIdx && styles.categoryTabActive]}
              onPress={() => setActiveCategoryIdx(idx)}
            >
              <Text style={styles.catIcon}>{cat.icon}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <View style={styles.card}>
            <View style={styles.heroCircle}>
              <Text style={styles.heroIcon}>{activeCategory.icon}</Text>
            </View>
            <Text style={styles.catTitle}>{t(activeCategory.titleKey)}</Text>
            <Text style={styles.catDesc}>{t(activeCategory.descKey)}</Text>

            <View style={styles.permList}>
              {permissions.map(p => {
                const status = permissionService.getStatus(p.key);
                return (
                  <View key={p.key} style={styles.permItem}>
                    <View style={styles.permTextCol}>
                      <Text style={styles.permName}>{p.name}</Text>
                      <Text style={styles.permRationale}>{p.rationale}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        status === 'granted'
                          ? styles.statusGranted
                          : status === 'blocked'
                            ? styles.statusBlocked
                            : styles.statusPending,
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {status === 'granted' ? '✓ OK' : status === 'blocked' ? 'BLOCKED' : 'NEED'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {activeCategory.key === 'battery' && (
              <TouchableOpacity
                style={styles.oemGuideBanner}
                onPress={onOpenOemGuide}
                activeOpacity={0.8}
              >
                <Text style={styles.oemGuideTitle}>📱 Xiaomi / Samsung / Oppo / Vivo Guide</Text>
                <Text style={styles.oemGuideSub}>
                  Tap here to learn how to lock RescueNet in memory and enable autostart on your
                  brand.
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => permissionService.openSettings()}
            accessibilityLabel="Open Android system settings"
          >
            <Text style={styles.settingsButtonText}>{t('perm.open_settings')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.grantButton}
            onPress={handleGrant}
            accessibilityLabel="Grant category permissions"
          >
            <Text style={styles.grantButtonText}>{t('perm.grant_btn')}</Text>
          </TouchableOpacity>
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
  categoryTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryTab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  categoryTabActive: {
    backgroundColor: colors.info,
  },
  catIcon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroIcon: {
    fontSize: 32,
  },
  catTitle: {
    fontSize: typography.fontSizes.headline,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  catDesc: {
    fontSize: typography.fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  permList: {
    marginTop: spacing.md,
  },
  permItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  permTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  permName: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
  permRationale: {
    fontSize: typography.fontSizes.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: layout.borderRadiusSm,
  },
  statusGranted: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusBlocked: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.heavy,
    color: colors.textPrimary,
  },
  oemGuideBanner: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: colors.info,
  },
  oemGuideTitle: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.info,
  },
  oemGuideSub: {
    fontSize: typography.fontSizes.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: spacing.md,
  },
  settingsButton: {
    flex: 1,
    height: layout.minTouchSize,
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonText: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
    fontSize: typography.fontSizes.small,
  },
  grantButton: {
    flex: 2,
    height: layout.minTouchSize,
    borderRadius: layout.borderRadiusMd,
    backgroundColor: colors.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grantButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.body,
  },
});
