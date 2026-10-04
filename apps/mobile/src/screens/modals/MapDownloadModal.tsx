import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, layout, spacing, typography } from '../../theme';
import { MapPackManager, INDIAN_DISASTER_MAP_REGIONS } from '../../maps/mapPackManager';

interface MapDownloadModalProps {
  visible: boolean;
  mapManager: MapPackManager;
  onClose: () => void;
  onMapDownloaded?: () => void;
}

export const MapDownloadModal: React.FC<MapDownloadModalProps> = ({
  visible,
  mapManager,
  onClose,
  onMapDownloaded,
}) => {
  const [, setRefreshCount] = useState(0);
  const [downloadingRegionId, setDownloadingRegionId] = useState<string | null>(null);

  const handleStartDownload = async (regionId: string) => {
    setDownloadingRegionId(regionId);
    await mapManager.startDownload(regionId, () => {
      setRefreshCount(k => k + 1);
    });
    setDownloadingRegionId(null);
    setRefreshCount(k => k + 1);
    if (onMapDownloaded) {
      onMapDownloaded();
    }
  };

  const handlePause = (regionId: string) => {
    mapManager.pauseDownload(regionId);
    setDownloadingRegionId(null);
    setRefreshCount(k => k + 1);
  };

  const handleDelete = (regionId: string) => {
    mapManager.deleteMapPack(regionId);
    setRefreshCount(k => k + 1);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Offline Vector Maps</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={styles.introText}>
            Select your disaster zone to download high-resolution MapLibre vector tiles (.pmtiles)
            for 100% offline navigation during communication blackouts.
          </Text>

          <View style={styles.regionList}>
            {INDIAN_DISASTER_MAP_REGIONS.map(region => {
              const state = mapManager.getStatus(region.id);
              const storage = mapManager.checkStorage(region.id);
              const sizeMb = (region.sizeBytes / 1_000_000).toFixed(1);

              return (
                <View key={region.id} style={styles.regionCard}>
                  <View style={styles.regionHeader}>
                    <Text style={styles.regionName}>{region.name}</Text>
                    <View style={styles.sizeBadge}>
                      <Text style={styles.sizeBadgeText}>~{sizeMb} MB</Text>
                    </View>
                  </View>

                  <Text style={styles.regionDesc}>{region.description}</Text>

                  {/* Progress Bar */}
                  {state.status !== 'idle' && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${state.progressPercent}%` },
                            state.status === 'downloaded' && styles.progressComplete,
                          ]}
                        />
                      </View>
                      <View style={styles.progressLabelRow}>
                        <Text style={styles.progressText}>
                          {state.status === 'downloaded'
                            ? 'Ready for offline use (PMTiles)'
                            : state.status === 'paused'
                              ? `Paused (${state.progressPercent}%)`
                              : state.status === 'error'
                                ? `Error: ${state.error}`
                                : `Downloading: ${state.progressPercent}%`}
                        </Text>
                        <Text style={styles.progressMb}>
                          {(state.downloadedBytes / 1_000_000).toFixed(1)} / {sizeMb} MB
                        </Text>
                      </View>
                    </View>
                  )}

                  {!storage.sufficient && (
                    <Text style={styles.storageWarning}>
                      ⚠️ Insufficient storage: {Math.round(storage.availableBytes / 1_000_000)} MB
                      available, {Math.round(storage.requiredBytes / 1_000_000)} MB required.
                    </Text>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.buttonRow}>
                    {state.status === 'downloaded' ? (
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(region.id)}
                      >
                        <Text style={styles.deleteBtnText}>Delete Map Pack</Text>
                      </TouchableOpacity>
                    ) : state.status === 'downloading' ? (
                      <TouchableOpacity
                        style={styles.pauseBtn}
                        onPress={() => handlePause(region.id)}
                      >
                        <Text style={styles.pauseBtnText}>Pause</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.downloadBtn, !storage.sufficient && styles.btnDisabled]}
                        disabled={!storage.sufficient || downloadingRegionId !== null}
                        onPress={() => handleStartDownload(region.id)}
                      >
                        <Text style={styles.downloadBtnText}>
                          {state.status === 'paused' ? 'Resume Download' : 'Download Pack'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
            <Text style={styles.closeFooterBtnText}>Close</Text>
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
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.xl,
  },
  introText: {
    fontSize: typography.fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  regionList: {
    gap: spacing.lg,
  },
  regionCard: {
    backgroundColor: colors.surface,
    borderRadius: layout.borderRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  regionName: {
    fontSize: typography.fontSizes.subtitle,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  sizeBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: layout.borderRadiusSm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sizeBadgeText: {
    fontSize: typography.fontSizes.caption,
    color: colors.info,
    fontWeight: typography.fontWeights.semibold,
  },
  regionDesc: {
    fontSize: typography.fontSizes.small,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.info,
  },
  progressComplete: {
    backgroundColor: colors.success,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: typography.fontSizes.caption,
    color: colors.textSecondary,
  },
  progressMb: {
    fontSize: typography.fontSizes.caption,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  storageWarning: {
    fontSize: typography.fontSizes.caption,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  downloadBtn: {
    height: layout.minTouchSize,
    backgroundColor: colors.info,
    paddingHorizontal: spacing.xl,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  downloadBtnText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.body,
  },
  pauseBtn: {
    height: layout.minTouchSize,
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xl,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtnText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.body,
  },
  deleteBtn: {
    height: layout.minTouchSize,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: colors.error,
    paddingHorizontal: spacing.lg,
    borderRadius: layout.borderRadiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: colors.error,
    fontWeight: typography.fontWeights.semibold,
    fontSize: typography.fontSizes.small,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  closeFooterBtn: {
    height: layout.minTouchSize,
    backgroundColor: colors.surfaceElevated,
    borderRadius: layout.borderRadiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.semibold,
    fontSize: typography.fontSizes.body,
  },
});
