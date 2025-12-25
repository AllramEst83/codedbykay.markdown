import { useState, useRef, useEffect, memo, useCallback } from 'react'
import { useTabs } from '../contexts/TabsContext'
import { useTheme } from '../contexts/ThemeContext'
import { useModal } from '../contexts/ModalContext'
import { useAuthStore } from '../contexts/AuthContext'
import { HelpCircle, Cloud, CloudOff, AlertCircle, RotateCw } from 'lucide-react'
import AuthButton from './auth/AuthButton'
import './TabBar.css'

const TabBarComponent = () => {
  const { tabs, activeTabId, addTab, closeTab, switchTab, updateTabTitle, reorderTabs, saveState, syncState } = useTabs()
  const { previewTheme } = useTheme()
  const { showModal } = useModal()
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated')
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Drag and drop state
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [touchDragState, setTouchDragState] = useState<{
    tabId: string | null
    startX: number
    currentX: number
    tabIndex: number
    hasMoved: boolean
  } | null>(null)
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const clickBlockedRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartPosRef = useRef<{x: number, y: number} | null>(null)

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleDoubleClick = (tabId: string, currentTitle: string) => {
    setEditingTabId(tabId)
    setEditingTitle(currentTitle)
  }

  const handleTitleSubmit = (tabId: string) => {
    if (editingTitle.trim()) {
      updateTabTitle(tabId, editingTitle.trim())
    }
    setEditingTabId(null)
    setEditingTitle('')
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      handleTitleSubmit(tabId)
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
      setEditingTitle('')
    }
  }

  const getSaveIndicator = (tabId: string) => {
    const state = saveState.get(tabId) || 'idle'
    if (state === 'saving') {
      return (
        <span className="save-indicator saving">
          <span className="spinner"></span>
          <span className="save-text">Saving...</span>
        </span>
      )
    } else if (state === 'saved') {
      return (
        <span className="save-indicator saved">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="save-text">Saved</span>
        </span>
      )
    }
    return null
  }

  const handleShowHelp = useCallback(async () => {
    await showModal({
      type: 'alert',
      title: 'How to Use This App',
      message: `Welcome to the Markdown Editor!

BASIC USAGE:
• Create new tabs by clicking the + button
• Double-click a tab title to rename it
• Use the toolbar buttons to format your text
• Your markdown is automatically rendered in the preview pane

KEYBOARD SHORTCUTS:
• Use toolbar buttons for quick formatting
• Drag the divider between editor and preview to resize

IMAGES:
• Click the image button to insert images
• Images are automatically compressed and stored locally
• Use the Images button to manage your stored images

SAVING:
• Click the Save button to download your markdown file
• Use the Open button to load markdown files

IMPORTANT - STORAGE:
By default, this app stores all your notes and images locally in your browser on this device only.

To enable cloud syncing and access your notes across devices:
• Click the profile icon to sign up or log in
• Your notes will automatically sync to the cloud
• Access your notes from any device by logging in

If you clear your browser data while logged out, your notes will be lost. Log in to keep them safe!`,
      confirmText: 'Got it'
    })
  }, [showModal])

  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) {
      return 'Never'
    }
    
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (seconds < 60) {
      return 'Just now'
    } else if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    } else if (hours < 24) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`
    } else if (days < 7) {
      return `${days} day${days === 1 ? '' : 's'} ago`
    } else {
      return new Date(timestamp).toLocaleDateString()
    }
  }

  const handleShowSyncStatus = useCallback(async () => {
    if (!isAuthenticated) {
      return
    }

    const { status, pendingChanges, lastSync } = syncState

    let statusText = ''
    let statusDetails = ''

    switch (status) {
      case 'syncing':
        statusText = 'Syncing...'
        statusDetails = pendingChanges > 0 
          ? `Syncing ${pendingChanges} change${pendingChanges === 1 ? '' : 's'} to the cloud.`
          : 'Synchronizing your notes with the cloud.'
        break
      case 'synced':
        statusText = 'Synced'
        statusDetails = 'All your notes are synchronized with the cloud.'
        break
      case 'error':
        statusText = 'Sync Error'
        statusDetails = 'There was an error syncing your notes. The app will automatically retry.'
        break
      case 'offline':
        statusText = 'Offline'
        statusDetails = 'You are currently offline. Changes will sync automatically when you reconnect.'
        break
      case 'idle':
        statusText = 'Idle'
        statusDetails = 'Sync service is idle.'
        break
      default:
        statusText = 'Unknown'
        statusDetails = 'Sync status is unknown.'
    }

    const message = `Sync Status: ${statusText}

${statusDetails}

