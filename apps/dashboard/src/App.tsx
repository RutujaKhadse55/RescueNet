import React from 'react';
import {
  ShieldAlert,
  Building2,
  Compass,
  RotateCcw,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { useRescueStore, Role } from './store/rescueStore';
import { AdminControlCenter } from './components/admin/AdminControlCenter';
import { RescuerView } from './components/rescuer/RescuerView';

export function App() {
  const {
    currentRole,
    setRole,
    sosList,
    resetDemo,
  } = useRescueStore();

  const pendingSosCount = sosList.filter((s) => s.status === 'Pending').length;
  const teamAlphaAssignedCount = sosList.filter(
    (s) => s.assignedTeam === 'Rescue Team Alpha' && s.status !== 'Resolved',
  ).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* ========================================================
          TOP HEADER: BRAND & DUAL-ROLE SWITCHER (ADMIN & RESCUER)
      ======================================================== */}
      <header
        style={{
          height: '60px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.5rem',
          flexShrink: 0,
          zIndex: 100,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={20} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a' }}>
              RescueNet Command
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
              Tactical Disaster Response & Field Dispatch System
            </div>
          </div>
        </div>

        {/* Center: The 2 Core Professional Roles (Admin & Rescuer) */}
        <div
          style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: '0.3rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            gap: '0.35rem',
          }}
          role="tablist"
          aria-label="Select Active Operations Terminal"
        >
          {/* Role 1: Admin / Control Center */}
          <button
            onClick={() => setRole('admin')}
            id="tab-role-admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 1.15rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.82rem',
              background: currentRole === 'admin' ? '#ffffff' : 'transparent',
              color: currentRole === 'admin' ? '#2563eb' : '#64748b',
              boxShadow: currentRole === 'admin' ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Building2 size={16} color={currentRole === 'admin' ? '#2563eb' : '#64748b'} />
            <span>Admin / Control Center</span>
            {pendingSosCount > 0 && (
              <span
                style={{
                  background: '#dc2626',
                  color: 'white',
                  fontSize: '0.65rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontWeight: 900,
                }}
              >
                {pendingSosCount}
              </span>
            )}
          </button>

          {/* Role 2: Rescuer / Rescue Team */}
          <button
            onClick={() => setRole('rescuer')}
            id="tab-role-rescuer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 1.15rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.82rem',
              background: currentRole === 'rescuer' ? '#ffffff' : 'transparent',
              color: currentRole === 'rescuer' ? '#16a34a' : '#64748b',
              boxShadow: currentRole === 'rescuer' ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Compass size={16} color={currentRole === 'rescuer' ? '#16a34a' : '#64748b'} />
            <span>Rescuer (Team Alpha)</span>
            {teamAlphaAssignedCount > 0 && (
              <span
                style={{
                  background: '#16a34a',
                  color: 'white',
                  fontSize: '0.65rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontWeight: 900,
                }}
              >
                {teamAlphaAssignedCount}
              </span>
            )}
          </button>
        </div>

        {/* Right Section: Mobile Survivor App Reference & Reset Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              color: '#64748b',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '0.3rem 0.65rem',
              borderRadius: '6px',
            }}
          >
            <Smartphone size={14} color="#0284c7" />
            <span>Survivor Client on <b>Android APK</b></span>
          </div>

          <button
            onClick={resetDemo}
            id="btn-reset-demo"
            title="Reset incident assignments to initial state"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#334155',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCcw size={13} />
            <span>Reset State</span>
          </button>
        </div>
      </header>

      {/* ========================================================
          ROLE VIEW CONTAINER
      ======================================================== */}
      <main style={{ flex: 1, overflow: 'hidden', padding: '0' }}>
        {currentRole === 'admin' && <AdminControlCenter />}
        {currentRole === 'rescuer' && <RescuerView />}
      </main>
    </div>
  );
}

export default App;
