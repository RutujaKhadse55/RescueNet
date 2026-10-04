import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, layout, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/LanguageContext';
import { ReadinessEvaluation } from '../preparedness/readinessScore';
import { DrillModeManager } from '../preparedness/drillMode';

interface PreparednessScreenProps {
  isPrepared: boolean;
  onCompletePreparedness: () => void;
  evaluation?: ReadinessEvaluation;
  drillManager?: DrillModeManager;
  onOpenMapDownload?: () => void;
  onOpenPermissions?: () => void;
}

export const PreparednessScreen: React.FC<PreparednessScreenProps> = ({
  isPrepared,
  onCompletePreparedness,
  evaluation,
  drillManager,
  onOpenMapDownload,
  onOpenPermissions,
}) => {
  const { t } = useTranslation();

  // Setup workflow steps: 'intro' | 'map_download' | 'running' | 'completed' | 'dashboard'
  const [setupStep, setSetupStep] = useState<
    'intro' | 'map_download' | 'running' | 'completed' | 'dashboard'
  >(isPrepared ? 'dashboard' : 'intro');

  const [mapDownloadProgress, setMapDownloadProgress] = useState(0);
  const [isDownloadingMap, setIsDownloadingMap] = useState(false);
  const [mapDownloaded, setMapDownloaded] = useState(false);

  const [progress, setProgress] = useState(0);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

  const preparationTasks = [
    'Checking Bluetooth radio & permissions',
    'Acquiring High-Accuracy GPS fix',
    'Initializing encrypted offline flash storage',
    'Activating BLE mesh store-and-forward',
    'Synchronizing disaster control numbers',
    'Readying 1-Tap SOS broadcast engine',
  ];

  useEffect(() => {
    if (isPrepared) {
      setSetupStep('dashboard');
    }
  }, [isPrepared]);

  const handleStartMapDownload = () => {
    setIsDownloadingMap(true);
    setMapDownloadProgress(0);

    let curr = 0;
    const interval = setInterval(() => {
      curr += 20;
      if (curr >= 100) {
        curr = 100;
        setMapDownloadProgress(100);
        setIsDownloadingMap(false);
        setMapDownloaded(true);
        clearInterval(interval);
      } else {
        setMapDownloadProgress(curr);
      }
    }, 300);
  };

  const startAutomatedPrep = () => {
    setSetupStep('running');
    setProgress(0);
    setCurrentTaskIndex(0);

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 20;
      if (currentProgress >= 100) {
        currentProgress = 100;
        setProgress(100);
        setCurrentTaskIndex(preparationTasks.length - 1);
        clearInterval(interval);
        setTimeout(() => {
          setSetupStep('completed');
        }, 500);
      } else {
        setProgress(currentProgress);
        const idx = Math.min(
          Math.floor((currentProgress / 100) * preparationTasks.length),
          preparationTasks.length - 1
        );
        setCurrentTaskIndex(idx);
      }
    }, 350);
  };

  const handleFinishSetup = () => {
    setSetupStep('dashboard');
    onCompletePreparedness();
  };

  // 1. STEP 1: INTRO
  if (setupStep === 'intro') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBox}>
          <Text style={styles.brandTitle}>RESCUENET</Text>
          <Text style={styles.heroSubTitle}>Disaster Preparedness Mode</Text>
        </View>

        <Text style={styles.introDesc}>
          Configure offline emergency protocols now so you can broadcast SOS, locate nearby survivors, and navigate maps even during complete network outages.
        </Text>

        <View style={styles.featureListCard}>
          <View style={styles.featureRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.featureText}>Offline Vector Disaster Map</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.featureText}>Bluetooth Low Energy Mesh</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.featureText}>GPS Location & Survivor Clusters</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.featureText}>Offline Peer-to-Peer Chat</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.featureText}>1-Tap SOS Emergency Relay</Text>
          </View>
        </View>

        {/* Buttons positioned safely with ample bottom clearance */}
        <TouchableOpacity
          style={styles.primaryActionButton}
          onPress={() => setSetupStep('map_download')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryActionButtonText}>START PREPAREDNESS SETUP</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleFinishSetup}
          activeOpacity={0.8}
        >
          <Text style={styles.skipButtonText}>⚡ Skip & Enter App Directly</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // 2. STEP 2: EXPLICIT OFFLINE MAP DOWNLOAD PROMPT (User Requested)
  if (setupStep === 'map_download') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP 1 OF 2</Text>
          </View>
          <Text style={styles.screenMainTitle}>Download Offline Disaster Map</Text>
          <Text style={styles.screenMainSub}>
            Cellular data and Wi-Fi will fail during floods. Download the regional vector map now to navigate completely offline.
          </Text>
        </View>

        <View style={styles.mapPackCard}>
          <View style={styles.mapPackTop}>
            <Text style={styles.mapPackIcon}>🗺️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.mapPackTitle}>Pune District & Western Ghats</Text>
              <Text style={styles.mapPackSize}>14.2 MB • MBTiles Vector Pack</Text>
              <Text style={styles.mapPackDetails}>
                Includes Mutha River, arterial roads, relief shelters, and hospital triage centers.
              </Text>
            </View>
          </View>

          {isDownloadingMap && (
            <View style={styles.downloadProgressBox}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${mapDownloadProgress}%` }]} />
              </View>
              <Text style={styles.downloadProgressText}>
                Downloading vector tiles... {mapDownloadProgress}%
              </Text>
            </View>
          )}

          {mapDownloaded && (
            <View style={styles.downloadSuccessBox}>
              <Text style={styles.downloadSuccessIcon}>✓</Text>
              <Text style={styles.downloadSuccessText}>
                Offline Map Pack Downloaded & Cached in Flash Memory
              </Text>
            </View>
          )}

          {!mapDownloaded && !isDownloadingMap && (
            <TouchableOpacity
              style={styles.downloadMapBtn}
              onPress={handleStartMapDownload}
              activeOpacity={0.8}
            >
              <Text style={styles.downloadMapBtnText}>⬇️ DOWNLOAD OFFLINE MAP (14.2 MB)</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryActionButton, !mapDownloaded && styles.btnDisabled]}
          onPress={startAutomatedPrep}
          disabled={!mapDownloaded && !isDownloadingMap}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryActionButtonText}>
            {mapDownloaded ? 'CONTINUE TO RADIOS & SENSORS ➔' : 'DOWNLOAD MAP TO CONTINUE'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => {
            setMapDownloaded(true);
            startAutomatedPrep();
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.skipButtonText}>Use Default Cached Region & Continue</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // 3. STEP 3: AUTOMATED RADIOS & MESH CONFIGURATION
  if (setupStep === 'running') {
    return (
      <View style={[styles.container, styles.scrollContent]}>
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP 2 OF 2</Text>
          </View>
          <Text style={styles.screenMainTitle}>Configuring Emergency Radios</Text>
        </View>

        <View style={styles.taskListCard}>
          {preparationTasks.map((task, idx) => {
            const isDone = idx < currentTaskIndex || progress === 100;
            const isCurrent = idx === currentTaskIndex && progress < 100;
            return (
              <View key={task} style={styles.taskRow}>
                <Text style={[styles.taskCheck, isDone && styles.taskCheckDone]}>
                  {isDone ? '✓' : isCurrent ? '⏳' : '○'}
                </Text>
                <Text
                  style={[
                    styles.taskText,
                    isDone && styles.taskTextDone,
                    isCurrent && styles.taskTextCurrent,
                  ]}
                >
                  {task}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{progress}% Configured</Text>
        </View>

        <View style={styles.runningBadge}>
          <ActivityIndicator size="small" color={colors.info} style={{ marginRight: 8 }} />
          <Text style={styles.runningText}>Enabling BLE Mesh and GPS hardware...</Text>
        </View>
      </View>
    );
  }

  // 4. STEP 4: PREPAREDNESS COMPLETED
  if (setupStep === 'completed') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.successBadge}>
          <Text style={styles.successIcon}>✓</Text>
        </View>

        <Text style={styles.completedTitle}>YOU ARE DISASTER READY</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Offline Disaster Map</Text>
            <Text style={styles.summaryReady}>✓ 14.2 MB Cached</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Bluetooth Low Energy Mesh</Text>
            <Text style={styles.summaryReady}>✓ 4-Hop Relay Active</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>GPS Coordinate Sharing</Text>
            <Text style={styles.summaryReady}>✓ High Accuracy</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>1-Tap SOS Emergency Engine</Text>
            <Text style={styles.summaryReady}>✓ Armed & Ready</Text>
          </View>
        </View>

        <Text style={styles.completedSubtext}>
          Your device can now communicate with nearby survivors and rescue teams without cell service or internet.
        </Text>

        <TouchableOpacity
          style={styles.primaryActionButton}
          onPress={handleFinishSetup}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryActionButtonText}>ENTER EMERGENCY APP</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // 5. PREPAREDNESS DASHBOARD
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.dashboardContent}>
      <View style={styles.statusHeaderCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusCheck}>✓</Text>
          <View>
            <Text style={styles.statusTitle}>You're Prepared</Text>
            <Text style={styles.statusSub}>Offline emergency protocols active</Text>
          </View>
        </View>
      </View>

      <View style={styles.mapReadyCard}>
        <Text style={styles.mapReadyTitle}>🗺️ Offline Map Status: Ready</Text>
        <Text style={styles.mapReadySub}>
          Pune District & Ghats Vector Pack (14.2 MB Cached Locally)
        </Text>
      </View>

      <TouchableOpacity
        style={styles.rerunButton}
        onPress={() => setSetupStep('map_download')}
        activeOpacity={0.8}
      >
        <Text style={styles.rerunButtonText}>Re-Run Preparation & Map Setup</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: 80,
    alignItems: 'center',
  },
  dashboardContent: {
    padding: spacing.lg,
    paddingBottom: 80,
    gap: spacing.md,
  },
  headerBox: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
  },
  heroSubTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38bdf8',
    marginTop: 4,
  },
  introDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  featureListCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 16,
    fontWeight: '900',
    color: '#10b981',
    marginRight: 10,
  },
  featureText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
  },
  primaryActionButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  btnDisabled: {
    backgroundColor: '#334155',
  },
  primaryActionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  skipButton: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    width: '100%',
  },
  stepBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#38bdf8',
  },
  screenMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  screenMainSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  mapPackCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  mapPackTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  mapPackIcon: {
    fontSize: 32,
  },
  mapPackTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
  },
  mapPackSize: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '700',
    marginTop: 2,
  },
  mapPackDetails: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 16,
  },
  downloadMapBtn: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  downloadMapBtnText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
  },
  downloadProgressBox: {
    marginTop: spacing.md,
  },
  downloadProgressText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  downloadSuccessBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 8,
    padding: 10,
    marginTop: spacing.md,
    gap: 8,
  },
  downloadSuccessIcon: {
    color: '#34d399',
    fontWeight: '900',
    fontSize: 16,
  },
  downloadSuccessText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  taskListCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskCheck: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 10,
    width: 18,
    textAlign: 'center',
  },
  taskCheckDone: {
    color: '#10b981',
    fontWeight: '900',
  },
  taskText: {
    fontSize: 12,
    color: '#64748b',
  },
  taskTextDone: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  taskTextCurrent: {
    color: '#38bdf8',
    fontWeight: '800',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  progressBarBg: {
    width: '100%',
    height: 10,
    backgroundColor: '#1e293b',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 5,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
    marginTop: 6,
  },
  runningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  runningText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 2,
    borderColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  successIcon: {
    fontSize: 32,
    color: '#10b981',
    fontWeight: '900',
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#10b981',
    letterSpacing: 1,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  summaryReady: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34d399',
  },
  completedSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.lg,
  },
  statusHeaderCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 12,
    padding: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusCheck: {
    fontSize: 20,
    color: '#10b981',
    fontWeight: '900',
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
  },
  statusSub: {
    fontSize: 11,
    color: '#94a3b8',
  },
  mapReadyCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: spacing.md,
  },
  mapReadyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f8fafc',
  },
  mapReadySub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  rerunButton: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  rerunButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
});
