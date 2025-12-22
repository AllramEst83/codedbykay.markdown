/**
 * Device ID Utility
 * Generates and manages a unique device identifier for conflict resolution
 */

const DEVICE_ID_KEY = 'markdown-editor-device-id'

/**
 * Generates a unique device ID using timestamp and random string
 */
function generateDeviceId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 15)
  return `device-${timestamp}-${random}`
}

/**
 * Gets the device ID from localStorage, creating one if it doesn't exist
 */
export function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY)
    
    if (!deviceId) {
      deviceId = generateDeviceId()
      localStorage.setItem(DEVICE_ID_KEY, deviceId)
    }
    
    return deviceId
  } catch (error) {
    console.error('Failed to get/create device ID:', error)
    // Return a session-only device ID if localStorage fails
    return generateDeviceId()
  }
}

/**
 * Clears the device ID (useful for testing or reset scenarios)
 */
export function clearDeviceId(): void {
  try {
    localStorage.removeItem(DEVICE_ID_KEY)
  } catch (error) {
    console.error('Failed to clear device ID:', error)
  }
}

