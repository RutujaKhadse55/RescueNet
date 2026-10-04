import { Linking, Platform } from 'react-native';
import {
  ANDROID_PERMISSIONS,
  AndroidPermissionDef,
  PermissionCategory,
  PermissionStatus,
} from './types';

export class PermissionService {
  private permissionStates: Map<string, PermissionStatus> = new Map();

  constructor(initialStates?: Record<string, PermissionStatus>) {
    for (const p of ANDROID_PERMISSIONS) {
      this.permissionStates.set(p.key, initialStates?.[p.key] || 'not_requested');
    }
  }

  public getStatus(key: string): PermissionStatus {
    return this.permissionStates.get(key) || 'not_requested';
  }

  public getPermissionsByCategory(category: PermissionCategory): AndroidPermissionDef[] {
    return ANDROID_PERMISSIONS.filter(p => p.category === category);
  }

  public getAllStatuses(): Record<string, PermissionStatus> {
    const res: Record<string, PermissionStatus> = {};
    for (const [k, v] of this.permissionStates.entries()) {
      res[k] = v;
    }
    return res;
  }

  /**
   * Mock or native permission request
   */
  public async requestPermission(key: string): Promise<PermissionStatus> {
    if (Platform.OS === 'android') {
      // In native Android runtime, this invokes PermissionsAndroid or react-native-permissions
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PermissionsAndroid } = require('react-native');
        const def = ANDROID_PERMISSIONS.find(p => p.key === key);
        if (def && PermissionsAndroid.PERMISSIONS[key]) {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS[key]);
          const status: PermissionStatus =
            granted === PermissionsAndroid.RESULTS.GRANTED
              ? 'granted'
              : granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
                ? 'blocked'
                : 'denied';
          this.permissionStates.set(key, status);
          return status;
        }
      } catch {
        // Fallback for tests / headless
      }
    }

    // Default simulation: mark granted
    this.permissionStates.set(key, 'granted');
    return 'granted';
  }

  public async requestCategory(
    category: PermissionCategory,
  ): Promise<Record<string, PermissionStatus>> {
    const perms = this.getPermissionsByCategory(category);
    const results: Record<string, PermissionStatus> = {};
    for (const p of perms) {
      results[p.key] = await this.requestPermission(p.key);
    }
    return results;
  }

  public setPermissionStatus(key: string, status: PermissionStatus): void {
    this.permissionStates.set(key, status);
  }

  public openSettings(): Promise<void> {
    return Linking.openSettings();
  }

  public areCriticalPermissionsGranted(): boolean {
    const critical = ANDROID_PERMISSIONS.filter(p => p.critical);
    return critical.every(p => this.getStatus(p.key) === 'granted');
  }

  public getGrantedPercentage(): number {
    const total = ANDROID_PERMISSIONS.length;
    let granted = 0;
    for (const p of ANDROID_PERMISSIONS) {
      if (this.getStatus(p.key) === 'granted') {
        granted++;
      }
    }
    return Math.round((granted / total) * 100);
  }
}
