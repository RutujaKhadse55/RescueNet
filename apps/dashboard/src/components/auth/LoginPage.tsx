import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Lock, Mail, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';
import { UserRole } from '../../types/dashboard';

export const LoginPage: React.FC = () => {
  const { login } = useAuthStore();
  const { t } = useTranslation();

  const [email, setEmail] = useState('dispatcher@rescuenet.gov.in');
  const [password, setPassword] = useState('RescueNet2024!SecurePassword');
  const [totp, setTotp] = useState('123456');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both official email and security password.');
      return;
    }
    if (!totp || totp.length < 6) {
      setError('A valid 6-digit TOTP token is mandatory for command room access.');
      return;
    }

    // Determine role from email
    let role: UserRole = 'dispatcher';
    if (email.includes('admin')) role = 'admin';
    else if (email.includes('rescuer')) role = 'rescuer';
    else if (email.includes('viewer')) role = 'viewer';

    login(email, role);
  };

  const handleQuickFill = (role: UserRole) => {
    setEmail(`${role}@rescuenet.gov.in`);
    setPassword('RescueNet2024!SecurePassword');
    setTotp('123456');
    setError(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        background: 'radial-gradient(circle at 50% 50%, #151e33 0%, #070b14 100%)',
        padding: '1.5rem',
      }}
    >
      <div
        className="modal-box"
        style={{
          maxWidth: '460px',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        }}
      >
        <div
          style={{
            padding: '2rem 2rem 1.5rem 2rem',
            textAlign: 'center',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              marginBottom: '1rem',
            }}
          >
            <ShieldAlert size={36} color="var(--accent-critical)" />
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            {t.loginTitle}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t.loginSubtitle}
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--accent-critical)',
                borderRadius: '6px',
                padding: '0.6rem 0.8rem',
                fontSize: '0.8rem',
                color: '#fca5a5',
              }}
              role="alert"
              id="login-error-message"
            >
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="input-email" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Mail size={14} />
              {t.emailLabel}
            </label>
            <input
              id="input-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="responder@rescuenet.gov.in"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="input-password" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={14} />
              {t.passwordLabel}
            </label>
            <input
              id="input-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="input-totp" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <KeyRound size={14} />
              {t.totpLabel}
            </label>
            <input
              id="input-totp"
              type="text"
              maxLength={6}
              className="form-input"
              style={{ letterSpacing: '0.25em', fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center' }}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              required
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.totpHelp}</span>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
            id="btn-login-submit"
          >
            <CheckCircle2 size={18} />
            {t.loginButton}
          </button>
        </form>

        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--border-color)',
            background: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {t.quickFill}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.2rem', fontSize: '0.72rem' }}
              onClick={() => handleQuickFill('dispatcher')}
              id="quick-fill-dispatcher"
            >
              Dispatcher
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.2rem', fontSize: '0.72rem' }}
              onClick={() => handleQuickFill('rescuer')}
              id="quick-fill-rescuer"
            >
              Rescuer
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.2rem', fontSize: '0.72rem' }}
              onClick={() => handleQuickFill('admin')}
              id="quick-fill-admin"
            >
              Admin
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.2rem', fontSize: '0.72rem' }}
              onClick={() => handleQuickFill('viewer')}
              id="quick-fill-viewer"
            >
              Viewer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
