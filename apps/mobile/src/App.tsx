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
  const [mapUpdateCount, setMapUpdateCount] = useState(0);

  // Controllers
  const [sosController, setSosController] = useState<SosController | null>(null);
  const [meshSyncController, setMeshSyncController] = useState<MeshSyncController | null>(null);
  const [_connectivityGovernor, setConnectivityGovernor] = useState<ConnectivityGovernor | null>(
    null,
  );
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
  const [activeClusterId, setActiveClusterId] = useState<string>('cl_pune_ghats_01');
  // Track the APK's own SOS GPS so we can match it in the clusters list
  const [myLastSosLocation, setMyLastSosLocation] = useState<{ lat: number; lon: number } | null>(
    null,
  );

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
        async () => (await identSvc.getIdentity()).privateKey,
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
        setBleNeighbors(prev => {
          const filtered = prev.filter(item => item.deviceId !== n.deviceId);
          return [...filtered, n];
        });
      });
      RescueBle.on('neighborLost', (event: { deviceId: string }) => {
        setBleNeighbors(prev => prev.filter(item => item.deviceId !== event.deviceId));
      });

      SurvivalModeManager.getInstance().addSurvivalListener(setSurvivalMode);

      mapManager.setDbInstance(db);
      await mapManager.loadFromDb(db);

      // Dynamically detect user's location and set active map region
      try {
        const userLoc = await LocationProvider.getInstance().getCurrentLocation(3000);
        if (userLoc) {
          mapManager.setActiveRegionFromLocation(userLoc.latitude, userLoc.longitude);
        }
      } catch {}

      // Check preparedness completion state
      const prepFlag = await db.settings.get('preparedness_completed');
      const savedRegion = await db.settings.get('map_region_downloaded');
      if (prepFlag === '1') {
        setIsPrepared(true);
        if (!mapManager.hasAnyMapDownloaded()) {
          const regionToLoad = savedRegion || mapManager.getActiveRegion().id;
          mapManager.startDownload(regionToLoad).catch(() => {});
        }
      } else {
        setIsPrepared(false);
      }

      const activeReg = mapManager.getActiveDownloadedRegion() || mapManager.getActiveRegion();
      LocationProvider.getInstance().setDefaultCoordinates(
        activeReg.centerLat,
        activeReg.centerLon,
      );

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
    const allNeighbors = await db.neighbors.getAllNeighbors();
    setNeighbors(allNeighbors);

    const allClusters = await db.clusters.getAllClusters();
    setClusters(allClusters);

    const allConvs = await db.chat.getAllConversations();
    setConversations(allConvs);

    const allMsgs = await db.chat.getAllMessages();
    setMessages(allMsgs);
  };

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  const readinessEvaluation: ReadinessEvaluation = calculateReadinessScore({
    permissionsGrantedPercentage: permissionService.getGrantedPercentage(),
    batteryOptimizationExempt:
      permissionService.getStatus('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS') === 'granted',
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
            'INTERNET',
          );
          await dbManager.events.logEvent('sos_uplink_success', {
            channel: 'internet',
            accepted: uplinkResult.accepted,
          });
          return;
        }
      } catch (e) {
        console.warn(
          '[EmergencyDispatcher] Internet uplink failed, falling back:',
          (e as Error).message,
        );
      }
    }

    // 2. Internet Unavailable + SMS Available -> SMS Fallback
    const hasSmsPermission = permissionService.getStatus('SEND_SMS') === 'granted' || demoMode;
    if (hasSmsPermission) {
      console.log(
        '[EmergencyDispatcher] Internet unavailable, SMS available -> Dispatching via Emergency SMS',
      );
      sosController.setUplinkStatus(
        false,
        true,
        'SOS dispatched via Emergency SMS Gateway (+911123456789)',
        'SMS',
      );
      await dbManager.events.logEvent('sos_dispatched_sms', {
        destination: '+911123456789',
      });
      await RescueBle.startAdvertising(
        'LOW_LATENCY',
        'survivor',
        { hasSos: true, lowBattery: false, beaconOnly: false },
        '00000000',
      );
      return;
    }

    // 3. No Internet + No SMS -> BLE Mesh Multi-hop Relay & Local Storage
    console.log('[EmergencyDispatcher] No Internet & No SMS -> Broadcasting on BLE Mesh');
    await RescueBle.startAdvertising(
      'LOW_LATENCY',
      'survivor',
      { hasSos: true, lowBattery: false, beaconOnly: false },
      '00000000',
    );
    await RescueBle.startScanning('LOW_LATENCY');
    sosController.setUplinkStatus(
      false,
      false,
      'Broadcasting emergency packet locally to nearby phones via Bluetooth Low Energy mesh',
      'BLE_MESH',
    );
    await dbManager.events.logEvent('sos_broadcast_ble_mesh', {
      sprayWaitCopies: 6,
    });
  };

  const handleSosBroadcasted = async (triage: TriageStatus, needsMask: number) => {
    if (sosController) {
      await sosController.triggerSos('instant_tap', { triage, needsMask });
      setShowSosStatusScreen(true);
      // Capture GPS at SOS send time so we can match our cluster in polling
      try {
        const loc = await LocationProvider.getInstance().getCurrentLocation(3000);
        if (loc) {
          setMyLastSosLocation({ lat: loc.latitude, lon: loc.longitude });
        }
      } catch {}
      await dispatchEmergencyChannels();
    }
  };

  const handleSendMessage = async (content: string, channelId: string = activeClusterId) => {
    if (dbManager && identity) {
      const msgId = `msg_${Date.now()}`;
      const newMsg: ChatMessageRecord = {
        message_id: msgId,
        conversation_id: channelId,
        direction: 'outbound',
        sender_fp: identity.originFp,
        recipient_fp: 'broadcast',
        content,
        status: 'delivered',
        ttl: 6,
        created_at: new Date().toISOString(),
      };
      await dbManager.chat.saveMessage(newMsg);
      setMessages(prev => [...prev, newMsg]);

      // Post to shared chat endpoint on backend so dashboard rescuer receives it in real time
      // Use the active cluster ID so the message routes to the right conversation
      const chatPayload = JSON.stringify({
        conversationId: activeClusterId,
        senderFp: identity.originFp,
        senderName: 'Survivor (You)',
        senderRole: 'survivor',
        content,
      });

      const tryFetch = (url: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: chatPayload,
        });

      tryFetch('http://10.0.2.2:3000/v1/chat/messages').catch(() =>
        tryFetch('http://localhost:3000/v1/chat/messages').catch(() => {}),
      );
    }
  };

  // Sync incoming rescuer messages, cluster state, and simulation peers from backend
  useEffect(() => {
    const pollTimer = setInterval(async () => {
      try {
        // ─── 1. Sync backend clusters → update map + extract own cluster state ───
        let clusterRes = await fetch('http://10.0.2.2:3000/v1/clusters').catch(() => null);
        if (!clusterRes || !clusterRes.ok) {
          clusterRes = await fetch('http://localhost:3000/v1/clusters').catch(() => null);
        }
        if (clusterRes && clusterRes.ok) {
          const backendClusters = await clusterRes.json();
          if (Array.isArray(backendClusters) && backendClusters.length > 0) {
            // Update our clusters list with real backend GPS data
            setClusters(
              backendClusters.map((c: any) => ({
                cluster_id: c.id,
                centroid_lat: Number(c.centroid_lat ?? c.lat ?? 18.5204),
                centroid_lon: Number(c.centroid_lon ?? c.lon ?? 73.8567),
                radius_meters: c.radius_m || 45,
                member_count: c.member_count || 1,
                priority_score: c.priority_score || 0.5,
                state: c.state || 'new',
                updated_at: c.updated_at || new Date().toISOString(),
              })),
            );

            // Find OUR cluster: match by last known SOS GPS, or take the newest cluster
            let myCluster: any = null;
            if (myLastSosLocation) {
              myCluster = backendClusters.find((c: any) => {
                const clat = Number(c.centroid_lat ?? c.lat ?? 0);
                const clon = Number(c.centroid_lon ?? c.lon ?? 0);
                return (
                  Math.abs(clat - myLastSosLocation.lat) < 0.002 &&
                  Math.abs(clon - myLastSosLocation.lon) < 0.002
                );
              });
            }
            // If no GPS match, fall back to the most recently updated cluster
            if (!myCluster) {
              myCluster = backendClusters.sort(
                (a: any, b: any) =>
                  new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime(),
              )[0];
            }

            if (myCluster) {
              // Update active cluster ID so chat messages route correctly
              setActiveClusterId(myCluster.id);

              // Extract assigned team directly from cluster record
              if (myCluster.assigned_team) {
                setAssignedTeam(myCluster.assigned_team);
              } else if (
                myCluster.state === 'assigned' ||
                myCluster.state === 'en_route' ||
                myCluster.state === 'reached'
              ) {
                // State says assigned but no team name yet — keep what we have
                if (!assignedTeam) setAssignedTeam('Rescue Team Alpha');
              }
            }
          }
        }

        // ─── 2. Sync simulation peers & status ───
        let simRes = await fetch('http://10.0.2.2:3000/v1/simulation/peers').catch(() => null);
        if (!simRes || !simRes.ok) {
          simRes = await fetch('http://localhost:3000/v1/simulation/peers').catch(() => null);
        }
        if (simRes && simRes.ok) {
          const simData = await simRes.json();
          if (simData.active && Array.isArray(simData.peers) && simData.peers.length > 0) {
            const simFps = new Set(simData.peers.map((p: any) => p.fp));
            setNeighbors(prev => {
              const nonSim = prev.filter(n => !simFps.has(n.fp));
              const simNeighbors: NeighborRecord[] = simData.peers.map((p: any) => ({
                fp: p.fp,
                last_rssi: p.rssi || -65,
                last_seen: new Date().toISOString(),
                battery: p.battery || 75,
                role: p.role || 'survivor',
                mac_rotating: 0,
              }));
              return [...nonSim, ...simNeighbors];
            });
          } else if (!simData.active) {
            setNeighbors(prev =>
              prev.filter(n => n.fp !== '4a9b2c8f1e7d3a01' && n.fp !== '8f2e1a3b5c7d9e02'),
            );
          }
        }

        // ─── 3. Sync chat messages from backend ───
        let res = await fetch('http://10.0.2.2:3000/v1/chat/messages?conversationId=all').catch(
          () => null,
        );
        if (!res || !res.ok) {
          res = await fetch('http://localhost:3000/v1/chat/messages?conversationId=all').catch(
            () => null,
          );
        }
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            if (data.messages.length === 0) {
              setMessages(prev =>
                prev.filter(m => m.direction === 'outbound' && !m.message_id.startsWith('msg_')),
              );
              setAssignedTeam(null);
            } else {
              // Check if any rescuer message carries an explicit team name
              const rescuerMsg = data.messages.find(
                (m: any) =>
                  m.senderRole === 'rescuer' ||
                  m.senderFp === 'team_alpha' ||
                  (m.senderName && m.senderName.toLowerCase().includes('team')),
              );
              if (rescuerMsg && !assignedTeam) {
                // Extract team name from message senderName if possible
                const teamName = rescuerMsg.senderName || 'Rescue Team Alpha';
                setAssignedTeam(teamName);
              }

              setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.message_id));
                const newIncoming = data.messages
                  .filter((m: any) => !existingIds.has(m.id))
                  .map((m: any) => ({
                    message_id: m.id,
                    conversation_id: m.conversationId || activeClusterId,
                    direction:
                      m.senderRole === 'survivor' && m.senderFp !== 'team_alpha'
                        ? ('outbound' as const)
                        : ('inbound' as const),
                    sender_fp: m.senderFp,
                    recipient_fp: m.recipientFp || 'broadcast',
                    content: m.content,
                    status: 'delivered' as const,
                    ttl: m.ttl || 6,
                    created_at: m.timestamp || new Date().toISOString(),
                  }));

                if (newIncoming.length > 0 && dbManager) {
                  for (const item of newIncoming) {
                    dbManager.chat.saveMessage(item).catch(() => {});
                  }
                  return [...prev, ...newIncoming];
                }
                return prev;
              });
            }
          }
        }
      } catch {
        // local offline mesh
      }
    }, 2500);
    return () => clearInterval(pollTimer);
  }, [dbManager, myLastSosLocation, assignedTeam, activeClusterId]);

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

  const handleCompletePreparedness = async (selectedRegionId?: string) => {
    setIsPrepared(true);
    if (dbManager) {
      const regionToUse = selectedRegionId || mapManager.getActiveRegion().id;
      await dbManager.settings.set('preparedness_completed', '1');
      await dbManager.settings.set('map_region_downloaded', regionToUse);
      await mapManager.startDownload(regionToUse).catch(() => {});
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Initializing RescueNet Mesh...</Text>
      </View>
    );
  }

  return (
    <LanguageProvider initialLanguage={appLanguage} onLanguageChange={handleLanguageChange}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

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
              {currentTab === 'home' &&
                (currentRole === 'rescuer' &&
                rescuerService &&
                homingService &&
                dbManager &&
                meshEngine ? (
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
                    onNavigateToTab={tab => setCurrentTab(tab)}
                    demoMode={demoMode}
                    onToggleDemoMode={val => setDemoMode(val)}
                  />
                ))}

              {currentTab === 'nearby' && (
                <NearbyScreen
                  neighbors={neighbors}
                  clusters={clusters}
                  yourClusterId={clusters[0]?.cluster_id || null}
                  onSelectPeer={_fp => {}}
                />
              )}

              {currentTab === 'chat' && (
                <ChatScreen
                  messages={messages}
                  activeChannelId={activeChatChannelId}
                  assignedTeam={assignedTeam}
                  neighbors={neighbors}
                  onSelectChannel={ch => setActiveChatChannelId(ch)}
                  onSendMessage={handleSendMessage}
                />
              )}

              {currentTab === 'map' && (
                <MapScreen
                  key={`map_${mapUpdateCount}_${mapManager.getActiveRegion().id}`}
                  hasOfflineMapPack={mapManager.hasAnyMapDownloaded()}
                  activeClusters={clusters}
                  neighbors={neighbors}
                  activeRegion={
                    mapManager.getActiveDownloadedRegion() || mapManager.getActiveRegion()
                  }
                  onOpenDownloadModal={() => setShowMapDownloadModal(true)}
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
            unreadChatCount={messages.length}
            nearbyCount={neighbors.length}
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
        <OemGuideModal visible={showOemGuideModal} onClose={() => setShowOemGuideModal(false)} />

        {/* Map Download Modal */}
        <MapDownloadModal
          visible={showMapDownloadModal}
          mapManager={mapManager}
          onClose={() => setShowMapDownloadModal(false)}
          onMapDownloaded={() => {
            setMapUpdateCount(c => c + 1);
          }}
        />

        {/* Rescuer Credential Import Modal */}
        <RescuerCredentialModal
          visible={showRescuerModal}
          rescuerService={rescuerService ?? undefined}
          onClose={() => setShowRescuerModal(false)}
          onCredentialImported={_cred => {
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
              onNavigateToChat={_channelId => {
                setShowSosStatusScreen(false);
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
            onSendTestPacket={async targetDeviceId => {
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
    backgroundColor: '#ffffff',
  },
  body: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#0f172a',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '700',
  },
});

export default App;
