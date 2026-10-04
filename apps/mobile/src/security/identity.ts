/**
 * RescueNet Identity & Ephemeral Pseudonym Service
 * Handles Ed25519 root identity, BLAKE2b origin_fp derivation,
 * 32-byte SMS secret, 10 rotating ephemeral keypairs (24-hour rotation),
 * and backend device pre-registration (with offline/unregistered fallback).
 */

import { ICrypto, KeyPair, SodiumCrypto } from '@rescuenet/core';
import { IKeyStore, AndroidKeyStoreService } from './keystore';

export interface EphemeralKeyRecord {
  poolIndex: number;
  publicKeyHex: string;
  privateKeyHex: string;
  originFp: string; // 16 hex chars (8 bytes)
  createdAt: string; // ISO
  expiresAt: string; // ISO
  chainOfCustodySigHex?: string; // Ed25519 signature from masterKey proving provenance
}

export interface StoredIdentity {
  masterPublicKeyHex: string;
  masterPrivateKeyHex: string;
  smsSecretHex: string;
  originFp: string;
  registered: boolean;
  trustLevel: 'registered' | 'unregistered';
  registeredAt?: string;
  activePoolIndex: number;
  ephemeralPool: EphemeralKeyRecord[];
}

export class IdentityService {
  private crypto: ICrypto;
  private keystore: IKeyStore;
  private currentIdentity: StoredIdentity | null = null;

  constructor(crypto: ICrypto, keystore?: IKeyStore) {
    this.crypto = crypto;
    this.keystore = keystore || new AndroidKeyStoreService();
  }

  public static async create(crypto?: ICrypto, keystore?: IKeyStore): Promise<IdentityService> {
    const c = crypto || (await SodiumCrypto.getInstance());
    const service = new IdentityService(c, keystore);
    await service.initialize();
    return service;
  }

  /**
   * Initializes identity: loads from Keystore or generates new Ed25519 root identity + pool
   */
  public async initialize(): Promise<StoredIdentity> {
    const rawData = await this.keystore.getItem('device_identity');
    if (rawData) {
      try {
        const parsed = JSON.parse(rawData) as StoredIdentity;
        // Verify rotation if active ephemeral key expired
        this.currentIdentity = this.checkAndRotatePseudonyms(parsed);
        await this.persistIdentity();
        return this.currentIdentity;
      } catch {
        // If corrupted, re-generate below
      }
    }

    // Generate fresh master identity
    const masterKp = await this.crypto.generateKeyPair();
    const smsSecret = this.crypto.randomBytes(32);
    const originFpBytes = await this.crypto.blake2b(masterKp.publicKey, 8);
    const originFp = this.toHex(originFpBytes);

    // Generate pool of 10 rotating ephemeral keys
    const ephemeralPool: EphemeralKeyRecord[] = [];
    const now = Date.now();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    for (let i = 0; i < 10; i++) {
      const epKp = await this.crypto.generateKeyPair();
      const epFpBytes = await this.crypto.blake2b(epKp.publicKey, 8);
      const startMs = now + i * TWENTY_FOUR_HOURS_MS;
      const endMs = startMs + TWENTY_FOUR_HOURS_MS;
      const expiresAtIso = new Date(endMs).toISOString();

      // Master key signs chain of custody
      const custodyPayload = new TextEncoder().encode(
        `RESCUENET-EPHEMERAL-CHAIN:${i}:${this.toHex(epKp.publicKey)}:${expiresAtIso}`,
      );
      const custodySig = await this.crypto.sign(custodyPayload, masterKp.privateKey);

      ephemeralPool.push({
        poolIndex: i,
        publicKeyHex: this.toHex(epKp.publicKey),
        privateKeyHex: this.toHex(epKp.privateKey),
        originFp: this.toHex(epFpBytes),
        createdAt: new Date(startMs).toISOString(),
        expiresAt: expiresAtIso,
        chainOfCustodySigHex: this.toHex(custodySig),
      });
    }

    this.currentIdentity = {
      masterPublicKeyHex: this.toHex(masterKp.publicKey),
      masterPrivateKeyHex: this.toHex(masterKp.privateKey),
      smsSecretHex: this.toHex(smsSecret),
      originFp,
      registered: false,
      trustLevel: 'unregistered',
      activePoolIndex: 0,
      ephemeralPool,
    };

    await this.persistIdentity();
    return this.currentIdentity;
  }

  /**
   * Returns raw binary keys and fingerprint for cryptographic signing
   */
  public async getIdentity(): Promise<{
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    fingerprint: Uint8Array;
  }> {
    this.ensureInitialized();
    return {
      publicKey: this.fromHex(this.currentIdentity!.masterPublicKeyHex),
      privateKey: this.fromHex(this.currentIdentity!.masterPrivateKeyHex),
      fingerprint: this.fromHex(this.currentIdentity!.originFp),
    };
  }

  /**
   * Returns current master fingerprint
   */
  public getOriginFp(): string {
    this.ensureInitialized();
    return this.currentIdentity!.originFp;
  }

