export interface EditorProps {
  value: string
  onChange: (value: string) => void
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void
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
