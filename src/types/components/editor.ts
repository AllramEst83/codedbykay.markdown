import type { Text as YText } from 'yjs'

export interface EditorProps {
  value: string
  onChange: (value: string) => void
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void
  /**
   * When provided, the editor binds directly to this Yjs text type (via yCollab)
   * instead of syncing through the `value`/`onChange` string props. `value`/`onChange`
   * are still used to keep the caller's display mirror fresh, but no longer drive
   * the CodeMirror document's content.
   */
  ytext?: YText
}

export interface EditorRef {
  insertText: (text: string) => void
  wrapSelection: (before: string, after?: string) => void
  replaceSelection: (text: string) => void
  getSelectedText: () => string
  hasSelection: () => boolean
  undo: () => void
  redo: () => void
  indentLeft: () => void
  indentRight: () => void
  focus: () => void
}
