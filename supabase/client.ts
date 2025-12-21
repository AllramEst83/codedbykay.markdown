import { createClient, type Session, type User } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const client = isAuthConfigured
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: false,
      },
    })
  : null;

export function getSupabaseClient() {
  if (!client) {
    throw new Error('Supabase client is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  }
  return client;
}

export type SupabaseSession = Session | null;
export type SupabaseUser = User | null;

