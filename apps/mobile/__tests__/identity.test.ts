import { IdentityService } from '../src/security/identity';
import { InMemoryKeyStore } from '../src/security/keystore';
import { SodiumCrypto } from '@rescuenet/core';

describe('Identity & Ephemeral Pseudonym Service', () => {
  let keystore: InMemoryKeyStore;
  let crypto: SodiumCrypto;

  beforeEach(async () => {
    keystore = new InMemoryKeyStore();
    crypto = await SodiumCrypto.getInstance();
  });

  test('generates Ed25519 root identity, SMS secret, and derives origin_fp via BLAKE2b', async () => {
    const service = await IdentityService.create(crypto, keystore);
    const identity = service.getIdentityState();

    expect(identity.masterPublicKeyHex).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(identity.masterPrivateKeyHex).toHaveLength(128); // 64 bytes Ed25519 = 128 hex chars
    expect(identity.smsSecretHex).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(identity.originFp).toHaveLength(16); // 8 bytes = 16 hex chars

    // Verify origin_fp matches BLAKE2b(masterPublicKey, 8)
    const expectedFpBytes = await crypto.blake2b(service.getMasterPublicKey(), 8);
    const expectedHex = Array.from(expectedFpBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(service.getOriginFp()).toBe(expectedHex);
  });

  test('maintains an ephemeral pool of exactly 10 rotating keypairs', async () => {
    const service = await IdentityService.create(crypto, keystore);
    const identity = service.getIdentityState();

    expect(identity.ephemeralPool).toHaveLength(10);
    expect(identity.activePoolIndex).toBe(0);

    const activeKey = service.getActiveEphemeralKey();
    expect(activeKey.poolIndex).toBe(0);
    expect(activeKey.originFp).toHaveLength(16);
    expect(new Date(activeKey.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('rotates ephemeral pseudonym every 24 hours / on demand', async () => {
    const service = await IdentityService.create(crypto, keystore);
    const key0 = service.getActiveEphemeralKey();
    expect(key0.poolIndex).toBe(0);

    const rotatedKey = await service.rotateEphemeralKey();
    expect(rotatedKey.poolIndex).toBe(1);
    expect(rotatedKey.originFp).not.toBe(key0.originFp);

    const state = service.getIdentityState();
    expect(state.activePoolIndex).toBe(1);
  });

  test('gracefully handles offline backend pre-registration as unregistered/low trust', async () => {
    const service = await IdentityService.create(crypto, keystore);

    // Call registration with unreachable port (simulating airplane mode / network down)
    const result = await service.registerWithBackend('http://127.0.0.1:59999');

    expect(result.success).toBe(false);
    expect(result.registered).toBe(false);
    expect(result.trustLevel).toBe('unregistered');

    const state = service.getIdentityState();
    expect(state.registered).toBe(false);
    expect(state.trustLevel).toBe('unregistered');
  });

  test('wiping identity completely clears stored keys', async () => {
    const service = await IdentityService.create(crypto, keystore);
    expect(await keystore.getItem('device_identity')).not.toBeNull();

    await service.wipeIdentity();
    expect(await keystore.getItem('device_identity')).toBeNull();
  });
});
