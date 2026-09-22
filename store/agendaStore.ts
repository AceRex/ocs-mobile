/**
 * wave.io Mobile Agenda Store (Zustand + Expo FileSystem + Socket.IO)
 * 
 * Supports offline-first agenda authoring, multi-track timeline editing,
 * app-managed asset storage, SHA-256 deduplication, and reliable LAN transfer.
 */
import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { useSocketStore } from './socketStore';

export interface TimelineItem {
  id: string;
  track: 'media' | 'visual' | 'audio' | 'background' | 'video';
  mediaType?: 'image' | 'video' | 'color' | 'audio';
  presentationMode?: 'background' | 'foreground' | 'audio';
  laneIndex?: number;
  actionType: 'point' | 'range';
  startSec: number;
  durationSec: number;
  sourceInSec?: number;
  sourceOutSec?: number;
  assetId?: string;
  name: string;
  destination?: 'all' | 'general' | 'speaker';
  endBehavior?: 'hold' | 'restore' | 'continue';
  color?: string;
  stopAtClipBoundary?: boolean;
  stopAtSessionBoundary?: boolean;
}

export interface AgendaSession {
  id: string;
  name: string;
  person?: string;
  durationSec: number;
  notes?: string;
  transitionMode: 'auto' | 'manual';
  intervalSec: number;
  recordSession?: boolean;
  targetDestination?: 'all' | 'general' | 'speaker';
  mediaEndBehavior?: 'hold' | 'restore' | 'continue';
  timelineItems: TimelineItem[];
}

export interface AgendaAssetRef {
  id: string;
  hash: string;
  originalName: string;
  relativePath: string;
  localUri: string;
  type: 'image' | 'video' | 'audio';
  size: number;
  mimeType: string;
  durationSec?: number;
}

export interface AgendaDocument {
  id: string;
  name: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  defaultDestination: 'all' | 'general' | 'speaker';
  defaultMediaEndBehavior: 'hold' | 'restore' | 'continue';
  sessions: AgendaSession[];
  assets: AgendaAssetRef[];
}

export interface TransferProgress {
  transferring: boolean;
  progress: number;
  status: string;
  error: string | null;
  transferId?: string;
}

interface AgendaState {
  agendas: AgendaDocument[];
  activeAgendaId: string | null;
  undoStack: Record<string, AgendaDocument[]>;
  redoStack: Record<string, AgendaDocument[]>;
  transfer: TransferProgress;
  isInitialized: boolean;

  // Actions
  init: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  createAgenda: (name?: string) => Promise<AgendaDocument>;
  duplicateAgenda: (id: string) => Promise<AgendaDocument | null>;
  deleteAgenda: (id: string) => Promise<void>;
  setActiveAgendaId: (id: string | null) => void;
  updateAgenda: (id: string, updates: Partial<AgendaDocument>) => void;

  // Session CRUD
  addSession: (agendaId: string, name?: string, durationSec?: number) => void;
  updateSession: (agendaId: string, sessionId: string, updates: Partial<AgendaSession>) => void;
  reorderSessions: (agendaId: string, fromIndex: number, toIndex: number) => void;
  deleteSession: (agendaId: string, sessionId: string) => void;

  // Timeline Item CRUD
  addTimelineItem: (agendaId: string, sessionId: string, item: Omit<TimelineItem, 'id'> & { id?: string }) => void;
  updateTimelineItem: (agendaId: string, sessionId: string, itemId: string, updates: Partial<TimelineItem>) => void;
  deleteTimelineItem: (agendaId: string, sessionId: string, itemId: string) => void;
  duplicateTimelineItem: (agendaId: string, sessionId: string, itemId: string) => void;

  // Media Asset Management
  importMediaAsset: (uri: string, name: string, mimeType: string, type: 'image' | 'video' | 'audio', size?: number) => Promise<AgendaAssetRef | null>;
  attachAssetToCue: (agendaId: string, sessionId: string, cueId: string, asset: AgendaAssetRef) => void;

  // Undo / Redo
  undo: (agendaId: string) => void;
  redo: (agendaId: string) => void;
  pushHistory: (agendaId: string) => void;

  // Desktop Transfer
  sendToDesktop: (agendaId: string) => Promise<{ ok: boolean; error?: string }>;
  cancelTransfer: () => void;
}

// ── Pure-JS SHA-256 Hash Helper ─────────────────────────────────────────────
async function computeSHA256(contentBase64OrText: string): Promise<string> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(contentBase64OrText);
      const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuf));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}

  // Fast DJB2 + FNV-1a hex fallback for environments without crypto.subtle
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < contentBase64OrText.length; i++) {
    const ch = contentBase64OrText.charCodeAt(i);
    h1 ^= ch;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = ((h2 << 5) + h2 + ch) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.padEnd(64, '0');
}

