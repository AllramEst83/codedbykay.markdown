/**
 * Sync Service
 * Main orchestration service for note synchronization between local and cloud storage
 */

import { getSupabaseClient } from '../supabase/client'
import { localStorageService } from './localStorageService'
import * as cloudStorage from './cloudStorageService'
import { resolveConflict, shouldUploadToCloud, shouldDownloadFromCloud } from './conflictResolver'
import { syncImageReferencesInContent, migrateAllImagesToCloud, prefetchImagesInContent } from './imageSyncService'
import { getDeviceId } from '../utils/deviceId'
import type { TabData } from '../types/services'
import type { CloudNote, SyncState, SyncQueueItem } from '../types/services/sync'
import type { RealtimeChannel } from '@supabase/supabase-js'

const SYNC_QUEUE_KEY = 'markdown-editor-sync-queue'
const SYNC_DEBOUNCE_MS = 2500 // 2.5 seconds debounce for cloud sync
const MAX_RETRIES = 5
const RETRY_BASE_DELAY = 2000 // 2 seconds

/**
 * Sync Service Class
 * Manages all synchronization logic
 */
class SyncService {
  private syncState: SyncState = {
    status: 'idle',
    lastSync: null,
    pendingChanges: 0,
  }

  private syncQueue: Map<string, SyncQueueItem> = new Map()
  private syncTimeout: ReturnType<typeof setTimeout> | null = null
  private realtimeChannel: RealtimeChannel | null = null
  private isInitialized = false
  private isSyncing = false
  private deviceId: string = getDeviceId()
  
  // Map of local tab IDs to cloud note IDs
  private localToCloudIdMap: Map<string, string> = new Map()
  
  // Callbacks for state changes
  private stateChangeCallbacks: Set<(state: SyncState) => void> = new Set()
  private noteUpdateCallbacks: Set<(notes: TabData[]) => void> = new Set()
  private noteDeletionCallbacks: Set<(noteId: string) => void> = new Set()

  /**
   * Initializes the sync service
   * Should be called after user logs in
   */
  async initialize(userId: string): Promise<void> {
    if (this.isInitialized) {
      console.log('Sync service already initialized')
      return
    }

    console.log('Initializing sync service...')
    this.updateSyncState({ status: 'syncing' })

    try {
      // Load persisted sync queue
      this.loadSyncQueue()

      // Perform initial sync
      await this.performInitialSync()

      // Set up realtime subscription
      await this.setupRealtimeSubscription(userId)

      // Process any queued changes
      await this.processSyncQueue()

      this.isInitialized = true
      this.updateSyncState({ 
        status: 'synced',
        lastSync: Date.now(),
      })

      console.log('Sync service initialized successfully')
    } catch (error) {
      console.error('Failed to initialize sync service:', error)
      this.updateSyncState({ status: 'error' })
      throw error
    }
  }

