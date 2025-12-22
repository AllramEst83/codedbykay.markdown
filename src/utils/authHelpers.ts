/**
 * Auth Helper Utilities
 * Functions to help manage authentication state and recover from errors
 */

/**
 * Clears all authentication-related data from browser storage
 * Useful for recovering from stale session errors
 */
export function clearAuthData(): void {
  try {
    // Clear session snapshots
    localStorage.removeItem('markdown_editor_auth_snapshot')
    
    // Clear all Supabase auth keys
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-')) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
    
    console.log('Cleared all authentication data')
  } catch (error) {
    console.error('Failed to clear auth data:', error)
  }
}

/**
 * Checks if there's a potentially stale session
 * Returns true if session exists but might be invalid
 */
export function hasStaleSession(): boolean {
  try {
    const snapshot = localStorage.getItem('markdown_editor_auth_snapshot')
    if (!snapshot) return false
    
    const data = JSON.parse(snapshot)
    const updatedAt = data.updatedAt || 0
    const daysSinceUpdate = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24)
    
    // Consider session stale if it's older than 7 days
    return daysSinceUpdate > 7
  } catch {
    return false
  }
}

