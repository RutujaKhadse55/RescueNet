import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors, layout, spacing, typography } from '../../theme';
import { OEM_GUIDES } from '../../permissions/oemGuides';

interface OemGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

export const OemGuideModal: React.FC<OemGuideModalProps> = ({ visible, onClose }) => {
  const [selectedBrand, setSelectedBrand] = useState<string>('xiaomi');
  const guide = OEM_GUIDES[selectedBrand] ?? OEM_GUIDES.xiaomi ?? {
    brand: 'xiaomi',
    displayName: 'Xiaomi',
    uiSystem: 'MIUI',
    steps: [],
    warningNote: '',
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>OEM Battery Guide</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Brand Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.brandBar}
          contentContainerStyle={styles.brandBarContent}
        >
          {Object.keys(OEM_GUIDES).map((brandKey) => {
            const item = OEM_GUIDES[brandKey];
            if (!item) return null;
            const isSelected = selectedBrand === brandKey;
            return (
              <TouchableOpacity
                key={brandKey}
                style={[styles.brandChip, isSelected && styles.brandChipSelected]}
                onPress={() => setSelectedBrand(brandKey)}
              >
                <Text style={[styles.brandText, isSelected && styles.brandTextSelected]}>
                  {item.displayName.split('/')[0]?.trim()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <View style={styles.card}>
            <Text style={styles.guideTitle}>{guide.displayName}</Text>
            <Text style={styles.uiSystemText}>Target System: {guide.uiSystem}</Text>

            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>⚠️ Manufacturer Task Killer Notice</Text>
              <Text style={styles.warningText}>{guide.warningNote}</Text>
            </View>

            <Text style={styles.stepsHeader}>Required Steps to Prevent Silent Drops:</Text>
            <View style={styles.stepsList}>
              {guide.steps.map((step, idx) => (
                <View key={idx} style={styles.stepRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepNum}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.stepContent}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
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
  brandBar: {
    maxHeight: 56,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandBarContent: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandChip: {
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandChipSelected: {
    backgroundColor: colors.info,
    borderColor: colors.info,
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.small,
    fontWeight: typography.fontWeights.semibold,
  },
  brandTextSelected: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
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
  guideTitle: {
    fontSize: typography.fontSizes.headline,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  uiSystemText: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    marginBottom: spacing.lg,
  },
  warningTitle: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.warning,
    marginBottom: 4,
  },
  warningText: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  stepsHeader: {
    fontSize: typography.fontSizes.body,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  stepsList: {
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNum: {
    color: colors.info,
    fontSize: typography.fontSizes.caption,
    fontWeight: typography.fontWeights.bold,
  },
  stepContent: {
    flex: 1,
    fontSize: typography.fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  doneButton: {
    height: layout.minTouchSize,
    backgroundColor: colors.surfaceElevated,
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.body,
  },
});