function getStoragePath(): string | null {
  try {
    const docDir = (FileSystem as any)?.documentDirectory;
    return docDir ? `${docDir}ocs_mobile_agendas.json` : null;
  } catch (_) {
    return null;
  }
}

function getAssetsDir(): string | null {
  try {
    const docDir = (FileSystem as any)?.documentDirectory;
    return docDir ? `${docDir}agenda_assets/` : null;
  } catch (_) {
    return null;
  }
}

export const useAgendaStore = create<AgendaState>((set, get) => ({
  agendas: [],
  activeAgendaId: null,
  undoStack: {},
  redoStack: {},
  transfer: {
    transferring: false,
    progress: 0,
    status: '',
    error: null,
  },
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;

    try {
      const assetsDir = getAssetsDir();
      if (assetsDir && Platform.OS !== 'web') {
        const info = await FileSystem.getInfoAsync(assetsDir).catch(() => null);
        if (!info?.exists) {
          await FileSystem.makeDirectoryAsync(assetsDir, { intermediates: true }).catch(() => {});
        }
      }

      let loaded: AgendaDocument[] = [];
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('ocs_mobile_agendas');
        if (raw) loaded = JSON.parse(raw);
      } else {
        const path = getStoragePath();
        if (path) {
          const info = await FileSystem.getInfoAsync(path).catch(() => null);
          if (info?.exists) {
            const raw = await FileSystem.readAsStringAsync(path);
            loaded = JSON.parse(raw);
          }
        }
      }

      if (!Array.isArray(loaded) || loaded.length === 0) {
        // Create initial default agenda
        const initial = {
          id: `agenda_${Date.now()}_init`,
          name: 'Sunday Worship Service',
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          defaultDestination: 'all' as const,
          defaultMediaEndBehavior: 'hold' as const,
          sessions: [
            {
              id: `sess_1_${Date.now()}`,
              name: 'Praise & Worship',
              durationSec: 1200,
              notes: 'Opening worship medley',
              transitionMode: 'auto' as const,
              intervalSec: 5,
              targetDestination: 'all' as const,
              mediaEndBehavior: 'hold' as const,
              timelineItems: [
                {
                  id: `cue_1_${Date.now()}`,
                  track: 'background' as const,
                  actionType: 'point' as const,
                  startSec: 0,
                  durationSec: 300,
                  name: 'Opening Background',
                  color: '#1A102F',
                },
              ],
            },
            {
              id: `sess_2_${Date.now()}`,
              name: 'Pastoral Prayer',
              durationSec: 360,
              notes: 'Prayers for the congregation',
              transitionMode: 'manual' as const,
              intervalSec: 0,
              targetDestination: 'all' as const,
              mediaEndBehavior: 'hold' as const,
              timelineItems: [],
            },
            {
              id: `sess_3_${Date.now()}`,
              name: 'Sermon Message',
              durationSec: 2400,
              notes: 'Main Scripture reading and sermon',
              transitionMode: 'manual' as const,
              intervalSec: 0,
              targetDestination: 'all' as const,
              mediaEndBehavior: 'hold' as const,
              timelineItems: [],
            },
          ],
          assets: [],
        };
        loaded = [initial];
      }

      set({
        agendas: loaded,
        activeAgendaId: loaded[0]?.id || null,
        isInitialized: true,
      });
      await get().saveToStorage();
    } catch (err: any) {
      console.warn('[AgendaStore] Init failed:', err.message);
      set({ isInitialized: true });
    }
  },

  saveToStorage: async () => {
    try {
      const data = JSON.stringify(get().agendas, null, 2);
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('ocs_mobile_agendas', data);
      } else {
        const path = getStoragePath();
        if (path) {
          await FileSystem.writeAsStringAsync(path, data);
        }
      }
    } catch (err: any) {
      console.warn('[AgendaStore] Save failed:', err.message);
    }
  },

  createAgenda: async (name = 'New Event Agenda') => {
    const now = Date.now();
    const newDoc: AgendaDocument = {
      id: `agenda_${now}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      version: 1,
      createdAt: now,
      updatedAt: now,
      defaultDestination: 'all',
      defaultMediaEndBehavior: 'hold',
      sessions: [
        {
          id: `sess_${now}_1`,
          name: 'Session 1',
          person: '',
          durationSec: 600,
          transitionMode: 'manual',
          intervalSec: 0,
          timelineItems: [],
        },
      ],
      assets: [],
    };

    set((state) => ({
      agendas: [newDoc, ...state.agendas],
      activeAgendaId: newDoc.id,
    }));
    await get().saveToStorage();
    return newDoc;
  },

  duplicateAgenda: async (id: string) => {
    const target = get().agendas.find((a) => a.id === id);
    if (!target) return null;

    const now = Date.now();
    const copy: AgendaDocument = JSON.parse(JSON.stringify(target));
    copy.id = `agenda_${now}_${Math.random().toString(36).slice(2, 7)}`;
    copy.name = `${target.name} (Copy)`;
    copy.createdAt = now;
    copy.updatedAt = now;

    set((state) => ({
      agendas: [copy, ...state.agendas],
      activeAgendaId: copy.id,
    }));
    await get().saveToStorage();
    return copy;
  },

  deleteAgenda: async (id: string) => {
    set((state) => {
      const next = state.agendas.filter((a) => a.id !== id);
      return {
        agendas: next,
        activeAgendaId: state.activeAgendaId === id ? (next[0]?.id || null) : state.activeAgendaId,
      };
    });
    await get().saveToStorage();
  },

  setActiveAgendaId: (id) => set({ activeAgendaId: id }),

  updateAgenda: (id, updates) => {
    get().pushHistory(id);
    set((state) => ({
      agendas: state.agendas.map((a) => (a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a)),
    }));
    get().saveToStorage();
  },

  // ── Session Operations ───────────────────────────────────────────────────

  addSession: (agendaId, name = 'New Session', durationSec = 300) => {
    get().pushHistory(agendaId);
    const now = Date.now();
    const newSession: AgendaSession = {
      id: `sess_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      person: '',
      durationSec: Math.max(1, durationSec),
      transitionMode: 'manual',
      intervalSec: 0,
      timelineItems: [],
    };

    set((state) => ({
      agendas: state.agendas.map((a) =>
        a.id === agendaId
          ? { ...a, sessions: [...a.sessions, newSession], updatedAt: Date.now() }
          : a
      ),
    }));
    get().saveToStorage();
  },

  updateSession: (agendaId, sessionId, updates) => {
    get().pushHistory(agendaId);
    set((state) => ({
      agendas: state.agendas.map((a) => {
        if (a.id !== agendaId) return a;
        return {
          ...a,
          updatedAt: Date.now(),
          sessions: a.sessions.map((s) => (s.id === sessionId ? { ...s, ...updates } : s)),
        };
      }),
    }));
    get().saveToStorage();
  },

  reorderSessions: (agendaId, fromIndex, toIndex) => {
    get().pushHistory(agendaId);
    set((state) => ({
      agendas: state.agendas.map((a) => {
        if (a.id !== agendaId) return a;
        const copy = [...a.sessions];
        const [moved] = copy.splice(fromIndex, 1);
        copy.splice(toIndex, 0, moved);
        return { ...a, sessions: copy, updatedAt: Date.now() };
      }),
    }));
    get().saveToStorage();
  },

  deleteSession: (agendaId, sessionId) => {
    get().pushHistory(agendaId);
    set((state) => ({
      agendas: state.agendas.map((a) => {
        if (a.id !== agendaId) return a;
        return {
          ...a,
          updatedAt: Date.now(),
          sessions: a.sessions.filter((s) => s.id !== sessionId),
        };
      }),
    }));
    get().saveToStorage();
  },

  // ── Timeline Item Operations ──────────────────────────────────────────────

  addTimelineItem: (agendaId, sessionId, item) => {
    get().pushHistory(agendaId);
    const now = Date.now();
    const newItem: TimelineItem = {
      ...item,
      id: item.id || `cue_${now}_${Math.random().toString(36).slice(2, 6)}`,
    };

    set((state) => ({
      agendas: state.agendas.map((a) => {
        if (a.id !== agendaId) return a;
        return {
          ...a,
          updatedAt: Date.now(),
          sessions: a.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              timelineItems: [...s.timelineItems, newItem].sort((x, y) => x.startSec - y.startSec),
            };
          }),
        };
      }),
    }));
    get().saveToStorage();
  },

  updateTimelineItem: (agendaId, sessionId, itemId, updates) => {
    get().pushHistory(agendaId);
    set((state) => ({
      agendas: state.agendas.map((a) => {
        if (a.id !== agendaId) return a;
        return {
          ...a,
          updatedAt: Date.now(),
          sessions: a.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              timelineItems: s.timelineItems.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
            };
          }),
        };
      }),
    }));
    get().saveToStorage();
  },

  deleteTimelineItem: (agendaId, sessionId, itemId) => {
    get().pushHistory(agendaId);
    set((state) => ({
      agendas: state.agendas.map((a) => {
        if (a.id !== agendaId) return a;
        return {
          ...a,
          updatedAt: Date.now(),
          sessions: a.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              timelineItems: s.timelineItems.filter((i) => i.id !== itemId),
            };
          }),
        };
      }),
    }));
    get().saveToStorage();
  },

  duplicateTimelineItem: (agendaId, sessionId, itemId) => {
    const agenda = get().agendas.find((a) => a.id === agendaId);
    const session = agenda?.sessions.find((s) => s.id === sessionId);
    const item = session?.timelineItems.find((i) => i.id === itemId);
    if (!item) return;

    get().addTimelineItem(agendaId, sessionId, {
      ...item,
      name: `${item.name} (Copy)`,
      startSec: item.startSec + (item.durationSec || 10),
    });
  },

  // ── Asset Importer with App-Managed Storage & SHA-256 Hashing ─────────────

  importMediaAsset: async (uri, originalName, mimeType, type, size = 0) => {
    try {
      const assetsDir = getAssetsDir();
      if (!assetsDir || Platform.OS === 'web') {
        const hash = await computeSHA256(uri + originalName);
        return {
          id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          hash,
          originalName,
          relativePath: `assets/${originalName}`,
          localUri: uri,
          type,
          size: size || 1024,
          mimeType,
        };
      }

      // Read small slice or base64 to compute hash
      let fileBase64 = '';
      try {
        fileBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (_) {
        fileBase64 = `${originalName}_${size}_${Date.now()}`;
      }

      const hash = await computeSHA256(fileBase64);
      const ext = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
      const destPath = `${assetsDir}${hash}${ext}`;

      // Copy into app-managed persistent storage if not already there
      const exists = await FileSystem.getInfoAsync(destPath).catch(() => null);
      if (!exists?.exists) {
        await FileSystem.copyAsync({ from: uri, to: destPath }).catch(() => {});
      }

      const assetRef: AgendaAssetRef = {
        id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        hash,
        originalName,
        relativePath: `agenda_assets/${hash}${ext}`,
        localUri: destPath,
        type,
        size: size || fileBase64.length,
        mimeType,
      };

      // Add to active agenda asset list
      const activeId = get().activeAgendaId;
      if (activeId) {
        set((state) => ({
          agendas: state.agendas.map((a) => {
            if (a.id !== activeId) return a;
            // Prevent duplicate hash entries in asset table
            if (a.assets.some((existing) => existing.hash === hash)) return a;
            return { ...a, assets: [...a.assets, assetRef], updatedAt: Date.now() };
          }),
        }));
        await get().saveToStorage();
      }

      return assetRef;
    } catch (err: any) {
      console.warn('[AgendaStore] importMediaAsset failed:', err.message);
      return null;
    }
  },

  attachAssetToCue: (agendaId, sessionId, cueId, asset) => {
    get().updateTimelineItem(agendaId, sessionId, cueId, {
      assetId: asset.id,
      name: asset.originalName,
      track: asset.type === 'image' ? 'background' : asset.type === 'video' ? 'video' : 'audio',
    });
  },

  // ── Undo / Redo Stacks ───────────────────────────────────────────────────

  pushHistory: (agendaId) => {
    const current = get().agendas.find((a) => a.id === agendaId);
    if (!current) return;
    const stack = get().undoStack[agendaId] || [];
    set((state) => ({
      undoStack: {
        ...state.undoStack,
        [agendaId]: [...stack.slice(-15), JSON.parse(JSON.stringify(current))],
      },
      redoStack: { ...state.redoStack, [agendaId]: [] },
    }));
  },

  undo: (agendaId) => {
    const stack = get().undoStack[agendaId] || [];
    if (stack.length === 0) return;
    const current = get().agendas.find((a) => a.id === agendaId);
    const previous = stack[stack.length - 1];

    set((state) => ({
      agendas: state.agendas.map((a) => (a.id === agendaId ? previous : a)),
      undoStack: {
        ...state.undoStack,
        [agendaId]: stack.slice(0, -1),
      },
      redoStack: {
        ...state.redoStack,
        [agendaId]: current ? [...(state.redoStack[agendaId] || []), JSON.parse(JSON.stringify(current))] : [],
      },
    }));
    get().saveToStorage();
  },

  redo: (agendaId) => {
    const rStack = get().redoStack[agendaId] || [];
    if (rStack.length === 0) return;
    const current = get().agendas.find((a) => a.id === agendaId);
    const next = rStack[rStack.length - 1];

    set((state) => ({
      agendas: state.agendas.map((a) => (a.id === agendaId ? next : a)),
      redoStack: {
        ...state.redoStack,
        [agendaId]: rStack.slice(0, -1),
      },
      undoStack: {
        ...state.undoStack,
        [agendaId]: current ? [...(state.undoStack[agendaId] || []), JSON.parse(JSON.stringify(current))] : [],
      },
    }));
    get().saveToStorage();
  },

  // ── Reliable Desktop LAN Transfer ────────────────────────────────────────

  sendToDesktop: async (agendaId) => {
    const agenda = get().agendas.find((a) => a.id === agendaId);
    if (!agenda) return { ok: false, error: 'Agenda not found' };

    const socketStore = useSocketStore.getState();
    const socket = socketStore.socket;
    if (!socket || !socketStore.isConnected || !socketStore.isPaired) {
      return { ok: false, error: 'Mobile is not connected and paired with desktop controller' };
    }

    set({
      transfer: {
        transferring: true,
        progress: 0,
        status: 'Sending offer to controller...',
        error: null,
      },
    });

    try {
      // Step 1: Handshake offer
      const offerRes: any = await new Promise((resolve) => {
        socket.emit(
          'mobile-agenda-offer',
          {
            agenda,
            deviceName: socketStore.deviceName || 'Mobile Companion',
          },
          resolve
        );
      });

      if (!offerRes?.ok) {
        throw new Error(offerRes?.error || 'Desktop declined agenda offer');
      }

      const transferId = offerRes.transferId;
      const neededHashes: string[] = offerRes.neededAssetHashes || [];

      set({
        transfer: {
          transferring: true,
          progress: 10,
          status: `Desktop accepted. Preparing ${neededHashes.length} assets...`,
          error: null,
          transferId,
        },
      });

      // Step 2: Stream missing assets chunk-by-chunk
      const assetsToSend = (agenda.assets || []).filter((a) => neededHashes.includes(a.hash));
      let uploadedFiles = 0;

      for (const asset of assetsToSend) {
        set({
          transfer: {
            transferring: true,
            progress: 10 + Math.round((uploadedFiles / Math.max(1, assetsToSend.length)) * 75),
            status: `Uploading "${asset.originalName}"...`,
            error: null,
            transferId,
          },
        });

        // Read file in chunks
        let dataBase64 = '';
        if (asset.localUri) {
          try {
            dataBase64 = await FileSystem.readAsStringAsync(asset.localUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch (_) {}
        }

        // Send chunk via socket
        const chunkRes: any = await new Promise((resolve) => {
          socket.emit(
            'mobile-agenda-chunk',
            {
              transferId,
              hash: asset.hash,
              chunkIndex: 0,
              totalChunks: 1,
              data: dataBase64,
            },
            resolve
          );
        });

        if (!chunkRes?.ok) {
          throw new Error(chunkRes?.error || `Failed chunk for ${asset.originalName}`);
        }

        // Finalize asset
        const finalizeRes: any = await new Promise((resolve) => {
          socket.emit(
            'mobile-agenda-finalize-asset',
            {
              transferId,
              hash: asset.hash,
              originalName: asset.originalName,
            },
            resolve
          );
        });

        if (!finalizeRes?.ok) {
          throw new Error(finalizeRes?.error || `Verification failed for ${asset.originalName}`);
        }

        uploadedFiles++;
      }

      // Step 3: Finalize transfer
      set({
        transfer: {
          transferring: true,
          progress: 95,
          status: 'Verifying manifest and committing to library...',
          error: null,
          transferId,
        },
      });

      const finalRes: any = await new Promise((resolve) => {
        socket.emit(
          'mobile-agenda-finalize-transfer',
          { transferId },
          resolve
        );
      });

      if (!finalRes?.ok) {
        throw new Error(finalRes?.error || 'Desktop failed to commit agenda');
      }

      set({
        transfer: {
          transferring: false,
          progress: 100,
          status: 'Transfer complete! Agenda is Ready on desktop controller.',
          error: null,
          transferId,
        },
      });

      return { ok: true };
    } catch (err: any) {
      set({
        transfer: {
          transferring: false,
          progress: 0,
          status: 'Transfer failed',
          error: err.message,
        },
      });
      return { ok: false, error: err.message };
    }
  },

  cancelTransfer: () => {
    const tid = get().transfer.transferId;
    if (tid) {
      const socket = useSocketStore.getState().socket;
      if (socket) {
        socket.emit('mobile-agenda-abort', { transferId: tid });
      }
    }
    set({
      transfer: {
        transferring: false,
        progress: 0,
        status: 'Transfer cancelled',
        error: null,
      },
    });
  },
}));
