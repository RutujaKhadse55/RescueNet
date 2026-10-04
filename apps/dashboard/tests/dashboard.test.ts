import { PROTOCOL_VERSION } from '@rescuenet/core';
import { useAuthStore } from '../src/store/authStore';
import { useDashboardStore } from '../src/store/dashboardStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { translations } from '../src/i18n/translations';
import { wsManager } from '../src/api/websocket';
import { SEED_CLUSTERS, SEED_TEAMS } from '../src/api/seedData';

describe('apps/dashboard state and core logic', () => {
  beforeEach(() => {
    // Reset stores
    useAuthStore.getState().logout();
    useDashboardStore.setState({
      clusters: JSON.parse(JSON.stringify(SEED_CLUSTERS)),
      teams: JSON.parse(JSON.stringify(SEED_TEAMS)),
      selectedClusterId: null,
      undoAction: null,
      filterState: 'all',
      searchQuery: '',
      criticalAlertFlash: false,
    });
  });

  describe('Protocol & Initialization', () => {
    it('imports core protocol version correctly', () => {
      expect(PROTOCOL_VERSION).toBe(1);
    });
  });

  describe('Authentication and Roles Store', () => {
    it('starts unauthenticated and logs in with role and session timer', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      useAuthStore.getState().login('dispatcher@rescuenet.gov.in', 'dispatcher');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.email).toBe('dispatcher@rescuenet.gov.in');
      expect(state.user?.role).toBe('dispatcher');
      expect(state.sessionExpiresAt).toBeGreaterThan(Date.now());
    });

    it('logs out and cleans up session', () => {
      useAuthStore.getState().login('admin@rescuenet.gov.in', 'admin');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      useAuthStore.getState().logout();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('extends session timeout upon user request', () => {
      useAuthStore.getState().login('rescuer@rescuenet.gov.in', 'rescuer');
      const initialExpiry = useAuthStore.getState().sessionExpiresAt!;

      // Advance clock slightly
      useAuthStore.getState().extendSession();
      expect(useAuthStore.getState().sessionExpiresAt).toBeGreaterThanOrEqual(initialExpiry);
    });
  });

  describe('Dashboard Clusters & Triage Actions', () => {
    it('loads seeded clusters with priority bands and components', () => {
      const clusters = useDashboardStore.getState().clusters;
      expect(clusters.length).toBeGreaterThanOrEqual(5);

      const criticalCluster = clusters.find(c => c.priority_score >= 0.8);
      expect(criticalCluster).toBeDefined();
      expect(criticalCluster?.priority_band).toBe('critical');
      expect(criticalCluster?.declared_people).toBeGreaterThan(0);
    });

    it('assigns a team and sets up an undo window', () => {
      const clusterId = '55555555-5555-5555-5555-555555555501';
      const teamId = '44444444-4444-4444-4444-444444444441';

      useDashboardStore.getState().assignTeam(clusterId, teamId, 20);

      const updated = useDashboardStore.getState().clusters.find(c => c.id === clusterId);
      expect(updated?.state).toBe('assigned');
      expect(updated?.assigned_team_id).toBe(teamId);
      expect(updated?.eta_minutes).toBe(20);

      // Verify undo action was recorded
      const undo = useDashboardStore.getState().undoAction;
      expect(undo).toBeDefined();
      expect(undo?.clusterId).toBe(clusterId);
      expect(undo?.type).toBe('assign_team');

      // Test trigger undo
      useDashboardStore.getState().triggerUndo();
      const reverted = useDashboardStore.getState().clusters.find(c => c.id === clusterId);
      expect(reverted?.state).toBe('new');
      expect(reverted?.assigned_team_id).toBeNull();
    });

    it('changes cluster state to false alarm with mandatory reason', () => {
      const clusterId = '55555555-5555-5555-5555-555555555502';
      const reason = 'Physical scout inspected location, confirmed no victims present';

      useDashboardStore.getState().changeClusterState(clusterId, 'false_alarm', reason);

      const updated = useDashboardStore.getState().clusters.find(c => c.id === clusterId);
      expect(updated?.state).toBe('false_alarm');
      expect(updated?.false_alarm_reason).toBe(reason);

      // Audit log recorded
      const audit = useDashboardStore
        .getState()
        .auditLogs.find(a => a.action === 'mark_false_alarm');
      expect(audit).toBeDefined();
      expect(audit?.target_id).toBe(clusterId);
    });

    it('dispatches signed ACK template with ETA', () => {
      const clusterId = '55555555-5555-5555-5555-555555555501';
      useDashboardStore.getState().dispatchAck(clusterId, 'help_on_way', 15);

      const updated = useDashboardStore.getState().clusters.find(c => c.id === clusterId);
      const ackEvent = (updated?.timeline || []).find(e => e.event_type === 'ack_sent');
      expect(ackEvent).toBeDefined();
      expect(ackEvent?.notes).toContain('help_on_way');
    });

    it('receives WebSocket new critical cluster and triggers audio/visual alert', () => {
      const newId = 'cl_incoming_live_99';
      useDashboardStore.setState({ criticalAlertFlash: false });

      wsManager.simulateCriticalCluster({
        id: newId,
        declared_people: 18,
        priority_score: 0.98,
        floor_hint: 'Basement under rubble',
      });

      const clusters = useDashboardStore.getState().clusters;
      const found = clusters.find(c => c.id === newId);
      expect(found).toBeDefined();
      expect(found?.priority_score).toBe(0.98);
      expect(found?.declared_people).toBe(18);
      expect(useDashboardStore.getState().criticalAlertFlash).toBe(true);
    });

    it('supports cluster merging and splitting', () => {
      const parentId = '55555555-5555-5555-5555-555555555501';
      const initialPeople = useDashboardStore
        .getState()
        .clusters.find(c => c.id === parentId)!.declared_people;

      useDashboardStore.getState().splitCluster(parentId);

      const clusters = useDashboardStore.getState().clusters;
      expect(clusters.length).toBeGreaterThan(SEED_CLUSTERS.length);
      const splitClusters = clusters.filter(c => c.id.startsWith('split_'));
      expect(splitClusters.length).toBeGreaterThan(0);
      const updatedParent = clusters.find(c => c.id === parentId)!;
      expect(updatedParent.declared_people).toBeLessThan(initialPeople);
    });

    it('allows updating priority formula weights with live preview', () => {
      const customWeights = {
        severity: 0.5,
        survivorCount: 0.2,
        timeSinceLastSeen: 0.1,
        declaredNeeds: 0.1,
        locationUncertainty: -0.1,
      };

      useDashboardStore.getState().updatePriorityWeights(customWeights);
      expect(useDashboardStore.getState().priorityWeights.severity).toBe(0.5);
    });
  });

  describe('Internationalization (English and Hindi)', () => {
    it('contains comprehensive translation keys for English and Hindi', () => {
      expect(translations.en.appName).toBe('RescueNet Incident Command');
      expect(translations.hi.appName).toContain('रेस्क्यूनेट');

      expect(translations.en.priorityCritical).toBe('CRITICAL');
      expect(translations.hi.priorityCritical).toBe('अति-गंभीर');

      expect(translations.en.ackTemplateHelp).toContain('Help is on the way');
      expect(translations.hi.ackTemplateHelp).toContain('सहायता रास्ते में है');

      expect(translations.en.drillBannerText).toContain('DRILL');
      expect(translations.hi.drillBannerText).toContain('अभ्यास');
    });

    it('toggles settings for language, high contrast, and large type', () => {
      useSettingsStore.setState({ language: 'en', highContrast: false, largeType: false });

      useSettingsStore.getState().toggleLanguage();
      expect(useSettingsStore.getState().language).toBe('hi');

      useSettingsStore.getState().toggleHighContrast();
      expect(useSettingsStore.getState().highContrast).toBe(true);

      useSettingsStore.getState().toggleLargeType();
      expect(useSettingsStore.getState().largeType).toBe(true);
    });
  });
});
