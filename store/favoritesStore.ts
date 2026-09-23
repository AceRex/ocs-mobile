import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

interface FavoritesState {
  favorites: string[];
  isLoaded: boolean;
  initFavorites: () => Promise<void>;
  toggleFavorite: (toolId: string) => Promise<void>;
  isFavorite: (toolId: string) => boolean;
}

const STORAGE_FILE_NAME = "ocs_mobile_favorites.json";
const DEFAULT_FAVORITES: string[] = [];

function getStoragePath(): string | null {
  try {
    const docDir = (FileSystem as any)?.documentDirectory;
    return docDir ? `${docDir}${STORAGE_FILE_NAME}` : null;
  } catch (_) {
    return null;
  }
}

async function loadPersistedFavorites(): Promise<string[]> {
  try {
    // 1. Web LocalStorage / Universal Fallback
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("ocs_mobile_favorites");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }

    // 2. Native FileSystem (iOS & Android)
    const path = getStoragePath();
    if (path) {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(path);
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (e) {
    console.warn("[favoritesStore] Failed to load favorites:", e);
  }
  return DEFAULT_FAVORITES;
}

async function savePersistedFavorites(favorites: string[]): Promise<void> {
  try {
    const payload = JSON.stringify(favorites);

    // Save to localStorage if available
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("ocs_mobile_favorites", payload);
    }

    // Save to Native FileSystem
    const path = getStoragePath();
    if (path) {
      await FileSystem.writeAsStringAsync(path, payload);
    }
  } catch (e) {
    console.warn("[favoritesStore] Failed to save favorites:", e);
  }
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: DEFAULT_FAVORITES,
  isLoaded: false,

  initFavorites: async () => {
    const saved = await loadPersistedFavorites();
    set({ favorites: saved, isLoaded: true });
  },

  toggleFavorite: async (toolId: string) => {
    const current = get().favorites;
    const exists = current.includes(toolId);
    const updated = exists
      ? current.filter((id) => id !== toolId)
      : [...current, toolId];

    // Synchronously update Zustand state so UI reacts instantly
    set({ favorites: updated });
    await savePersistedFavorites(updated);
  },

  isFavorite: (toolId: string) => {
    return get().favorites.includes(toolId);
  },
}));
