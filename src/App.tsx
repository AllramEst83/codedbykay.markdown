import { useCallback, useRef, useMemo, useState, useEffect, Suspense, lazy } from 'react'
import Editor, { EditorRef } from './components/Editor'
const Preview = lazy(() => import('./components/Preview'))
import Toolbar from './components/Toolbar'
import TabBar from './components/TabBar'
import MobileToolbar from './components/MobileToolbar'
import MobileViewToggle from './components/MobileViewToggle'
import Spinner from './components/Spinner'
import ImageManager from './components/ImageManager'
import { useTheme } from './contexts/ThemeContext'
import { useTabs } from './contexts/TabsContext'
import { useDebounce } from './hooks/useDebounce'
import { useMobileKeyboard } from './hooks/useMobileKeyboard'
import { migrateFromLocalStorage } from './utils/imageStorage'
import type { MobileViewMode } from './types/app'
import './App.css'

function App() {
  const { previewTheme } = useTheme()
  const { tabs, activeTabId, updateTabContent, addTab } = useTabs()
  const editorRef = useRef<EditorRef | null>(null)
  const [isPreviewScrolling, setIsPreviewScrolling] = useState(false)
  const [isEditorScrolling, setIsEditorScrolling] = useState(false)
  const [editorPaneWidth, setEditorPaneWidth] = useState(50) // Percentage
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { isMobile, isKeyboardVisible, keyboardOffset } = useMobileKeyboard()
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('editor')
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isCompressingImage, setIsCompressingImage] = useState(false)
  const [isImageManagerOpen, setIsImageManagerOpen] = useState(false)

  const activeTab = useMemo(() => {
    if (!activeTabId) return null
    const tab = tabs.find((tab) => tab.id === activeTabId)
    if (!tab) return null
    // Ensure tab content is always a string
    if (typeof tab.content !== 'string') {
      return {
        ...tab,
        content: typeof tab.content === 'object' ? '' : String(tab.content || ''),
      }
    }
    return tab
  }, [tabs, activeTabId])

  const markdown = useMemo(() => {
    if (!activeTab) return ''
    const content = activeTab.content
    // Ensure markdown is always a string
    if (typeof content === 'string') {
      return content
    }
    if (content === null || content === undefined) {
      return ''
    }
    return String(content || '')
  }, [activeTab])

  // Debounce the markdown for preview to improve typing performance
  const debouncedMarkdown = useDebounce(markdown, 150)

  const handleMarkdownChange = useCallback((newMarkdown: string) => {
    if (activeTabId) {
      updateTabContent(activeTabId, newMarkdown)
    }
  }, [activeTabId, updateTabContent])

  const handleSave = useCallback(() => {
    if (!activeTab) return
    const blob = new Blob([activeTab.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab.title || 'document'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [activeTab])

  const handleOpen = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const content = event.target?.result as string
          // Extract filename without extension
          const fileName = file.name.replace(/\.(md|markdown)$/i, '')
          // Create a new tab with the file content and title
          addTab(content, fileName)
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }, [addTab])

  const handlePreviewScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (!isEditorScrolling && editorRef.current) {
      setIsPreviewScrolling(true)
      const editor = document.querySelector('.cm-editor') as HTMLElement
      const editorScroll = editor?.querySelector('.cm-scroller') as HTMLElement
      if (editorScroll) {
        const ratio = scrollTop / (scrollHeight - clientHeight)
        const maxScroll = editorScroll.scrollHeight - editorScroll.clientHeight
        editorScroll.scrollTop = ratio * maxScroll
      }
      setTimeout(() => setIsPreviewScrolling(false), 100)
    }
  }, [isEditorScrolling])

  const handleEditorScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (!isPreviewScrolling) {
      setIsEditorScrolling(true)
      const preview = document.querySelector('.preview-container') as HTMLElement
      if (preview) {
        const ratio = scrollTop / (scrollHeight - clientHeight)
        const maxScroll = preview.scrollHeight - preview.clientHeight
        preview.scrollTop = ratio * maxScroll
      }
      setTimeout(() => setIsEditorScrolling(false), 100)
    }
  }, [isPreviewScrolling])

  const MIN_PANE_WIDTH = 20 // Minimum width as percentage
  const MAX_PANE_WIDTH = 80 // Maximum width as percentage

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const mouseX = e.clientX - containerRect.left
    const newWidth = (mouseX / containerRect.width) * 100

    // Constrain the width between min and max
    const constrainedWidth = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, newWidth))
    setEditorPaneWidth(constrainedWidth)
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Handle initial loading and migrate images from localStorage to IndexedDB
  useEffect(() => {
    // Migrate images from localStorage to IndexedDB (one-time migration)
    migrateFromLocalStorage().catch(console.error)
    
    // Simulate initial load time (you can remove this if not needed)
    const timer = setTimeout(() => {
      setIsInitialLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // On mobile, show only editor or preview based on view mode
  const showEditor = !isMobile || mobileViewMode === 'editor'
  const showPreview = !isMobile || mobileViewMode === 'preview'

  if (isInitialLoading) {
    return (
      <div 
        className="app"
        style={{
          backgroundColor: previewTheme.backgroundColor,
          '--app-border-color': previewTheme.borderColor,
        } as React.CSSProperties}
      >
        <div className="spinner-overlay">
          <Spinner size={48} message="Loading editor..." />
        </div>
      </div>
    )
  }

  return (
    <div 
      className="app"
      style={{
        backgroundColor: previewTheme.backgroundColor,
        '--app-border-color': previewTheme.borderColor,
      } as React.CSSProperties}
    >
      <TabBar />
      {isMobile && (
        <MobileViewToggle 
          viewMode={mobileViewMode}
          onViewModeChange={setMobileViewMode}
        />
      )}
      {!isMobile && (
        <Toolbar 
          editorRef={editorRef.current}
          onSave={handleSave}
          onOpen={handleOpen}
          onCompressingImageChange={setIsCompressingImage}
          onOpenImageManager={() => setIsImageManagerOpen(true)}
        />
      )}
      <div 
        ref={containerRef}
        className="editor-container"
        style={{
          borderTopColor: previewTheme.borderColor,
        }}
      >
        {showEditor && (
          <div 
            className="pane editor-pane"
            style={{
              width: isMobile ? '100%' : `${editorPaneWidth}%`,
              minWidth: isMobile ? '100%' : `${MIN_PANE_WIDTH}%`,
              maxWidth: isMobile ? '100%' : `${MAX_PANE_WIDTH}%`,
            }}
          >
            <Editor
              key={activeTabId} // Force recreation when switching tabs (not when title changes)
              ref={editorRef}
              value={markdown}
              onChange={handleMarkdownChange}
              onScroll={handleEditorScroll}
            />
          </div>
        )}
        {!isMobile && (
          <div
            className={`divider ${isDragging ? 'dragging' : ''}`}
            onMouseDown={handleMouseDown}
            style={{
              backgroundColor: previewTheme.borderColor,
            }}
          />
        )}
        {showPreview && (
          <div 
            className="pane preview-pane"
            style={{
              backgroundColor: previewTheme.backgroundColor,
              width: isMobile ? '100%' : `${100 - editorPaneWidth}%`,
              minWidth: isMobile ? '100%' : `${MIN_PANE_WIDTH}%`,
              maxWidth: isMobile ? '100%' : `${MAX_PANE_WIDTH}%`,
            }}
          >
            <Suspense fallback={
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
              }}>
                <Spinner size={32} message="Loading preview..." />
              </div>
            }>
              <Preview
                markdown={debouncedMarkdown}
                onScroll={handlePreviewScroll}
              />
            </Suspense>
          </div>
        )}
      </div>
      {isMobile && (
        <MobileToolbar 
          editorRef={editorRef.current}
          isVisible={isKeyboardVisible && mobileViewMode === 'editor'}
          keyboardOffset={keyboardOffset}
          onCompressingImageChange={setIsCompressingImage}
          onOpenImageManager={() => setIsImageManagerOpen(true)}
        />
      )}
      
      {/* Loading overlay for image compression - rendered at app level for proper centering */}
      {isCompressingImage && (
        <div className="spinner-overlay">
          <Spinner size={48} message="Compressing image..." />
        </div>
      )}
      
      {/* Image Manager Modal */}
      <ImageManager 
        isOpen={isImageManagerOpen}
        onClose={() => setIsImageManagerOpen(false)}
      />
    </div>
  )
}

export default App
