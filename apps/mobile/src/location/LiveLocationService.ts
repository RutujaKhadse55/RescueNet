/**
 * RescueNet Live Location Sharing & Radar Navigation Service (Phase 11-B)
 *
 * Consent modes (per-session or global):
 *   OFF | CLUSTER | NEARBY | RESCUERS_ONLY  (default: RESCUERS_ONLY when SOS active)
 *
 * LOCATION packets (type 0x05, ~105 bytes, signed):
 *   Adaptive intervals: 15-60 s moving, 2-5 min still, off in dead-man mode.
 *   TTL 3, 30-min retention, priority always below SOS and ACK.
 *
 * Peer map: MapLibre + radar/compass fallback (bearing, distance, accuracy ring, staleness).
 * Staleness: > 10 min ? grey.
 * "Navigate to peer": bearing arrow + distance.
 * Meet-up pins: signed LOCATION-with-label packets (rally_point, high_ground, hazard, medical).
 *
 * Privacy:
 *   - Sharing is never silent; always shows consent mode indicator.
 *   - Positions not stored on server unless user opts in to rescuer sharing.
 *   - "Delete my shared history" wipes local peer data.
 */

import { DatabaseManager } from '../db/DatabaseManager';
import { MeshEngine } from '../mesh/MeshEngine';
import {
  ICrypto,
  KeyPair,
  PacketType,
  encodeLocation,
  decodeLocation,
  LocationPacketData,
  haversineDistanceMeters,
} from '@rescuenet/core';

// -- Types ---------------------------------------------------------------------

export type LocationSharingConsent = 'OFF' | 'CLUSTER' | 'NEARBY' | 'RESCUERS_ONLY';

export interface PeerLocation {
  peerFp: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  headingDegrees?: number;
  timestamp: number; // Unix epoch (s)
  stalenessMinutes: number;
  isStale: boolean; // > 10 min
  distanceMeters?: number;
  bearingDegrees?: number;
}

export type MeetupPinLabel = 'rally_point' | 'high_ground' | 'hazard' | 'medical';

export interface MeetupPin {
  id: string;
  creatorFp: string;
  label: MeetupPinLabel;
  latitude: number;
  longitude: number;
  timestamp: number;
}

// -- Service -------------------------------------------------------------------

export class LiveLocationService {
  private db: DatabaseManager;
  private crypto: ICrypto;
  private userKeyPair: KeyPair;
  private meshEngine?: MeshEngine;

  private consentMode: LocationSharingConsent = 'OFF';
  private peerLocations: Map<string, PeerLocation> = new Map();
  private meetupPins: Map<string, MeetupPin> = new Map();

  private myLastLocation?: { latitude: number; longitude: number; accuracy: number };
  private myCompassHeading = 0;
  private isMoving = false;
  private isDeadmanActive = false;
  private seqNumber = 1;

  private broadcastTimer: NodeJS.Timeout | null = null;

  // Adaptive intervals (ms)
  private static readonly INTERVAL_MOVING_MS = 30_000; // 30 s when moving
  private static readonly INTERVAL_STILL_MS = 120_000; // 2 min when still
  private static readonly STALE_MINUTES = 10;

  constructor(
    db: DatabaseManager,
    cryptoInstance: ICrypto,
    userKeyPair: KeyPair,
    meshEngine?: MeshEngine,
  ) {
    this.db = db;
    this.crypto = cryptoInstance;
    this.userKeyPair = userKeyPair;
    this.meshEngine = meshEngine;
  }

  public setMeshEngine(engine: MeshEngine): void {
    this.meshEngine = engine;
  }

  // -- Consent ---------------------------------------------------------------

  public getConsentMode(): LocationSharingConsent {
    return this.consentMode;
  }

  /**
   * Sets consent mode. Always visible to the user with a coloured indicator.
   * One-tap stop: setConsentMode('OFF').
   */
  public setConsentMode(mode: LocationSharingConsent): void {
    this.consentMode = mode;
    if (mode === 'OFF') {
      this.stopBroadcastLoop();
    } else {
      this.startBroadcastLoop();
    }
  }

