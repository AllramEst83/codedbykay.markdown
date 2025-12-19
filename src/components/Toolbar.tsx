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
  FolderOpen,
  Save,
  Moon,
  Sun,
  Sparkles,
  Palette,
  Images
} from 'lucide-react'
import type { ToolbarProps } from '../types/components'
import './Toolbar.css'

const ToolbarComponent = ({ editorRef, onSave, onOpen, onCompressingImageChange, onOpenImageManager }: ToolbarProps) => {
  const { theme, setTheme, previewTheme } = useTheme()
  const { showModal } = useModal()
  const imageInputRef = useRef<HTMLInputElement>(null)
  
  const handleAction = useCallback((action: () => void) => {
    if (editorRef) {
      // Ensure editor is focused before performing actions
      // This ensures selection state is current
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
        // Split by lines and add bullet points
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
        // Split by lines and add numbers
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
        // Split by lines and add blockquote prefix
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
    // Trigger file input
    imageInputRef.current?.click()
  }, [])

  const handleImageSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset input immediately to allow selecting the same file again
    event.target.value = ''

    // Check if editor is available
    if (!editorRef) {
      await showModal({
        type: 'alert',
        title: 'Error',
        message: 'Editor is not ready. Please try again.',
        confirmText: 'OK'
      })
      return
    }

    onCompressingImageChange(true)
    try {
      const selectedText = editorRef.getSelectedText()
      
      // Store image and get data URL (this compresses the image)
      const dataUrl = await storeImage(file)
      
      onCompressingImageChange(false)
      
      // Prompt for alt text
      const alt = await showModal({
        type: 'prompt',
        title: 'Insert Image',
        message: 'Enter alt text for the image:',
        defaultValue: selectedText || file.name.replace(/\.[^/.]+$/, ''),
        placeholder: 'Image description',
        confirmText: 'Insert',
        cancelText: 'Cancel'
      })
      
      // Insert markdown with stored image
      if (alt !== null && editorRef) {
        handleAction(() => {
          if (selectedText) {
            editorRef.replaceSelection(`![${alt || 'image'}](${dataUrl})`)
          } else {
            editorRef.insertText(`![${alt || 'image'}](${dataUrl})`)
          }
        })
      }
    } catch (error) {
      onCompressingImageChange(false)
      console.error('Failed to insert image:', error)
      await showModal({
        type: 'alert',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to insert image',
        confirmText: 'OK'
      })
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
    ? '#1a0a2d' // Dark blue-purple for rainbow
    : '#fef1f2'
  const toolbarBorder = previewTheme.borderColor
  const toolbarText = theme === 'dark' 
    ? '#e8e8e8' // WCAG AA: 12.6:1 on #252526
    : theme === 'light'
    ? '#212121' // WCAG AA: 15.8:1 on #f5f5f5
    : theme === 'rainbow'
    ? '#00ffff' // Bright cyan for rainbow
    : '#2d3748' // WCAG AA: 12.1:1 on #fef1f2
  const toolbarHoverBg = theme === 'dark'
    ? '#2a2d2e'
    : theme === 'light'
    ? '#e8e8e8'
    : theme === 'rainbow'
    ? '#2d1a4d' // Lighter purple with more saturation
    : '#fce7f3'
  const toolbarSelectBg = theme === 'dark'
    ? '#2a2d2e'
    : theme === 'light'
    ? '#ffffff'
    : theme === 'rainbow'
    ? '#3d2a5d' // Even lighter saturated purple
    : '#ffffff'

  return (
    <div 
      className="toolbar"
      style={{
        backgroundColor: toolbarBg,
        borderBottomColor: toolbarBorder,
        color: toolbarText,
        '--toolbar-text': toolbarText,
        '--toolbar-hover-bg': toolbarHoverBg,
        '--toolbar-select-bg': toolbarSelectBg,
        '--toolbar-border': toolbarBorder,
      } as React.CSSProperties}
    >
      <div className="toolbar-group">
        <button 
          className="toolbar-button" 
          onClick={handleUndo}
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={handleRedo}
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className="toolbar-button" 
          onClick={insertBold}
          title="Bold"
          aria-label="Bold"
        >
          <Bold size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={insertItalic}
          title="Italic"
          aria-label="Italic"
        >
          <Italic size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={insertStrikethrough}
          title="Strikethrough"
          aria-label="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className="toolbar-button" 
          onClick={insertBulletList}
          title="Bullet List"
          aria-label="Bullet List"
        >
          <List size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={insertNumberedList}
          title="Numbered List"
          aria-label="Numbered List"
        >
          <ListOrdered size={16} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className="toolbar-button" 
          onClick={insertBlockquote}
          title="Blockquote"
          aria-label="Blockquote"
        >
          <Quote size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={insertCodeBlock}
          title="Code Block"
          aria-label="Code Block"
        >
          <Code size={16} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className="toolbar-button" 
          onClick={insertLink}
          title="Insert Link"
          aria-label="Insert Link"
        >
          <LinkIcon size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={insertImage}
          title="Insert Image"
          aria-label="Insert Image"
        >
          <ImageIcon size={16} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group toolbar-theme-group">
        <select
          className="toolbar-select"
          value={theme}
          onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'unicorn-pastel' | 'rainbow')}
          title="Theme"
          aria-label="Select Theme"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="unicorn-pastel">Unicorn Pastel</option>
          <option value="rainbow">Rainbow</option>
        </select>
        <div className="toolbar-theme-icon">
          {theme === 'dark' && <Moon size={14} />}
          {theme === 'light' && <Sun size={14} />}
          {theme === 'unicorn-pastel' && <Sparkles size={14} />}
          {theme === 'rainbow' && <Palette size={14} />}
        </div>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className="toolbar-button" 
          onClick={onOpenImageManager}
          title="Manage Images"
          aria-label="Manage Images"
        >
          <Images size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={onOpen}
          title="Open File"
          aria-label="Open File"
        >
          <FolderOpen size={16} />
        </button>
        <button 
          className="toolbar-button" 
          onClick={onSave}
          title="Save File"
          aria-label="Save File"
        >
          <Save size={16} />
        </button>
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

// Memoize Toolbar to prevent unnecessary re-renders
// Only re-render when editorRef changes (onSave and onOpen are stable callbacks)
const Toolbar = memo(ToolbarComponent, (prevProps, nextProps) => {
  return prevProps.editorRef === nextProps.editorRef &&
         prevProps.onSave === nextProps.onSave &&
         prevProps.onOpen === nextProps.onOpen &&
         prevProps.onOpenImageManager === nextProps.onOpenImageManager
})

Toolbar.displayName = 'Toolbar'

export default Toolbar
