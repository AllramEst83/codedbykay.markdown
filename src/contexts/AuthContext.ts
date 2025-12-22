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
  isAuthConfigured: boolean;
  lastAuthEvent: number | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string) => Promise<AuthResult>;
  logout: (scope?: 'local' | 'global') => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  deleteAccount: () => Promise<AuthResult>;
  setError: (message: string | null) => void;
}

function writeSessionSnapshot(session: Session | null) {
  if (!session) {
    localStorage.removeItem(SESSION_CACHE_KEY);
    return;
  }
  const snapshot: CachedSessionSnapshot = {
    userId: session.user.id,
    email: session.user.email ?? undefined,
    updatedAt: Date.now(),
  };
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(snapshot));
}

function getSessionSnapshot(): CachedSessionSnapshot | null {
  try {
    const value = localStorage.getItem(SESSION_CACHE_KEY);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as CachedSessionSnapshot;
  } catch {
    localStorage.removeItem(SESSION_CACHE_KEY);
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

    return { success: true };
  },
  logout: async (scope = 'global') => {
    if (!isAuthConfigured) {
      return;
    }
    const supabase = getSupabaseClient();
    try {
      // @supabase/supabase-js v2 supports scope: 'local' | 'global' | 'others'
      await supabase.auth.signOut({ scope });
    } catch (error) {
      console.warn('signOut failed; continuing to clear local auth state anyway.', error);
    }

    writeSessionSnapshot(null);
    authSubscription?.unsubscribe();
    authSubscription = null;
    set({
      status: 'unauthenticated',
      session: null,
      user: null,
      error: null,
    });
  },
  resetPassword: async (email: string) => {
    if (!isAuthConfigured) {
      const error = 'Authentication is not configured.';
      set({ error });
      return { success: false, error };
    }

    const supabase = getSupabaseClient();
    set({ error: null });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      console.error('Password reset failed', error);
      set({ error: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  },
  updatePassword: async (newPassword: string) => {
    if (!isAuthConfigured) {
      const error = 'Authentication is not configured.';
      set({ error });
      return { success: false, error };
    }

    const supabase = getSupabaseClient();
    set({ error: null });

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('Password update failed', error);
      set({ error: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  },
  deleteAccount: async () => {
    if (!isAuthConfigured) {
      const error = 'Authentication is not configured.';
      set({ error });
      return { success: false, error };
    }

    const user = get().user;

    if (!user) {
      const error = 'No user logged in';
      set({ error });
      return { success: false, error };
    }

    // Note: Supabase doesn't have a direct deleteUser method for users to delete themselves
    // This would typically be handled by an Edge Function with admin privileges
    // For now, we'll just sign out and return an error message
    const error = 'Account deletion must be handled by an admin. Please contact support.';
    set({ error });
    return { success: false, error };
  },
  setError: (message) => set({ error: message }),
}));

