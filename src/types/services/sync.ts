import type { TabData } from './storage'

export interface CloudNote {
  id: string
  user_id: string
  title: string
  content: string // Decrypted on client
  created_at: string
  updated_at: string
  last_synced_at: string | null
  device_id: string | null
  local_id: string | null
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  lastSync: number | null
  pendingChanges: number
}

export interface ConflictResolution {
  strategy: 'local-wins' | 'cloud-wins' | 'merge'
  resolvedNote: TabData
}

export interface ResolveConflictOptions {
  /**
   * Forces merge behavior even when one side is clearly newer.
   * Intended for true concurrency cases like optimistic concurrency conflicts (HTTP 409).
   */
  forceMerge?: boolean
}

export interface SyncQueueItem {
  tabId: string
  action: 'create' | 'update' | 'delete'
  timestamp: number
  retries: number
}

export interface ImageSyncItem {
  imageId: string
  noteId: string
  localUrl: string
  cloudUrl?: string
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
}

/**
 * Tracks recently synced notes to prevent redundant sync operations
 */
export interface RecentSyncInfo {
  cloudUpdatedAt: string
  timestamp: number
  contentHash: string
}

