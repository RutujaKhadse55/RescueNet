import { IDatabaseDriver } from '../driver';

export interface OutboxUplinkRecord {
  id: string;
  packet_id: string;
  payload: string;
  created_at: string;
  retry_count: number;
  status: 'pending' | 'in_progress' | 'sent' | 'failed';
}

export interface OutboxSmsRecord {
  id: string;
  destination_number: string;
  encoded_sms: string;
  created_at: string;
  retry_count: number;
  status: 'pending' | 'sent' | 'failed';
}

export class OutboxRepository {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  async queueUplink(record: OutboxUplinkRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO outbox_uplink (
        id, packet_id, payload, created_at, retry_count, status
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      [
        record.id,
        record.packet_id,
        record.payload,
        record.created_at,
        record.retry_count,
        record.status,
      ]
    );
  }

  async getPendingUplinks(): Promise<OutboxUplinkRecord[]> {
    const res = await this.driver.execute<OutboxUplinkRecord>(
      `SELECT * FROM outbox_uplink WHERE status = 'pending' ORDER BY created_at ASC;`
    );
    return res.rows;
  }

  async markUplinkSent(id: string): Promise<void> {
    await this.driver.execute(
      `UPDATE outbox_uplink SET status = 'sent' WHERE id = ?;`,
      [id]
    );
  }

  async queueSms(record: OutboxSmsRecord): Promise<void> {
    await this.driver.execute(
      `INSERT OR REPLACE INTO outbox_sms (
        id, destination_number, encoded_sms, created_at, retry_count, status
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      [
        record.id,
        record.destination_number,
        record.encoded_sms,
        record.created_at,
        record.retry_count,
        record.status,
      ]
    );
  }

  async getPendingSms(): Promise<OutboxSmsRecord[]> {
    const res = await this.driver.execute<OutboxSmsRecord>(
      `SELECT * FROM outbox_sms WHERE status = 'pending' ORDER BY created_at ASC;`
    );
    return res.rows;
  }

  async markSmsSent(id: string): Promise<void> {
    await this.driver.execute(
      `UPDATE outbox_sms SET status = 'sent' WHERE id = ?;`,
      [id]
    );
  }
}
