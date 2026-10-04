/**
 * RescueNet SMS Ingestion Load Test Suite (Phase 16)
 * Generates and transmits 1,000 emergency SMS reports across a 5-minute sustained window (3.33 req/sec).
 * Tests cryptographic webhook HMAC signature verification, parsing, and database ingestion.
 *
 * Usage:
 *   pnpm tsx scripts/load_test_sms.ts [--url http://localhost:3000] [--fast]
 */

import * as crypto from 'crypto';
import {
  SodiumCrypto,
  createAndSignSos,
  encodeSms,
  TriageStatus,
  NeedsBitmask,
} from '@rescuenet/core';

interface LoadTestOptions {
  apiUrl: string;
  totalMessages: number;
  durationSeconds: number;
  secret: string;
  fastMode: boolean;
}

const args = process.argv.slice(2);
const options: LoadTestOptions = {
  apiUrl: 'http://localhost:3000/v1/sms/webhook',
  totalMessages: 1000,
  durationSeconds: args.includes('--fast') ? 10 : 300, // 5 minutes default (or 10s fast benchmark)
  secret: process.env.SMS_WEBHOOK_SECRET || 'rescuenet_inbound_sms_hmac_secret_key_998877',
  fastMode: args.includes('--fast'),
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) {
    options.apiUrl = args[i + 1]!;
  }
}

async function runSmsLoadTest() {
  console.log('================================================================');
  console.log('🚀 RescueNet SMS Ingestion Load Test (Phase 16)');
  console.log(`   Target:       ${options.apiUrl}`);
  console.log(`   Messages:     ${options.totalMessages.toLocaleString()} Emergency SMS`);
  console.log(`   Duration:     ${options.durationSeconds} seconds (${(options.totalMessages / options.durationSeconds).toFixed(2)} SMS/sec sustained)`);
  console.log('================================================================\n');

  const sodium = await SodiumCrypto.getInstance();
  const testKeyPair = await sodium.generateKeyPair();

  // 1. Pre-generate 1,000 realistic SMS payloads (50% Base64 binary packets, 50% Plain human text)
  console.log('⏳ Pre-generating 1,000 emergency SMS payloads with valid cryptographic signatures...');
  const payloads: { from: string; body: string; timestamp: number }[] = [];

  for (let i = 0; i < options.totalMessages; i++) {
    const lat = 18.5204 + (Math.random() - 0.5) * 0.15;
    const lon = 73.8567 + (Math.random() - 0.5) * 0.15;
    const triage = (i % 4) as TriageStatus;
    const phone = `+9198${(10000000 + i).toString()}`;

    if (i % 2 === 0) {
      // Binary Base64URL SMS
      const originFp = await sodium.blake2b(testKeyPair.publicKey, 8);
      const encoded = await encodeSms(
        {
          originFp,
          timestamp: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 60),
          latitude: lat,
          longitude: lon,
          accuracyMeters: 12,
          status: triage,
          peopleCount: (i % 5) + 1,
          needsMask: NeedsBitmask.WATER | NeedsBitmask.MEDICAL,
          batteryPercent: 75,
          sequenceNumber: 1,
          nonce: Math.floor(Math.random() * 1000000),
          altitudeMeters: 50,
        },
        null,
        sodium
      );
      payloads.push({ from: phone, body: encoded, timestamp: Math.floor(Date.now() / 1000) });
    } else {
      // Natural language human SMS
      const humanText = `SOS ${lat.toFixed(4)} ${lon.toFixed(4)} trapped ${(i % 3) + 1} people need water and first aid`;
      payloads.push({ from: phone, body: humanText, timestamp: Math.floor(Date.now() / 1000) });
    }
  }

  console.log('✓ 1,000 payloads generated.');

  // 2. Execute Load Test
  const latenciesMs: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  const startTime = Date.now();
  const delayBetweenRequestsMs = (options.durationSeconds * 1000) / options.totalMessages;

  console.log(`\n⏳ Streaming SMS ingestion load... (Pacing: ~${delayBetweenRequestsMs.toFixed(1)} ms between requests)`);

  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i]!;
    const bodyJson = JSON.stringify({
      from: p.from,
      body: p.body,
      timestamp: p.timestamp,
      provider: 'load_test_suite',
    });

    const hmacSig = crypto
      .createHmac('sha256', options.secret)
      .update(bodyJson)
      .digest('hex');

    const reqStart = Date.now();
    try {
      const resp = await fetch(options.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rescue-signature': hmacSig,
          'x-provider': 'synthetic_load',
        },
        body: bodyJson,
      });

      const reqDuration = Date.now() - reqStart;
      latenciesMs.push(reqDuration);

      if (resp.ok) {
        successfulRequests++;
      } else {
        failedRequests++;
      }
    } catch {
      // Local server might be offline or mocked
      latenciesMs.push(Date.now() - reqStart);
      failedRequests++;
    }

    if (!options.fastMode && delayBetweenRequestsMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenRequestsMs));
    }

    if ((i + 1) % 100 === 0 || i === payloads.length - 1) {
      process.stdout.write(`   Sent ${i + 1}/${options.totalMessages} (${successfulRequests} OK, ${failedRequests} Fail)...\r`);
    }
  }

  const totalTimeSeconds = (Date.now() - startTime) / 1000;
  latenciesMs.sort((a, b) => a - b);
  const medianLatency = latenciesMs.length > 0 ? latenciesMs[Math.floor(latenciesMs.length * 0.5)]! : 0;
  const p95Latency = latenciesMs.length > 0 ? latenciesMs[Math.floor(latenciesMs.length * 0.95)]! : 0;
  const p99Latency = latenciesMs.length > 0 ? latenciesMs[Math.floor(latenciesMs.length * 0.99)]! : 0;

  console.log('\n\n================================================================');
  console.log('📊 RESCUENET SMS LOAD TEST RESULTS');
  console.log('================================================================');
  console.log(`Total Transmitted:    ${payloads.length.toLocaleString()} SMS`);
  console.log(`Successful Ingested:  ${successfulRequests.toLocaleString()} (${((successfulRequests / payloads.length) * 100).toFixed(1)}%)`);
  console.log(`Failed / Rejected:    ${failedRequests.toLocaleString()}`);
  console.log(`Total Duration:       ${totalTimeSeconds.toFixed(2)} seconds`);
  console.log(`Achieved Throughput:  ${(payloads.length / totalTimeSeconds).toFixed(2)} SMS/second`);
  console.log(`Median Latency:       ${medianLatency} ms`);
  console.log(`p95 Latency:          ${p95Latency} ms`);
  console.log(`p99 Latency:          ${p99Latency} ms`);
  console.log('================================================================\n');
}

runSmsLoadTest().catch((err) => {
  console.error('Load test runner failed:', err);
  process.exit(1);
});
