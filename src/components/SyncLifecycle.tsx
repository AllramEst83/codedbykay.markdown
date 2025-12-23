/**
 * SyncLifecycle Component
 * Handles browser lifecycle events (visibility, focus, online/offline) to reconnect sync service
 * when the app becomes visible again or network connectivity is restored
 */

import { useEffect } from 'react'
import { useAuthStore } from '../contexts/AuthContext'
import { syncService } from '../services/syncService'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

/**
 * Component that listens to browser lifecycle events and reconnects sync service when needed
 * This fixes the issue where sync icon turns red after mobile hibernation or tab suspension
 */
function SyncLifecycle() {
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated')
  const { isOnline } = useNetworkStatus()

  // Handle visibility change (tab becomes visible/hidden) and window focus
  // This is especially important for mobile devices that hibernate apps
  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    const handleVisibilityOrFocus = () => {
      // Only reconnect when tab becomes visible
      if (document.visibilityState === 'visible') {
        syncService.reconnectIfNeeded()
      }
    }

    window.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
    }
  }, [isAuthenticated])

  // Handle online/offline network status changes
  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    if (isOnline) {
      // Network came back online - try to reconnect
      syncService.reconnectIfNeeded()
    } else {
      // Network went offline - mark as offline (shows orange icon instead of red)
      syncService.setOffline()
    }
  }, [isOnline, isAuthenticated])

  // This component doesn't render anything
  return null
}

export default SyncLifecycle