  /**
   * Performs initial sync on login
   * Merges local notes with cloud notes
   */
  async performInitialSync(): Promise<void> {
    console.log('Starting initial sync...')

    try {
      // Load local notes
      const localNotes = localStorageService.loadTabs()
      console.log(`Found ${localNotes.length} local notes`)

      // Fetch cloud notes
      const cloudNotes = await cloudStorage.getNotes()
      console.log(`Found ${cloudNotes.length} cloud notes`)

      // Build maps for efficient lookup
      const cloudByLocalId = new Map<string, CloudNote>()
      const cloudById = new Map<string, CloudNote>()
      
      cloudNotes.forEach((note) => {
        if (note.local_id) {
          cloudByLocalId.set(note.local_id, note)
        }
        cloudById.set(note.id, note)
      })

      // Process local notes
      const notesToSync: TabData[] = []
      const notesToCreate: TabData[] = []

      for (const localNote of localNotes) {
        const cloudNote = cloudByLocalId.get(localNote.id)

        if (!cloudNote) {
          // Skip empty notes during initial sync
          if (!localNote.content.trim() && localNote.title === 'Untitled') {
            console.log('Skipping empty note during initial sync:', localNote.id)
            continue
          }
          
          // Local-only note - needs to be uploaded
          notesToCreate.push(localNote)
        } else {
          // Note exists in both - resolve conflict
          const resolution = resolveConflict(localNote, cloudNote)
          notesToSync.push(resolution.resolvedNote)
          
          // Map local ID to cloud ID
          this.localToCloudIdMap.set(localNote.id, cloudNote.id)

          // Update cloud if local wins or merge
          if (resolution.strategy === 'local-wins' || resolution.strategy === 'merge') {
            await this.uploadNoteToCloud(resolution.resolvedNote, cloudNote.id)
          }
        }
      }

      // Process cloud notes not in local
      for (const cloudNote of cloudNotes) {
        const hasLocalVersion = localNotes.some(
          (local) => local.id === cloudNote.local_id || this.localToCloudIdMap.get(local.id) === cloudNote.id
        )

        if (!hasLocalVersion) {
          // Cloud-only note - download to local
          const tabData = cloudStorage.cloudNoteToTabData(cloudNote)
          notesToSync.push(tabData)
          this.localToCloudIdMap.set(tabData.id, cloudNote.id)
        }
      }

      // Create new cloud notes for local-only notes
      for (const localNote of notesToCreate) {
        try {
          // Sync images in content first
          const syncedContent = await syncImageReferencesInContent(localNote.content, localNote.id)
          const noteToCreate = { ...localNote, content: syncedContent }

          const params = cloudStorage.tabDataToCreateParams(noteToCreate, this.deviceId)
          const createdNote = await cloudStorage.createNote(params)
          
          this.localToCloudIdMap.set(localNote.id, createdNote.id)
          
          // Update local note with synced content
          if (syncedContent !== localNote.content) {
            notesToSync.push(noteToCreate)
          }
        } catch (error) {
          console.error(`Failed to create cloud note for ${localNote.id}:`, error)
        }
      }

      // Update local storage with synced notes
      if (notesToSync.length > 0) {
        this.triggerNoteUpdate(notesToSync)
      }

      // Migrate images to cloud (best effort)
      try {
        await migrateAllImagesToCloud()
      } catch (error) {
        console.warn('Image migration had issues:', error)
      }

      console.log('Initial sync complete')
    } catch (error) {
      console.error('Initial sync failed:', error)
      throw error
    }
  }

