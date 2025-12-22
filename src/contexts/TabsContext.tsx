import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { localStorageService } from '../services/localStorageService'
import { syncService } from '../services/syncService'
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
    if (loadedTabs.length === 0) {
      // Create initial tab if none exist
      const initialTabId = `tab-${Date.now()}`
      return [{
        id: initialTabId,
        title: 'Untitled',
        content: '',
      }]
    }
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
    // If no tabs loaded, we created an initial tab above, so get its ID from tabs
    // Since tabs is initialized synchronously, we can safely access tabs[0]
    const initialTabs = (() => {
      const loaded = localStorageService.loadTabs()
      if (loaded.length === 0) {
        return [{
          id: `tab-${Date.now()}`,
          title: 'Untitled',
          content: '',
        }]
      }
      return loaded.map((tab) => ({
        ...tab,
        content: typeof tab.content === 'string' ? tab.content : String(tab.content || ''),
        title: typeof tab.title === 'string' ? tab.title : String(tab.title || 'Untitled'),
      }))
    })()
    return initialTabs.length > 0 ? initialTabs[0].id : null
  })

  const [saveState, setSaveState] = useState<Map<string, 'saving' | 'saved' | 'idle'>>(new Map())
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSync: null,
    pendingChanges: 0,
  })
  
  // Get auth state for sync
  const authStatus = useAuthStore((state) => state.status)
  const isAuthenticated = authStatus === 'authenticated'
  
  // Ref to store the debounce timeout for auto-saving (browser timeout ID)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
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
    }
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
      if (filtered.length === 0) {
        // If closing last tab, create a new one
        const newTab: TabData = {
          id: `tab-${Date.now()}`,
          title: 'Untitled',
          content: '',
        }
        setActiveTabId(newTab.id)
        return [newTab]
      }
      // Switch to another tab if closing active tab
      if (activeTabId === tabId) {
        const currentIndex = prev.findIndex((tab) => tab.id === tabId)
        const newIndex = currentIndex > 0 ? currentIndex - 1 : 0
        setActiveTabId(filtered[newIndex]?.id || filtered[0].id)
      }
      return filtered
    })
    
    // Remove tab from localStorage
    localStorageService.removeTab(tabId)
    
    // Queue for cloud deletion if authenticated
    if (isAuthenticated) {
      syncService.queueNoteForSync(tabId, 'delete')
    }
    
    // Clean up save state and last saved state
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
    
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, content: contentString } : tab))
    )
  }, [])

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === tabId) {
          // Preserve all existing properties, especially content
          return { ...tab, title }
        }
        return tab
      })
    )
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

  // Subscribe to note deletions from sync (cloud changes)
  useEffect(() => {
    const unsubscribe = syncService.onNoteDeletion((deletedNoteId) => {
      console.log('Received deletion event for note:', deletedNoteId)
      
      setTabs((prevTabs) => {
        const filtered = prevTabs.filter((tab) => tab.id !== deletedNoteId)
        
        // If deleting the last tab, create a new one
        if (filtered.length === 0) {
          const newTab: TabData = {
            id: `tab-${Date.now()}`,
            title: 'Untitled',
            content: '',
          }
          setActiveTabId(newTab.id)
          return [newTab]
        }
        
        // Switch to another tab if deleting active tab
        if (activeTabId === deletedNoteId) {
          const currentIndex = prevTabs.findIndex((tab) => tab.id === deletedNoteId)
          const newIndex = currentIndex > 0 ? currentIndex - 1 : 0
          setActiveTabId(filtered[newIndex]?.id || filtered[0].id)
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
  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    // Queue dirty tabs for sync
    tabs.forEach((tab) => {
      const lastSaved = lastSavedState.get(tab.id)
      if (lastSaved && (lastSaved.content !== tab.content || lastSaved.title !== tab.title)) {
        // Note has changes - queue for sync
        syncService.queueNoteForSync(tab.id, 'update')
      }
    })
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
        saveState,
        syncState,
      }}
    >
      {children}
    </TabsContext.Provider>
  )
}
