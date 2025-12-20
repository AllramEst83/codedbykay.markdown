import { useCallback, useRef, memo } from 'react'
import { useTheme, type Theme } from '../contexts/ThemeContext'
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
  Images,
  Heading,
  FolderOpen,
  Save,
  Moon,
  Sun,
  Sparkles,
  Briefcase,
  Flower2,
  Indent,
  Outdent
} from 'lucide-react'
import { MobileSelect } from './MobileSelect'
import type { MobileToolbarProps } from '../types/components'
import './MobileToolbar.css'

const MobileToolbarComponent = ({ editorRef, isVisible, keyboardOffset, onSave, onOpen, onCompressingImageChange, onOpenImageManager }: MobileToolbarProps) => {
  const { theme, setTheme, previewTheme } = useTheme()
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

  const handleIndentLeft = useCallback(() => {
    handleAction(() => editorRef!.indentLeft())
  }, [handleAction, editorRef])

  const handleIndentRight = useCallback(() => {
    handleAction(() => editorRef!.indentRight())
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

  const insertHeading = useCallback((level: number) => {
    handleAction(() => {
      if (editorRef!.hasSelection()) {
        const selectedText = editorRef!.getSelectedText()
        // Split by lines and add heading prefix to each line
        const lines = selectedText.split('\n')
        const headingPrefix = '#'.repeat(level) + ' '
        const formatted = lines.map(line => line.trim() ? `${headingPrefix}${line}` : line).join('\n')
        editorRef!.replaceSelection(formatted)
      } else {
        // Insert heading example
        const headingPrefix = '#'.repeat(level) + ' '
        editorRef!.insertText(`${headingPrefix}Heading`)
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

  // Calculate bottom position: when keyboard is visible, position toolbar above it
  // keyboardOffset represents the height of the keyboard
  const bottomPosition = keyboardOffset > 0 ? `${keyboardOffset}px` : '0px'

  return (
    <>
      {isVisible && (
        <div 
          className="mobile-toolbar"
          style={{
            backgroundColor: previewTheme.mobileToolbarBg,
            borderTopColor: previewTheme.borderColor,
            color: previewTheme.mobileToolbarText,
            bottom: bottomPosition,
            '--mobile-toolbar-text': previewTheme.mobileToolbarText,
            '--mobile-toolbar-hover-bg': previewTheme.mobileToolbarHoverBg,
            '--mobile-toolbar-select-bg': previewTheme.toolbarSelectBg,
            '--mobile-toolbar-border': previewTheme.borderColor,
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
                onClick={handleIndentLeft}
                title="Indent Left"
                aria-label="Indent Left"
              >
                <Outdent size={18} />
              </button>
              <button 
                className="mobile-toolbar-button" 
                onClick={handleIndentRight}
                title="Indent Right"
                aria-label="Indent Right"
              >
                <Indent size={18} />
              </button>
            </div>

            <div className="mobile-toolbar-separator" />

            <div className="mobile-toolbar-group">
              <div className="mobile-toolbar-group mobile-toolbar-heading-group">
                <MobileSelect
                  options={[
                    { label: 'Heading 1', value: '1' },
                    { label: 'Heading 2', value: '2' },
                    { label: 'Heading 3', value: '3' },
                    { label: 'Heading 4', value: '4' },
                  ]}
                  onChange={(value) => {
                    insertHeading(parseInt(value))
                  }}
                  icon={<Heading size={16} />}
                  label="Select Heading"
                  placeholder="Heading"
                  value="" // Always reset
                />
              </div>
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

            <div className="mobile-toolbar-separator" />

            <div className="mobile-toolbar-group mobile-toolbar-theme-group">
              <MobileSelect
                options={[
                  { label: 'Dark', value: 'dark', icon: <Moon size={16} /> },
                  { label: 'Light', value: 'light', icon: <Sun size={16} /> },
                  { label: 'Unicorn Pastel', value: 'unicorn-pastel', icon: <Sparkles size={16} /> },
                  { label: 'Office Plain', value: 'office-plain', icon: <Briefcase size={16} /> },
                  { label: '70s Swirl', value: '70s-swirl', icon: <Flower2 size={16} /> },
                ]}
                value={theme}
                onChange={(value) => setTheme(value as Theme)}
                label="Select Theme"
                icon={
                  theme === 'dark' ? <Moon size={16} /> :
                  theme === 'light' ? <Sun size={16} /> :
                  theme === 'unicorn-pastel' ? <Sparkles size={16} /> :
                  theme === 'office-plain' ? <Briefcase size={16} /> :
                  theme === '70s-swirl' ? <Flower2 size={16} /> :
                  <Moon size={16} />
                }
              />
            </div>

            <div className="mobile-toolbar-separator" />

            <div className="mobile-toolbar-group">
              <button
                className="mobile-toolbar-button"
                onClick={onOpenImageManager}
                title="Manage Images"
                aria-label="Manage Images"
              >
                <Images size={18} />
              </button>
              <button 
                className="mobile-toolbar-button" 
                onClick={onOpen}
                title="Open File"
                aria-label="Open File"
              >
                <FolderOpen size={18} />
              </button>
              <button 
                className="mobile-toolbar-button" 
                onClick={onSave}
                title="Save File"
                aria-label="Save File"
              >
                <Save size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for image selection */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </>
  )
}

// Memoize MobileToolbar to prevent unnecessary re-renders
const MobileToolbar = memo(MobileToolbarComponent, (prevProps, nextProps) => {
  return prevProps.editorRef === nextProps.editorRef &&
         prevProps.isVisible === nextProps.isVisible &&
         Math.abs(prevProps.keyboardOffset - nextProps.keyboardOffset) < 1 &&
         prevProps.onSave === nextProps.onSave &&
         prevProps.onOpen === nextProps.onOpen &&
         prevProps.onOpenImageManager === nextProps.onOpenImageManager
})

MobileToolbar.displayName = 'MobileToolbar'

export default MobileToolbar