  /**
   * Sets up realtime subscription for note changes
   */
  private async setupRealtimeSubscription(userId: string): Promise<void> {
    const supabase = getSupabaseClient()

    this.realtimeChannel = supabase
      .channel('notes-changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'notes', 
          filter: `user_id=eq.${userId}` 
        },
        (payload) => this.handleRealtimeEvent(payload)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error')
          this.updateSyncState({ status: 'error' })
        }
      })
  }

  /**
   * Handles realtime database events
   */
  private async handleRealtimeEvent(payload: any): Promise<void> {
    console.log('Realtime event:', payload.eventType, payload)

    try {
      switch (payload.eventType) {
        case 'INSERT': {
          const rawNote = payload.new
          
          // Skip if we created this note (same device)
          if (rawNote.device_id === this.deviceId) {
            console.log('Skipping INSERT - same device')
            return
          }

          // Fetch decrypted note from backend
          console.log('Fetching decrypted note for INSERT:', rawNote.id)
          const cloudNote = await cloudStorage.getNote(rawNote.id)
          
          // Download to local
          const tabData = cloudStorage.cloudNoteToTabData(cloudNote)
          this.localToCloudIdMap.set(tabData.id, cloudNote.id)
          
          // Prefetch images
          await prefetchImagesInContent(tabData.content)
          
          console.log('Adding new note from realtime:', tabData)
          this.triggerNoteUpdate([tabData])
          break
        }

        case 'UPDATE': {
          const rawNote = payload.new
          
          // Skip if we updated this note (same device)
          if (rawNote.device_id === this.deviceId) {
            console.log('Skipping UPDATE - same device')
            return
          }

          // Find local note by cloud ID
          const localId = Array.from(this.localToCloudIdMap.entries())
            .find(([_, cloudId]) => cloudId === rawNote.id)?.[0]

          // Fetch decrypted note from backend
          console.log('Fetching decrypted note for UPDATE:', rawNote.id)
          const cloudNote = await cloudStorage.getNote(rawNote.id)

          if (!localId) {
            // New note we don't have locally
            const tabData = cloudStorage.cloudNoteToTabData(cloudNote)
            this.localToCloudIdMap.set(tabData.id, cloudNote.id)
            await prefetchImagesInContent(tabData.content)
            console.log('Adding note from UPDATE event:', tabData)
            this.triggerNoteUpdate([tabData])
            return
          }

          // Load local note
          const localNotes = localStorageService.loadTabs()
          const localNote = localNotes.find((n) => n.id === localId)

          if (!localNote) {
            return
          }

          // Resolve conflict
          const resolution = resolveConflict(localNote, cloudNote)
          
          // Only update if cloud wins or merge
          if (resolution.strategy === 'cloud-wins' || resolution.strategy === 'merge') {
            await prefetchImagesInContent(resolution.resolvedNote.content)
            console.log('Updating note from realtime:', resolution.resolvedNote)
            this.triggerNoteUpdate([resolution.resolvedNote])
          } else {
            console.log('Local note is newer, skipping update')
          }
          break
        }

        case 'DELETE': {
          const deletedNote = payload.old
          
          // Find local note by cloud ID
          const localId = Array.from(this.localToCloudIdMap.entries())
            .find(([_, cloudId]) => cloudId === deletedNote.id)?.[0]

          if (localId) {
            // Remove from local storage
            console.log('Deleting note from realtime:', localId)
            localStorageService.removeTab(localId)
            this.localToCloudIdMap.delete(localId)
            
            // Notify to remove tab from UI
            this.triggerNoteDeletion(localId)
          }
          break
        }
      }
    } catch (error) {
      console.error('Failed to handle realtime event:', error)
    }
  }

  /**
   * Queues a note for sync to cloud
   */
  queueNoteForSync(tabId: string, action: 'create' | 'update' | 'delete' = 'update'): void {
    if (!this.isInitialized) {
      console.log('Sync service not initialized, skipping queue')
      return
    }

    // Add to queue
    this.syncQueue.set(tabId, {
      tabId,
      action,
      timestamp: Date.now(),
      retries: 0,
    })

    this.updateSyncState({ 
      pendingChanges: this.syncQueue.size,
    })

    // Persist queue
    this.saveSyncQueue()

    // Debounce sync
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }

    this.syncTimeout = setTimeout(() => {
      this.processSyncQueue()
    }, SYNC_DEBOUNCE_MS)
  }

  /**
   * Processes the sync queue
   */
  private async processSyncQueue(): Promise<void> {
    if (this.isSyncing || this.syncQueue.size === 0) {
      return
    }

    this.isSyncing = true
    this.updateSyncState({ status: 'syncing' })

    const items = Array.from(this.syncQueue.values())

    for (const item of items) {
      try {
        await this.syncNoteToCloud(item)
        this.syncQueue.delete(item.tabId)
      } catch (error) {
        console.error(`Failed to sync note ${item.tabId}:`, error)
        
        // Retry logic with exponential backoff
        if (item.retries < MAX_RETRIES) {
          item.retries++
          const delay = RETRY_BASE_DELAY * Math.pow(2, item.retries - 1)
          
          setTimeout(() => {
            this.processSyncQueue()
          }, delay)
        } else {
          // Max retries reached - remove from queue
          console.error(`Max retries reached for note ${item.tabId}`)
          this.syncQueue.delete(item.tabId)
        }
      }
    }

    this.isSyncing = false
    this.updateSyncState({ 
      status: this.syncQueue.size > 0 ? 'syncing' : 'synced',
      pendingChanges: this.syncQueue.size,
      lastSync: Date.now(),
    })

    this.saveSyncQueue()
  }

  /**
   * Syncs a single note to cloud
   */
  private async syncNoteToCloud(item: SyncQueueItem): Promise<void> {
    const localNotes = localStorageService.loadTabs()
    const localNote = localNotes.find((n) => n.id === item.tabId)

    if (!localNote && item.action !== 'delete') {
      // Note no longer exists locally
      return
    }

    const cloudId = this.localToCloudIdMap.get(item.tabId)

    switch (item.action) {
      case 'create':
      case 'update': {
        if (!localNote) return

        // Skip syncing empty notes (nothing to save yet)
        if (!localNote.content.trim() && localNote.title === 'Untitled') {
          console.log('Skipping sync of empty note:', localNote.id)
          return
        }

        // Sync images in content
        const syncedContent = await syncImageReferencesInContent(localNote.content, item.tabId)
        const noteToSync = { ...localNote, content: syncedContent }

        if (cloudId) {
          // Update existing cloud note
          await this.uploadNoteToCloud(noteToSync, cloudId)
        } else {
          // Create new cloud note
          const params = cloudStorage.tabDataToCreateParams(noteToSync, this.deviceId)
          const createdNote = await cloudStorage.createNote(params)
          this.localToCloudIdMap.set(item.tabId, createdNote.id)
        }

        // Update local note with synced content if changed
        if (syncedContent !== localNote.content) {
          localStorageService.saveTabImmediately({ ...localNote, content: syncedContent })
        }
        break
      }

      case 'delete': {
        if (cloudId) {
          console.log('Deleting note from cloud:', cloudId)
          await cloudStorage.deleteNote({ id: cloudId })
          this.localToCloudIdMap.delete(item.tabId)
        } else {
          console.log('Note was never synced to cloud, skipping delete:', item.tabId)
        }
        break
      }
    }
  }

  /**
   * Uploads a note to cloud
   */
  private async uploadNoteToCloud(note: TabData, cloudId: string): Promise<void> {
    const params = cloudStorage.tabDataToUpdateParams(note, cloudId, this.deviceId)
    await cloudStorage.updateNote(params)
  }

  /**
   * Loads sync queue from localStorage
   */
  private loadSyncQueue(): void {
    try {
      const stored = localStorage.getItem(SYNC_QUEUE_KEY)
      if (stored) {
        const items = JSON.parse(stored) as SyncQueueItem[]
        this.syncQueue = new Map(items.map((item) => [item.tabId, item]))
        this.updateSyncState({ pendingChanges: this.syncQueue.size })
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error)
    }
  }

  /**
   * Saves sync queue to localStorage
   */
  private saveSyncQueue(): void {
    try {
      const items = Array.from(this.syncQueue.values())
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(items))
    } catch (error) {
      console.error('Failed to save sync queue:', error)
    }
  }

  /**
   * Updates sync state and notifies listeners
   */
  private updateSyncState(updates: Partial<SyncState>): void {
    this.syncState = { ...this.syncState, ...updates }
    this.stateChangeCallbacks.forEach((callback) => callback(this.syncState))
  }

  /**
   * Triggers note update callbacks
   */
  private triggerNoteUpdate(notes: TabData[]): void {
    this.noteUpdateCallbacks.forEach((callback) => callback(notes))
  }

  /**
   * Triggers note deletion callbacks
   */
  private triggerNoteDeletion(noteId: string): void {
    this.noteDeletionCallbacks.forEach((callback) => callback(noteId))
  }

  /**
   * Subscribes to sync state changes
   */
  onSyncStateChange(callback: (state: SyncState) => void): () => void {
    this.stateChangeCallbacks.add(callback)
    // Return unsubscribe function
    return () => {
      this.stateChangeCallbacks.delete(callback)
    }
  }

  /**
   * Subscribes to note updates from sync
   */
  onNoteUpdate(callback: (notes: TabData[]) => void): () => void {
    this.noteUpdateCallbacks.add(callback)
    // Return unsubscribe function
    return () => {
      this.noteUpdateCallbacks.delete(callback)
    }
  }

  /**
   * Subscribes to note deletions from sync
   */
  onNoteDeletion(callback: (noteId: string) => void): () => void {
    this.noteDeletionCallbacks.add(callback)
    // Return unsubscribe function
    return () => {
      this.noteDeletionCallbacks.delete(callback)
    }
  }

  /**
   * Gets current sync state
   */
  getSyncState(): SyncState {
    return { ...this.syncState }
  }

  /**
   * Gets cloud ID for a local tab ID
   */
  getCloudId(localId: string): string | undefined {
    return this.localToCloudIdMap.get(localId)
  }

  /**
   * Cleanup - unsubscribe from realtime and clear timeouts
   */
  cleanup(): void {
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe()
      this.realtimeChannel = null
    }

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
      this.syncTimeout = null
    }

    this.isInitialized = false
    this.stateChangeCallbacks.clear()
    this.noteUpdateCallbacks.clear()
    this.noteDeletionCallbacks.clear()
  }
}

// Export singleton instance
export const syncService = new SyncService()
