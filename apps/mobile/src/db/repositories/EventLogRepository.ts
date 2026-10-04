import { IDatabaseDriver } from '../driver';

export interface EventLogRecord {
  id: string;
  event_type: string;
  details: string;
  timestamp: string;
}

export class EventLogRepository {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async logEvent(eventType: string, details: Record<string, unknown> | string): Promise<void> {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);

    await this.driver.execute(
      `INSERT INTO event_log (id, event_type, details, timestamp) VALUES (?, ?, ?, ?);`,
      [id, eventType, detailsStr, timestamp]
    );
  }

  async getRecentEvents(limit: number = 50): Promise<EventLogRecord[]> {
    const res = await this.driver.execute<EventLogRecord>(
      `SELECT * FROM event_log ORDER BY timestamp DESC LIMIT ${limit};`
    );
    return res.rows;
  }

  async clearLogs(): Promise<void> {
    await this.driver.execute(`DELETE FROM event_log;`);
  }
}
