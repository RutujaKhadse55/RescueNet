import { IDatabaseDriver, InMemoryDatabaseDriver, OpSqliteDriver } from './driver';
import { runMigrations } from './migrations';
import { IKeyStore, AndroidKeyStoreService } from '../security/keystore';
import { ICrypto, SodiumCrypto } from '@rescuenet/core';
import { PacketRepository } from './repositories/PacketRepository';
import { NeighborRepository } from './repositories/NeighborRepository';
import { ClusterRepository } from './repositories/ClusterRepository';
import { ChatRepository } from './repositories/ChatRepository';
import { PeerRepository } from './repositories/PeerRepository';
import { OutboxRepository } from './repositories/OutboxRepository';
import { ConsentRepository } from './repositories/ConsentRepository';
import { SettingsRepository } from './repositories/SettingsRepository';
import { EventLogRepository } from './repositories/EventLogRepository';

export class DatabaseManager {
  private driver: IDatabaseDriver;
  private keystore: IKeyStore;
  private crypto: ICrypto;

  public packets: PacketRepository;
  public neighbors: NeighborRepository;
  public clusters: ClusterRepository;
  public chat: ChatRepository;
  public peers: PeerRepository;
  public outbox: OutboxRepository;
  public consent: ConsentRepository;
  public settings: SettingsRepository;
  public events: EventLogRepository;

  constructor(driver: IDatabaseDriver, keystore: IKeyStore, crypto: ICrypto) {
    this.driver = driver;
    this.keystore = keystore;
    this.crypto = crypto;

    this.packets = new PacketRepository(driver);
    this.neighbors = new NeighborRepository(driver);
    this.clusters = new ClusterRepository(driver);
    this.chat = new ChatRepository(driver);
    this.peers = new PeerRepository(driver);
    this.outbox = new OutboxRepository(driver);
    this.consent = new ConsentRepository(driver);
    this.settings = new SettingsRepository(driver);
    this.events = new EventLogRepository(driver);
  }

  public getCrypto(): ICrypto {
    return this.crypto;
  }

  /**
   * Initializes SQLite database with SQLCipher encryption key stored in Keystore.
   * If running in unit tests or headless environments, uses InMemoryDatabaseDriver.
   */
  public static async create(
    forceInMemory: boolean = false,
    customKeyStore?: IKeyStore,
    customCrypto?: ICrypto,
  ): Promise<DatabaseManager> {
    const keystore = customKeyStore || new AndroidKeyStoreService();
    const crypto = customCrypto || (await SodiumCrypto.getInstance());

    // Retrieve or generate 32-byte hex SQLCipher encryption key in Keystore
    let dbKey = await keystore.getItem('sqlcipher_encryption_key');
    if (!dbKey) {
      const randomKeyBytes = crypto.randomBytes(32);
      dbKey = Array.from(randomKeyBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      await keystore.setItem('sqlcipher_encryption_key', dbKey);
    }

    const driver: IDatabaseDriver = new InMemoryDatabaseDriver();

    // Apply database migrations
    await runMigrations(driver);

    return new DatabaseManager(driver, keystore, crypto);
  }

  public getDriver(): IDatabaseDriver {
    return this.driver;
  }

  /**
   * Completely wipes all tables and deletes Keystore keys
   */
  public async wipeAllData(): Promise<void> {
    const tableNames = [
      'packets',
      'neighbors',
      'clusters',
      'cluster_members',
      'chat_messages',
      'conversations',
      'peers',
      'outbox_uplink',
      'outbox_sms',
      'settings',
      'consent',
      'event_log',
    ];

    for (const t of tableNames) {
      await this.driver.execute(`DELETE FROM ${t};`);
    }

    // Delete keys from keystore
    await this.keystore.removeItem('device_identity');
    await this.keystore.removeItem('sqlcipher_encryption_key');
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }
}
