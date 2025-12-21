import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isAuthConfigured } from '../supabase/client';

const SESSION_CACHE_KEY = 'markdown_editor_auth_snapshot';

interface CachedSessionSnapshot {
  userId: string;
  email?: string;
  updatedAt: number;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'disabled' | 'error';

export interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthState {
  status: AuthStatus;
  initializing: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
  hasApiKey: boolean | null;
  isCheckingApiKey: boolean;
  isAuthConfigured: boolean;
  lastAuthEvent: number | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  checkApiKey: () => Promise<boolean>;
  setError: (message: string | null) => void;
}

function writeSessionSnapshot(session: Session | null) {
  if (!session) {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    return;
  }
  const snapshot: CachedSessionSnapshot = {
    userId: session.user.id,
    email: session.user.email ?? undefined,
    updatedAt: Date.now(),
  };
  sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(snapshot));
}

function getSessionSnapshot(): CachedSessionSnapshot | null {
  try {
    const value = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as CachedSessionSnapshot;
  } catch {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    return null;
  }
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  initializing: false,
  session: null,
  user: null,
  error: null,
  hasApiKey: null,
  isCheckingApiKey: false,
  isAuthConfigured,
  lastAuthEvent: null,
  initialize: async () => {
    if (!isAuthConfigured) {
      set({
        status: 'disabled',
        initializing: false,
        session: null,
        user: null,
        error: 'Authentication environment variables are missing.',
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (get().initializing) {
      return;
    }

    set({
      initializing: true,
      status: 'loading',
      error: null,
    });

    const cached = getSessionSnapshot();
    if (cached && !get().user) {
      set({
        user: {
          id: cached.userId,
          email: cached.email ?? null,
        } as User,
      });
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Failed to hydrate session', error);
      set({
        status: 'error',
        initializing: false,
        session: null,
        user: null,
        error: error.message,
      });
      writeSessionSnapshot(null);
      return;
    }

    const session = data.session ?? null;
    writeSessionSnapshot(session);

    set({
      status: session ? 'authenticated' : 'unauthenticated',
      initializing: false,
      session,
      user: session?.user ?? null,
      error: null,
      lastAuthEvent: Date.now(),
    });

    if (session) {
      await get().checkApiKey();
    } else {
      set({ hasApiKey: null });
    }

    authSubscription?.unsubscribe();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      writeSessionSnapshot(newSession);
      set({
        session: newSession,
        user: newSession?.user ?? null,
        status: newSession ? 'authenticated' : 'unauthenticated',
        error: null,
        lastAuthEvent: Date.now(),
      });

      if (newSession) {
        await get().checkApiKey();
      } else {
        set({ hasApiKey: null });
      }
    });

    authSubscription = listener.subscription;
  },
  login: async (email, password) => {
    if (!isAuthConfigured) {
      const error = 'Authentication is not configured.';
      set({ error });
      return { success: false, error };
    }

    const supabase = getSupabaseClient();
    set({ status: 'loading', error: null });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Login failed', error);
      set({
        status: 'unauthenticated',
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    writeSessionSnapshot(data.session);
    set({
      status: 'authenticated',
      session: data.session,
      user: data.session?.user ?? null,
      error: null,
      lastAuthEvent: Date.now(),
    });

    await get().checkApiKey();

    return { success: true };
  },
  signup: async (email, password) => {
    if (!isAuthConfigured) {
      const error = 'Authentication is not configured.';
      set({ error });
      return { success: false, error };
    }

    const supabase = getSupabaseClient();
    set({ status: 'loading', error: null });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error('Signup failed', error);
      set({
        status: 'unauthenticated',
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    writeSessionSnapshot(data.session);
    set({
      status: data.session ? 'authenticated' : 'unauthenticated',
      session: data.session ?? null,
      user: data.user ?? null,
      error: null,
      lastAuthEvent: Date.now(),
    });

    if (data.session) {
      await get().checkApiKey();
      return { success: true };
    }

    return { success: true };
  },
  logout: async () => {
    if (!isAuthConfigured) {
      return;
    }
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();

    writeSessionSnapshot(null);
    authSubscription?.unsubscribe();
    authSubscription = null;
    set({
      status: 'unauthenticated',
      session: null,
      user: null,
      error: null,
      hasApiKey: null,
    });
  },
  checkApiKey: async () => {
    if (!isAuthConfigured) {
      set({ hasApiKey: false });
      return false;
    }
    if (get().isCheckingApiKey) {
      return Boolean(get().hasApiKey);
    }

    set({ isCheckingApiKey: true });
    const hasKey = await ApiKeyService.hasApiKey();
    set({ hasApiKey: hasKey, isCheckingApiKey: false });
    return hasKey;
  },
  setError: (message) => set({ error: message }),
}));

