import { useEffect } from 'react';
import { useAuthStore } from '../../contexts/AuthContext';

export default function AuthBootstrap() {
  useEffect(() => {
    // Initialize Supabase auth session + listener once on app load.
    useAuthStore.getState().initialize().catch((error) => {
      console.error('Failed to initialize auth', error);
    });
  }, []);

  return null;
}


