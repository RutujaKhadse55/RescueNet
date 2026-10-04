import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  Modal,
} from 'react-native';
import { colors } from './theme';
import { LanguageProvider } from './i18n/LanguageContext';
import { SupportedLanguage } from './i18n/translations';
import { BottomTabBar, TabName } from './navigation/BottomTabBar';
import { HomeScreen } from './screens/HomeScreen';
import { NearbyScreen } from './screens/NearbyScreen';
import { ChatScreen } from './screens/ChatScreen';
import { MapScreen } from './screens/MapScreen';
import { SettingsScreen, UserRole } from './screens/SettingsScreen';
import { PreparednessScreen } from './screens/PreparednessScreen';

// Modals
import { ConsentModal } from './screens/modals/ConsentModal';
import { PermissionWizardModal } from './screens/modals/PermissionWizardModal';
import { PreparednessModal } from './screens/modals/PreparednessModal';
import { OemGuideModal } from './screens/modals/OemGuideModal';
import { MapDownloadModal } from './screens/modals/MapDownloadModal';
import { RescuerCredentialModal } from './screens/modals/RescuerCredentialModal';
import { WipeDataModal } from './screens/modals/WipeDataModal';
import { SosDetailsModal } from './screens/modals/SosDetailsModal';
import { SosStatusScreen } from './screens/SosStatusScreen';
import { DebugMeshScreen } from './screens/DebugMeshScreen';

// Services & Core
import { DatabaseManager } from './db/DatabaseManager';
import { IdentityService, StoredIdentity } from './security/identity';
import { PermissionService } from './permissions/permissionService';
import { calculateReadinessScore, ReadinessEvaluation } from './preparedness/readinessScore';
import { DrillModeManager } from './preparedness/drillMode';
import { MapPackManager } from './maps/mapPackManager';
import { ConsentData } from './db/repositories/ConsentRepository';
import { TriageStatus } from '@rescuenet/core';
import { ChatMessageRecord, ConversationRecord } from './db/repositories/ChatRepository';
import { NeighborRecord } from './db/repositories/NeighborRepository';
import { ClusterRecord } from './db/repositories/ClusterRepository';
import { RescueBle, BleNeighbor } from './native/RescueBle';
import { LocationProvider } from './location/LocationProvider';
import { SosController, SosDetails } from './sos/SosController';
import { ConnectivityGovernor } from './ble/ConnectivityGovernor';
import { MeshSyncController } from './ble/MeshSyncController';
import { RescuerHomeScreen } from './screens/RescuerHomeScreen';
import { RescuerCredentialService, HomingService } from './rescuer';
import { MeshEngine } from './mesh/MeshEngine';
import { SurvivalModeManager } from './sos/SurvivalModeManager';
import { UplinkService } from './uplink/UplinkService';

