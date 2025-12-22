/**
 * Network Status Hook
 * Detects online/offline state and provides network status information
 */

import { useState, useEffect } from 'react'

export type NetworkStatus = 'online' | 'offline' | 'unknown'

export interface UseNetworkStatusReturn {
  isOnline: boolean
  status: NetworkStatus
}

/**
 * Hook to detect and monitor network status
 */
export function useNetworkStatus(): UseNetworkStatusReturn {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    // Initialize based on navigator.onLine if available
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })

  useEffect(() => {
    // Handle online event
    const handleOnline = () => {
      setIsOnline(true)
    }

    // Handle offline event
    const handleOffline = () => {
      setIsOnline(false)
    }

    // Add event listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const status: NetworkStatus = isOnline ? 'online' : 'offline'

  return {
    isOnline,
    status,
  }
}

