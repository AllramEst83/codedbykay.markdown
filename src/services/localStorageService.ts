import type { TabData, TabMetadata } from '../types/services'
import { getServerAlignedTimestamp } from './serverTimeService'

export type { TabData }

const METADATA_KEY = 'markdown-editor-metadata'
const TAB_KEY_PREFIX = 'markdown-editor-tab-'
const THROTTLE_DELAY = 500 // 500ms throttle for better responsiveness

class LocalStorageService {
  private saveTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private saveCallbacks: Map<string, () => void> = new Map()
  private cachedTabs: Map<string, TabData> = new Map()
  private isMigrated = false

  constructor() {
    this.migrateOldStorageIfNeeded()
  }

  /**
   * Migrate from old monolithic storage to granular storage
   */
  private migrateOldStorageIfNeeded(): void {
    if (this.isMigrated) return
    
    try {
      const oldKey = 'markdown-editor-tabs'
      const oldData = localStorage.getItem(oldKey)
      const newMetadata = localStorage.getItem(METADATA_KEY)
      
      // Only migrate if old data exists and new format doesn't
      if (oldData && !newMetadata) {
        console.log('Migrating to granular storage format...')
        const tabs = JSON.parse(oldData) as TabData[]
        
        // Save each tab individually
        tabs.forEach(tab => {
          this.saveTabToStorage(tab)
        })
        
        // Save metadata
        const metadata: TabMetadata = {
          tabIds: tabs.map(t => t.id),
          activeTabId: tabs[0]?.id || null
        }
        localStorage.setItem(METADATA_KEY, JSON.stringify(metadata))
        
        // Remove old storage
        localStorage.removeItem(oldKey)
        console.log('Migration complete')
      }
    } catch (error) {
      console.error('Failed to migrate storage:', error)
    }
    
    this.isMigrated = true
  }

  /**
   * Get a single tab from localStorage
   */
  private getTabFromStorage(tabId: string): TabData | null {
    try {
      const stored = localStorage.getItem(`${TAB_KEY_PREFIX}${tabId}`)
      if (stored) {
        const tab = JSON.parse(stored) as TabData
        return this.validateTabData(tab)
      }
    } catch (error) {
      console.error(`Failed to load tab ${tabId}:`, error)
    }
    return null
  }

  /**
   * Save a single tab to localStorage
   */
  private saveTabToStorage(tab: TabData, options?: { preserveLastSaved?: boolean }): void {
    try {
      const preserveLastSaved = options?.preserveLastSaved ?? false
      const existingTab = preserveLastSaved ? this.getTabFromStorage(tab.id) : null
      const validatedTab = this.validateTabData(tab)
      const { timestamp, isAligned } = getServerAlignedTimestamp()
      const lastSaved = preserveLastSaved
        ? (validatedTab.lastSaved ?? existingTab?.lastSaved ?? timestamp)
        : timestamp
      const lastSavedServerTime = preserveLastSaved
        ? (validatedTab.lastSavedServerTime ?? existingTab?.lastSavedServerTime ?? false)
        : isAligned
      const tabWithTimestamp = {
        ...validatedTab,
        lastSaved,
        lastSavedServerTime,
      }
      localStorage.setItem(`${TAB_KEY_PREFIX}${tab.id}`, JSON.stringify(tabWithTimestamp))
      this.cachedTabs.set(tab.id, tabWithTimestamp)
    } catch (error) {
      console.error(`Failed to save tab ${tab.id}:`, error)
    }
  }

  /**
   * Validate and clean tab data
   */
  private validateTabData(tab: TabData): TabData {
    let content: string
    if (typeof tab.content === 'string') {
      content = tab.content === '[object Object]' ? '' : tab.content
    } else if (tab.content === null || tab.content === undefined) {
      content = ''
    } else if (typeof tab.content === 'object') {
      content = ''
    } else {
      content = String(tab.content || '')
      if (content === '[object Object]') {
        content = ''
      }
    }
    
    let title: string
    if (typeof tab.title === 'string') {
      title = tab.title === '[object Object]' ? 'Untitled' : tab.title
    } else {
      title = typeof tab.title === 'object' ? 'Untitled' : String(tab.title || 'Untitled')
      if (title === '[object Object]') {
        title = 'Untitled'
      }
    }
    
    const lastSaved = typeof tab.lastSaved === 'number' ? tab.lastSaved : undefined
    const lastSavedServerTime = typeof tab.lastSavedServerTime === 'boolean' ? tab.lastSavedServerTime : undefined
    const cloudId = typeof tab.cloudId === 'string' ? tab.cloudId : undefined
    const cloudUpdatedAt = typeof tab.cloudUpdatedAt === 'string' ? tab.cloudUpdatedAt : undefined
    
    return {
      ...tab,
      content,
      title,
      lastSaved,
      lastSavedServerTime,
      cloudId,
      cloudUpdatedAt,
    }
  }

  /**
   * Get metadata from localStorage
   */
  private getMetadata(): TabMetadata | null {
    try {
      const stored = localStorage.getItem(METADATA_KEY)
      if (stored) {
        return JSON.parse(stored) as TabMetadata
      }
    } catch (error) {
      console.error('Failed to load metadata:', error)
    }
    return null
  }

