import { create } from 'zustand';
import { User, UserRole } from '../types/dashboard';

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  sessionExpiresAt: number | null;
  warningModalOpen: boolean;
  login: (email: string, role?: UserRole, token?: string) => void;
  logout: () => void;
  extendSession: () => void;
  checkSessionTimeout: () => boolean;
  setWarningModalOpen: (open: boolean) => void;
}

const STORAGE_AUTH_KEY = 'rescuenet_dashboard_auth';
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_WINDOW_MS = 2 * 60 * 1000; // 2 minutes before expiry

function loadStoredAuth(): {
  user: User | null;
  token: string | null;
  sessionExpiresAt: number | null;
} {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.sessionExpiresAt && Date.now() < data.sessionExpiresAt) {
        return data;
      }
    }
  } catch {
    // fallback
  }
  return { user: null, token: null, sessionExpiresAt: null };
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = loadStoredAuth();

  return {
    isAuthenticated: !!initial.user,
    user: initial.user,
    token: initial.token,
    sessionExpiresAt: initial.sessionExpiresAt,
    warningModalOpen: false,

    login: (email: string, role: UserRole = 'dispatcher', token?: string) => {
      const expiresAt = Date.now() + SESSION_DURATION_MS;
      const user: User = {
        id: `usr_${Date.now()}`,
        email,
        fullName:
          role === 'admin'
            ? 'NDRF Cmdr. Rajesh Sharma'
            : role === 'dispatcher'
              ? 'Duty Officer Ananya Rao'
              : role === 'rescuer'
                ? 'Team Lead Vikram Jadhav'
                : 'Observer Priya Nair',
        role,
        agencyId: '11111111-1111-1111-1111-111111111111',
        active: true,
      };

      const authData = {
        user,
        token: token || `jwt_token_${Date.now()}`,
        sessionExpiresAt: expiresAt,
      };

      try {
        localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(authData));
      } catch {
        // ignore
      }

      set({
        isAuthenticated: true,
        user,
        token: authData.token,
        sessionExpiresAt: expiresAt,
        warningModalOpen: false,
      });
    },

    logout: () => {
      try {
        localStorage.removeItem(STORAGE_AUTH_KEY);
      } catch {
        // ignore
      }
      set({
        isAuthenticated: false,
        user: null,
        token: null,
        sessionExpiresAt: null,
        warningModalOpen: false,
      });
    },

    extendSession: () => {
      const newExpiry = Date.now() + SESSION_DURATION_MS;
      set({ sessionExpiresAt: newExpiry, warningModalOpen: false });
      const current = get();
      if (current.user) {
        try {
          localStorage.setItem(
            STORAGE_AUTH_KEY,
            JSON.stringify({
              user: current.user,
              token: current.token,
              sessionExpiresAt: newExpiry,
            }),
          );
        } catch {
          // ignore
        }
      }
    },

    checkSessionTimeout: () => {
      const { sessionExpiresAt, isAuthenticated, logout } = get();
      if (!isAuthenticated || !sessionExpiresAt) return false;

      const timeLeft = sessionExpiresAt - Date.now();
      if (timeLeft <= 0) {
        logout();
        return true;
      }

      if (timeLeft <= WARNING_WINDOW_MS && !get().warningModalOpen) {
        set({ warningModalOpen: true });
      }

      return false;
    },

    setWarningModalOpen: (open: boolean) => {
      set({ warningModalOpen: open });
    },
  };
});
