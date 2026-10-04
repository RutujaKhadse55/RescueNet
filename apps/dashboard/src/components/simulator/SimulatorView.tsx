import React, { useState } from 'react';
import {
  Smartphone,
  Radio,
  Send,
  ShieldCheck,
  AlertTriangle,
  WifiOff,
  Signal,
  CheckCircle2,
  Navigation,
  MessageSquare,
  Volume2,
  RefreshCw,
  Compass,
  FileText,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { playDispatchChime, playCriticalClusterAlert } from '../../utils/soundEffects';

interface MeshMessage {
  id: string;
  sender: string;
  text: string;
  channel: 'ble_mesh' | 'sms' | 'internet';
  hops: number;
  timestamp: string;
}

export const SimulatorView: React.FC = () => {
  const { clusters, teams, assignTeamToCluster, selectCluster, setActiveNav } = useDashboardStore();

  // Active Network Case (1 = No Internet / BLE Mesh, 2 = 2G SMS, 3 = Online Cloud)
  const [activeCase, setActiveCase] = useState<1 | 2 | 3>(1);

  // Survivor Phone State (Phone A)
  const [survivorSosSent, setSurvivorSosSent] = useState(true);
  const [survivorAckReceived, setSurvivorAckReceived] = useState(false);
  const [ackDetails, setAckDetails] = useState<string | null>(null);
  const [survivorInputText, setSurvivorInputText] = useState('');

  // Rescuer Homing Distance (meters)
  const [homingDistance, setHomingDistance] = useState<number>(14.5);

  // Mesh Chat History
  const [messages, setMessages] = useState<MeshMessage[]>([
    {
      id: 'm1',
      sender: 'Rohan (Trapped)',
      text: 'Need medical aid! 2 adults trapped under 2nd floor debris.',
      channel: 'ble_mesh',
      hops: 1,
      timestamp: '13:10:02',
    },
    {
      id: 'm2',
      sender: 'Priya (Relay Peer)',
      text: 'Received via BLE! I am relaying your signal to approaching rescuers.',
      channel: 'ble_mesh',
      hops: 2,
      timestamp: '13:10:28',
    },
  ]);

  // Send message from Survivor Phone
  const handleSendMessage = () => {
    if (!survivorInputText.trim()) return;

    const newMsg: MeshMessage = {
      id: `m_${Date.now()}`,
      sender: 'Rohan (Trapped)',
      text: survivorInputText,
      channel: activeCase === 1 ? 'ble_mesh' : activeCase === 2 ? 'sms' : 'internet',
      hops: activeCase === 1 ? 1 : 0,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, newMsg]);
    setSurvivorInputText('');

    if (activeCase === 3) {
      playCriticalClusterAlert();
    }
  };

  // Dispatch Action from Admin side
  const handleAdminDispatchAndAck = () => {
    playDispatchChime();
    setSurvivorAckReceived(true);
    setAckDetails('NDRF Team Alpha (ETA 12 mins)');

    const ackMsg: MeshMessage = {
      id: `ack_${Date.now()}`,
      sender: 'Disaster Control Room (Admin)',
      text: '🚨 OFFICIAL ACK: NDRF Team Alpha dispatched! Keep phones safe, help is arriving.',
      channel: activeCase === 1 ? 'ble_mesh' : activeCase === 2 ? 'sms' : 'internet',
      hops: activeCase === 1 ? 2 : 0,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages(prev => [...prev, ackMsg]);
  };

  // Calculate RSSI from distance
  const currentRssi = Math.round(-40 - 20 * Math.log10(Math.max(1, homingDistance)));

  return (
    <div
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* 1. Header & The 3 Cases Control Bar */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          background:
            'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: 0,
              }}
            >
              <Radio size={22} color="var(--accent-primary)" />
              RescueNet Live Field & Network Simulator
            </h2>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
              }}
            >
              Test and demonstrate how Survivor-to-Survivor chat, Rescuer Homing, and Admin dispatch
              operate across all 3 disaster connectivity scenarios.
            </p>
          </div>

          {/* 3 Cases Selector */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              background: 'rgba(0,0,0,0.3)',
              padding: '0.3rem',
              borderRadius: '8px',
            }}
          >
            <button
              className={`btn ${activeCase === 1 ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              onClick={() => setActiveCase(1)}
              id="sim-case-1-btn"
            >
              <WifiOff size={14} />
              Case 1: No Internet (BLE Mesh)
            </button>

            <button
              className={`btn ${activeCase === 2 ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              onClick={() => setActiveCase(2)}
              id="sim-case-2-btn"
            >
              <Signal size={14} />
              Case 2: 2G SMS Fallback
            </button>

            <button
              className={`btn ${activeCase === 3 ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                fontSize: '0.8rem',
                padding: '0.4rem 0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              onClick={() => setActiveCase(3)}
              id="sim-case-3-btn"
            >
              <Radio size={14} />
              Case 3: Online (Control Room)
            </button>
          </div>
        </div>

        {/* Case Description Banner */}
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <strong>Current Scenario: </strong>
            {activeCase === 1 &&
              'Zero Internet, Zero Cellular. Phones communicate directly via 2.4 GHz Bluetooth Low Energy (BLE) multi-hop gossiping.'}
            {activeCase === 2 &&
              'Cellular data is down, but basic 2G voice tower exists. Emergency packets compress into single 160-char SMS text.'}
            {activeCase === 3 &&
              'Internet or Satellite link is active. Mesh gateway directly streams survivor data into the Command Center Leaflet map.'}
          </div>
          <span className="badge badge-info" style={{ textTransform: 'uppercase' }}>
            {activeCase === 1
              ? 'BLE Hopping Active'
              : activeCase === 2
                ? 'GSM SMS Mode'
                : 'WebSocket Online'}
          </span>
        </div>
      </div>

      {/* 2. Three Interactive Device Panels Side-by-Side */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          flex: 1,
        }}
      >
        {/* ========================================================
            PHONE 1: SURVIVOR (ROHAN)
        ======================================================== */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            background: '#0b1120',
          }}
        >
          {/* Virtual Phone Header */}
          <div
            style={{
              padding: '0.75rem 1rem',
              background: '#1e293b',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopLeftRadius: '14px',
              borderTopRightRadius: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Smartphone size={18} color="var(--accent-critical)" />
              <strong style={{ fontSize: '0.88rem' }}>Survivor Device (Rohan)</strong>
            </div>
            <span className="badge badge-critical" style={{ fontSize: '0.7rem' }}>
              {activeCase === 1
                ? 'Airplane Mode (BLE)'
                : activeCase === 2
                  ? '2G Only'
                  : 'WiFi Active'}
            </span>
          </div>

          {/* Virtual Screen Body */}
          <div
            style={{
              padding: '1rem',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {/* Status Card */}
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700 }}>
                  EMERGENCY BEACON ACTIVE
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  🔋 58% (Battery Saver)
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.25rem' }}>
                Priority: Critical (Trapped Under Rubble)
              </div>
              <div
                style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}
              >
                Location: Pune Sector 4 (18.5204° N, 73.8567° E) • 2 Victims
              </div>
            </div>

            {/* ACK Receipt Banner */}
            {survivorAckReceived ? (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle2 size={24} color="#10b981" />
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10b981' }}>
                    HELP IS ON THE WAY!
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                    {ackDetails}
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                📡 Broadcasting BLE beacon every 1.5s... Waiting for Rescuer ACK.
              </div>
            )}

            {/* Survivor-to-Survivor Chat Log */}
            <div
              style={{
                flex: 1,
                minHeight: '160px',
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
                padding: '0.6rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                ─── Offline Mesh Direct Chat ───
              </div>
              {messages.map(m => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.sender.includes('Rohan') ? 'flex-end' : 'flex-start',
                    background: m.sender.includes('Rohan')
                      ? 'rgba(59, 130, 246, 0.25)'
                      : 'rgba(255,255,255,0.1)',
                    border: m.sender.includes('Admin') ? '1px solid #10b981' : 'none',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '8px',
                    maxWidth: '85%',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: m.sender.includes('Admin') ? '#10b981' : 'var(--text-secondary)',
                    }}
                  >
                    {m.sender}{' '}
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                      {m.timestamp}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', marginTop: '0.15rem' }}>{m.text}</div>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                className="form-input"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                placeholder="Type offline message to nearby phones..."
                value={survivorInputText}
                onChange={e => setSurvivorInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              />
              <button
                className="btn btn-primary"
                style={{ padding: '0.4rem 0.8rem' }}
                onClick={handleSendMessage}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================
            PHONE 2: FIELD RESCUER (VIKRAM) & HOMING MODE
        ======================================================== */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            border: '2px solid rgba(16, 185, 129, 0.4)',
            background: '#0b1120',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.75rem 1rem',
              background: '#1e293b',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopLeftRadius: '14px',
              borderTopRightRadius: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Compass size={18} color="var(--accent-success)" />
              <strong style={{ fontSize: '0.88rem' }}>Rescuer Device (Vikram - NDRF)</strong>
            </div>
            <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
              Verified CA Credential
            </span>
          </div>

          {/* Body */}
          <div
            style={{
              padding: '1rem',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {/* Homing Mode Gauge */}
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#34d399',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              >
                BLUETOOTH HOMING MODE (FINAL APPROACH)
              </div>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 800,
                  color: homingDistance < 3 ? '#10b981' : '#f59e0b',
                  margin: '0.3rem 0',
                }}
              >
                {homingDistance.toFixed(1)} meters
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Signal Strength: <strong>{currentRssi} dBm</strong>{' '}
                {homingDistance < 3 ? '🎯 TARGET LOCKED UNDER RUBBLE!' : '📡 Approaching signal...'}
              </div>

              {/* Distance Slider for Demo */}
              <div
                style={{
                  marginTop: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Far (30m)</span>
                <input
                  type="range"
                  min="0.5"
                  max="30"
                  step="0.5"
                  value={homingDistance}
                  onChange={e => setHomingDistance(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Close (0.5m)</span>
              </div>
            </div>

            {/* Quick Actions for Rescuer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Field Actions:
              </div>
              <button
                className="btn btn-success"
                style={{
                  width: '100%',
                  fontSize: '0.82rem',
                  padding: '0.55rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
                onClick={handleAdminDispatchAndAck}
              >
                <CheckCircle2 size={16} />
                Send Field Rescuer ACK (Ed25519 Signed)
              </button>

              <button
                className="btn btn-secondary"
                style={{
                  width: '100%',
                  fontSize: '0.82rem',
                  padding: '0.55rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
                onClick={() => {
                  setHomingDistance(0.8);
                  alert('Target Extricated: Marked Reached & Safe.');
                }}
              >
                <ShieldCheck size={16} />
                Mark Cluster Reached & Extricated
              </button>
            </div>

            {/* Relay Inspector */}
            <div
              style={{
                marginTop: 'auto',
                padding: '0.6rem',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '6px',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                BLE Packet Inspector:
              </div>
              <code style={{ color: '#38bdf8', fontSize: '0.7rem', wordBreak: 'break-all' }}>
                {activeCase === 2
                  ? 'SMS Payload: RN:B64:8f3c7a9... (142/160 chars, HMAC valid)'
                  : `TLV: [Type: 0x01, TTL: 9, Hops: 1, Lat: 18.5204, Lon: 73.8567, Sig: Ed25519]`}
              </code>
            </div>
          </div>
        </div>

        {/* ========================================================
            PANEL 3: ADMIN & COMMAND CENTER DISPATCH
        ======================================================== */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            border: '2px solid rgba(59, 130, 246, 0.4)',
            background: '#0b1120',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.75rem 1rem',
              background: '#1e293b',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopLeftRadius: '14px',
              borderTopRightRadius: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Radio size={18} color="var(--accent-primary)" />
              <strong style={{ fontSize: '0.88rem' }}>Admin Incident Room Action</strong>
            </div>
            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
              Dispatcher Live
            </span>
          </div>

          {/* Body */}
          <div
            style={{
              padding: '1rem',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              The control room automatically groups multi-hop survivor sightings into priority
              clusters. Click below to execute live dispatch:
            </div>

            {/* Quick Dispatch Card */}
            <div
              style={{
                padding: '0.8rem',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span className="badge badge-critical" style={{ fontSize: '0.7rem' }}>
                  Priority: 94.2 / 100
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Cluster #c-pune-01
                </span>
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: '0.4rem' }}>
                Pune Sector 4 Rubble Collapse
              </div>
              <div
                style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}
              >
                8 Trapped Survivors • Medical Assistance Required
              </div>

              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '0.75rem',
                  padding: '0.6rem',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
                onClick={handleAdminDispatchAndAck}
                id="btn-admin-dispatch-sim"
              >
                <Send size={16} />
                Dispatch NDRF Alpha & Send Mesh ACK
              </button>
            </div>

            {/* Go to Full Map View */}
            <button
              className="btn btn-secondary"
              style={{
                width: '100%',
                marginTop: 'auto',
                padding: '0.6rem',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              onClick={() => setActiveNav('map')}
            >
              <Navigation size={16} />
              Open Full Tactical Map View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
