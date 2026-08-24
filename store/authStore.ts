import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const AUTH_STORAGE_FILE = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}ocs_auth_session.json` : null;
const DEFAULT_API_BASE = 'https://ocs-backend.netlify.app';
const GUEST_DURATION_MS = 60 * 60 * 1000; // 1 hour in milliseconds

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  churchName?: string;
  customerType?: string;
  role?: string;
  subscriptionTier?: string;
  effectiveTier?: string;
  isTrial?: boolean;
  trialRemainingDays?: number;
  features?: string[];
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;

  // Guest 1-Hour Session States
  guestStartedAt: number;
  guestExpired: boolean;
  guestRemainingSeconds: number;
  guestRemainingMinutes: number;

  // Actions
  initAuth: () => Promise<void>;
  login: (email: string, password: string, customApiUrl?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setAuthError: (error: string | null) => void;
  syncGuestTimer: () => void;
}

// Persistent Storage Helpers (Native FileSystem + Web LocalStorage)
async function loadPersistedData(): Promise<{ token: string | null; user: AuthUser | null; guestStartedAt: number | null }> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ocs_mobile_auth');
      if (raw) return JSON.parse(raw);
    } else if (AUTH_STORAGE_FILE) {
      const info = await FileSystem.getInfoAsync(AUTH_STORAGE_FILE);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(AUTH_STORAGE_FILE);
        if (raw) return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.warn('[AuthStore] Failed to load persisted auth:', err);
  }
  return { token: null, user: null, guestStartedAt: null };
}

async function savePersistedData(data: { token: string | null; user: AuthUser | null; guestStartedAt: number }): Promise<void> {
  try {
    const serialized = JSON.stringify(data);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem('ocs_mobile_auth', serialized);
    } else if (AUTH_STORAGE_FILE) {
      await FileSystem.writeAsStringAsync(AUTH_STORAGE_FILE, serialized);
    }
  } catch (err) {
    console.warn('[AuthStore] Failed to save persisted auth:', err);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authError: null,

  guestStartedAt: Date.now(),
  guestExpired: false,
  guestRemainingSeconds: 3600,
  guestRemainingMinutes: 60,

  setAuthError: (error: string | null) => set({ authError: error }),

  syncGuestTimer: () => {
    const { isAuthenticated, guestStartedAt } = get();
    if (isAuthenticated) {
      set({ guestExpired: false, guestRemainingSeconds: 3600, guestRemainingMinutes: 60 });
      return;
    }

    const now = Date.now();
    const elapsed = now - guestStartedAt;
    const remainingMs = Math.max(0, GUEST_DURATION_MS - elapsed);
    const remainingSeconds = Math.floor(remainingMs / 1000);
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    const isExpired = remainingMs <= 0;

    set({
      guestExpired: isExpired,
      guestRemainingSeconds: remainingSeconds,
      guestRemainingMinutes: remainingMinutes,
    });
  },

  initAuth: async () => {
    set({ isLoading: true, authError: null });
    const persisted = await loadPersistedData();
    const now = Date.now();
    const guestStartedAt = persisted.guestStartedAt || now;

    // Save if this was first boot
    if (!persisted.guestStartedAt) {
      await savePersistedData({
        token: persisted.token,
        user: persisted.user,
        guestStartedAt,
      });
    }

    const isAuthenticated = !!persisted.token;
    const elapsed = now - guestStartedAt;
    const remainingMs = Math.max(0, GUEST_DURATION_MS - elapsed);
    const isExpired = !isAuthenticated && remainingMs <= 0;

    set({
      token: persisted.token,
      user: persisted.user,
      isAuthenticated,
      guestStartedAt,
      guestExpired: isExpired,
      guestRemainingSeconds: Math.floor(remainingMs / 1000),
      guestRemainingMinutes: Math.ceil(remainingMs / 60000),
      isLoading: false,
    });
  },

  login: async (email: string, password: string, customApiUrl?: string) => {
    set({ isLoading: true, authError: null });
    const baseUrl = (customApiUrl && customApiUrl.trim()) ? customApiUrl.trim().replace(/\/$/, '') : DEFAULT_API_BASE;

    try {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const message = data.message || data.error || 'Invalid credentials or login failed';
        set({ authError: message, isLoading: false });
        return { success: false, error: message };
      }

      const token = data.token;
      const user = data.user || data.data?.user || {
        id: data.userId || '1',
        name: data.name || email.split('@')[0],
        email: email.trim(),
        churchName: data.churchName,
        subscriptionTier: data.tier || 'trial',
      };

      const guestStartedAt = get().guestStartedAt;

      await savePersistedData({
        token,
        user,
        guestStartedAt,
      });

      set({
        token,
        user,
        isAuthenticated: true,
        guestExpired: false,
        isLoading: false,
        authError: null,
      });

      return { success: true };
    } catch (err: any) {
      const message = err.message || 'Network error connecting to OCS auth server';
      set({ authError: message, isLoading: false });
      return { success: false, error: message };
    }
  },

  logout: async () => {
    const guestStartedAt = get().guestStartedAt;
    await savePersistedData({
      token: null,
      user: null,
      guestStartedAt,
    });

    const now = Date.now();
    const elapsed = now - guestStartedAt;
    const remainingMs = Math.max(0, GUEST_DURATION_MS - elapsed);

    set({
      token: null,
      user: null,
      isAuthenticated: false,
      guestExpired: remainingMs <= 0,
      guestRemainingSeconds: Math.floor(remainingMs / 1000),
      guestRemainingMinutes: Math.ceil(remainingMs / 60000),
      authError: null,
    });
  },
}));
