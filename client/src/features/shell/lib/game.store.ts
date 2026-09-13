import { create } from 'zustand';
import { toast } from 'sonner';
import { io, type Socket } from 'socket.io-client';
import { api } from '../../../shared/auth/auth.store';
import { logVaultError } from '../../machines/lib/vault.errors';

const AUTH_REFRESH_COOLDOWN_MS = 30_000;

let authRefreshInFlight = false;
let lastAuthRefreshAttemptAt = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const LAST_NOTIFIED_NOTIFICATION_ID_KEY = 'bm_last_notified_notification_id';

function readLastNotifiedNotificationId(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(LAST_NOTIFIED_NOTIFICATION_ID_KEY);
  const parsed = raw != null ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeLastNotifiedNotificationId(id: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_NOTIFIED_NOTIFICATION_ID_KEY, String(id));
}

function toastNewNotifications(notifications: unknown[]): void {
  const ids = notifications
    .map((row) => (isRecord(row) && row.id != null ? Number(row.id) : NaN))
    .filter((id) => Number.isFinite(id));
  if (ids.length === 0) return;
  const maxId = Math.max(...ids);
  if (typeof window !== 'undefined' && window.localStorage.getItem(LAST_NOTIFIED_NOTIFICATION_ID_KEY) == null) {
    writeLastNotifiedNotificationId(maxId);
    return;
  }
  const lastSeen = readLastNotifiedNotificationId();
  const fresh = notifications.filter(
    (row) => isRecord(row) && row.id != null && Number(row.id) > lastSeen,
  );
  for (const row of fresh) {
    if (isRecord(row) && typeof row.title === 'string') {
      toast.info(row.title, {
        description: typeof row.message === 'string' ? row.message : undefined,
      });
    }
  }
  if (maxId > lastSeen) writeLastNotifiedNotificationId(maxId);
}

