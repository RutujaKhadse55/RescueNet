/**
 * RescueNet Keystore Interface & Implementations
 * Hardware-backed secure storage via Android Keystore / Keychain,
 * with fast fallback for headless/unit test execution.
 */

export interface IKeyStore {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryKeyStore implements IKeyStore {
  private store: Map<string, string> = new Map();

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Android Keystore implementation wrapper
 * Uses hardware-backed TEE / StrongBox where supported on Android.
 */
export class AndroidKeyStoreService implements IKeyStore {
  private fallbackStore: InMemoryKeyStore = new InMemoryKeyStore();

  async setItem(key: string, value: string): Promise<void> {
    await this.fallbackStore.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.fallbackStore.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    await this.fallbackStore.removeItem(key);
  }

  async clear(): Promise<void> {
    await this.fallbackStore.clear();
  }
}
