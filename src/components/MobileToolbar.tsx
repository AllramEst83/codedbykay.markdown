import { useCallback, useRef, memo } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useModal } from '../contexts/ModalContext'
import { storeImage } from '../utils/imageStorage'
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
} from 'lucide-react'
import './MobileToolbar.css'

interface EditorRef {
  insertText: (text: string) => void
  wrapSelection: (before: string, after?: string) => void
  replaceSelection: (text: string) => void
  getSelectedText: () => string
  hasSelection: () => boolean
  undo: () => void
  redo: () => void
}

interface MobileToolbarProps {
  editorRef: EditorRef | null
  isVisible: boolean
  keyboardOffset: number
}

const MobileToolbarComponent = ({ editorRef, isVisible, keyboardOffset }: MobileToolbarProps) => {
  const { theme, previewTheme } = useTheme()
  const { showModal } = useModal()
  const imageInputRef = useRef<HTMLInputElement>(null)
  
  const handleAction = useCallback((action: () => void) => {
    if (editorRef) {
      action()
    }
  }, [editorRef])

  const insertBold = useCallback(() => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        editorRef!.wrapSelection('**', '**')
      } else {
        editorRef!.insertText('**bold text**')
      }
    })
  }, [handleAction, editorRef])

  const insertItalic = useCallback(() => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        editorRef!.wrapSelection('*', '*')
      } else {
        editorRef!.insertText('*italic text*')
      }
    })
  }, [handleAction, editorRef])

  const insertStrikethrough = useCallback(() => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        editorRef!.wrapSelection('~~', '~~')
      } else {
        editorRef!.insertText('~~strikethrough text~~')
      }
    })
  }, [handleAction, editorRef])

  const insertBulletList = useCallback(() => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        const selectedText = editorRef!.getSelectedText()
        const lines = selectedText.split('\n').filter(line => line.trim())
        const formatted = lines.map(line => `- ${line}`).join('\n')
        editorRef!.replaceSelection(formatted)
      } else {
        editorRef!.insertText('- List item')
      }
    })
  }, [handleAction, editorRef])

  const insertNumberedList = useCallback(() => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        const selectedText = editorRef!.getSelectedText()
        const lines = selectedText.split('\n').filter(line => line.trim())
        const formatted = lines.map((line, index) => `${index + 1}. ${line}`).join('\n')
        editorRef!.replaceSelection(formatted)
      } else {
        editorRef!.insertText('1. List item')
      }
    })
  }, [handleAction, editorRef])

  const insertBlockquote = useCallback(() => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        const selectedText = editorRef!.getSelectedText()
        const lines = selectedText.split('\n')
        const formatted = lines.map(line => line.trim() ? `> ${line}` : line).join('\n')
        editorRef!.replaceSelection(formatted)
      } else {
        editorRef!.insertText('> Quote')
      }
    })
  }, [handleAction, editorRef])

  const insertCodeBlock = useCallback(() => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        editorRef!.wrapSelection('```\n', '\n```')
      } else {
        editorRef!.insertText('\n```\ncode\n```\n')
      }
    })
  }, [handleAction, editorRef])

  const insertLink = useCallback(async () => {
    const selectedText = editorRef!.getSelectedText()
    const url = await showModal({
      type: 'prompt',
      title: 'Insert Link',
      message: 'Enter the URL:',
      defaultValue: selectedText || '',
      placeholder: 'https://example.com',
      confirmText: 'Next',
      cancelText: 'Cancel'
    })
    if (url) {
      const text = await showModal({
        type: 'prompt',
        title: 'Insert Link',
        message: 'Enter the link text:',
        defaultValue: selectedText || url || '',
        placeholder: 'Link text',
        confirmText: 'Insert',
        cancelText: 'Cancel'
      })
      if (text) {
        handleAction(() => {
          if (selectedText) {
            editorRef!.replaceSelection(`[${text}](${url})`)
          } else {
            editorRef!.insertText(`[${text}](${url})`)
          }
        })
      }
    }
  }, [handleAction, editorRef, showModal])

  const insertImage = useCallback(() => {
    imageInputRef.current?.click()
  }, [])

  const handleImageSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const selectedText = editorRef!.getSelectedText()
      const dataUrl = await storeImage(file)
      const alt = await showModal({
        type: 'prompt',
        title: 'Insert Image',
        message: 'Enter alt text for the image:',
        defaultValue: selectedText || file.name.replace(/\.[^/.]+$/, ''),
        placeholder: 'Image description',
        confirmText: 'Insert',
        cancelText: 'Cancel'
      })
      
      if (alt !== null) {
        handleAction(() => {
          if (selectedText) {
            editorRef!.replaceSelection(`![${alt || 'image'}](${dataUrl})`)
          } else {
            editorRef!.insertText(`![${alt || 'image'}](${dataUrl})`)
          }
        })
      }
    } catch (error) {
      console.error('Failed to insert image:', error)
      await showModal({
        type: 'alert',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to insert image',
        confirmText: 'OK'
      })
    } finally {
      event.target.value = ''
    }
  }, [handleAction, editorRef, showModal])

  const handleUndo = useCallback(() => {
    handleAction(() => editorRef!.undo())
  }, [handleAction, editorRef])

  const handleRedo = useCallback(() => {
    handleAction(() => editorRef!.redo())
  }, [handleAction, editorRef])

  // Determine toolbar colors based on theme
  const toolbarBg = theme === 'dark' 
    ? '#252526' 
    : theme === 'light' 
    ? '#f5f5f5'
    : theme === 'rainbow'
    ? '#1a0a2d' // Dark blue-purple
    : '#fef1f2'
  const toolbarBorder = previewTheme.borderColor
  const toolbarText = theme === 'dark' 
    ? '#e8e8e8'
    : theme === 'light'
    ? '#212121'
    : theme === 'rainbow'
    ? '#00ff00' // Bright lime green
    : '#2d3748'
  const toolbarHoverBg = theme === 'dark'
    ? '#2a2d2e'
    : theme === 'light'
    ? '#e8e8e8'
    : theme === 'rainbow'
    ? '#2d1a4d' // Lighter purple
    : '#fce7f3'

  if (!isVisible) return null

  // Calculate bottom position: when keyboard is visible, position toolbar above it
  // keyboardOffset represents the height of the keyboard
  const bottomPosition = keyboardOffset > 0 ? `${keyboardOffset}px` : '0px'

  return (
    <div 
      className="mobile-toolbar"
      style={{
        backgroundColor: toolbarBg,
        borderTopColor: toolbarBorder,
        color: toolbarText,
        bottom: bottomPosition,
        '--mobile-toolbar-text': toolbarText,
        '--mobile-toolbar-hover-bg': toolbarHoverBg,
        '--mobile-toolbar-border': toolbarBorder,
      } as React.CSSProperties}
    >
      <div className="mobile-toolbar-scroll">
        <div className="mobile-toolbar-group">
          <button 
            className="mobile-toolbar-button" 
            onClick={handleUndo}
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 size={18} />
          </button>
          <button 
            className="mobile-toolbar-button" 
            onClick={handleRedo}
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 size={18} />
          </button>
        </div>

        <div className="mobile-toolbar-separator" />

        <div className="mobile-toolbar-group">
          <button 
            className="mobile-toolbar-button" 
            onClick={insertBold}
            title="Bold"
            aria-label="Bold"
          >
            <Bold size={18} />
          </button>
          <button 
            className="mobile-toolbar-button" 
            onClick={insertItalic}
            title="Italic"
            aria-label="Italic"
          >
            <Italic size={18} />
          </button>
          <button 
            className="mobile-toolbar-button" 
            onClick={insertStrikethrough}
            title="Strikethrough"
            aria-label="Strikethrough"
          >
            <Strikethrough size={18} />
          </button>
        </div>

        <div className="mobile-toolbar-separator" />

        <div className="mobile-toolbar-group">
          <button 
            className="mobile-toolbar-button" 
            onClick={insertBulletList}
            title="Bullet List"
            aria-label="Bullet List"
          >
            <List size={18} />
          </button>
          <button 
            className="mobile-toolbar-button" 
            onClick={insertNumberedList}
            title="Numbered List"
            aria-label="Numbered List"
          >
            <ListOrdered size={18} />
          </button>
        </div>

        <div className="mobile-toolbar-separator" />

        <div className="mobile-toolbar-group">
          <button 
            className="mobile-toolbar-button" 
            onClick={insertBlockquote}
            title="Blockquote"
            aria-label="Blockquote"
          >
            <Quote size={18} />
          </button>
          <button 
            className="mobile-toolbar-button" 
            onClick={insertCodeBlock}
            title="Code Block"
            aria-label="Code Block"
          >
            <Code size={18} />
          </button>
        </div>

        <div className="mobile-toolbar-separator" />

        <div className="mobile-toolbar-group">
          <button 
            className="mobile-toolbar-button" 
            onClick={insertLink}
            title="Insert Link"
            aria-label="Insert Link"
          >
            <LinkIcon size={18} />
          </button>
          <button 
            className="mobile-toolbar-button" 
            onClick={insertImage}
            title="Insert Image"
            aria-label="Insert Image"
          >
            <ImageIcon size={18} />
          </button>
        </div>
      </div>

      {/* Hidden file input for image selection */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </div>
  )
}

// Memoize MobileToolbar to prevent unnecessary re-renders
const MobileToolbar = memo(MobileToolbarComponent, (prevProps, nextProps) => {
  return prevProps.editorRef === nextProps.editorRef &&
         prevProps.isVisible === nextProps.isVisible &&
         Math.abs(prevProps.keyboardOffset - nextProps.keyboardOffset) < 1
})

MobileToolbar.displayName = 'MobileToolbar'

export default MobileToolbar
