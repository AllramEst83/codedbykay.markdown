import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { localStorageService } from '../services/localStorageService'
import { syncService } from '../services/syncService'
import * as yjsDocService from '../services/yjsDocService'
import { useAuthStore } from './AuthContext'
import type { TabData } from '../types/services'
import type { TabsContextType, TabsProviderProps } from '../types/contexts'
import type { SyncState } from '../types/services/sync'

const TabsContext = createContext<TabsContextType | undefined>(undefined)

export const useTabs = () => {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('useTabs must be used within a TabsProvider')
  }
  return context
}

export const TabsProvider = ({ children }: TabsProviderProps) => {
  const [tabs, setTabs] = useState<TabData[]>(() => {
    const loadedTabs = localStorageService.loadTabs()
    // Ensure all loaded tabs have string content
    return loadedTabs.map((tab) => ({
      ...tab,
      content: typeof tab.content === 'string' ? tab.content : String(tab.content || ''),
      title: typeof tab.title === 'string' ? tab.title : String(tab.title || 'Untitled'),
    }))
  })

  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const loadedTabs = localStorageService.loadTabs()
    if (loadedTabs.length > 0) {
      return loadedTabs[0].id
    }
    return null
  })

  const [saveState, setSaveState] = useState<Map<string, 'saving' | 'saved' | 'idle'>>(new Map())
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSync: null,
    pendingChanges: 0,
  })
  const [pendingIncomingTabIds, setPendingIncomingTabIds] = useState<Set<string>>(new Set())
  
  // Get auth state for sync
  const authStatus = useAuthStore((state) => state.status)
  const isAuthenticated = authStatus === 'authenticated'
  
  // Ref to store the debounce timeout for auto-saving (browser timeout ID)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Track last edit time per tab (used to defer incoming sync updates during active editing)
  // Using ref instead of state to avoid unnecessary re-renders on every keystroke
  const lastEditTimeRef = useRef<Map<string, number>>(new Map())
  
  // Track tabs that have been edited by the user and need cloud sync
  // This prevents queuing syncs for tabs that were updated via realtime (not user edits)
  const tabsNeedingSyncRef = useRef<Set<string>>(new Set())

  // Mirrors `tabs` for callbacks (updateTabTitle, etc.) that need to read current
  // tab data (like contentFormat) without taking `tabs` as a dependency
  const tabsRef = useRef<TabData[]>(tabs)
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  // Tracks legacy ('plain') tabs currently mid-migration to Yjs, so a second edit
  // arriving before the first migration's seed finishes doesn't kick off a second
  // concurrent seed for the same tab (see migrateLegacyTabToYjs).
  const migratingTabsRef = useRef<Set<string>>(new Set())

  // Lazily migrates a legacy note to Yjs on its first edit on this device (per-note,
  // no batch job). The tab stays in plain-format mode, completely unaffected, until
  // the doc has been seeded with `content`/`title` - only then does contentFormat
  // flip to 'yjs', so nothing about the existing plain-mode save/sync path changes
  // while migration is in flight.
  const migrateLegacyTabToYjs = useCallback((tabId: string, content: string, title: string) => {
    if (migratingTabsRef.current.has(tabId)) {
      return
    }
    migratingTabsRef.current.add(tabId)
    void yjsDocService.seedFromPlainText(tabId, content, title).then(() => {
      // If further plain-mode edits landed while the seed above was still awaiting
      // IndexedDB load, catch the doc up to the latest content before flipping over -
      // safe here specifically because nothing else has ever seen this doc yet.
      const latestTab = tabsRef.current.find((t) => t.id === tabId)
      if (latestTab && (latestTab.content !== content || latestTab.title !== title)) {
        yjsDocService.resetToPlainText(tabId, latestTab.content, latestTab.title)
      }
      migratingTabsRef.current.delete(tabId)
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, contentFormat: 'yjs' } : t)))
    })
  }, [])
  
  // Track last saved state for each tab to detect dirty tabs
  // Only initialize for tabs loaded from localStorage, not newly created ones
  const [lastSavedState, setLastSavedState] = useState<Map<string, { content: string; title: string }>>(() => {
    const saved = new Map<string, { content: string; title: string }>()
    const loadedTabs = localStorageService.loadTabs()
    // Only initialize lastSavedState for tabs that were actually loaded from localStorage
    // Newly created tabs (including initial tab) should not be initialized here
    tabs.forEach((tab) => {
      const wasLoaded = loadedTabs.some(loadedTab => loadedTab.id === tab.id)
      if (wasLoaded) {
        saved.set(tab.id, { content: tab.content, title: tab.title })
      }
    })
    return saved
  })

  // Initialize save states and last saved state when tabs are first loaded
  useEffect(() => {
    const initialSaveState = new Map<string, 'saving' | 'saved' | 'idle'>()
    const initialLastSaved = new Map<string, { content: string; title: string }>()
    
    tabs.forEach((tab) => {
      initialSaveState.set(tab.id, 'idle')
      // Initialize last saved state to current state (tabs loaded from localStorage are not dirty)
      initialLastSaved.set(tab.id, { content: tab.content, title: tab.title })
    })
    
    setSaveState(initialSaveState)
    setLastSavedState((prev) => {
      // Only update if not already set (to preserve state during updates)
      const newState = new Map(prev)
      tabs.forEach((tab) => {
        if (!newState.has(tab.id)) {
          newState.set(tab.id, { content: tab.content, title: tab.title })
        }
      })
      return newState
    })
  }, []) // Only run once on mount

  // Auto-save only dirty tabs when tabs change (debounced)
  useEffect(() => {
    if (tabs.length === 0) return

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set a new timeout to save after user stops typing (800ms delay)
    saveTimeoutRef.current = setTimeout(() => {
      // Find dirty tabs by comparing with last saved state
      const dirtyTabIds: string[] = []
      const dirtyTabs: TabData[] = []
      
      tabs.forEach((tab) => {
        const lastSaved = lastSavedState.get(tab.id)
        if (!lastSaved) {
          // New tab that hasn't been saved yet - always mark as dirty to ensure it gets saved
          // This handles the case where a new tab is created but hasn't been saved yet
          dirtyTabIds.push(tab.id)
          dirtyTabs.push(tab)
        } else {
          // Compare with last saved state
          if (lastSaved.content !== tab.content || lastSaved.title !== tab.title) {
            dirtyTabIds.push(tab.id)
            dirtyTabs.push(tab)
          }
        }
      })

      // Only save and show saving state for dirty tabs
      if (dirtyTabIds.length > 0) {
        // Set dirty tabs to 'saving' state
        setSaveState((prev) => {
          const newState = new Map(prev)
          dirtyTabIds.forEach((tabId) => {
            newState.set(tabId, 'saving')
          })
          return newState
        })

        // Save only dirty tabs (not entire state) with throttling
        localStorageService.saveDirtyTabs(
          dirtyTabs, // Only dirty tabs
          tabs, // All tabs for metadata
          (tabId) => {
            // Update last saved state
            const tab = tabs.find((t) => t.id === tabId)
            if (tab) {
              setLastSavedState((prev) => {
                const newState = new Map(prev)
                newState.set(tabId, { content: tab.content, title: tab.title })
                return newState
              })
            }

            setSaveState((prev) => {
              const newState = new Map(prev)
              newState.set(tabId, 'saved')
              return newState
            })

            // Reset to idle after 2 seconds
            setTimeout(() => {
              setSaveState((prev) => {
                const newState = new Map(prev)
                if (newState.get(tabId) === 'saved') {
                  newState.set(tabId, 'idle')
                }
                return newState
              })
            }, 2000)
          }
        )
      }
    }, 800) // 800ms delay - save after user stops typing

    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [tabs, lastSavedState])

  const addTab = useCallback((initialContent = '', initialTitle = 'Untitled') => {
    // Ensure content and title are always strings
    // Guard against event objects being passed accidentally
    let contentString: string
    if (typeof initialContent === 'string') {
      contentString = initialContent
    } else if (initialContent === null || initialContent === undefined) {
      contentString = ''
    } else if (typeof initialContent === 'object') {
      // Likely an event object was passed - ignore it and use empty string
      console.warn('addTab received object as initialContent (likely an event), using empty string')
      contentString = ''
    } else {
      contentString = String(initialContent || '')
    }
    
    let titleString: string
    if (typeof initialTitle === 'string') {
      titleString = initialTitle
    } else if (initialTitle === null || initialTitle === undefined) {
      titleString = 'Untitled'
    } else if (typeof initialTitle === 'object') {
      console.warn('addTab received object as initialTitle (likely an event), using default')
      titleString = 'Untitled'
    } else {
      titleString = String(initialTitle || 'Untitled')
    }
    
    const newTab: TabData = {
      id: `tab-${Date.now()}`,
      title: titleString,
      content: contentString,
      contentFormat: 'yjs',
    }
    // New notes are Yjs-backed from creation - seed the doc with any initial content/title
    // now so the editor and sync layer see a fully-formed doc immediately.
    yjsDocService.seedNewNote(newTab.id, contentString, titleString)
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
    setSaveState((prev) => {
      const newState = new Map(prev)
      newState.set(newTab.id, 'idle')
      return newState
    })
    // Don't initialize lastSavedState for new tabs - let them be detected as dirty
    // and saved automatically. This ensures new tabs are saved even if empty.
    // lastSavedState will be set after the tab is successfully saved to localStorage.
    return newTab.id
  }, [])

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((tab) => tab.id !== tabId)
      
      // If closing active tab, switch to another one
      if (activeTabId === tabId) {
        if (filtered.length === 0) {
          setActiveTabId(null)
        } else {
          const currentIndex = prev.findIndex((tab) => tab.id === tabId)
          const newIndex = currentIndex > 0 ? currentIndex - 1 : 0
          setActiveTabId(filtered[newIndex]?.id || filtered[0].id)
        }
      }
      return filtered
    })
    
    // Remove tab from localStorage
    localStorageService.removeTab(tabId)
    
    // Queue for cloud deletion if authenticated
    if (isAuthenticated) {
      syncService.queueNoteForSync(tabId, 'delete')
    }

    // The note is gone for good (closing a tab deletes it, it's not a "hide" action) -
    // free its in-memory doc and local IndexedDB store.
    yjsDocService.disposeNoteDoc(tabId)

    // Clean up save state, last saved state, and last edit time
    setSaveState((prev) => {
      const newState = new Map(prev)
      newState.delete(tabId)
      return newState
    })
    setLastSavedState((prev) => {
      const newState = new Map(prev)
      newState.delete(tabId)
      return newState
    })
    lastEditTimeRef.current.delete(tabId)
    tabsNeedingSyncRef.current.delete(tabId)
  }, [activeTabId, isAuthenticated])

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const updateTabContent = useCallback((tabId: string, content: string) => {
    // Ensure content is always a string
    const contentString = typeof content === 'string' 
      ? content 
      : (content === null || content === undefined || typeof content === 'object')
      ? ''
      : String(content || '')
    
    // Track last edit time for this tab (used to defer incoming sync updates)
    lastEditTimeRef.current.set(tabId, Date.now())

    // Mark this tab as needing cloud sync (user edit, not realtime update)
    tabsNeedingSyncRef.current.add(tabId)

    const tab = tabsRef.current.find((t) => t.id === tabId)
    if (tab && tab.contentFormat !== 'yjs') {
      migrateLegacyTabToYjs(tabId, contentString, tab.title)
    }

    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, content: contentString } : tab))
    )
  }, [migrateLegacyTabToYjs])

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    // Track last edit time for this tab (used to defer incoming sync updates)
    lastEditTimeRef.current.set(tabId, Date.now())

    // Mark this tab as needing cloud sync (user edit, not realtime update)
    tabsNeedingSyncRef.current.add(tabId)

    const tab = tabsRef.current.find((t) => t.id === tabId)
    if (tab?.contentFormat === 'yjs') {
      // Route the title through the doc's meta map too, so it gets Yjs's
      // per-key CRDT merge instead of the legacy string-heuristic merge.
      yjsDocService.setTitle(tabId, title)
    } else if (tab) {
      migrateLegacyTabToYjs(tabId, tab.content, title)
    }

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === tabId) {
          // Preserve all existing properties, especially content
          return { ...tab, title }
        }
        return tab
      })
    )
  }, [migrateLegacyTabToYjs])

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const newTabs = [...prev]
      const [removed] = newTabs.splice(fromIndex, 1)
      newTabs.splice(toIndex, 0, removed)
      return newTabs
    })
  }, [])

  const saveTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (tab) {
      setSaveState((prev) => {
        const newState = new Map(prev)
        newState.set(tabId, 'saving')
        return newState
      })

      localStorageService.saveTabImmediately(tab)
      
      // Update last saved state
      setLastSavedState((prev) => {
        const newState = new Map(prev)
        newState.set(tabId, { content: tab.content, title: tab.title })
        return newState
      })
      
      setSaveState((prev) => {
        const newState = new Map(prev)
        newState.set(tabId, 'saved')
        return newState
      })

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveState((prev) => {
          const newState = new Map(prev)
          if (newState.get(tabId) === 'saved') {
            newState.set(tabId, 'idle')
          }
          return newState
        })
      }, 2000)
    }
  }, [tabs])

  // Memoize tab IDs string to prevent unnecessary metadata updates
  const tabIdsString = useMemo(() => tabs.map(t => t.id).join(','), [tabs])

  // Reconcile a Yjs-backed tab's title in React state when a remote merge changes
  // it outside of local typing (mirrors how onNoteUpdate reconciles content below,
  // scoped to just the title key). Keyed on id+format so a legacy tab flipping to
  // 'yjs' (Phase 7 migration) also gets subscribed.
  const yjsTabFormatsString = useMemo(
    () => tabs.filter((t) => t.contentFormat === 'yjs').map((t) => t.id).join(','),
    [tabs]
  )
  useEffect(() => {
    const yjsTabIds = yjsTabFormatsString ? yjsTabFormatsString.split(',') : []
    const unsubscribers = yjsTabIds.map((tabId) =>
      yjsDocService.onTitleChange(tabId, (title) => {
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)))
      })
    )
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [yjsTabFormatsString])
  
  // Update metadata when tab structure or active tab changes
  useEffect(() => {
    if (tabs.length > 0) {
      localStorageService.updateMetadata(tabs)
    }
  }, [tabIdsString, activeTabId]) // Only when tab structure or activeTabId change

  // Subscribe to sync state changes
  useEffect(() => {
    const unsubscribe = syncService.onSyncStateChange((state) => {
      setSyncState(state)
    })
    return unsubscribe
  }, [])

  // Subscribe to incoming change notifications
  useEffect(() => {
    const unsubscribe = syncService.onPendingIncomingChange((pendingTabIds) => {
      setPendingIncomingTabIds(new Set(pendingTabIds))
    })
    return unsubscribe
  }, [])

  const isTabDirty = useCallback((tabId: string): boolean => {
    const tab = tabs.find((current) => current.id === tabId)
    if (!tab) {
      return false
    }
    const lastSaved = lastSavedState.get(tabId)
    if (!lastSaved) {
      return true
    }
    return lastSaved.content !== tab.content || lastSaved.title !== tab.title
  }, [tabs, lastSavedState])

  const hasPendingIncomingChange = useCallback((tabId: string): boolean => {
    return pendingIncomingTabIds.has(tabId)
  }, [pendingIncomingTabIds])

  const getYText = useCallback((tabId: string) => {
    // Reads `tabs` directly (not tabsRef) - this is called synchronously during
    // render (App.tsx computes the Editor's `ytext` prop from it), and tabsRef only
    // catches up to `tabs` via an effect one tick later. A brand-new tab's contentFormat
    // wouldn't be visible yet on its very first render if this went through the ref.
    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.contentFormat !== 'yjs') {
      return undefined
    }
    return yjsDocService.getOrCreateNoteDoc(tabId).ytext
  }, [tabs])

  // Check if a tab was recently edited within the grace period
  // This is used to defer incoming sync updates during active editing
  const isTabRecentlyEdited = useCallback((tabId: string, graceMs: number): boolean => {
    const lastEdit = lastEditTimeRef.current.get(tabId)
    if (!lastEdit) {
      return false
    }
    return Date.now() - lastEdit < graceMs
  }, [])

  // Share dirty state with sync service for realtime updates
  useEffect(() => {
    const unsubscribe = syncService.setTabDirtyChecker(isTabDirty)
    return unsubscribe
  }, [isTabDirty])

  // Share recent edit checker with sync service for realtime updates
  useEffect(() => {
    const unsubscribe = syncService.setTabRecentEditChecker(isTabRecentlyEdited)
    return unsubscribe
  }, [isTabRecentlyEdited])

  // Subscribe to note updates from sync (cloud changes)
  useEffect(() => {
    const unsubscribe = syncService.onNoteUpdate((updatedNotes) => {
      if (updatedNotes.length === 0) {
        // Empty update - nothing to do
        return
      }

      setTabs((prevTabs) => {
        const updatedTabsMap = new Map(prevTabs.map((t) => [t.id, t]))
        
        // Update or add synced notes
        updatedNotes.forEach((note) => {
          updatedTabsMap.set(note.id, note)
        })

        return Array.from(updatedTabsMap.values())
      })

      // Update last saved state for synced notes
      setLastSavedState((prev) => {
        const newState = new Map(prev)
        updatedNotes.forEach((note) => {
          newState.set(note.id, { content: note.content, title: note.title })
        })
        return newState
      })
    })
    return unsubscribe
  }, [])

  // Attempt to apply any pending incoming updates when state changes
  useEffect(() => {
    void syncService.applyPendingUpdates()
  }, [tabs, lastSavedState])

  // Subscribe to note deletions from sync (cloud changes)
  useEffect(() => {
    const unsubscribe = syncService.onNoteDeletion((deletedNoteId) => {
      console.log('Received deletion event for note:', deletedNoteId)
      
      setTabs((prevTabs) => {
        const filtered = prevTabs.filter((tab) => tab.id !== deletedNoteId)
        
        // If deleting active tab, switch to another one or null
        if (activeTabId === deletedNoteId) {
          if (filtered.length === 0) {
            setActiveTabId(null)
          } else {
            const currentIndex = prevTabs.findIndex((tab) => tab.id === deletedNoteId)
            const newIndex = currentIndex > 0 ? currentIndex - 1 : 0
            setActiveTabId(filtered[newIndex]?.id || filtered[0].id)
          }
        }
        
        return filtered
      })
      
      // Clean up save state and last saved state
      setSaveState((prev) => {
        const newState = new Map(prev)
        newState.delete(deletedNoteId)
        return newState
      })
      setLastSavedState((prev) => {
        const newState = new Map(prev)
        newState.delete(deletedNoteId)
        return newState
      })
    })
    return unsubscribe
  }, [activeTabId])

  // Queue notes for cloud sync after local save (only if authenticated)
  // Only queue tabs that were edited by the user, not those updated via realtime
  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    // Only queue tabs that the user actually edited
    const tabsToSync = tabsNeedingSyncRef.current
    if (tabsToSync.size === 0) {
      return
    }

    // Queue dirty tabs for sync (only user-edited ones)
    tabs.forEach((tab) => {
      if (!tabsToSync.has(tab.id)) {
        return // Skip tabs not edited by user
      }
      
      const lastSaved = lastSavedState.get(tab.id)
      if (lastSaved && (lastSaved.content !== tab.content || lastSaved.title !== tab.title)) {
        // Note has changes - queue for sync
        syncService.queueNoteForSync(tab.id, 'update')
      }
    })
    
    // Clear the set after processing (sync service has its own debouncing)
    tabsNeedingSyncRef.current.clear()
  }, [tabs, lastSavedState, isAuthenticated])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStorageService.clearTimeouts()
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeTabId,
        addTab,
        closeTab,
        switchTab,
        updateTabContent,
        updateTabTitle,
        saveTab,
        reorderTabs,
        isTabDirty,
        hasPendingIncomingChange,
        getYText,
        saveState,
        syncState,
      }}
    >
      {children}
    </TabsContext.Provider>
  )
}