  /**
   * Save metadata to localStorage
   */
  private saveMetadata(metadata: TabMetadata): void {
    try {
      localStorage.setItem(METADATA_KEY, JSON.stringify(metadata))
    } catch (error) {
      console.error('Failed to save metadata:', error)
    }
  }

  /**
   * Get saved tabs from localStorage (for comparison)
   */
  getSavedTabs(): Map<string, TabData> {
    const map = new Map<string, TabData>()
    const metadata = this.getMetadata()
    
    if (metadata) {
      metadata.tabIds.forEach(tabId => {
        const tab = this.getTabFromStorage(tabId)
        if (tab) {
          map.set(tabId, tab)
        }
      })
    }
    
    return map
  }

  /**
   * Check if a tab is dirty (has unsaved changes)
   */
  isTabDirty(tab: TabData): boolean {
    const savedTab = this.cachedTabs.get(tab.id) || this.getTabFromStorage(tab.id)
    
    if (!savedTab) {
      // New tab with content is dirty
      return tab.content !== '' || tab.title !== 'Untitled'
    }
    
    // Compare content and title
    return savedTab.content !== tab.content || savedTab.title !== tab.title
  }

  /**
   * Save dirty tabs to localStorage with throttling
   * This now only saves the changed tabs, not the entire state
   * @param dirtyTabs - Array of tabs that are dirty and need to be saved
   * @param allTabs - All tabs (for metadata)
   * @param onSave - Callback when each tab is saved
   * @returns Array of dirty tab IDs
   */
  saveDirtyTabs(dirtyTabs: TabData[], allTabs: TabData[], onSave?: (tabId: string) => void): string[] {
    const dirtyTabIds = dirtyTabs.map((tab) => tab.id)
    
    if (dirtyTabIds.length === 0) {
      return []
    }
    
    // Clear existing timeouts for dirty tabs
    dirtyTabIds.forEach((tabId) => {
      const existingTimeout = this.saveTimeouts.get(tabId)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
        this.saveTimeouts.delete(tabId)
      }
    })
    
    // Store callbacks for dirty tabs
    if (onSave) {
      dirtyTabIds.forEach((tabId) => {
        this.saveCallbacks.set(tabId, () => onSave(tabId))
      })
    }

    // Set a timeout to save only the dirty tabs
    const timeout = setTimeout(() => {
      // Save only the dirty tabs (not the entire state)
      dirtyTabs.forEach(tab => {
        this.saveTabToStorage(tab)
      })
      
      // Update metadata (lightweight operation)
      this.updateMetadata(allTabs)
      
      // Trigger callbacks for dirty tabs
      dirtyTabIds.forEach((tabId) => {
        const callback = this.saveCallbacks.get(tabId)
        if (callback) {
          callback()
          this.saveCallbacks.delete(tabId)
        }
        this.saveTimeouts.delete(tabId)
      })
    }, THROTTLE_DELAY)

    // Store timeout for all dirty tabs
    dirtyTabIds.forEach((tabId) => {
      this.saveTimeouts.set(tabId, timeout)
    })
    
    return dirtyTabIds
  }

  /**
   * Update metadata without touching tab content
   */
  updateMetadata(tabs: TabData[]): void {
    const metadata: TabMetadata = {
      tabIds: tabs.map(t => t.id),
      activeTabId: tabs[0]?.id || null
    }
    this.saveMetadata(metadata)
  }

  /**
   * Load tabs from localStorage
   */
  loadTabs(): TabData[] {
    this.migrateOldStorageIfNeeded()
    
    const metadata = this.getMetadata()
    if (!metadata || metadata.tabIds.length === 0) {
      return []
    }
    
    const tabs: TabData[] = []
    metadata.tabIds.forEach(tabId => {
      const tab = this.getTabFromStorage(tabId)
      if (tab) {
        tabs.push(tab)
        this.cachedTabs.set(tabId, tab)
      }
    })
    
    return tabs
  }

  /**
   * Save a single tab immediately (for manual save)
   */
  saveTabImmediately(tab: TabData, options?: { preserveLastSaved?: boolean }): void {
    this.saveTabToStorage(tab, options)
    
    // Ensure tab is in metadata
    const metadata = this.getMetadata()
    if (metadata && !metadata.tabIds.includes(tab.id)) {
      metadata.tabIds.push(tab.id)
      this.saveMetadata(metadata)
    }
  }

  /**
   * Remove a tab from storage
   */
  removeTab(tabId: string): void {
    try {
      localStorage.removeItem(`${TAB_KEY_PREFIX}${tabId}`)
      this.cachedTabs.delete(tabId)
      
      // Update metadata
      const metadata = this.getMetadata()
      if (metadata) {
        metadata.tabIds = metadata.tabIds.filter(id => id !== tabId)
        if (metadata.activeTabId === tabId) {
          metadata.activeTabId = metadata.tabIds[0] || null
        }
        this.saveMetadata(metadata)
      }
    } catch (error) {
      console.error(`Failed to remove tab ${tabId}:`, error)
    }
  }

  /**
   * Clear all timeouts (useful for cleanup)
   */
  clearTimeouts(): void {
    this.saveTimeouts.forEach((timeout) => clearTimeout(timeout))
    this.saveTimeouts.clear()
    this.saveCallbacks.clear()
  }
}

export const localStorageService = new LocalStorageService()
