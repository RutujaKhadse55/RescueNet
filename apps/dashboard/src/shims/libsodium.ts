// Browser shim for libsodium-wrappers in dashboard UI
export const ready = Promise.resolve();
export default {
  ready,
  crypto_sign_detached: () => new Uint8Array(64),
  crypto_sign_verify_detached: () => true,
  crypto_sign_keypair: () => ({ publicKey: new Uint8Array(32), privateKey: new Uint8Array(64) }),
  randombytes_buf: (len: number) => new Uint8Array(len),
};
