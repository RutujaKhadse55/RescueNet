import { IDatabaseDriver } from '../driver';

export interface SettingRecord {
  key: string;
  value: string;
  updated_at: string;
}

export class SettingsRepository {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async set(key: string, value: string): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.driver.execute(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);`,
      [key, value, updatedAt]
    );
  }

  async get(key: string): Promise<string | null> {
    const res = await this.driver.execute<SettingRecord>(
      `SELECT * FROM settings WHERE key = ?;`,
      [key]
    );
    return res.rows[0]?.value ?? null;
  }

  async getAll(): Promise<Record<string, string>> {
    const res = await this.driver.execute<SettingRecord>(`SELECT * FROM settings;`);
    const result: Record<string, string> = {};
    for (const row of res.rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async remove(key: string): Promise<void> {
    await this.driver.execute(`DELETE FROM settings WHERE key = ?;`, [key]);
  }
}