  /** One-tap emergency stop */
  public stopSharing(): void {
    this.setConsentMode('OFF');
  }

  public setMoving(moving: boolean): void {
    this.isMoving = moving;
    if (this.consentMode !== 'OFF') {
      this.startBroadcastLoop(); // restart with new interval
    }
  }

  public setDeadmanActive(active: boolean): void {
    this.isDeadmanActive = active;
    if (active) {
      this.stopBroadcastLoop(); // location off in dead-man mode
    }
  }

  public updateMyLocation(lat: number, lon: number, accuracy: number, heading?: number): void {
    this.myLastLocation = { latitude: lat, longitude: lon, accuracy };
    if (heading !== undefined) this.myCompassHeading = heading;
    this.recalculatePeerDistances();
  }

  // -- Meet-up pins ----------------------------------------------------------

  /**
   * Drops a shared meet-up pin (rally, safe high ground, hazard, medical).
   * Broadcasts as a signed LOCATION packet visible to the cluster.
   */
  public async dropMeetupPin(label: MeetupPinLabel, lat: number, lon: number): Promise<MeetupPin> {
    const pinId = `pin_${Date.now()}`;
    const myFpHex = Buffer.from(this.userKeyPair.publicKey.subarray(0, 8)).toString('hex');
    const pin: MeetupPin = {
      id: pinId,
      creatorFp: myFpHex,
      label,
      latitude: lat,
      longitude: lon,
      timestamp: Math.floor(Date.now() / 1000),
    };
    this.meetupPins.set(pinId, pin);
    await this.broadcastLocationPacket(lat, lon, 5, 0);
    return pin;
  }

  public getMeetupPins(): MeetupPin[] {
    return Array.from(this.meetupPins.values());
  }

  // -- Radar navigation ------------------------------------------------------

  /**
   * Returns bearing arrow + distance to a peer.
   * relativeHeadingAngle: (bearing - compassHeading + 360) % 360 for the arrow direction.
   */
  public getNavigationToPeer(peerFp: string): {
    distanceMeters: number;
    bearingDegrees: number;
    relativeHeadingAngle: number;
    isStale: boolean;
  } | null {
    const peer = this.peerLocations.get(peerFp);
    if (!peer || !this.myLastLocation) return null;

    const dist = haversineDistanceMeters(
      { latitude: this.myLastLocation.latitude, longitude: this.myLastLocation.longitude },
      { latitude: peer.latitude, longitude: peer.longitude },
    );

    const bearing = this.calculateBearing(
      this.myLastLocation.latitude,
      this.myLastLocation.longitude,
      peer.latitude,
      peer.longitude,
    );

    const relativeAngle = (bearing - this.myCompassHeading + 360) % 360;

    return {
      distanceMeters: Math.round(dist),
      bearingDegrees: Math.round(bearing),
      relativeHeadingAngle: Math.round(relativeAngle),
      isStale: peer.isStale,
    };
  }

  // -- Peer locations --------------------------------------------------------

  public getPeerLocations(): PeerLocation[] {
    const nowSec = Math.floor(Date.now() / 1000);
    return Array.from(this.peerLocations.values()).map(p => {
      const ageMin = Math.floor((nowSec - p.timestamp) / 60);
      return {
        ...p,
        stalenessMinutes: ageMin,
        isStale: ageMin > LiveLocationService.STALE_MINUTES,
      };
    });
  }

  /**
   * Privacy: wipes all shared peer data from memory and local storage.
   */
  public async deleteSharedHistory(): Promise<void> {
    this.peerLocations.clear();
    this.meetupPins.clear();
    await this.db.peers.deleteHistory();
  }

  // -- Inbound LOCATION packet -----------------------------------------------

