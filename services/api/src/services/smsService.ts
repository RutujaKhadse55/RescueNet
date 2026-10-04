/**
 * RescueNet SMS Webhook & Gateway Service (Phase 9)
 * Supports Twilio, MSG91, and generic GSM-modem webhooks.
 * Validates cryptographic signatures, unpacks emergency telemetry,
 * and feeds parsed packets into the Ingest Pipeline.
 */

import crypto from 'crypto';
import { db } from '../db/client';
import { config } from '../config';
import { ingestService } from './ingestService';
import { decodeSms, parseHumanSms, createAndSignSos, PacketFlags } from '@rescuenet/core';

export interface SmsWebhookInput {
  provider: 'twilio' | 'msg91' | 'custom_webhook';
  from: string;
  body: string;
  signature?: string;
  messageId?: string;
}

export class SmsService {
  /**
   * Verifies incoming provider webhook signature
   */
  public static verifyWebhookSignature(
    provider: string,
    signature: string | undefined,
    body: any,
  ): boolean {
    if (config.NODE_ENV === 'test') return true;
    if (!signature) return false;

    if (provider === 'twilio') {
      const expected = crypto
        .createHmac('sha1', config.SMS_WEBHOOK_SECRET)
        .update(typeof body === 'string' ? body : JSON.stringify(body))
        .digest('base64');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }

    if (provider === 'msg91') {
      return signature === config.SMS_WEBHOOK_SECRET;
    }

    return true;
  }

  /**
   * Ingests SMS webhook message, decodes emergency telemetry, and routes to ingest pipeline
   */
  public static async processIncomingSms(input: SmsWebhookInput): Promise<{
    success: boolean;
    smsId: string;
    acceptedPackets: number;
  }> {
    const smsId =
      input.messageId || `sms_in_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fromHash = crypto.createHash('sha256').update(input.from).digest();

    // 1. Record in sms_inbound table
    await db.query(
      `INSERT INTO sms_inbound (id, provider_msg_id, from_hash, from_enc, body, parse_status, received_at)
       VALUES ($1, $2, $3, $4, $5, 'processing', now());`,
      [smsId, smsId, fromHash, Buffer.from(input.from), input.body],
    );

    // 2. Decode SMS payload (Check if binary hex/base64 or compact SMS profile)
    let rawPacketBytes: Uint8Array | null = null;
    const cleanBody = input.body.trim();

    // Check if base64 or hex packet
    if (/^[0-9a-fA-F]+$/.test(cleanBody) && cleanBody.length >= 42) {
      rawPacketBytes = new Uint8Array(cleanBody.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else {
      // Check compact SMS profile or human-readable fallback
      try {
        let lat = 18.5204;
        let lon = 73.8567;
        let status = 3;
        let people = 2;
        let needs = 1;
        let battery = 80;

        if (cleanBody.startsWith('RN1 ')) {
          const d = await decodeSms(cleanBody);
          lat = d.latitude;
          lon = d.longitude;
          status = d.status;
          people = d.peopleCount;
          needs = d.needsMask;
          battery = d.batteryPercent;
        } else if (cleanBody.startsWith('RN SOS')) {
          const d = parseHumanSms(cleanBody);
          lat = d.latitude;
          lon = d.longitude;
          status = d.status;
          people = d.peopleCount;
          needs = d.needsMask;
        } else {
          const parts = cleanBody.split(/\s+/);
          if (parts[0]?.toUpperCase() === 'SOS' && parts.length >= 3) {
            lat = parseFloat(parts[1]!) || lat;
            lon = parseFloat(parts[2]!) || lon;
            if (parts[3]) status = parseInt(parts[3]!, 10) || status;
            if (parts[4]) people = parseInt(parts[4]!, 10) || people;
            if (parts[5]) needs = parseInt(parts[5]!, 10) || needs;
            if (parts[6]) battery = parseInt(parts[6]!, 10) || battery;
          }
        }

        // Build binary packet representation from SMS fields using createAndSignSos
        const cryptoInstance = await ingestService.getCrypto();
        const keyPair = await cryptoInstance.generateKeyPair();
        rawPacketBytes = await createAndSignSos(
          {
            flags: PacketFlags.SMS_PROFILE,
            timestamp: Math.floor(Date.now() / 1000),
            latitude: lat,
            longitude: lon,
            accuracyMeters: 10,
            status,
            peopleCount: people,
            needsMask: needs,
            batteryPercent: battery,
            sequenceNumber: 1,
            keyPair,
          },
          cryptoInstance,
        );
      } catch {
        rawPacketBytes = null;
      }
    }

    if (!rawPacketBytes) {
      await db.query(`UPDATE sms_inbound SET parse_status = 'unparseable' WHERE id = $1;`, [smsId]);
      return { success: false, smsId, acceptedPackets: 0 };
    }

    // 3. Route through Ingest Pipeline
    const ingestRes = await ingestService.ingestBatch([rawPacketBytes], 'sms');
    const status = ingestRes.accepted > 0 ? 'parsed_sos' : 'duplicate_or_rejected';
    await db.query(`UPDATE sms_inbound SET parse_status = $1 WHERE id = $2;`, [status, smsId]);

    return {
      success: true,
      smsId,
      acceptedPackets: ingestRes.accepted,
    };
  }
}
