import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, layout, spacing, typography } from '../../theme';

interface WipeDataModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmWipe: () => void;
}

export const WipeDataModal: React.FC<WipeDataModalProps> = ({
  visible,
  onClose,
  onConfirmWipe,
}) => {
  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>⚠️</Text>
          </View>
          <Text style={styles.title}>Wipe All Local Data?</Text>
          <Text style={styles.body}>
            This action is permanent and cannot be undone. It will immediately:
          </Text>

          <View style={styles.list}>
            <Text style={styles.listItem}>
              • Delete your Ed25519 root identity and rotating pseudonyms
            </Text>
            <Text style={styles.listItem}>• Erase your 32-byte SMS secret</Text>
            <Text style={styles.listItem}>
              • Wipe all local mesh packets, neighbors, and cluster caches
            </Text>
            <Text style={styles.listItem}>• Delete all peer-to-peer chat conversations</Text>
            <Text style={styles.listItem}>• Reset your consent preferences</Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.wipeBtn} onPress={onConfirmWipe}>
              <Text style={styles.wipeBtnText}>Wipe Everything</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: typography.fontSizes.headline,
    fontWeight: typography.fontWeights.heavy,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  list: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceElevated,
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: 4,
  },
  listItem: {
    fontSize: typography.fontSizes.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignSelf: 'stretch',
  },
  cancelBtn: {
    flex: 1,
    height: layout.minTouchSize,
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
  },
  wipeBtn: {
    flex: 1,
    height: layout.minTouchSize,
    borderRadius: layout.borderRadiusMd,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wipeBtnText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.heavy,
  },
});