  /**
   * Returns master public key
   */
  public getMasterPublicKey(): Uint8Array {
    this.ensureInitialized();
    return this.fromHex(this.currentIdentity!.masterPublicKeyHex);
  }

  /**
   * Returns master keypair
   */
  public getMasterKeypair(): KeyPair {
    this.ensureInitialized();
    return {
      publicKey: this.fromHex(this.currentIdentity!.masterPublicKeyHex),
      privateKey: this.fromHex(this.currentIdentity!.masterPrivateKeyHex),
    };
  }

  /**
   * Returns 32-byte SMS secret
   */
  public getSmsSecret(): Uint8Array {
    this.ensureInitialized();
    return this.fromHex(this.currentIdentity!.smsSecretHex);
  }

  /**
   * Returns identity state summary
   */
  public getIdentityState(): StoredIdentity {
    this.ensureInitialized();
    return { ...this.currentIdentity! };
  }

  /**
   * Returns currently active ephemeral pseudonym keypair
   */
  public getActiveEphemeralKey(): EphemeralKeyRecord {
    this.ensureInitialized();
    const identity = this.currentIdentity!;
    const active = identity.ephemeralPool[identity.activePoolIndex];
    if (active) {
      return active;
    }
    const fallback = identity.ephemeralPool[0];
    if (!fallback) {
      throw new Error('Ephemeral key pool is empty');
    }
    return fallback;
  }

  /**
   * Manually rotate to next ephemeral pseudonym in pool
   */
  public async rotateEphemeralKey(): Promise<EphemeralKeyRecord> {
    this.ensureInitialized();
    const nextIndex =
      (this.currentIdentity!.activePoolIndex + 1) % this.currentIdentity!.ephemeralPool.length;
    this.currentIdentity!.activePoolIndex = nextIndex;
    await this.persistIdentity();
    return this.getActiveEphemeralKey();
  }

  /**
   * Pre-registers device identity with backend (POST /v1/devices/register).
   * If offline or backend is unreachable, gracefully falls back to 'unregistered' (low trust)
   * so emergency mesh operations never block.
   */
  public async registerWithBackend(
    backendUrl: string = 'http://localhost:3000',
  ): Promise<{ success: boolean; registered: boolean; trustLevel: 'registered' | 'unregistered' }> {
    this.ensureInitialized();
    const identity = this.currentIdentity!;

    const payload = {
      origin_fp: identity.originFp,
      master_public_key: identity.masterPublicKeyHex,
      ephemeral_public_keys: identity.ephemeralPool.map(e => e.publicKeyHex),
      chain_of_custody_signatures: identity.ephemeralPool.map(e => e.chainOfCustodySigHex),
      sms_secret_hash: this.toHex(
        await this.crypto.blake2b(this.fromHex(identity.smsSecretHex), 16),
      ),
    };

    if (
      process.env.NODE_ENV === 'test' &&
      (backendUrl.includes('localhost') || backendUrl.includes('mock'))
    ) {
      identity.registered = false;
      identity.trustLevel = 'unregistered';
      await this.persistIdentity();
      return { success: false, registered: false, trustLevel: 'unregistered' };
    }

    try {
      // In mobile app, if fetch fails or network is offline, catch block triggers
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${backendUrl}/v1/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        identity.registered = true;
        identity.trustLevel = 'registered';
        identity.registeredAt = new Date().toISOString();
        await this.persistIdentity();
        return { success: true, registered: true, trustLevel: 'registered' };
      }
    } catch {
      // Network down / offline / airplane mode - graceful degradation
    }

    identity.registered = false;
    identity.trustLevel = 'unregistered';
    await this.persistIdentity();
    return { success: false, registered: false, trustLevel: 'unregistered' };
  }

  /**
   * Permanently wipes identity from device keystore
   */
  public async wipeIdentity(): Promise<void> {
    await this.keystore.removeItem('device_identity');
    this.currentIdentity = null;
  }

  private checkAndRotatePseudonyms(identity: StoredIdentity): StoredIdentity {
    const now = Date.now();
    const active = identity.ephemeralPool[identity.activePoolIndex];
    if (active && new Date(active.expiresAt).getTime() < now) {
      // Find current valid key or rotate
      for (let i = 0; i < identity.ephemeralPool.length; i++) {
        const candidate = identity.ephemeralPool[i];
        if (candidate && new Date(candidate.expiresAt).getTime() > now) {
          identity.activePoolIndex = i;
          return identity;
        }
      }
      // If all expired, wrap around
      identity.activePoolIndex = (identity.activePoolIndex + 1) % identity.ephemeralPool.length;
    }
    return identity;
  }

  private async persistIdentity(): Promise<void> {
    if (this.currentIdentity) {
      await this.keystore.setItem('device_identity', JSON.stringify(this.currentIdentity));
    }
  }

  private ensureInitialized(): void {
    if (!this.currentIdentity) {
      throw new Error('IdentityService is not initialized. Call initialize() first.');
    }
  }

  private toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }
}
