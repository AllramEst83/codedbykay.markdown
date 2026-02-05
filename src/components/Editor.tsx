import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { useTheme } from '../contexts/ThemeContext'
import type { EditorProps, EditorRef } from '../types/components'

export type { EditorRef }

const getSelectedLines = (view: EditorView) => {
  const doc = view.state.doc
  const lines = new Set<number>()

  view.state.selection.ranges.forEach((range) => {
    const startLine = doc.lineAt(range.from).number
    const endLine = doc.lineAt(range.to).number
    for (let i = startLine; i <= endLine; i++) {
      lines.add(i)
    }
  })

  return { doc, lines }
}

const applyIndentLeft = (view: EditorView) => {
  const { doc, lines } = getSelectedLines(view)
  const changes: {from: number, to: number, insert: string}[] = []

  lines.forEach((lineNo) => {
    const line = doc.line(lineNo)
    const text = line.text
    if (text.startsWith('  ')) {
      changes.push({ from: line.from, to: line.from + 2, insert: '' })
    } else if (text.startsWith(' ')) {
      changes.push({ from: line.from, to: line.from + 1, insert: '' })
    } else if (text.startsWith('\t')) {
      changes.push({ from: line.from, to: line.from + 1, insert: '' })
    }
  })

  if (changes.length > 0) {
    view.dispatch({
      changes,
      userEvent: 'delete.dedent'
    })
  }
}

const applyIndentRight = (view: EditorView) => {
  const { doc, lines } = getSelectedLines(view)
  const changes: {from: number, insert: string}[] = []

  lines.forEach((lineNo) => {
    const line = doc.line(lineNo)
    changes.push({ from: line.from, insert: '  ' })
  })

  if (changes.length > 0) {
    view.dispatch({
      changes,
      userEvent: 'input.indent'
    })
  }
}

const Editor = forwardRef<EditorRef, EditorProps>(({ value, onChange, onScroll }, ref) => {
  const { editorTheme } = useTheme()
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isUpdatingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onScrollRef = useRef(onScroll)

  // Keep refs updated
  useEffect(() => {
    onChangeRef.current = onChange
    onScrollRef.current = onScroll
  }, [onChange, onScroll])

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      const view = viewRef.current
      if (view) {
        const selection = view.state.selection.main
        
        // Ensure we're not in an update cycle
        isUpdatingRef.current = false
        
        view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: text
          },
          selection: { anchor: selection.from + text.length }
        })
        view.focus()
      }
    },
    wrapSelection: (before: string, after?: string) => {
      const view = viewRef.current
      if (view) {
        // Get selection before focusing (selection persists across focus changes)
        const selection = view.state.selection.main
        const selectedText = view.state.sliceDoc(selection.from, selection.to)
        const afterText = after ?? before
        const newText = before + selectedText + afterText
        
        // Ensure we're not in an update cycle so onChange fires
        isUpdatingRef.current = false
        
        view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: newText
          },
          selection: { 
            anchor: selection.from + before.length + selectedText.length + afterText.length,
            head: selection.from + before.length + selectedText.length + afterText.length
          }
        })
        view.focus()
      }
    },
    replaceSelection: (text: string) => {
      const view = viewRef.current
      if (view) {
        // Get selection before focusing (selection persists across focus changes)
        const selection = view.state.selection.main
        
        // Ensure we're not in an update cycle so onChange fires
        isUpdatingRef.current = false
        
        view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: text
          },
          selection: { anchor: selection.from + text.length }
        })
        view.focus()
      }
    },
    getSelectedText: () => {
      const view = viewRef.current
      if (view) {
        const selection = view.state.selection.main
        return view.state.sliceDoc(selection.from, selection.to)
      }
      return ''
    },
    hasSelection: () => {
      const view = viewRef.current
      if (view) {
        const selection = view.state.selection.main
        return selection.from !== selection.to
      }
      return false
    },
    undo: () => {
      const view = viewRef.current
      if (view) {
        undo(view)
        view.focus()
      }
    },
    redo: () => {
      const view = viewRef.current
      if (view) {
        redo(view)
        view.focus()
      }
    },
    indentLeft: () => {
      const view = viewRef.current
      if (view) {
        applyIndentLeft(view)
        view.focus()
      }
    },
    indentRight: () => {
      const view = viewRef.current
      if (view) {
        applyIndentRight(view)
        view.focus()
      }
    },
    focus: () => {
      const view = viewRef.current
      if (view) {
        view.focus()
      }
    }
  }))

  useEffect(() => {
    if (!editorRef.current) return

    // Ensure value is always a string
    const stringValue = typeof value === 'string' ? value : String(value || '')

    const startState = EditorState.create({
      doc: stringValue,
      extensions: [
        markdown(),
        history(),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isUpdatingRef.current) {
            const newValue = update.state.doc.toString()
            onChangeRef.current(newValue)
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%'
          },
          '.cm-scroller': {
            overflow: 'auto',
            height: '100%'
          },
          '.cm-content': {
            minHeight: '100%',
            padding: '16px',
            fontSize: '14px',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflowWrap: 'break-word'
          },
          '.cm-focused': {
            outline: 'none'
          }
        }),
        keymap.of([
          {
            key: 'Tab',
            run: (view) => {
              applyIndentRight(view)
              return true
            },
            preventDefault: true
          },
          {
            key: 'Shift-Tab',
            run: (view) => {
              applyIndentLeft(view)
              return true
            },
            preventDefault: true
          },
          ...defaultKeymap,
          ...historyKeymap
        ]),
        EditorView.domEventHandlers({
          scroll: (event) => {
            const target = event.target as HTMLElement
            const scroller = target.closest('.cm-scroller') as HTMLElement
            if (scroller && onScrollRef.current) {
              onScrollRef.current(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight)
            }
          }
        })
      ]
    })

    const view = new EditorView({
      state: startState,
      parent: editorRef.current
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [editorTheme]) // Recreate when theme changes

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    
    // Ensure value is always a string
    const stringValue = typeof value === 'string' ? value : String(value || '')
    const currentValue = view.state.doc.toString()
    
    if (stringValue !== currentValue) {
      isUpdatingRef.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: stringValue
        }
      })
      isUpdatingRef.current = false
    }
  }, [value])

  return <div ref={editorRef} style={{ height: '100%', width: '100%' }} />
})

Editor.displayName = 'Editor'

export default Editor
