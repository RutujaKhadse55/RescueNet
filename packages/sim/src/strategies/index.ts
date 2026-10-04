/**
 * RescueNet Simulation Strategies (Phase 15)
 *
 * Implements and compares four routing strategies:
 * 1. Plain Flooding: Naive blind re-broadcast to all neighbors; zero clustering, zero budget limits.
 * 2. Epidemic with TTL: Gossip with hop-decrement TTL=5 and duplicate packet suppression.
 * 3. Binary Spray-and-Wait: L=8 tokens halved upon encounters; direct delivery when L=1.
 * 4. RescueNet Full: Spatial clustering (DBSCAN 40m), carrier budgets (64KB/16KB),
 *    priority queues, battery-aware backoff (BEACON_ONLY at <=15%).
 */

import { SimNode, SimPacketCopy, SimulationStrategy } from '../models/types';
import { BatteryModel } from '../models/battery';

export class StrategyExecutor {
  constructor(private batteryModel: BatteryModel) {}

  /**
   * Executes contact exchange between sender and receiver under the chosen strategy.
   * Returns number of successful packet deliveries directly to a gateway.
   */
  public executeExchange(
    strategy: SimulationStrategy,
    sender: SimNode,
    receiver: SimNode,
    _nowSec: number,
  ): { gatewayDeliveries: SimPacketCopy[]; transmissions: number; bytesSent: number } {
    const gatewayDeliveries: SimPacketCopy[] = [];
    let transmissions = 0;
    let bytesSent = 0;

    if (!sender.isAlive || !receiver.isAlive) {
      return { gatewayDeliveries, transmissions, bytesSent };
    }

    // Battery-aware constraint in RescueNet Full: nodes in survival mode do not relay
    if (strategy === 'rescuenet_full') {
      if (sender.isInSurvivalMode && receiver.role !== 'gateway') {
        return { gatewayDeliveries, transmissions, bytesSent };
      }
    }

    const senderBuffer = [...sender.buffer];

    // Priority sorting in RescueNet Full: High priority (SOS) first
    if (strategy === 'rescuenet_full') {
      senderBuffer.sort((a, b) => b.packet.priority - a.packet.priority);
    }

    // Role-based byte budget in RescueNet Full: 64 KB for rescuers/gateways, 16 KB for survivors
    let byteBudget = 999999999;
    if (strategy === 'rescuenet_full') {
      byteBudget = sender.role === 'rescuer' || receiver.role === 'rescuer' ? 65536 : 16384;
    }

    let bytesTransferredThisSession = 0;

    for (const item of senderBuffer) {
      if (bytesTransferredThisSession + item.packet.sizeBytes > byteBudget) {
        break;
      }

      // Fast O(1) check if receiver already has this packet
      const alreadyHas = receiver.seenPacketIds.has(item.packet.packetId);

      switch (strategy) {
        case 'plain_flooding': {
          // Plain flooding re-transmits blindly on every contact
          transmissions++;
          bytesSent += item.packet.sizeBytes;
          bytesTransferredThisSession += item.packet.sizeBytes;
          this.batteryModel.recordTransmission(sender, item.packet.sizeBytes);
          this.batteryModel.recordReception(receiver, item.packet.sizeBytes);

          if (receiver.role === 'gateway') {
            gatewayDeliveries.push(item);
          } else if (!alreadyHas && receiver.buffer.length < 100) {
            receiver.seenPacketIds.add(item.packet.packetId);
            receiver.buffer.push({
              packet: item.packet,
              sprayTokens: 1,
              ttlHops: 99,
              hopCount: item.hopCount + 1,
            });
          }
          break;
        }

        case 'epidemic_ttl': {
          if (!alreadyHas && item.ttlHops > 0) {
            transmissions++;
            bytesSent += item.packet.sizeBytes;
            bytesTransferredThisSession += item.packet.sizeBytes;
            this.batteryModel.recordTransmission(sender, item.packet.sizeBytes);
            this.batteryModel.recordReception(receiver, item.packet.sizeBytes);

            if (receiver.role === 'gateway') {
              gatewayDeliveries.push(item);
            } else if (receiver.buffer.length < 100) {
              receiver.seenPacketIds.add(item.packet.packetId);
              receiver.buffer.push({
                packet: item.packet,
                sprayTokens: 1,
                ttlHops: item.ttlHops - 1,
                hopCount: item.hopCount + 1,
              });
            }
          }
          break;
        }

        case 'spray_and_wait': {
          if (receiver.role === 'gateway') {
            // Direct delivery to destination
            transmissions++;
            bytesSent += item.packet.sizeBytes;
            bytesTransferredThisSession += item.packet.sizeBytes;
            this.batteryModel.recordTransmission(sender, item.packet.sizeBytes);
            this.batteryModel.recordReception(receiver, item.packet.sizeBytes);
            gatewayDeliveries.push(item);
          } else if (!alreadyHas && item.sprayTokens > 1 && receiver.buffer.length < 100) {
            // Spray phase: split tokens
            const giveTokens = Math.floor(item.sprayTokens / 2);
            item.sprayTokens -= giveTokens;

            transmissions++;
            bytesSent += item.packet.sizeBytes;
            bytesTransferredThisSession += item.packet.sizeBytes;
            this.batteryModel.recordTransmission(sender, item.packet.sizeBytes);
            this.batteryModel.recordReception(receiver, item.packet.sizeBytes);

            receiver.seenPacketIds.add(item.packet.packetId);
            receiver.buffer.push({
              packet: item.packet,
              sprayTokens: giveTokens,
              ttlHops: item.ttlHops - 1,
              hopCount: item.hopCount + 1,
            });
          }
          break;
        }

        case 'rescuenet_full': {
          if (receiver.role === 'gateway') {
            // Direct delivery to gateway / control room
            transmissions++;
            bytesSent += item.packet.sizeBytes;
            bytesTransferredThisSession += item.packet.sizeBytes;
            this.batteryModel.recordTransmission(sender, item.packet.sizeBytes);
            this.batteryModel.recordReception(receiver, item.packet.sizeBytes);
            gatewayDeliveries.push(item);
          } else if (!alreadyHas && item.ttlHops > 0 && receiver.buffer.length < 100) {
            if (item.sprayTokens > 1) {
              // Asymmetric spray: provide larger token quota to mobile sweep rescuers
              const giveFraction = receiver.role === 'rescuer' ? 0.75 : 0.5;
              const giveTokens = Math.max(1, Math.floor(item.sprayTokens * giveFraction));
              item.sprayTokens -= giveTokens;

              transmissions++;
              bytesSent += item.packet.sizeBytes;
              bytesTransferredThisSession += item.packet.sizeBytes;
              this.batteryModel.recordTransmission(sender, item.packet.sizeBytes);
              this.batteryModel.recordReception(receiver, item.packet.sizeBytes);

              receiver.seenPacketIds.add(item.packet.packetId);
              receiver.buffer.push({
                packet: item.packet,
                sprayTokens: giveTokens,
                ttlHops: item.ttlHops - 1,
                hopCount: item.hopCount + 1,
              });
            } else if (receiver.role === 'rescuer' || receiver.role === 'carrier') {
              // Mobile carrier proxy relay during wait phase
              transmissions++;
              bytesSent += item.packet.sizeBytes;
              bytesTransferredThisSession += item.packet.sizeBytes;
              this.batteryModel.recordTransmission(sender, item.packet.sizeBytes);
              this.batteryModel.recordReception(receiver, item.packet.sizeBytes);

              receiver.seenPacketIds.add(item.packet.packetId);
              receiver.buffer.push({
                packet: item.packet,
                sprayTokens: 1,
                ttlHops: item.ttlHops - 1,
                hopCount: item.hopCount + 1,
              });
            }
          }
          break;
        }
      }
    }

    return { gatewayDeliveries, transmissions, bytesSent };
  }
}