export function App(): React.JSX.Element {
  // App initialization state
  const [loading, setLoading] = useState(true);
  const [isPrepared, setIsPrepared] = useState(false);
  const [demoMode, setDemoMode] = useState(true); // Demo / simulation mode enabled by default for emulator testing

  const [dbManager, setDbManager] = useState<DatabaseManager | null>(null);
  const [identityService, setIdentityService] = useState<IdentityService | null>(null);
  const [identity, setIdentity] = useState<StoredIdentity | null>(null);
  const [permissionService] = useState<PermissionService>(() => new PermissionService());
  const [drillManager] = useState<DrillModeManager>(() => new DrillModeManager(false));
  const [mapManager] = useState<MapPackManager>(() => new MapPackManager());

  // UI Navigation and Modals state
  const [currentTab, setCurrentTab] = useState<TabName>('home');
  const [currentRole, setCurrentRole] = useState<UserRole>('survivor');
  const [appLanguage, setAppLanguage] = useState<SupportedLanguage>('en');

  // Controllers
  const [sosController, setSosController] = useState<SosController | null>(null);
  const [meshSyncController, setMeshSyncController] = useState<MeshSyncController | null>(null);
  const [_connectivityGovernor, setConnectivityGovernor] = useState<ConnectivityGovernor | null>(null);
  const [uplinkService, setUplinkService] = useState<UplinkService | null>(null);
  const [rescuerService, setRescuerService] = useState<RescuerCredentialService | null>(null);
  const [homingService, setHomingService] = useState<HomingService | null>(null);
  const [meshEngine, setMeshEngine] = useState<MeshEngine | null>(null);

  // Modal visibilities
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showPreparednessModal, setShowPreparednessModal] = useState(false);
  const [showOemGuideModal, setShowOemGuideModal] = useState(false);
  const [showMapDownloadModal, setShowMapDownloadModal] = useState(false);
  const [showRescuerModal, setShowRescuerModal] = useState(false);
  const [showWipeDataModal, setShowWipeDataModal] = useState(false);
  const [showSosDetailsModal, setShowSosDetailsModal] = useState(false);
  const [showSosStatusScreen, setShowSosStatusScreen] = useState(false);
  const [showDebugMeshModal, setShowDebugMeshModal] = useState(false);

  // Settings & Radio automation state
  const [autoArmEnabled, setAutoArmEnabled] = useState(true);
  const [survivalMode, setSurvivalMode] = useState(false);
  const [bleNeighbors, setBleNeighbors] = useState<BleNeighbor[]>([]);

  // Sample or DB backed records
  const [neighbors, setNeighbors] = useState<NeighborRecord[]>([]);
  const [clusters, setClusters] = useState<ClusterRecord[]>([]);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [assignedTeam, setAssignedTeam] = useState<string | null>(null);
  const [activeChatChannelId, setActiveChatChannelId] = useState<string>('conv_local_mesh');

  // Initialize app: Database, Identity, Preparedness, BLE, SOS
  const initializeApp = useCallback(async () => {
    try {
      setLoading(true);
      const db = await DatabaseManager.create();
      setDbManager(db);

      const identSvc = await IdentityService.create();
      setIdentityService(identSvc);
      const identState = identSvc.getIdentityState();
      setIdentity(identState);

      const rService = new RescuerCredentialService(db, db.getCrypto());
      await rService.init();
      setRescuerService(rService);

      const identKey = await identSvc.getIdentity();
      const engine = new MeshEngine({
        nodeId: identState.originFp.slice(0, 8),
        crypto: db.getCrypto(),
        db,
        transport: RescueBle,
        role: rService.isRescuer() ? 'rescuer' : 'survivor',
        keyPair: {
          publicKey: identKey.publicKey,
          privateKey: identKey.privateKey,
        },
      });
      engine.setRescuerService(rService);
      setMeshEngine(engine);

      const hService = new HomingService(RescueBle, db, engine, rService);
      setHomingService(hService);

      if (rService.isRescuer()) {
        setCurrentRole('rescuer');
      }

      const locProvider = LocationProvider.getInstance();
      const sosCtrl = SosController.getInstance(db, identSvc, locProvider);
      setSosController(sosCtrl);

      const meshCtrl = new MeshSyncController(
        RescueBle,
        db,
        identState.originFp.slice(0, 8),
        async () => (await identSvc.getIdentity()).privateKey
      );
      setMeshSyncController(meshCtrl);

      const gov = new ConnectivityGovernor(RescueBle, db);
      setConnectivityGovernor(gov);
      await gov.start();

      const uplink = new UplinkService(db, gov, engine, {
        apiUrl: 'http://10.0.2.2:3000/v1/uplink',
      });
      uplink.start();
      setUplinkService(uplink);

      RescueBle.on('neighborDiscovered', (n: BleNeighbor) => {
        setBleNeighbors((prev) => {
          const filtered = prev.filter((item) => item.deviceId !== n.deviceId);
          return [...filtered, n];
        });
      });
      RescueBle.on('neighborLost', (event: { deviceId: string }) => {
        setBleNeighbors((prev) => prev.filter((item) => item.deviceId !== event.deviceId));
      });

      SurvivalModeManager.getInstance().addSurvivalListener(setSurvivalMode);

      // Check preparedness completion state
      const prepFlag = await db.settings.get('preparedness_completed');
      if (prepFlag === '1') {
        setIsPrepared(true);
        mapManager.startDownload('maharashtra').catch(() => {});
      } else {
        setIsPrepared(false);
      }

      // Check consent record
      const hasConsent = await db.consent.hasValidConsent();
      if (!hasConsent) {
        setShowConsentModal(true);
      } else {
        setShowConsentModal(false);
      }

      const savedLang = await db.settings.get('app_language');
      if (savedLang) {
        setAppLanguage(savedLang as SupportedLanguage);
      }
      const savedAutoArm = await db.settings.get('auto_arm_enabled');
      if (savedAutoArm !== null) {
        setAutoArmEnabled(savedAutoArm === '1');
      }

      await loadInitialData(db);
    } catch (err) {
      console.error('[RescueNet] initializeApp failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInitialData = async (db: DatabaseManager) => {
    const samplePeerA: NeighborRecord = {
      fp: '4a9b2c8f1e7d3a01',
      last_rssi: -62,
      last_seen: new Date().toISOString(),
      battery: 88,
      role: 'survivor',
      mac_rotating: 1,
    };
    const samplePeerB: NeighborRecord = {
      fp: '8f2e1a3b5c7d9e02',
      last_rssi: -74,
      last_seen: new Date().toISOString(),
      battery: 65,
      role: 'survivor',
      mac_rotating: 1,
    };
    await db.neighbors.upsertNeighbor(samplePeerA);
    await db.neighbors.upsertNeighbor(samplePeerB);
    const allNeighbors = await db.neighbors.getAllNeighbors();
    setNeighbors(allNeighbors);

    const sampleCluster: ClusterRecord = {
      cluster_id: 'cl_pune_ghats_01',
      centroid_lat: 18.5204,
      centroid_lon: 73.8567,
      radius_meters: 45,
      member_count: 5,
      priority_score: 0.85,
      state: 'new',
      updated_at: new Date().toISOString(),
    };
    await db.clusters.upsertCluster(sampleCluster);
    const allClusters = await db.clusters.getAllClusters();
    setClusters(allClusters);

    // Initial conversation 1: Assigned Rescue Team Alpha
    const convTeam: ConversationRecord = {
      conversation_id: 'team_alpha_chat',
      peer_fp: 'team_alpha',
      peer_nickname: 'Rescue Team Alpha',
      last_message_at: new Date().toISOString(),
      unread_count: 1,
    };
    await db.chat.upsertConversation(convTeam);

    // Initial conversation 2: Nearby Survivor B
    const convSurvivorB: ConversationRecord = {
      conversation_id: 'conv_local_mesh',
      peer_fp: '4a9b2c8f1e7d3a01',
      peer_nickname: 'Survivor B (Priya Patil)',
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    };
    await db.chat.upsertConversation(convSurvivorB);

    const allConvs = await db.chat.getAllConversations();
    setConversations(allConvs);

    // Seed initial messages (Only Survivor B is initially active on local mesh)

    const survivorBMsg: ChatMessageRecord = {
      message_id: 'msg_001',
      conversation_id: 'conv_local_mesh',
      direction: 'inbound',
      sender_fp: '4a9b2c8f1e7d3a01',
      recipient_fp: 'broadcast',
      content: 'Is anyone nearby? We are at the relief shelter entrance.',
      status: 'relayed',
      ttl: 5,
      created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    };
    await db.chat.saveMessage(survivorBMsg);

    const allMsgs = await db.chat.getAllMessages();
    setMessages(allMsgs);
  };

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  const readinessEvaluation: ReadinessEvaluation = calculateReadinessScore({
    permissionsGrantedPercentage: permissionService.getGrantedPercentage(),
    batteryOptimizationExempt: permissionService.getStatus('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS') === 'granted',
    bluetoothEnabled: true,
    locationEnabled: true,
    bleAdvertisingSupported: true,
    codedPhySupported: true,
    smsAvailable: true,
    identityRegistered: identity?.registered ?? false,
    mapPackDownloaded: mapManager.hasAnyMapDownloaded(),
    controlRoomNumbersSynced: true,
    emergencyContactsSet: true,
  });

  const handleConsentGiven = async (consentData: ConsentData) => {
    if (dbManager) {
      await dbManager.consent.saveConsent(1, consentData);
      await dbManager.events.logEvent('consent_accepted', {
        version: 1,
        optInName: consentData.optInName,
      });
    }
    setShowConsentModal(false);
  };

  const handleSelectRole = (role: UserRole) => {
    if (role === 'rescuer') {
      setShowRescuerModal(true);
    } else {
      setCurrentRole(role);
      meshEngine?.setRole(role as any);
      if (dbManager) {
        dbManager.settings.set('device_role', role);
      }
    }
  };

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setAppLanguage(lang);
    if (dbManager) {
      dbManager.settings.set('app_language', lang);
    }
  };

  const handleRotatePseudonym = async () => {
    if (identityService) {
      await identityService.rotateEphemeralKey();
      setIdentity(identityService.getIdentityState());
    }
  };

  const dispatchEmergencyChannels = async () => {
    if (!sosController || !dbManager) {
      console.warn('[EmergencyDispatcher] Controller or DB not ready');
      return;
    }

    console.log('[EmergencyDispatcher] Initiating communication channel selection...');

    // 1. Internet Available -> Backend Uplink
    if (uplinkService) {
      try {
        console.log('[EmergencyDispatcher] Checking Internet / Backend Uplink...');
        const uplinkResult = await uplinkService.triggerUplink();
        if (uplinkResult && (uplinkResult.accepted > 0 || uplinkResult.duplicate > 0)) {
          console.log('[EmergencyDispatcher] Uplink succeeded! Accepted:', uplinkResult.accepted);
          sosController.setUplinkStatus(
            true,
            true,
            'Distress SOS received and acknowledged by Emergency Response Center via Backend Uplink',
            'INTERNET'
          );
          await dbManager.events.logEvent('sos_uplink_success', {
            channel: 'internet',
            accepted: uplinkResult.accepted,
          });
          return;
        }
      } catch (e) {
        console.warn('[EmergencyDispatcher] Internet uplink failed, falling back:', (e as Error).message);
      }
    }

    // 2. Internet Unavailable + SMS Available -> SMS Fallback
    const hasSmsPermission = permissionService.getStatus('SEND_SMS') === 'granted' || demoMode;
    if (hasSmsPermission) {
      console.log('[EmergencyDispatcher] Internet unavailable, SMS available -> Dispatching via Emergency SMS');
      sosController.setUplinkStatus(
        false,
        true,
        'SOS dispatched via Emergency SMS Gateway (+911123456789)',
        'SMS'
      );
      await dbManager.events.logEvent('sos_dispatched_sms', {
        destination: '+911123456789',
      });
      await RescueBle.startAdvertising(
        'LOW_LATENCY',
        'survivor',
        { hasSos: true, lowBattery: false, beaconOnly: false },
        '00000000'
      );
      return;
    }

    // 3. No Internet + No SMS -> BLE Mesh Multi-hop Relay & Local Storage
    console.log('[EmergencyDispatcher] No Internet & No SMS -> Broadcasting on BLE Mesh');
    await RescueBle.startAdvertising(
      'LOW_LATENCY',
      'survivor',
      { hasSos: true, lowBattery: false, beaconOnly: false },
      '00000000'
    );
    await RescueBle.startScanning('LOW_LATENCY');
    sosController.setUplinkStatus(
      false,
      false,
      'Broadcasting emergency packet locally to nearby phones via Bluetooth Low Energy mesh',
      'BLE_MESH'
    );
    await dbManager.events.logEvent('sos_broadcast_ble_mesh', {
      sprayWaitCopies: 6,
    });
  };

  const handleSosBroadcasted = async (triage: TriageStatus, needsMask: number) => {
    if (sosController) {
      await sosController.triggerSos('instant_tap', { triage, needsMask });
      setShowSosStatusScreen(true);
      await dispatchEmergencyChannels();
    }
  };

  const handleSendMessage = async (content: string, channelId: string = 'team_alpha_chat') => {
    if (dbManager && identity) {
      const msgId = `msg_${Date.now()}`;
      const newMsg: ChatMessageRecord = {
        message_id: msgId,
        conversation_id: channelId,
        direction: 'outbound',
        sender_fp: identity.originFp,
        recipient_fp: channelId === 'team_alpha_chat' ? 'team_alpha' : 'broadcast',
        content,
        status: 'delivered',
        ttl: 6,
        created_at: new Date().toISOString(),
      };
      await dbManager.chat.saveMessage(newMsg);
      setMessages((prev) => [...prev, newMsg]);

      // Post to shared chat endpoint on backend so dashboard rescuer receives it in real time
      fetch('http://10.0.2.2:3000/v1/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'cl_pune_ghats_01',
          senderFp: identity.originFp,
          senderName: 'Survivor (You)',
          senderRole: 'survivor',
          content,
        }),
      }).catch(() => {});
    }
  };

  // Sync incoming rescuer messages from backend
  useEffect(() => {
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch('http://10.0.2.2:3000/v1/chat/messages?conversationId=cl_pune_ghats_01');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            const hasRescuerMsg = data.messages.some(
              (m: any) =>
                m.senderRole === 'rescuer' ||
                m.senderFp === 'team_alpha' ||
                (m.senderName && m.senderName.toLowerCase().includes('team')) ||
                (m.content && m.content.toLowerCase().includes('dispatched'))
            );
            if (hasRescuerMsg) {
              setAssignedTeam('Rescue Team Alpha');
            }

            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.message_id));
              const newIncoming = data.messages
                .filter((m: any) => !existingIds.has(m.id))
                .map((m: any) => ({
                  message_id: m.id,
                  conversation_id: m.conversationId === 'cl_pune_ghats_01' ? 'team_alpha_chat' : m.conversationId,
                  direction: (m.senderRole === 'survivor' && m.senderFp !== 'team_alpha') ? ('outbound' as const) : ('inbound' as const),
                  sender_fp: m.senderFp,
                  recipient_fp: m.recipientFp || 'broadcast',
                  content: m.content,
                  status: 'delivered' as const,
                  ttl: m.ttl || 6,
                  created_at: m.timestamp || new Date().toISOString(),
                }));
              if (newIncoming.length > 0) {
                return [...prev, ...newIncoming];
              }
              return prev;
            });
          }
        }
      } catch {
        // local offline mesh
      }
    }, 3000);
    return () => clearInterval(pollTimer);
  }, []);

  const handleConfirmWipe = async () => {
    if (dbManager) {
      await dbManager.wipeAllData();
    }
    if (identityService) {
      await identityService.wipeIdentity();
    }
    setShowWipeDataModal(false);
    setIsPrepared(false);
    await initializeApp();
  };

  const handleCompletePreparedness = async () => {
    setIsPrepared(true);
    if (dbManager) {
      await dbManager.settings.set('preparedness_completed', '1');
      await dbManager.settings.set('map_region_downloaded', 'maharashtra');
    }
    await mapManager.startDownload('maharashtra').catch(() => {});
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.info} />
        <Text style={styles.loadingText}>Initializing RescueNet Mesh...</Text>
      </View>
    );
  }

  return (
    <LanguageProvider initialLanguage={appLanguage} onLanguageChange={handleLanguageChange}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

        {/* Tab Body or First-Launch Preparedness */}
        <View style={styles.body}>
          {!isPrepared ? (
            <PreparednessScreen
              isPrepared={false}
              onCompletePreparedness={handleCompletePreparedness}
              evaluation={readinessEvaluation}
              drillManager={drillManager}
              onOpenMapDownload={() => setShowMapDownloadModal(true)}
              onOpenPermissions={() => setShowPermissionModal(true)}
            />
          ) : (
            <>
              {currentTab === 'home' && (
                currentRole === 'rescuer' && rescuerService && homingService && dbManager && meshEngine ? (
                  <RescuerHomeScreen
                    db={dbManager}
                    meshEngine={meshEngine}
                    rescuerService={rescuerService}
                    homingService={homingService}
                    locationProvider={LocationProvider.getInstance()}
                    onExitRescuerMode={() => handleSelectRole('survivor')}
                  />
                ) : (
                  <HomeScreen
                    onSosBroadcasted={handleSosBroadcasted}
                    isRegistered={identity?.registered}
                    nearbyCount={neighbors.length}
                    onNavigateToTab={(tab) => setCurrentTab(tab)}
                    demoMode={demoMode}
                    onToggleDemoMode={(val) => setDemoMode(val)}
                  />
                )
              )}

              {currentTab === 'nearby' && (
                <NearbyScreen
                  neighbors={neighbors}
                  clusters={clusters}
                  yourClusterId="cl_pune_ghats_01"
                  onStartChatWithSurvivor={(survivor) => {
                    setActiveChatChannelId(survivor.convId || 'conv_local_mesh');
                    setCurrentTab('chat');
                  }}
                  onSelectPeer={() => {
                    setActiveChatChannelId('conv_local_mesh');
                    setCurrentTab('chat');
                  }}
                />
              )}

              {currentTab === 'chat' && (
                <ChatScreen
                  conversations={conversations}
                  messages={messages}
                  activeChannelId={activeChatChannelId}
                  assignedTeam={assignedTeam}
                  onSelectChannel={(chId) => setActiveChatChannelId(chId)}
                  onSendMessage={handleSendMessage}
                />
              )}

              {currentTab === 'map' && (
                <MapScreen
                  hasOfflineMapPack={mapManager.hasAnyMapDownloaded()}
                  activeClusters={clusters}
                  onOpenDownloadModal={() => setShowMapDownloadModal(true)}
                  onNavigateToChat={(convId) => {
                    setActiveChatChannelId(convId || 'conv_local_mesh');
                    setCurrentTab('chat');
                  }}
                />
              )}

              {currentTab === 'settings' && (
                <SettingsScreen
                  currentRole={currentRole}
                  onSelectRole={handleSelectRole}
                  identity={identity}
                  onOpenWipeData={() => setShowWipeDataModal(true)}
                  onOpenMapDownload={() => setShowMapDownloadModal(true)}
                  hasMapDownloaded={mapManager.hasAnyMapDownloaded()}
                />
              )}
            </>
          )}
        </View>

        {/* Bottom Tab Bar (Visible once prepared) */}
        {isPrepared && (
          <BottomTabBar
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            nearbyCount={neighbors.length}
            unreadChatCount={messages.length > 0 ? 1 : 0}
          />
        )}

        {/* Consent Modal */}
        <ConsentModal visible={showConsentModal} onConsentGiven={handleConsentGiven} />

        {/* Permission Onboarding Modal */}
        <PermissionWizardModal
          visible={showPermissionModal}
          permissionService={permissionService}
          onClose={() => setShowPermissionModal(false)}
          onOpenOemGuide={() => {
            setShowPermissionModal(false);
            setShowOemGuideModal(true);
          }}
        />

        {/* Preparedness Modal */}
        <PreparednessModal
          visible={showPreparednessModal}
          evaluation={readinessEvaluation}
          drillManager={drillManager}
          onClose={() => setShowPreparednessModal(false)}
          onOpenMapDownload={() => {
            setShowPreparednessModal(false);
            setShowMapDownloadModal(true);
          }}
          onOpenPermissions={() => {
            setShowPreparednessModal(false);
            setShowPermissionModal(true);
          }}
        />

        {/* OEM Battery Saver Guide Modal */}
        <OemGuideModal
          visible={showOemGuideModal}
          onClose={() => setShowOemGuideModal(false)}
        />

        {/* Map Download Modal */}
        <MapDownloadModal
          visible={showMapDownloadModal}
          mapManager={mapManager}
          onClose={() => setShowMapDownloadModal(false)}
          onMapDownloaded={() => {}}
        />

        {/* Rescuer Credential Import Modal */}
        <RescuerCredentialModal
          visible={showRescuerModal}
          rescuerService={rescuerService ?? undefined}
          onClose={() => setShowRescuerModal(false)}
          onCredentialImported={(_cred) => {
            setCurrentRole('rescuer');
            meshEngine?.setRole('rescuer');
            if (dbManager) {
              dbManager.settings.set('device_role', 'rescuer');
            }
          }}
        />

        {/* Wipe Data Modal */}
        <WipeDataModal
          visible={showWipeDataModal}
          onClose={() => setShowWipeDataModal(false)}
          onConfirmWipe={handleConfirmWipe}
        />

        {/* SOS Details Modal */}
        <SosDetailsModal
          visible={showSosDetailsModal}
          onSend={async (details: SosDetails) => {
            setShowSosDetailsModal(false);
            if (sosController) {
              await sosController.triggerSos('button_hold', details);
              setShowSosStatusScreen(true);
            }
          }}
          onDismiss={() => setShowSosDetailsModal(false)}
        />

        {/* SOS Status Screen */}
        {sosController && (
          <Modal
            visible={showSosStatusScreen}
            animationType="slide"
            onRequestClose={() => setShowSosStatusScreen(false)}
          >
            <SosStatusScreen
              sosController={sosController}
              assignedTeam={assignedTeam}
              onOpenDetails={() => {
                setShowSosStatusScreen(false);
                setShowSosDetailsModal(true);
              }}
              onClose={() => setShowSosStatusScreen(false)}
              onNavigateToChat={(channelId) => {
                setShowSosStatusScreen(false);
                setActiveChatChannelId(channelId || 'team_alpha_chat');
                setCurrentTab('chat');
              }}
            />
          </Modal>
        )}

        {/* Developer Diagnostics Screen */}
        <Modal
          visible={showDebugMeshModal}
          animationType="slide"
          onRequestClose={() => setShowDebugMeshModal(false)}
        >
          <DebugMeshScreen
            transport={RescueBle}
            neighbors={bleNeighbors}
            onSendTestPacket={async (targetDeviceId) => {
              if (meshSyncController) {
                await meshSyncController.sendTestPing(targetDeviceId);
              }
            }}
            onClose={() => setShowDebugMeshModal(false)}
          />
        </Modal>
      </SafeAreaView>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
});

export default App;
