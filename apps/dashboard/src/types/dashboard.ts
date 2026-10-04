export type UserRole = 'viewer' | 'dispatcher' | 'rescuer' | 'admin';

export type ClusterState = 'new' | 'assigned' | 'en_route' | 'reached' | 'closed' | 'false_alarm';

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  agencyId: string;
  active: boolean;
}

export interface Incident {
  id: string;
  agency_id: string;
  name: string;
  hazard: string;
  status: 'open' | 'closed';
  is_drill: boolean;
  region?: {
    type: string;
    coordinates: number[][][];
  } | null;
  opened_at: string;
  closed_at?: string | null;
}

export interface RawPacket {
  id: string;
  packetId: string;
  hopCount: number;
  channel: 'ble_mesh' | 'sms' | 'gateway' | 'internet';
  uplinkingDeviceId: string;
  receivedAt: string;
  payloadSize: number;
}

export interface ClusterMember {
  id: string;
  device_id: string;
  lat: number;
  lon: number;
  status: number; // 0 Safe, 1 Injured, 2 Trapped, 3 Critical
  battery: number;
  reported_people: number;
  last_heard: string;
  floor_hint?: string;
}

export interface ClusterEvent {
  id: string;
  cluster_id: string;
  event_type:
    | 'created'
    | 'state_changed'
    | 'team_assigned'
    | 'ack_sent'
    | 'note_added'
    | 'merged'
    | 'false_alarm';
  actor_id?: string;
  actor_name?: string;
  notes?: string;
  created_at: string;
}

export interface TrustSignal {
  id: string;
  cluster_id: string;
  signal_type: 'signature_valid' | 'multi_witness' | 'hop_plausibility' | 'spoof_risk';
  score: number; // 0.0 - 1.0
  passed: boolean;
  details: string;
}

export interface ChatMessage {
  id: string;
  cluster_id: string;
  sender_name: string;
  sender_type: 'victim' | 'rescuer' | 'system';
  message: string;
  channel: 'ble_mesh' | 'sms' | 'satellite';
  timestamp: string;
}

export interface ScoreComponents {
  severityWeighted: number; // 0.35 * severity
  survivorCountWeighted: number; // 0.25 * count
  timeSinceLastSeenWeighted: number; // 0.15 * time
  declaredNeedsWeighted: number; // 0.15 * needs
  locationUncertaintyDeduction: number; // -0.10 * uncertainty
}

export interface Cluster {
  id: string;
  external_id?: string;
  incident_id: string;
  lat: number;
  lon: number;
  radius_m: number;
  member_count: number;
  declared_people: number;
  max_status: number; // 0: Safe, 1: Injured, 2: Trapped, 3: Critical
  needs_mask: number; // Bitmask: 1=Med, 2=Water, 4=Food, 8=Shelter, 16=Evac, 32=Mobility
  best_battery: number;
  first_seen: string;
  last_seen: string;
  floor_hint: string;
  trust_score: number;
  priority_score: number;
  priority_band: PriorityBand;
  components?: ScoreComponents;
  flags: string[]; // 'large_group', 'possibly_failing', 'low_trust', 'drill'
  state: ClusterState;
  assigned_team_id?: string | null;
  assigned_team_name?: string | null;
  eta_minutes?: number | null;
  false_alarm_reason?: string | null;
  merged_into?: string | null;
  notes?: string[];
  members?: ClusterMember[];
  timeline?: ClusterEvent[];
  trustBreakdown?: TrustSignal[];
  rawPackets?: RawPacket[];
  chatMessages?: ChatMessage[];
}

export interface Team {
  id: string;
  agency_id: string;
  name: string;
  lead_user_id?: string;
  lead_name?: string;
  lat: number;
  lon: number;
  status: 'idle' | 'assigned' | 'en_route' | 'on_scene' | 'resting';
  assigned_clusters: string[];
  last_position_at: string;
  member_count: number;
  equipment?: string[];
}

export interface GatewayNode {
  id: string;
  name: string;
  type: 'sms_modem' | 'ble_relay' | 'satellite_uplink' | 'lora_gateway';
  lat: number;
  lon: number;
  online: boolean;
  packetsRelayed: number;
  lastPing: string;
}

export interface OperationalStats {
  totalClusters: number;
  activeClusters: number;
  totalSurvivors: number;
  totalPacketsIngested: number;
  registeredDevices: number;
  timeToFirstContactMin: number;
  packetDeliveryRate: number; // percentage
  duplicateSosReduction: number; // percentage
  falseAlarmRate: number; // percentage
  ackDeliveryLatencySec: number;
  activeGateways: number;
  channelBreakdown: {
    bleMesh: number;
    sms: number;
    directInternet: number;
    gateway: number;
  };
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  user_id: string | null;
  user_name?: string;
  user_role?: UserRole;
  client_ip: string | null;
  metadata: Record<string, any>;
  at: string;
}

export interface PriorityWeightsConfig {
  severity: number; // default 0.35
  survivorCount: number; // default 0.25
  timeSinceLastSeen: number; // default 0.15
  declaredNeeds: number; // default 0.15
  locationUncertainty: number; // default -0.10
}

export interface SmsGatewayNumber {
  id: string;
  phone_number: string;
  provider: string;
  active: boolean;
  created_at: string;
}

export interface UndoAction {
  id: string;
  type: 'state_change' | 'assign_team' | 'send_ack';
  clusterId: string;
  previousState: ClusterState;
  previousTeamId?: string | null;
  description: string;
  expiresAt: number;
}
