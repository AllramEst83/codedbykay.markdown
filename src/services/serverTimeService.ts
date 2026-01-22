const SERVER_TIME_OFFSET_KEY = 'markdown-editor-server-time-offset'
const SERVER_TIME_UPDATED_AT_KEY = 'markdown-editor-server-time-updated-at'

let serverTimeOffsetMs: number | null = null

function loadOffsetFromStorage(): void {
  if (serverTimeOffsetMs !== null) {
    return
  }

  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    const stored = localStorage.getItem(SERVER_TIME_OFFSET_KEY)
    if (!stored) {
      return
    }

    const parsed = Number(stored)
    if (Number.isFinite(parsed)) {
      serverTimeOffsetMs = parsed
    }
  } catch (error) {
    console.error('Failed to load server time offset:', error)
  }
}

export function updateServerTime(serverTimeIso: string): void {
  const serverMs = Date.parse(serverTimeIso)
  if (!Number.isFinite(serverMs)) {
    return
  }

  const offset = serverMs - Date.now()
  serverTimeOffsetMs = offset

  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(SERVER_TIME_OFFSET_KEY, String(offset))
    localStorage.setItem(SERVER_TIME_UPDATED_AT_KEY, String(Date.now()))
  } catch (error) {
    console.error('Failed to persist server time offset:', error)
  }
}

export function getServerTimeOffsetMs(): number | null {
  loadOffsetFromStorage()
  return serverTimeOffsetMs
}

export function getServerAlignedTimestamp(): { timestamp: number; isAligned: boolean } {
  const offset = getServerTimeOffsetMs()
  if (offset === null || !Number.isFinite(offset)) {
    return { timestamp: Date.now(), isAligned: false }
  }

  return { timestamp: Date.now() + offset, isAligned: true }
}
