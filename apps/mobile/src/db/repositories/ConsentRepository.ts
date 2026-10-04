import { IDatabaseDriver } from '../driver';

export interface ConsentData {
  shareGpsLocation: boolean;
  shareTriageStatus: boolean;
  shareBatteryLevel: boolean;
  enableOptionalChat: boolean;
  enableLiveLocationSharing: boolean;
  optInName?: string;
  optInPhone?: string;
}

export interface ConsentRecord {
  version: number;
  consented_at: string;
  json_data: string;
}

export class ConsentRepository {
  private driver: IDatabaseDriver;
  public static readonly CURRENT_CONSENT_VERSION = 1;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async saveConsent(version: number, data: ConsentData): Promise<void> {
    const timestamp = new Date().toISOString();
    const jsonData = JSON.stringify(data);
    await this.driver.execute(
      `INSERT OR REPLACE INTO consent (version, consented_at, json_data)
       VALUES (?, ?, ?);`,
      [version, timestamp, jsonData]
    );
  }

  async getLatestConsent(): Promise<{ version: number; consented_at: string; data: ConsentData } | null> {
    const res = await this.driver.execute<ConsentRecord>(
      `SELECT * FROM consent ORDER BY version DESC LIMIT 1;`
    );
    const row = res.rows[0];
    if (!row) return null;
    try {
      return {
        version: row.version,
        consented_at: row.consented_at,
        data: JSON.parse(row.json_data) as ConsentData,
      };
    } catch {
      return null;
    }
  }

  async hasValidConsent(): Promise<boolean> {
    const latest = await this.getLatestConsent();
    if (!latest) return false;
    return latest.version >= ConsentRepository.CURRENT_CONSENT_VERSION;
  }

  async wipeConsent(): Promise<void> {
    await this.driver.execute(`DELETE FROM consent;`);
  }
}
