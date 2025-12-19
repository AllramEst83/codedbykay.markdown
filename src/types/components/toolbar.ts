import { EditorRef } from './editor'

export interface ToolbarProps {
  editorRef: EditorRef | null
  onSave: () => void
  onOpen: () => void
  onCompressingImageChange: (isCompressing: boolean) => void
  onOpenImageManager: () => void
}

export interface MobileToolbarProps {
  editorRef: EditorRef | null
  isVisible: boolean
  keyboardOffset: number
  onSave: () => void
  onOpen: () => void
  onCompressingImageChange: (isCompressing: boolean) => void
  onOpenImageManager: () => void
}

export type ViewMode = 'editor' | 'preview'

export interface MobileViewToggleProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

