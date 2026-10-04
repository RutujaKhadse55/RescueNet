/**
 * GATT Fragmentation & Reassembly Engine
 * Handles transmission of binary packets across constrained BLE MTU boundaries.
 */

export const FRAGMENT_HEADER_SIZE = 6; // transferId(2) + seq(1) + total(1) + crc16(2)

/**
 * Computes CRC-16-CCITT (poly 0x1021, init 0xFFFF)
 */
export function computeCrc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    crc ^= byte << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

export interface FragmentInfo {
  transferId: number;
  seq: number;
  total: number;
  crc16: number;
  payload: Uint8Array;
}

/**
 * Parses a single GATT fragment header and payload
 */
export function parseFragment(fragment: Uint8Array): FragmentInfo {
  if (fragment.length < FRAGMENT_HEADER_SIZE) {
    throw new Error(`Fragment length ${fragment.length} < header size ${FRAGMENT_HEADER_SIZE}`);
  }
  const view = new DataView(fragment.buffer, fragment.byteOffset, fragment.byteLength);
  const transferId = view.getUint16(0, true);
  const seq = view.getUint8(2);
  const total = view.getUint8(3);
  const crc16 = view.getUint16(4, true);
  const payload = fragment.slice(FRAGMENT_HEADER_SIZE);

  return { transferId, seq, total, crc16, payload };
}

/**
 * Fragments a full packet into chunks sized to fit within the specified GATT MTU
 */
export function fragmentPacket(
  packet: Uint8Array,
  maxFragmentSize: number,
  transferId?: number,
): Uint8Array[] {
  if (maxFragmentSize <= FRAGMENT_HEADER_SIZE) {
    throw new Error(
      `MTU size ${maxFragmentSize} must be greater than header size ${FRAGMENT_HEADER_SIZE}`,
    );
  }

  const payloadCapacity = maxFragmentSize - FRAGMENT_HEADER_SIZE;
  const totalFragments = Math.ceil(packet.length / payloadCapacity);

  if (totalFragments > 255) {
    throw new Error(`Packet too large to fragment: requires ${totalFragments} fragments (max 255)`);
  }

  const tid = transferId !== undefined ? transferId : Math.floor(Math.random() * 65535);
  const crc = computeCrc16(packet);
  const fragments: Uint8Array[] = [];

  for (let seq = 0; seq < totalFragments; seq++) {
    const start = seq * payloadCapacity;
    const end = Math.min(start + payloadCapacity, packet.length);
    const chunk = packet.slice(start, end);

    const fragBuf = new Uint8Array(FRAGMENT_HEADER_SIZE + chunk.length);
    const view = new DataView(fragBuf.buffer, fragBuf.byteOffset, fragBuf.byteLength);

    view.setUint16(0, tid, true);
    view.setUint8(2, seq);
    view.setUint8(3, totalFragments);
    view.setUint16(4, crc, true);
    fragBuf.set(chunk, FRAGMENT_HEADER_SIZE);

    fragments.push(fragBuf);
  }

  return fragments;
}

/**
 * Reassembles an array of fragments into the original packet.
 * Returns null if incomplete, corrupted, or CRC16 mismatch.
 */
export function reassembleFragments(fragments: Uint8Array[]): Uint8Array | null {
  if (fragments.length === 0) return null;

  const parsed = fragments.map(f => parseFragment(f));
  const first = parsed[0]!;
  const transferId = first.transferId;
  const total = first.total;
  const expectedCrc = first.crc16;

  // Validate consistent transferId and total across all fragments
  const receivedChunks: Map<number, Uint8Array> = new Map();
  for (const item of parsed) {
    if (item.transferId !== transferId || item.total !== total || item.crc16 !== expectedCrc) {
      return null;
    }
    receivedChunks.set(item.seq, item.payload);
  }

  // Check that all sequence numbers from 0 to total-1 are present
  if (receivedChunks.size !== total) {
    return null;
  }

  let totalLength = 0;
  for (let seq = 0; seq < total; seq++) {
    const chunk = receivedChunks.get(seq);
    if (!chunk) return null;
    totalLength += chunk.length;
  }

  const packet = new Uint8Array(totalLength);
  let offset = 0;
  for (let seq = 0; seq < total; seq++) {
    const chunk = receivedChunks.get(seq)!;
    packet.set(chunk, offset);
    offset += chunk.length;
  }

  // Verify CRC16
  const actualCrc = computeCrc16(packet);
  if (actualCrc !== expectedCrc) {
    return null;
  }

  return packet;
}

/**
 * State manager tracking in-flight fragment reassembly sessions with timeout eviction
 */
export class GattReassemblySession {
  private sessions: Map<
    number,
    {
      total: number;
      crc16: number;
      received: Map<number, Uint8Array>;
      lastUpdated: number;
    }
  > = new Map();

  constructor(private readonly timeoutMs: number = 5000) {}

  public processFragment(fragmentBytes: Uint8Array, now: number = Date.now()): Uint8Array | null {
    this.evictExpired(now);

    const info = parseFragment(fragmentBytes);
    let session = this.sessions.get(info.transferId);

    if (!session) {
      session = {
        total: info.total,
        crc16: info.crc16,
        received: new Map(),
        lastUpdated: now,
      };
      this.sessions.set(info.transferId, session);
    }

    session.received.set(info.seq, info.payload);
    session.lastUpdated = now;

    if (session.received.size === session.total) {
      let totalLen = 0;
      for (let s = 0; s < session.total; s++) {
        const chunk = session.received.get(s);
        if (!chunk) return null;
        totalLen += chunk.length;
      }

      const packet = new Uint8Array(totalLen);
      let offset = 0;
      for (let s = 0; s < session.total; s++) {
        const chunk = session.received.get(s)!;
        packet.set(chunk, offset);
        offset += chunk.length;
      }

      this.sessions.delete(info.transferId);

      if (computeCrc16(packet) === session.crc16) {
        return packet;
      }
      return null;
    }

    return null;
  }

  private evictExpired(now: number): void {
    for (const [tid, session] of this.sessions.entries()) {
      if (now - session.lastUpdated > this.timeoutMs) {
        this.sessions.delete(tid);
      }
    }
  }

  public getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
