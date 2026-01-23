/**
 * Sync Service
 * Main orchestration service for note synchronization between local and cloud storage
 */

import { getSupabaseClient } from '../supabase/client'
import { localStorageService } from './localStorageService'
import * as cloudStorage from './cloudStorageService'
import { resolveConflict } from './conflictResolver'
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
  private isConnected = false
  private deviceId: string = getDeviceId()
  private currentUserId: string | null = null
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  
  // Map of local tab IDs to cloud note IDs
  private localToCloudIdMap: Map<string, string> = new Map()
  
  // Callbacks for state changes
  private stateChangeCallbacks: Set<(state: SyncState) => void> = new Set()
  private noteUpdateCallbacks: Set<(notes: TabData[]) => void> = new Set()
  private noteDeletionCallbacks: Set<(noteId: string) => void> = new Set()
  private pendingIncomingCallbacks: Set<(pendingTabIds: string[]) => void> = new Set()
  private tabDirtyChecker: ((tabId: string) => boolean) | null = null
  private pendingIncomingUpdates: Map<string, CloudNote> = new Map()

  /**
   * Initializes the sync service
   * Should be called after user logs in
   */
  async initialize(userId: string): Promise<void> {
    if (this.isInitialized) {
      console.log('Sync service already initialized')
      this.currentUserId = userId // Ensure we always have the latest userId
      return
    }

    console.log('Initializing sync service...')
    this.currentUserId = userId
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

      // Prime local-to-cloud mapping from stored metadata
      localNotes.forEach((note) => {
        if (note.cloudId) {
          this.localToCloudIdMap.set(note.id, note.cloudId)
        }
      })

      // Fetch cloud notes
      const cloudNotes = await cloudStorage.getNotes()
      console.log(`Found ${cloudNotes.length} cloud notes`)

      // Build maps for efficient lookup
      const cloudByLocalId = new Map<string, CloudNote>()
      const cloudByLocalAndDevice = new Map<string, CloudNote>()
      const cloudById = new Map<string, CloudNote>()
      
      cloudNotes.forEach((note) => {
        if (note.local_id) {
          cloudByLocalId.set(note.local_id, note)
          if (note.device_id) {
            cloudByLocalAndDevice.set(`${note.local_id}:${note.device_id}`, note)
          }
        }
        cloudById.set(note.id, note)
      })

      // Process local notes
      const notesToSync: TabData[] = []
      const notesToCreate: TabData[] = []

      for (const localNote of localNotes) {
        let cloudNote: CloudNote | undefined
        if (localNote.cloudId) {
          cloudNote = cloudById.get(localNote.cloudId)
        }
        if (!cloudNote) {
          cloudNote = cloudById.get(localNote.id)
        }
        if (!cloudNote) {
          cloudNote = cloudByLocalAndDevice.get(`${localNote.id}:${this.deviceId}`)
        }
        if (!cloudNote) {
          const legacyMatch = cloudByLocalId.get(localNote.id)
          if (legacyMatch && !legacyMatch.device_id) {
            cloudNote = legacyMatch
          }
        }

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
          const resolvedNote = {
            ...resolution.resolvedNote,
            cloudId: localNote.cloudId || cloudNote.id,
            cloudUpdatedAt: cloudNote.updated_at,
          }
          notesToSync.push(resolvedNote)
          
          // Map local ID to cloud ID
          this.localToCloudIdMap.set(localNote.id, cloudNote.id)

          // Persist cloud metadata without mutating lastSaved
          localStorageService.saveTabImmediately(resolvedNote, { preserveLastSaved: true })

          // Update cloud if local wins or merge
          if (resolution.strategy === 'local-wins' || resolution.strategy === 'merge') {
            const updatedCloud = await this.uploadNoteToCloud(resolvedNote, cloudNote.id)
            this.persistCloudMetadata(resolvedNote, updatedCloud)
          }
        }
      }

      // Process cloud notes not in local
      for (const cloudNote of cloudNotes) {
        const hasLocalVersion = localNotes.some((local) => {
          if (local.id === cloudNote.id) return true
          if (local.cloudId === cloudNote.id) return true
          if (this.localToCloudIdMap.get(local.id) === cloudNote.id) return true
          if (cloudNote.local_id && local.id === cloudNote.local_id) {
            return !cloudNote.device_id || cloudNote.device_id === this.deviceId
          }
          return false
        })

        if (!hasLocalVersion) {
          // Cloud-only note - download to local
          const tabData = cloudStorage.cloudNoteToTabData(cloudNote)
          notesToSync.push(tabData)
          this.localToCloudIdMap.set(tabData.id, cloudNote.id)
          localStorageService.saveTabImmediately(tabData, { preserveLastSaved: true })
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
          const noteWithCloud = {
            ...noteToCreate,
            cloudId: createdNote.id,
            cloudUpdatedAt: createdNote.updated_at,
          }
          localStorageService.saveTabImmediately(noteWithCloud, { preserveLastSaved: true })
          
          // Update local note with synced content
          if (syncedContent !== localNote.content) {
            notesToSync.push(noteWithCloud)
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

    // Clean up any existing channel before creating a new one
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe()
      this.realtimeChannel = null
    }

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
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription active')
          this.isConnected = true
          // If we were in error/offline state, consider ourselves healthy again
          if (this.syncState.status === 'error' || this.syncState.status === 'offline') {
            this.updateSyncState({
              status: this.syncQueue.size > 0 ? 'syncing' : 'synced',
              lastSync: Date.now(),
            })
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error')
          this.isConnected = false
          this.handleRealtimeChannelError()
        } else if (status === 'CLOSED') {
          this.isConnected = false
        }
      })
  }

  /**
   * Handles realtime channel errors and schedules reconnection
   */
  private handleRealtimeChannelError(): void {
    // Mark as error (drives red icon), but also schedule a reconnect attempt
    this.updateSyncState({ status: 'error' })

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // Schedule reconnection attempt with exponential backoff
    // Start with 5 seconds, but this will be overridden by visibility/focus events
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      this.reconnectIfNeeded()
    }, 5000)
  }

  /**
   * Public method to reconnect sync service when app becomes visible or online
   * Can be called from React components on visibilitychange, focus, or online events
   * @param force - If true, forces a full re-sync even if state looks healthy
   */
  async reconnectIfNeeded(force = false): Promise<void> {
    if (!this.isInitialized || !this.currentUserId) {
      return
    }

    // Check if we're actually online
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateSyncState({ status: 'offline' })
      this.isConnected = false
      return
    }

    // If force is true, or we're not connected, or we're in an error/offline state
    const shouldReconnect = force || !this.isConnected || this.syncState.status === 'error' || this.syncState.status === 'offline'

    if (!shouldReconnect) {
      return
    }

    try {
      console.log('Attempting sync service reconnect...', { force, isConnected: this.isConnected, status: this.syncState.status })
      this.updateSyncState({ status: 'syncing' })

      // If forcing or disconnected, perform a full initial sync to ensure we have latest data
      // This is crucial for mobile where we might have missed events while suspended
      if (force || !this.isConnected) {
        console.log('Performing full sync on reconnect...')
        await this.performInitialSync()
      }

      // Re-establish realtime subscription if needed
      if (!this.realtimeChannel || !this.isConnected) {
        await this.setupRealtimeSubscription(this.currentUserId)
      }
      
      // Process any pending queue items
      await this.processSyncQueue()

      // Update state based on queue status
      this.updateSyncState({
        status: this.syncQueue.size > 0 ? 'syncing' : 'synced',
        lastSync: Date.now(),
      })
      console.log('Sync service reconnect successful')
    } catch (error) {
      console.error('Sync service reconnect failed:', error)
      this.updateSyncState({ status: 'error' })
    }
  }

  /**
   * Sets sync state to offline (called when network goes offline)
   */
  setOffline(): void {
    if (this.isInitialized) {
      this.updateSyncState({ status: 'offline' })
    }
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

          await this.addCloudNoteToLocal(cloudNote, 'INSERT event')
          break
        }

        case 'UPDATE': {
          const rawNote = payload.new
          
          // Skip if we updated this note (same device)
          if (rawNote.device_id === this.deviceId) {
            console.log('Skipping UPDATE - same device')
            return
          }

          // Fetch decrypted note from backend
          console.log('Fetching decrypted note for UPDATE:', rawNote.id)
          const cloudNote = await cloudStorage.getNote(rawNote.id)

          // Find local note by cloud ID or stored metadata
          const localNotes = localStorageService.loadTabs()
          let localNote = localNotes.find((n) => n.cloudId === rawNote.id || n.id === rawNote.id)
          if (!localNote) {
            const mappedLocalId = Array.from(this.localToCloudIdMap.entries())
              .find(([_, cloudId]) => cloudId === rawNote.id)?.[0]
            if (mappedLocalId) {
              localNote = localNotes.find((n) => n.id === mappedLocalId)
            }
          }

          if (!localNote) {
            // New note we don't have locally
            await this.addCloudNoteToLocal(cloudNote, 'UPDATE event')
            return
          }

          this.localToCloudIdMap.set(localNote.id, cloudNote.id)

          if (this.shouldDeferIncomingUpdate(localNote.id)) {
            console.log('Deferring update for dirty or queued note:', localNote.id)
            this.deferIncomingUpdate(localNote.id, cloudNote)
            return
          }

          this.removePendingIncoming(localNote.id)
          await this.applyCloudNoteUpdate(localNote, cloudNote, 'realtime')
          break
        }

        case 'DELETE': {
          const deletedNote = payload.old
          
          // Find local note by cloud ID
          const localNotes = localStorageService.loadTabs()
          const localNote = localNotes.find((n) => n.cloudId === deletedNote.id || n.id === deletedNote.id)
          const localId = localNote?.id || Array.from(this.localToCloudIdMap.entries())
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

    if (action === 'delete') {
      this.removePendingIncoming(tabId)
    }

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

    // Don't process queue if we're offline
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateSyncState({ status: 'offline' })
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
    await this.applyPendingUpdates()
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

    const cloudId = localNote?.cloudId || this.localToCloudIdMap.get(item.tabId)

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

        let updatedCloud: CloudNote
        if (cloudId) {
          // Update existing cloud note
          try {
            updatedCloud = await this.uploadNoteToCloud(noteToSync, cloudId)
          } catch (error) {
            if (cloudStorage.isConflictError(error)) {
              await this.handleUpdateConflict(noteToSync, cloudId)
              return
            }
            throw error
          }
        } else {
          // Create new cloud note
          const params = cloudStorage.tabDataToCreateParams(noteToSync, this.deviceId)
          updatedCloud = await cloudStorage.createNote(params)
        }
        this.localToCloudIdMap.set(item.tabId, updatedCloud.id)

        // Persist cloud metadata (and content if images were synced)
        localStorageService.saveTabImmediately(
          {
            ...localNote,
            content: syncedContent,
            cloudId: updatedCloud.id,
            cloudUpdatedAt: updatedCloud.updated_at,
          },
          { preserveLastSaved: syncedContent === localNote.content }
        )
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
  private async uploadNoteToCloud(note: TabData, cloudId: string): Promise<CloudNote> {
    let noteWithExpected = note
    if (!note.cloudUpdatedAt) {
      console.warn('Missing cloudUpdatedAt for update, fetching latest:', cloudId)
      const cloudNote = await cloudStorage.getNote(cloudId)
      this.persistCloudMetadata(note, cloudNote)
      noteWithExpected = {
        ...note,
        cloudId: cloudNote.id,
        cloudUpdatedAt: cloudNote.updated_at,
      }
    }
    const params = cloudStorage.tabDataToUpdateParams(noteWithExpected, cloudId, this.deviceId)
    return cloudStorage.updateNote(params)
  }

  /**
   * Handles optimistic concurrency conflicts (409) by resolving against latest cloud note.
   */
  private async handleUpdateConflict(localNote: TabData, cloudId: string): Promise<void> {
    console.warn('Conflict detected, fetching latest cloud note:', cloudId)
    const cloudNote = await cloudStorage.getNote(cloudId)
    this.localToCloudIdMap.set(localNote.id, cloudNote.id)

    const resolution = resolveConflict(localNote, cloudNote)
    const resolvedNote = resolution.resolvedNote

    // Persist resolution locally
    localStorageService.saveTabImmediately(resolvedNote, { preserveLastSaved: true })

    if (resolution.strategy !== 'local-wins') {
      await prefetchImagesInContent(resolvedNote.content)
      this.triggerNoteUpdate([resolvedNote])
    }

    if (resolution.strategy === 'cloud-wins') {
      return
    }

    // Local wins or merge - re-upload using latest expected_updated_at
    const syncedContent = await syncImageReferencesInContent(resolvedNote.content, localNote.id)
    const noteToUpload = { ...resolvedNote, content: syncedContent }
    const updatedCloud = await this.uploadNoteToCloud(noteToUpload, cloudNote.id)

    this.localToCloudIdMap.set(localNote.id, updatedCloud.id)
    localStorageService.saveTabImmediately(
      {
        ...noteToUpload,
        cloudId: updatedCloud.id,
        cloudUpdatedAt: updatedCloud.updated_at,
      },
      { preserveLastSaved: syncedContent === resolvedNote.content }
    )
  }

  /**
   * Persists cloud metadata without mutating lastSaved
   */
  private persistCloudMetadata(localNote: TabData, cloudNote: CloudNote): void {
    localStorageService.saveTabImmediately(
      {
        ...localNote,
        cloudId: cloudNote.id,
        cloudUpdatedAt: cloudNote.updated_at,
      },
      { preserveLastSaved: true }
    )
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

  private notifyPendingIncomingChange(): void {
    const pendingTabIds = Array.from(this.pendingIncomingUpdates.keys())
    this.pendingIncomingCallbacks.forEach((callback) => callback(pendingTabIds))
  }

  private isTabDirty(tabId: string): boolean {
    if (!this.tabDirtyChecker) {
      return false
    }
    try {
      return this.tabDirtyChecker(tabId)
    } catch (error) {
      console.warn('Failed to check dirty state for tab:', tabId, error)
      return false
    }
  }

  private isTabQueued(tabId: string): boolean {
    return this.syncQueue.has(tabId)
  }

  private shouldDeferIncomingUpdate(tabId: string): boolean {
    return this.isTabDirty(tabId) || this.isTabQueued(tabId)
  }

  private deferIncomingUpdate(tabId: string, cloudNote: CloudNote): void {
    const queuedItem = this.syncQueue.get(tabId)
    if (queuedItem?.action === 'delete') {
      console.log('Skipping incoming update for tab queued for delete:', tabId)
      this.removePendingIncoming(tabId)
      return
    }

    const existing = this.pendingIncomingUpdates.get(tabId)
    if (
      !existing ||
      new Date(cloudNote.updated_at).getTime() >= new Date(existing.updated_at).getTime()
    ) {
      this.pendingIncomingUpdates.set(tabId, cloudNote)
    }
    this.notifyPendingIncomingChange()
  }

  private removePendingIncoming(tabId: string): void {
    if (this.pendingIncomingUpdates.delete(tabId)) {
      this.notifyPendingIncomingChange()
    }
  }

  private async addCloudNoteToLocal(cloudNote: CloudNote, sourceLabel: string): Promise<void> {
    const tabData = cloudStorage.cloudNoteToTabData(cloudNote)
    this.localToCloudIdMap.set(tabData.id, cloudNote.id)
    localStorageService.saveTabImmediately(tabData, { preserveLastSaved: true })
    await prefetchImagesInContent(tabData.content)
    console.log(`Adding note from ${sourceLabel}:`, tabData)
    this.triggerNoteUpdate([tabData])
  }

  private async applyCloudNoteUpdate(
    localNote: TabData,
    cloudNote: CloudNote,
    sourceLabel: string
  ): Promise<void> {
    const resolution = resolveConflict(localNote, cloudNote)

    if (resolution.strategy === 'cloud-wins' || resolution.strategy === 'merge') {
      const resolvedNote = {
        ...resolution.resolvedNote,
        cloudId: localNote.cloudId || cloudNote.id,
        cloudUpdatedAt: cloudNote.updated_at,
      }
      await prefetchImagesInContent(resolvedNote.content)
      localStorageService.saveTabImmediately(resolvedNote, { preserveLastSaved: true })
      console.log(`Updating note from ${sourceLabel}:`, resolvedNote)
      this.triggerNoteUpdate([resolvedNote])
    } else {
      console.log('Local note is newer, skipping update')
    }
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
   * Subscribes to pending incoming change updates
   */
  onPendingIncomingChange(callback: (pendingTabIds: string[]) => void): () => void {
    this.pendingIncomingCallbacks.add(callback)
    callback(Array.from(this.pendingIncomingUpdates.keys()))
    return () => {
      this.pendingIncomingCallbacks.delete(callback)
    }
  }

  /**
   * Registers a dirty state checker for realtime updates
   */
  setTabDirtyChecker(checker: (tabId: string) => boolean): () => void {
    this.tabDirtyChecker = checker
    return () => {
      if (this.tabDirtyChecker === checker) {
        this.tabDirtyChecker = null
      }
    }
  }

  /**
   * Applies any pending incoming updates that are safe to merge
   */
  async applyPendingUpdates(tabId?: string): Promise<void> {
    if (this.pendingIncomingUpdates.size === 0) {
      return
    }

    const pendingEntries = tabId
      ? this.pendingIncomingUpdates.has(tabId)
        ? [[tabId, this.pendingIncomingUpdates.get(tabId)!]]
        : []
      : Array.from(this.pendingIncomingUpdates.entries())

    if (pendingEntries.length === 0) {
      return
    }

    let didUpdate = false

    for (const [localId, cloudNote] of pendingEntries) {
      if (this.shouldDeferIncomingUpdate(localId)) {
        continue
      }

      const localNotes = localStorageService.loadTabs()
      const localNote = localNotes.find((note) => note.id === localId)

      if (!localNote) {
        await this.addCloudNoteToLocal(cloudNote, 'pending update')
      } else {
        this.localToCloudIdMap.set(localNote.id, cloudNote.id)
        await this.applyCloudNoteUpdate(localNote, cloudNote, 'pending update')
      }

      this.pendingIncomingUpdates.delete(localId)
      didUpdate = true
    }

    if (didUpdate) {
      this.notifyPendingIncomingChange()
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

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.isInitialized = false
    this.currentUserId = null
    this.stateChangeCallbacks.clear()
    this.noteUpdateCallbacks.clear()
    this.noteDeletionCallbacks.clear()
    this.pendingIncomingCallbacks.clear()
    this.pendingIncomingUpdates.clear()
    this.tabDirtyChecker = null
  }
}

// Export singleton instance
export const syncService = new SyncService()
