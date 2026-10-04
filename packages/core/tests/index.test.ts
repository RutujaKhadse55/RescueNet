import { PROTOCOL_VERSION, isVersionCompatible, PacketType } from '../src/index';

describe('packages/core foundations', () => {
  it('should expose the current PROTOCOL_VERSION', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('should validate protocol version compatibility', () => {
    expect(isVersionCompatible(1)).toBe(true);
    expect(isVersionCompatible(2)).toBe(false);
    expect(isVersionCompatible(0)).toBe(false);
  });

  it('should have expected PacketType enumerations', () => {
    expect(PacketType.SOS).toBe(0x01);
    expect(PacketType.CHAT).toBe(0x02);
    expect(PacketType.ACK).toBe(0x03);
    expect(PacketType.DEADMAN).toBe(0x04);
    expect(PacketType.LOCATION).toBe(0x05);
    expect(PacketType.CLUSTER_SUMMARY).toBe(0x06);
    expect(PacketType.HELLO).toBe(0x07);
    expect(PacketType.CHAT_RECEIPT).toBe(0x08);
  });
});