function axiosErrorMessage(error: unknown, fallback: string): string {
  if (!isRecord(error)) return fallback;
  const response = error.response;
  if (!isRecord(response)) return fallback;
  const data = response.data;
  if (!isRecord(data)) return fallback;
  const message = data.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export type MiningStatsSnapshot = Record<string, unknown> & {
  miner?: Record<string, unknown>;
  blockHistory?: unknown[];
  networkHashRate?: number;
  tokenPrice?: number;
  blockReward?: number;
  blockIntervalMinutes?: number;
};

function mergeMiningStats(
  previous: MiningStatsSnapshot | null | undefined,
  incoming: MiningStatsSnapshot,
): MiningStatsSnapshot {
  const prevHistory = previous?.blockHistory ?? [];
  const nextHistoryRaw = incoming.blockHistory;
  const nextHistory = Array.isArray(nextHistoryRaw) ? nextHistoryRaw : null;
  if (nextHistory === null) {
    return {
      ...incoming,
      miner: incoming.miner ?? previous?.miner,
      blockHistory: prevHistory,
    };
  }
  if (nextHistory.length === 0 && prevHistory.length > 0) {
    return {
      ...incoming,
      miner: incoming.miner ?? previous?.miner,
      blockHistory: prevHistory,
    };
  }
  const nextLooksEmpty = nextHistory.every((row) => {
    if (!isRecord(row)) return true;
    const userReward = Number(row.userReward) || 0;
    const totalReward = Number(row.totalReward) || 0;
    const persistFailed = Boolean(row.persistFailed);
    return userReward === 0 && totalReward === 0 && !persistFailed;
  });
  const prevHasReward = prevHistory.some((row) => (Number((row as { userReward?: unknown }).userReward) || 0) > 0);
  const blockHistory = nextLooksEmpty && prevHasReward ? prevHistory : nextHistory;
  return {
    ...incoming,
    miner: incoming.miner ?? previous?.miner,
    blockHistory,
  };
}

type GameSocket = Socket & {
  __bmCleanup?: () => void;
};

export interface GameStoreState {
  machines: unknown[];
  vaultItems: unknown[];
  vaultLoading: boolean;
  vaultError: string | null;
  inventory: unknown[];
  racks: Record<string, string>;
  stats: MiningStatsSnapshot | null;
  messages: unknown[];
  privateMessages: unknown[];
  conversations: unknown[];
  notifications: unknown[];
  activePrivateUser: { id: number; name?: string; username?: string } | null;
  socket: GameSocket | null;
  isLoading: boolean;
  isChatOpen: boolean;
  isSidebarOpen: boolean;
  unreadPms: number;
  hasMention: boolean;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  clearMention: () => void;
  clearUnreadPms: () => void;
  setActivePrivateUser: (user: GameStoreState['activePrivateUser']) => void;
  clearActivePrivateUser: () => void;
  initSocket: () => void;
  disconnectSocket: () => void;
  fetchMachines: () => Promise<void>;
  fetchVault: () => Promise<void>;
  fetchInventory: () => Promise<void>;
  fetchRacks: () => Promise<void>;
  fetchMessages: () => Promise<void>;
  fetchPrivateMessages: (userId: number) => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: number | string | 'all') => Promise<void>;
  sendMessage: (message: string, replyToId?: number | null) => Promise<{ ok: boolean; message?: string }>;
  sendPrivateMessage: (receiverId: number, message: string) => Promise<{ ok: boolean; message?: string }>;
  installMachine: (slotIndex: number, inventoryId: number) => Promise<{ ok: boolean }>;
  removeMachine: (machineId: number) => Promise<{ ok: boolean }>;
  toggleMachine: (machineId: number, isActive: boolean) => Promise<{ ok: boolean }>;
  moveMachine: (machineId: number, targetSlotIndex: number) => Promise<{ ok: boolean; message?: string }>;
  fetchAll: () => Promise<void>;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  machines: [],
  vaultItems: [],
  vaultLoading: false,
  vaultError: null,
  inventory: [],
  racks: {},
  stats: null,
  messages: [],
  privateMessages: [],
  conversations: [],
  notifications: [],
  activePrivateUser: null,
  socket: null,
  isLoading: true,
  isChatOpen: false,
  isSidebarOpen: false,
  unreadPms: 0,
  hasMention: false,

  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen, hasMention: false })),
  openChat: () => set({ isChatOpen: true, hasMention: false }),
  closeChat: () => set({ isChatOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  clearMention: () => set({ hasMention: false }),
  clearUnreadPms: () => set({ unreadPms: 0 }),
  setActivePrivateUser: (user) => set({ activePrivateUser: user }),
  clearActivePrivateUser: () => set({ activePrivateUser: null }),

  initSocket: () => {
    if (get().socket) return;

    const timeoutEnv =
      typeof window !== 'undefined' && window.__BLOCKMINER_ENV__?.VITE_SOCKET_TIMEOUT_MS
        ? window.__BLOCKMINER_ENV__.VITE_SOCKET_TIMEOUT_MS
        : undefined;
    const timeoutMs = Math.max(
      60_000,
      Number.parseInt(String(timeoutEnv || '180000'), 10) || 180_000,
    );

    const socket = io('/', {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: timeoutMs,
    }) as GameSocket;

    if (typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
      };
      const onOnline = () => {
        if (!socket.connected) socket.connect();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      window.addEventListener('focus', onVisible);
      socket.__bmCleanup = () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('focus', onVisible);
      };
    }

    const joinMiner = () => {
      const token = document.cookie
        .split(';')
        .reduce<Record<string, string>>((acc, part) => {
          const [key, value] = part.trim().split('=');
          acc[key] = value;
          return acc;
        }, {}).blockminer_access;
      socket.emit('miner:join', { token }, (response: unknown) => {
        if (!isRecord(response) || !response.ok) return;
        const state = response.state;
        if (isRecord(state)) {
          set((prev) => ({
            stats: {
              ...(state as MiningStatsSnapshot),
              miner: (state as MiningStatsSnapshot).miner ?? prev.stats?.miner,
            },
          }));
        }
      });
    };

    socket.on('auth:expired', () => {
      const now = Date.now();
      if (authRefreshInFlight) return;
      if (now - lastAuthRefreshAttemptAt < AUTH_REFRESH_COOLDOWN_MS) {
        if (socket.connected) joinMiner();
        return;
      }
      authRefreshInFlight = true;
      lastAuthRefreshAttemptAt = now;
      api
        .post('/auth/refresh', {})
        .then(() => {
          if (socket.connected) joinMiner();
        })
        .catch(() => {})
        .finally(() => {
          authRefreshInFlight = false;
        });
    });

    socket.on('connect', () => {
      joinMiner();
      void get().fetchMachines();
      void get().fetchVault();
      void get().fetchInventory();
    });

    socket.on('state:update', (payload: unknown) => {
      if (isRecord(payload)) {
        set((prev) => ({ stats: mergeMiningStats(prev.stats, payload as MiningStatsSnapshot) }));
      }
    });

    socket.on('miner:update', (payload: unknown) => {
      if (isRecord(payload)) {
        set((prev) => ({
          stats: prev.stats ? { ...prev.stats, miner: payload } : { miner: payload },
        }));
      }
    });

    socket.on('inventory:update', (payload: unknown) => {
      if (isRecord(payload) && Array.isArray(payload.inventory)) {
        set({ inventory: payload.inventory });
      } else {
        void get().fetchInventory();
      }
    });

    socket.on('machines:update', (payload: unknown) => {
      if (isRecord(payload) && Array.isArray(payload.machines)) {
        set({ machines: payload.machines });
      } else {
        void get().fetchMachines();
      }
    });

    socket.on('vault:update', (payload: unknown) => {
      if (isRecord(payload) && Array.isArray(payload.vault)) {
        set({ vaultItems: payload.vault, vaultError: null });
      } else {
        void get().fetchVault();
      }
    });

    socket.on('chat:new-message', (payload: unknown) => {
      try {
        const raw = localStorage.getItem('user-storage');
        const user = raw ? (JSON.parse(raw) as { state?: { user?: { username?: string; name?: string } } })?.state?.user : undefined;
        const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : '';
        const handle = user?.username || user?.name || '';
        if (handle && message.includes(`@${handle}`) && !get().isChatOpen) {
          set({ hasMention: true });
        }
      } catch {
        /* ignore */
      }
      void get().fetchMessages();
    });

    socket.on('chat:new-pm', (payload: unknown) => {
      if (!isRecord(payload)) return;
      const active = get().activePrivateUser;
      let selfId: number | undefined;
      try {
        const raw = localStorage.getItem('user-storage');
        const user = raw ? (JSON.parse(raw) as { state?: { user?: { id?: number } } })?.state?.user : undefined;
        selfId = user?.id;
      } catch {
        selfId = undefined;
      }
      const receiverId = Number(payload.receiverId);
      const senderId = Number(payload.senderId);
      if (selfId != null && receiverId === selfId && (!get().isChatOpen || active?.id !== senderId)) {
        set((state) => ({ unreadPms: state.unreadPms + 1 }));
      }
      if (active && (senderId === active.id || receiverId === active.id)) {
        void get().fetchPrivateMessages(active.id);
      }
      void get().fetchConversations();
    });

    socket.on('notification:new', (payload: unknown) => {
      set((state) => ({ notifications: [payload, ...state.notifications] }));
      toastNewNotifications([payload]);
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (!socket) return;
    socket.__bmCleanup?.();
    socket.removeAllListeners();
    socket.disconnect();
    set({ socket: null });
  },

  fetchMachines: async () => {
    try {
      const res = await api.get('/machines');
      if (res.data.ok && Array.isArray(res.data.machines)) {
        set({ machines: res.data.machines });
      }
    } catch (error) {
      console.error(error);
    }
  },

  fetchVault: async () => {
    set({ vaultLoading: true, vaultError: null });
    try {
      const res = await api.get('/vault');
      if (res.data?.ok) {
        const vault = Array.isArray(res.data.vault) ? res.data.vault : [];
        set({ vaultItems: vault, vaultError: null });
      } else {
        set({ vaultError: 'LOAD_FAILED' });
      }
    } catch (error) {
      logVaultError('VAULT_LIST_FETCH_FAILED', error);
      set({ vaultError: 'NETWORK' });
    } finally {
      set({ vaultLoading: false });
    }
  },

  fetchInventory: async () => {
    try {
      const res = await api.get('/inventory');
      if (res.data.ok && Array.isArray(res.data.inventory)) {
        set({ inventory: res.data.inventory });
      }
    } catch (error) {
      console.error(error);
    }
  },

  fetchRacks: async () => {
    try {
      const res = await api.get('/racks');
      if (res.data.ok && res.data.racks) {
        const racks: Record<string, string> = {};
        for (const row of res.data.racks as Array<{ rack_index: number; custom_name: string }>) {
          racks[String(row.rack_index)] = row.custom_name;
        }
        set({ racks });
      }
    } catch (error) {
      console.error(error);
    }
  },

  fetchMessages: async () => {
    try {
      const res = await api.get('/chat/messages');
      if (res.data.ok && Array.isArray(res.data.messages)) {
        set({ messages: res.data.messages });
      }
    } catch (error) {
      console.error(error);
    }
  },

  fetchPrivateMessages: async (userId: number) => {
    try {
      const res = await api.get(`/chat/private/${userId}`);
      if (res.data.ok && Array.isArray(res.data.messages)) {
        set({ privateMessages: res.data.messages });
      }
    } catch (error) {
      console.error(error);
    }
  },

  fetchConversations: async () => {
    try {
      const res = await api.get('/chat/conversations');
      if (res.data.ok && Array.isArray(res.data.conversations)) {
        set({ conversations: res.data.conversations });
      }
    } catch (error) {
      console.error(error);
    }
  },

  fetchNotifications: async () => {
    try {
      const res = await api.get('/notifications');
      if (!res.data.ok) return;
      const notifications = Array.isArray(res.data.notifications) ? res.data.notifications : [];
      toastNewNotifications(notifications);
      set({ notifications });
    } catch (error) {
      console.error(error);
    }
  },

  markNotificationRead: async (id) => {
    try {
      const res = await api.post(`/notifications/read/${id}`);
      if (!res.data.ok) return;
      if (id === 'all') {
        set((state) => ({
          notifications: state.notifications.map((row) =>
            isRecord(row) ? { ...row, isRead: true } : row,
          ),
        }));
      } else {
        set((state) => ({
          notifications: state.notifications.map((row) =>
            isRecord(row) && row.id === id ? { ...row, isRead: true } : row,
          ),
        }));
      }
    } catch (error) {
      console.error(error);
    }
  },

  sendMessage: async (message, replyToId = null) => {
    try {
      const res = await api.post('/chat/send', { message, replyToId });
      return res.data;
    } catch (error) {
      return { ok: false, message: axiosErrorMessage(error, 'Error sending message') };
    }
  },

  sendPrivateMessage: async (receiverId, message) => {
    try {
      const res = await api.post('/chat/send-private', { receiverId, message });
      const data = res.data;
      if (isRecord(data) && data.ok) {
        void get().fetchPrivateMessages(receiverId);
        void get().fetchConversations();
      }
      return data;
    } catch (error) {
      return { ok: false, message: axiosErrorMessage(error, 'Error sending PM') };
    }
  },

  installMachine: async (slotIndex, inventoryId) => {
    try {
      const res = await api.post('/inventory/install', { slotIndex, inventoryId });
      const data = res.data;
      if (isRecord(data) && data.ok) {
        void get().fetchMachines();
        void get().fetchInventory();
      }
      return isRecord(data) ? (data as { ok: boolean }) : { ok: false };
    } catch {
      return { ok: false };
    }
  },

  removeMachine: async (machineId) => {
    try {
      const res = await api.post('/machines/remove', { machineId });
      const data = res.data;
      if (isRecord(data) && data.ok) {
        void get().fetchMachines();
        void get().fetchInventory();
      }
      return isRecord(data) ? (data as { ok: boolean }) : { ok: false };
    } catch {
      return { ok: false };
    }
  },

  toggleMachine: async (machineId, isActive) => {
    try {
      const res = await api.post('/machines/toggle', { machineId, isActive });
      const data = res.data;
      if (isRecord(data) && data.ok) void get().fetchMachines();
      return isRecord(data) ? (data as { ok: boolean }) : { ok: false };
    } catch {
      return { ok: false };
    }
  },

  moveMachine: async (machineId, targetSlotIndex) => {
    try {
      const res = await api.post('/machines/move', { machineId, targetSlotIndex });
      const data = res.data;
      if (isRecord(data) && data.ok) void get().fetchMachines();
      return isRecord(data) ? (data as { ok: boolean; message?: string }) : { ok: false, message: 'Server error' };
    } catch {
      return { ok: false, message: 'Server error' };
    }
  },

  fetchAll: async () => {
    set({ isLoading: true });
    await Promise.all([
      get().fetchMachines(),
      get().fetchInventory(),
      get().fetchRacks(),
      get().fetchMessages(),
      get().fetchNotifications(),
    ]);
    set({ isLoading: false });
  },
}));