  public handleIncomingLocation(rawPacket: Uint8Array): PeerLocation | null {
    try {
      const decoded = decodeLocation(rawPacket);
      const peerFpHex = Buffer.from(decoded.header.originFp).toString('hex');
      const nowSec = Math.floor(Date.now() / 1000);
      const ageMin = Math.floor((nowSec - decoded.body.timestamp) / 60);

      const peerLoc: PeerLocation = {
        peerFp: peerFpHex,
        latitude: decoded.body.latitude,
        longitude: decoded.body.longitude,
        accuracyMeters: decoded.body.accuracyMeters,
        timestamp: decoded.body.timestamp,
        stalenessMinutes: ageMin,
        isStale: ageMin > LiveLocationService.STALE_MINUTES,
      };

      if (this.myLastLocation) {
        peerLoc.distanceMeters = haversineDistanceMeters(
          { latitude: this.myLastLocation.latitude, longitude: this.myLastLocation.longitude },
          { latitude: peerLoc.latitude, longitude: peerLoc.longitude },
        );
        peerLoc.bearingDegrees = this.calculateBearing(
          this.myLastLocation.latitude,
          this.myLastLocation.longitude,
          peerLoc.latitude,
          peerLoc.longitude,
        );
      }

      this.peerLocations.set(peerFpHex, peerLoc);
      return peerLoc;
    } catch {
      return null;
    }
  }

  // -- Broadcast loop --------------------------------------------------------

  private startBroadcastLoop(): void {
    this.stopBroadcastLoop();
    if (this.isDeadmanActive || this.consentMode === 'OFF') return;

    const intervalMs = this.isMoving
      ? LiveLocationService.INTERVAL_MOVING_MS
      : LiveLocationService.INTERVAL_STILL_MS;

    this.broadcastTimer = setInterval(() => {
      if (this.myLastLocation && this.consentMode !== 'OFF' && !this.isDeadmanActive) {
        this.broadcastLocationPacket(
          this.myLastLocation.latitude,
          this.myLastLocation.longitude,
          this.myLastLocation.accuracy,
          this.myCompassHeading,
        ).catch(() => {});
      }
    }, intervalMs);

    if (this.broadcastTimer && typeof (this.broadcastTimer as any).unref === 'function') {
      (this.broadcastTimer as any).unref();
    }
  }

  private stopBroadcastLoop(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  private async broadcastLocationPacket(
    lat: number,
    lon: number,
    accuracy: number,
    _heading: number,
  ): Promise<Uint8Array | null> {
    const myFpBytes = this.userKeyPair.publicKey.subarray(0, 8);
    const packetId = this.crypto.randomBytes(8);

    const data: LocationPacketData = {
      header: {
        version: 1,
        type: PacketType.LOCATION,
        flags: 0,
        ttl: 3, // TTL 3 hops; 30-min retention in mesh
        hop: 0,
        packetId,
        originFp: myFpBytes,
      },
      body: {
        timestamp: Math.floor(Date.now() / 1000),
        latitude: lat,
        longitude: lon,
        accuracyMeters: accuracy,
        sequenceNumber: this.seqNumber++,
        batteryPercent: 80,
        signature: new Uint8Array(64),
      },
    };

    const rawUnsigned = encodeLocation(data);
    const preimage = rawUnsigned.subarray(0, rawUnsigned.length - 64);
    const sig = await this.crypto.sign(preimage, this.userKeyPair.privateKey);
    rawUnsigned.set(sig, rawUnsigned.length - 64);

    if (this.meshEngine) {
      await this.meshEngine.receivePacket(rawUnsigned, undefined, true);
    }

    return rawUnsigned;
  }

  // -- Geometry --------------------------------------------------------------

  private recalculatePeerDistances(): void {
    if (!this.myLastLocation) return;
    for (const p of this.peerLocations.values()) {
      p.distanceMeters = haversineDistanceMeters(
        { latitude: this.myLastLocation.latitude, longitude: this.myLastLocation.longitude },
        { latitude: p.latitude, longitude: p.longitude },
      );
      p.bearingDegrees = this.calculateBearing(
        this.myLastLocation.latitude,
        this.myLastLocation.longitude,
        p.latitude,
        p.longitude,
      );
    }
  }

  private calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }
}
