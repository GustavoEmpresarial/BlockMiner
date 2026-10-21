import { create } from 'zustand';
import { api } from '../auth/auth.store';
import { isSafeAvatarUrl } from '../components/UserAvatar';

type MyAvatarState = {
  avatarUrl: string | null;
  loadedForUserId: number | null;
  setAvatarUrl: (url: string | null) => void;
  load: (userId: number) => Promise<void>;
};

/** The signed-in user's own visible photo, for the header. Settings updates it after upload/remove. */
export const useMyAvatar = create<MyAvatarState>((set, get) => ({
  avatarUrl: null,
  loadedForUserId: null,
  setAvatarUrl: (url) => set({ avatarUrl: isSafeAvatarUrl(url) ? url : null }),
  load: async (userId) => {
    if (get().loadedForUserId === userId) return;
    set({ loadedForUserId: userId });
    try {
      const res = await api.get<{ avatarUrl?: unknown }>('/avatar');
      set({ avatarUrl: isSafeAvatarUrl(res.data?.avatarUrl) ? res.data.avatarUrl : null });
    } catch {
      set({ avatarUrl: null });
    }
  },
}));
