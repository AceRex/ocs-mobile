import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_API_BASE = process.env.EXPO_PUBLIC_API_URL || '';
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
function getAuthStorageFile(): string | null {
  try {
    const docDir = (FileSystem as any)?.documentDirectory;
    return docDir ? `${docDir}ocs_mobile_auth.json` : null;
  } catch (_) {
    return null;
  }
}

async function loadPersistedData(): Promise<{ token: string | null; user: AuthUser | null; guestStartedAt: number | null }> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ocs_mobile_auth');
      if (raw) return JSON.parse(raw);
    } else {
      const storageFile = getAuthStorageFile();
      if (storageFile) {
        const info = await FileSystem.getInfoAsync(storageFile);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(storageFile);
          if (raw) {
            const legacy = JSON.parse(raw);
            const secureToken = await SecureStore.getItemAsync('ocs_mobile_token');
            const token = secureToken || legacy.token || null;
            if (legacy.token) {
              await SecureStore.setItemAsync('ocs_mobile_token', legacy.token);
              await FileSystem.writeAsStringAsync(storageFile, JSON.stringify({ ...legacy, token: null }));
            }
            return { ...legacy, token };
          }
        }
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
    } else {
      const storageFile = getAuthStorageFile();
      if (storageFile) {
        if (data.token) await SecureStore.setItemAsync('ocs_mobile_token', data.token);
        else await SecureStore.deleteItemAsync('ocs_mobile_token');
        await FileSystem.writeAsStringAsync(storageFile, JSON.stringify({ ...data, token: null }));
      }
    }
  } catch (err) {
    throw new Error('Unable to securely save your session. Please try again.');
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
    const rawBase = (customApiUrl && customApiUrl.trim()) ? customApiUrl.trim() : DEFAULT_API_BASE;
    if (!rawBase) {
      const error = 'Authentication server is not configured.';
      set({ isLoading: false, authError: error });
      return { success: false, error };
    }
    let parsedBase: URL;
    try { parsedBase = new URL(rawBase); }
    catch (_) {
      const error = 'Authentication server URL is invalid.';
      set({ isLoading: false, authError: error });
      return { success: false, error };
    }
    if (!['https:', 'http:'].includes(parsedBase.protocol) || (parsedBase.protocol !== 'https:' && !__DEV__)) {
      const error = 'Authentication requires an HTTPS server.';
      set({ isLoading: false, authError: error });
      return { success: false, error };
    }
    const cleanBase = rawBase.replace(/\/api\/?$/, '').replace(/\/$/, '');
    const endpoint = `${cleanBase}/api/auth/login`;

    let deviceId = `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const savedId = localStorage.getItem('ocs_mobile_device_id');
        if (savedId) deviceId = savedId;
        else localStorage.setItem('ocs_mobile_device_id', deviceId);
      } else if (Platform.OS !== 'web') {
        const savedId = await SecureStore.getItemAsync('ocs_mobile_device_id');
        if (savedId) deviceId = savedId;
        else await SecureStore.setItemAsync('ocs_mobile_device_id', deviceId);
      }
    } catch (_) {}

    const deviceName = Platform.OS === 'ios' ? 'iPhone Companion' : Platform.OS === 'android' ? 'Android Companion' : 'Mobile Companion';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          platform: 'mobile',
          deviceId,
          deviceName,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const rawText = await response.text();
        const snippet = rawText.replace(/<[^>]*>/g, '').trim().slice(0, 120);
        if (response.status >= 500) {
          throw new Error(`Authentication server unavailable (HTTP ${response.status})`);
        }
        throw new Error(snippet || `Server returned status ${response.status}`);
      }

      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          const message = data.message || data.error || 'Invalid email or password. Please verify your credentials.';
          set({ authError: message, isLoading: false });
          return { success: false, error: message };
        }
        if (response.status >= 500) {
          const message = 'Authentication server is temporarily unavailable. Please try again shortly.';
          set({ authError: message, isLoading: false });
          return { success: false, error: message };
        }
        const message = data.message || data.error || 'Login failed. Please check your credentials.';
        set({ authError: message, isLoading: false });
        return { success: false, error: message };
      }

      const token = data.token;
      const user = data.user || data.data?.user;
      if (typeof token !== 'string' || !token || !user || typeof user.id !== 'string' || typeof user.email !== 'string') {
        throw new Error('Authentication server returned an invalid session.');
      }

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
      clearTimeout(timeoutId);
      let message = err.message || 'Network error connecting to OCS auth server';

      if (err.name === 'AbortError') {
        message = 'Connection timed out. The server took too long to respond. Please check your network connection.';
      } else if (
        message.includes('Failed to fetch') ||
        message.includes('Network request failed') ||
        message.includes('NetworkError') ||
        message.includes('ECONNREFUSED')
      ) {
        if (cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1')) {
          message = Platform.OS === 'android'
            ? "Cannot reach 'localhost' on Android. Use 'http://10.0.2.2:4000' for emulator or your computer's LAN IP (e.g. http://192.168.x.x:4000)."
            : "Cannot reach 'localhost' from a mobile device. Use your computer's LAN IP address (e.g. http://192.168.x.x:4000).";
        } else {
          message = `Unable to reach authentication server (${cleanBase}). Please check your internet connection or server address.`;
        }
      }

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