${pendingChanges > 0 ? `Pending Changes: ${pendingChanges}\n` : ''}Last Sync: ${formatLastSync(lastSync)}`

    await showModal({
      type: 'alert',
      title: 'Sync Status',
      message: message,
      confirmText: 'OK'
    })
  }, [isAuthenticated, syncState, showModal])

  const getSyncIndicator = () => {
    if (!isAuthenticated) {
      return null
    }

    const { status, pendingChanges } = syncState

    let icon
    let title
    let className = 'sync-indicator'

    switch (status) {
      case 'syncing':
        icon = <RotateCw size={14} className="sync-icon spinning" />
        title = `Syncing${pendingChanges > 0 ? ` (${pendingChanges} pending)` : ''}...`
        className += ' syncing'
        break
      case 'synced':
        icon = <Cloud size={14} className="sync-icon" />
        title = 'Synced to cloud'
        className += ' synced'
        break
      case 'error':
        icon = <AlertCircle size={14} className="sync-icon" />
        title = 'Sync error - will retry'
        className += ' error'
        break
      case 'offline':
        icon = <CloudOff size={14} className="sync-icon" />
        title = 'Offline - will sync when online'
        className += ' offline'
        break
      default:
        return null
    }

    return (
      <button 
        className={className} 
        title={title}
        onClick={handleShowSyncStatus}
        aria-label="Show sync status"
      >
        {icon}
      </button>
    )
  }

  const handleCloseTab = async (e: React.MouseEvent, tabId: string, tabTitle: string) => {
    e.stopPropagation()
    
    const result = await showModal({
      type: 'confirm',
      title: 'Delete Tab',
      message: `Are you sure you want to delete "${tabTitle}"?`,
      confirmText: 'Delete',
      variant: 'danger'
    })

    if (result) {
      closeTab(tabId)
    }
  }

  // Desktop drag handlers
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    if (editingTabId === tabId) {
      e.preventDefault()
      return
    }
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', tabId)
    // Add a slight delay to allow drag image to be set
    setTimeout(() => {
      if (e.dataTransfer) {
        e.dataTransfer.setDragImage(new Image(), 0, 0)
      }
    }, 0)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    if (draggedTabId === null) return
    
    const dragIndex = tabs.findIndex(tab => tab.id === draggedTabId)
    if (dragIndex === -1) return
    
    // Calculate drop position based on mouse position within the tab
    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2
    
    // Determine if dropping before or after this tab
    let targetIndex: number
    if (e.clientX < midpoint) {
      // Dropping before this tab
      targetIndex = index
    } else {
      // Dropping after this tab
      targetIndex = index + 1
    }
    
    // Adjust target index if dragging from left to right (account for removed element)
    if (dragIndex < targetIndex) {
      targetIndex = targetIndex - 1
    }
    
    // Clamp to valid range
    targetIndex = Math.max(0, Math.min(targetIndex, tabs.length - 1))
    
    // Only update if different from current drag index
    if (targetIndex !== dragIndex) {
      setDragOverIndex(targetIndex)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the tabs container, not just moving between tabs
    const rect = e.currentTarget.getBoundingClientRect()
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setDragOverIndex(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedTabId === null) return

    const dragIndex = tabs.findIndex(tab => tab.id === draggedTabId)
    if (dragIndex === -1) return
    
    // Use the dragOverIndex which was calculated in handleDragOver
    const targetIndex = dragOverIndex !== null ? dragOverIndex : dragIndex
    
    if (dragIndex !== targetIndex) {
      reorderTabs(dragIndex, targetIndex)
    }

    setDraggedTabId(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedTabId(null)
    setDragOverIndex(null)
  }

  // Mobile touch handlers
  const handleTouchStart = (e: React.TouchEvent, tabId: string, index: number) => {
    if (editingTabId === tabId) return // Don't drag if editing
    
    const touch = e.touches[0]
    const tabElement = tabRefs.current.get(tabId)
    if (!tabElement) return

    // Store initial touch position to detect scrolling
    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY
    }

    // Start long press timer
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }

      clickBlockedRef.current = false
      setTouchDragState({
        tabId,
        startX: touch.clientX,
        currentX: touch.clientX,
        tabIndex: index,
        hasMoved: false,
      })
    }, 400) // 400ms delay for long press
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0]

    if (!touchDragState) {
      if (touchStartPosRef.current) {
        const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
        const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)
        
        if (deltaX > 10 || deltaY > 10) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }
        }
      }
      return
    }

    e.preventDefault() // Prevent scrolling while dragging
    e.stopPropagation()
    
    if (!touchDragState.hasMoved) {
      clickBlockedRef.current = true
    }
    
    setTouchDragState(prev => prev ? {
      ...prev,
      currentX: touch.clientX,
      hasMoved: true,
    } : null)

    // Find which tab we're over
    const tabsContainer = e.currentTarget as HTMLElement
    if (!tabsContainer) return

    const touchX = touch.clientX
    const tabElements = Array.from(tabsContainer.querySelectorAll('.tab')) as HTMLElement[]
    
    let targetIndex: number | null = null
    
    for (let i = 0; i < tabElements.length; i++) {
      const rect = tabElements[i].getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      
      if (touchX >= rect.left && touchX < midpoint) {
        targetIndex = i
        break
      } else if (touchX >= midpoint && touchX < rect.right) {
        targetIndex = i + 1
        break
      }
    }
    
    // Handle case when dragging past the last tab
    if (targetIndex === null && tabElements.length > 0) {
      const lastRect = tabElements[tabElements.length - 1].getBoundingClientRect()
      if (touchX >= lastRect.right) {
        targetIndex = tabElements.length
      } else {
        targetIndex = 0
      }
    }
    
    if (targetIndex !== null) {
      // Adjust target index if dragging from left to right (account for removed element)
      let adjustedIndex = targetIndex
      if (touchDragState.tabIndex < targetIndex) {
        adjustedIndex = targetIndex - 1
      }
      
      // Clamp to valid range
      adjustedIndex = Math.max(0, Math.min(adjustedIndex, tabs.length - 1))
      
      // Only update if different from current drag index
      if (adjustedIndex !== touchDragState.tabIndex) {
        setDragOverIndex(adjustedIndex)
      }
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    touchStartPosRef.current = null

    if (!touchDragState) return

    const dragIndex = touchDragState.tabIndex
    const dropIndex = dragOverIndex !== null ? dragOverIndex : dragIndex

    if (touchDragState.hasMoved && dragIndex !== dropIndex && dropIndex >= 0 && dropIndex < tabs.length) {
      reorderTabs(dragIndex, dropIndex)
    }

    // Reset click block after a short delay
    if (clickBlockedRef.current) {
      setTimeout(() => {
        clickBlockedRef.current = false
      }, 100)
    }

    setTouchDragState(null)
    setDragOverIndex(null)
  }

  return (
    <div 
      className="tab-bar"
      style={{
        backgroundColor: previewTheme.tabBarBg,
        borderBottomColor: previewTheme.borderColor,
        '--tab-bg': previewTheme.tabBg,
        '--tab-active-bg': previewTheme.tabActiveBg,
        '--tab-text': previewTheme.tabText,
        '--tab-border': previewTheme.borderColor,
      } as React.CSSProperties}
    >
      <div 
        className="tabs-container"
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) {
                tabRefs.current.set(tab.id, el)
              } else {
                tabRefs.current.delete(tab.id)
              }
            }}
            className={`tab ${activeTabId === tab.id ? 'active' : ''} ${
              draggedTabId === tab.id ? 'dragging' : ''
            } ${dragOverIndex === index ? 'drag-over' : ''} ${
              touchDragState?.tabId === tab.id ? 'touch-dragging' : ''
            }`}
            draggable={editingTabId !== tab.id}
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, tab.id, index)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              // Don't switch tab if we just finished dragging or are currently dragging
              if (!clickBlockedRef.current && !touchDragState && draggedTabId === null) {
                switchTab(tab.id)
              }
            }}
            onDoubleClick={() => handleDoubleClick(tab.id, tab.title)}
          >
            {editingTabId === tab.id ? (
              <input
                ref={inputRef}
                className="tab-title-input"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => handleTitleSubmit(tab.id)}
                onKeyDown={(e) => handleTitleKeyDown(e, tab.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="tab-title">{tab.title}</span>
                {getSaveIndicator(tab.id)}
              </>
            )}
            <button
              className="tab-close"
              onClick={(e) => handleCloseTab(e, tab.id, tab.title)}
              aria-label="Close tab"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="tab-actions">
        {getSyncIndicator()}
        <AuthButton />
        <button 
          className="tab-help" 
          onClick={handleShowHelp} 
          aria-label="Show help and instructions" 
          title="Help & Instructions"
        >
          <HelpCircle size={16} />
        </button>
        <button 
          className="tab-add" 
          onClick={() => addTab()} 
          aria-label="Add new tab" 
          title="Add new tab"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// Memoize TabBar - since it uses context hooks, it will only re-render 
// when context values change, which is the desired behavior
const TabBar = memo(TabBarComponent)

TabBar.displayName = 'TabBar'

export default TabBar
