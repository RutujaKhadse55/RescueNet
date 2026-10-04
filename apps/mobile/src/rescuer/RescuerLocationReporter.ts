/**
 * RescueNet Rescuer Location Reporter (Phase 13)
 * Provides periodic GPS position updates from active rescuers to the control room
 * (feeding teams.last_position) over HTTP uplink or SMS fallback.
 */

import { LocationProvider, DisasterLocation } from '../location/LocationProvider';
import { DatabaseManager } from '../db/DatabaseManager';
import { RescuerCredentialService } from './RescuerCredentialService';
import { ConnectivityGovernor } from '../ble/ConnectivityGovernor';

export interface RescuerLocationReport {
  teamId?: string;
  rescuerId: string;
  badgeNumber: string;
  agencyId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: string;
}

export class RescuerLocationReporter {
  private locationProvider: LocationProvider;
  private db: DatabaseManager;
  private rescuerService: RescuerCredentialService;
  private connectivityGovernor?: ConnectivityGovernor;
  private serverBaseUrl: string;

  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private lastReportedLocation: DisasterLocation | null = null;

  constructor(
    locationProvider: LocationProvider,
    db: DatabaseManager,
    rescuerService: RescuerCredentialService,
    connectivityGovernor?: ConnectivityGovernor,
    serverBaseUrl: string = 'http://localhost:3000',
    intervalMs: number = 30000, // 30 seconds
  ) {
    this.locationProvider = locationProvider;
    this.db = db;
    this.rescuerService = rescuerService;
    this.connectivityGovernor = connectivityGovernor;
    this.serverBaseUrl = serverBaseUrl;
    this.intervalMs = intervalMs;
  }

  public setServerBaseUrl(url: string): void {
    this.serverBaseUrl = url;
  }

  public setIntervalMs(ms: number): void {
    this.intervalMs = ms;
  }

  public startReporting(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.reportCurrentPosition().catch(() => {});
    this.timer = setInterval(() => {
      this.reportCurrentPosition().catch(() => {});
    }, this.intervalMs);
  }

  public stopReporting(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async reportCurrentPosition(): Promise<{
    success: boolean;
    mode: 'uplink' | 'sms' | 'skipped';
  }> {
    if (!this.rescuerService.isRescuer()) {
      return { success: false, mode: 'skipped' };
    }

    const cred = this.rescuerService.getActiveCredential();
    if (!cred) {
      return { success: false, mode: 'skipped' };
    }

    let loc: DisasterLocation;
    try {
      loc = await this.locationProvider.getCurrentLocation(5000);
    } catch {
      const fallback = this.locationProvider.getLastKnownLocation();
      if (!fallback) return { success: false, mode: 'skipped' };
      loc = fallback;
    }

    this.lastReportedLocation = loc;

    const report: RescuerLocationReport = {
      teamId: cred.badgeNumber, // or agency team ID
      rescuerId: cred.userId,
      badgeNumber: cred.badgeNumber,
      agencyId: cred.agencyId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracyMeters: loc.accuracyMeters,
      timestamp: new Date(loc.timestamp).toISOString(),
    };

    // 1. Check if online via ConnectivityGovernor
    const isOnline = this.connectivityGovernor
      ? this.connectivityGovernor.getNetworkState() === 'ONLINE'
      : true;

    if (isOnline) {
      try {
        const teamIdParam = encodeURIComponent(report.teamId || cred.userId);
        const res = await fetch(`${this.serverBaseUrl}/v1/teams/${teamIdParam}/position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy_meters: loc.accuracyMeters,
            timestamp: report.timestamp,
          }),
        });

        if (res.ok) {
          await this.db.events.logEvent('rescuer_location_uplinked', {
            rescuerId: cred.userId,
            lat: loc.latitude,
            lon: loc.longitude,
          });
          return { success: true, mode: 'uplink' };
        }
      } catch {
        // Fall back to SMS/outbox
      }
    }

    // 2. Offline fallback: log outbox or SMS queue
    await this.db.events.logEvent('rescuer_location_sms_fallback', {
      rescuerId: cred.userId,
      lat: loc.latitude,
      lon: loc.longitude,
    });

    return { success: true, mode: 'sms' };
  }

  public getLastReportedLocation(): DisasterLocation | null {
    return this.lastReportedLocation;
  }
}
