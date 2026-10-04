import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { colors, layout, spacing } from '../../theme';
import { RescuerCredentialService } from '../../rescuer/RescuerCredentialService';
import { RescuerCredential } from '@rescuenet/core';

interface RescuerCredentialModalProps {
  visible: boolean;
  onClose: () => void;
  rescuerService?: RescuerCredentialService;
  onCredentialImported?: (credential: RescuerCredential) => void;
}

export const RescuerCredentialModal: React.FC<RescuerCredentialModalProps> = ({
  visible,
  onClose,
  rescuerService,
  onCredentialImported,
}) => {
  const [credentialToken, setCredentialToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeCred, setActiveCred] = useState<RescuerCredential | null>(null);

  useEffect(() => {
    if (visible && rescuerService) {
      setActiveCred(rescuerService.getActiveCredential());
      setError(null);
      setSuccess(null);
    }
  }, [visible, rescuerService]);

  const handleImport = async () => {
    if (!credentialToken.trim()) {
      setError('Please paste or scan a valid disaster authorization token (RESCUER-V1:...).');
      return;
    }

    if (!rescuerService) {
      setError('Rescuer service is unavailable.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await rescuerService.importCredential(credentialToken.trim());
    setLoading(false);

    if (result.success && result.credential) {
      setActiveCred(result.credential);
      setSuccess(`Verified! Rescuer mode unlocked for ${result.credential.rescuerName}.`);
      onCredentialImported?.(result.credential);
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setError(result.error || 'Failed to verify rescuer credential against Agency CA.');
    }
  };

  const handleRevoke = async () => {
    if (!rescuerService) return;
    await rescuerService.revokeActiveCredential('User requested revocation');
    setActiveCred(null);
    setSuccess('Credential cleared. Returned to standard mode.');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Rescuer Enrollment</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="rescuer-modal-close-btn">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {activeCred ? (
              <View style={styles.activeCredBox}>
                <Text style={styles.activeBadge}>✓ ENROLLED RESPONDER</Text>
                <Text style={styles.credName}>{activeCred.rescuerName}</Text>
                <Text style={styles.credDetail}>Badge #{activeCred.badgeNumber}</Text>
                <Text style={styles.credDetail}>Agency ID: {activeCred.agencyId}</Text>
                <Text style={styles.credDetail}>
                  Expires: {new Date(activeCred.expiresAt * 1000).toLocaleDateString()}
                </Text>
                <Text style={styles.credPermissions}>
                  Permissions: {activeCred.permissions.join(', ')}
                </Text>

                <TouchableOpacity style={styles.revokeBtn} onPress={handleRevoke} testID="revoke-cred-btn">
                  <Text style={styles.revokeBtnText}>Revoke Credential</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.description}>
                  Rescuer mode requires an Agency CA-signed cryptographic certificate.
                  Responders can claim clusters, adjust triage priorities, transmit verified ACKs,
                  and use BLE homing guidance.
                </Text>

                {/* Import Methods: QR Code & File */}
                <View style={styles.importMethodsRow}>
                  <TouchableOpacity
                    style={styles.methodBtn}
                    onPress={() => {
                      setError(null);
                      setSuccess('Camera active: Align rescuer QR code within viewfinder.');
                    }}
                    testID="scan-qr-btn"
                  >
                    <Text style={styles.methodBtnIcon}>📷</Text>
                    <Text style={styles.methodBtnText}>Scan QR Code</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.methodBtn}
                    onPress={() => {
                      setError(null);
                      setSuccess('Select .json or .cert file from local storage.');
                    }}
                    testID="import-file-btn"
                  >
                    <Text style={styles.methodBtnIcon}>📁</Text>
                    <Text style={styles.methodBtnText}>Import File</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>Credential Token / QR String</Text>
                <TextInput
                  style={styles.textInput}
                  value={credentialToken}
                  onChangeText={(t) => {
                    setCredentialToken(t);
                    setError(null);
                  }}
                  placeholder="RESCUER-V1:eyJpZCI6IC..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  testID="rescuer-token-input"
                />

                {error && <Text style={styles.errorText}>{error}</Text>}
                {success && <Text style={styles.successText}>{success}</Text>}

                <View style={styles.buttonRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.importBtn, loading && styles.btnDisabled]}
                    onPress={handleImport}
                    disabled={loading}
                    testID="rescuer-verify-btn"
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.importBtnText}>Verify & Unlock</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: layout.borderRadiusLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bodyScroll: {
    maxHeight: 450,
  },
  description: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: '#0F172A',
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    padding: spacing.sm,
    fontSize: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: spacing.xs,
  },
  successText: {
    color: '#10B981',
    fontSize: 12,
    marginTop: spacing.xs,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  importBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  activeCredBox: {
    backgroundColor: '#0F172A',
    borderRadius: layout.borderRadiusMd,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#059669',
  },
  activeBadge: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  credName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  credDetail: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  credPermissions: {
    fontSize: 11,
    color: '#64748B',
    marginTop: spacing.xs,
  },
  revokeBtn: {
    backgroundColor: '#7F1D1D',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    alignItems: 'center',
  },
  revokeBtnText: {
    color: '#FEE2E2',
    fontWeight: 'bold',
    fontSize: 12,
  },
  importMethodsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: '#475569',
  },
  methodBtnIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  methodBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
  },
});
