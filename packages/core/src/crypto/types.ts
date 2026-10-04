/**
 * RescueNet Cryptographic Abstraction Interface
 * Isolates cryptographic primitives (Ed25519, BLAKE2b, HMAC/auth, secure random)
 * allowing libsodium-wrappers on Node/Dashboard and react-native-libsodium on Mobile.
 */

export interface KeyPair {
  publicKey: Uint8Array; // 32 bytes
  privateKey: Uint8Array; // 64 bytes (seed + pubkey)
}

export interface ICrypto {
  /**
   * Generates a new Ed25519 signing keypair
   */
  generateKeyPair(): Promise<KeyPair>;

  /**
   * Signs a message using Ed25519
   * Returns a 64-byte signature
   */
  sign(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;

  /**
   * Verifies an Ed25519 signature
   */
  verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean>;

  /**
   * Computes BLAKE2b hash with variable digest length (default 32 bytes)
   */
  blake2b(data: Uint8Array, outLength?: number, key?: Uint8Array): Promise<Uint8Array>;

  /**
   * Generates cryptographically secure random bytes
   */
  randomBytes(length: number): Uint8Array;

  /**
   * Computes keyed message authentication tag (HMAC / crypto_auth)
   */
  hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array>;
}
