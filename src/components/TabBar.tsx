import { useState, useRef, useEffect, memo } from 'react'
import { useTabs } from '../contexts/TabsContext'
import { useTheme } from '../contexts/ThemeContext'
import './TabBar.css'

const TabBarComponent = () => {
  const { tabs, activeTabId, addTab, closeTab, switchTab, updateTabTitle, saveState } = useTabs()
  const { theme, previewTheme } = useTheme()
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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

  // Determine tab bar colors based on theme
  const tabBarBg = theme === 'dark' 
    ? '#252526' 
    : theme === 'light' 
    ? '#f5f5f5'
    : theme === 'rainbow'
    ? '#1a0a2d' // Dark blue-purple
    : theme === 'office-plain'
    ? '#e8e8e8' // Neutral office gray
    : theme === '70s-swirl'
    ? '#e8d5c4' // Warm beige for 70s
    : '#fef1f2'
  const tabBg = theme === 'dark'
    ? '#2d2d30'
    : theme === 'light'
    ? '#e8e8e8'
    : theme === 'rainbow'
    ? '#2d1a4d' // Lighter purple
    : theme === 'office-plain'
    ? '#d0d0d0' // Subtle gray
    : theme === '70s-swirl'
    ? '#d5c4b4' // Warmer beige
    : '#ffffff'
  const tabActiveBg = theme === 'dark'
    ? '#1e1e1e'
    : theme === 'light'
    ? '#ffffff'
    : theme === 'rainbow'
    ? '#0a0a1a' // Very dark for active tab
    : theme === 'office-plain'
    ? '#f8f8f8' // Clean white for active
    : theme === '70s-swirl'
    ? '#f5e6d3' // Warm cream for active
    : '#fff5f7'
  const tabText = theme === 'dark'
    ? '#e8e8e8'
    : theme === 'light'
    ? '#212121'
    : theme === 'rainbow'
    ? '#ff69b4' // Hot pink
    : theme === 'office-plain'
    ? '#2c2c2c' // Professional dark gray
    : theme === '70s-swirl'
    ? '#5d4037' // Rich brown for 70s
    : '#2d3748'
  const tabBorder = previewTheme.borderColor

  return (
    <div 
      className="tab-bar"
      style={{
        backgroundColor: tabBarBg,
        borderBottomColor: tabBorder,
        '--tab-bg': tabBg,
        '--tab-active-bg': tabActiveBg,
        '--tab-text': tabText,
        '--tab-border': tabBorder,
      } as React.CSSProperties}
    >
      <div className="tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => switchTab(tab.id)}
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
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              aria-label="Close tab"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
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
  )
}

// Memoize TabBar - since it uses context hooks, it will only re-render 
// when context values change, which is the desired behavior
const TabBar = memo(TabBarComponent)

TabBar.displayName = 'TabBar'

export default TabBar
