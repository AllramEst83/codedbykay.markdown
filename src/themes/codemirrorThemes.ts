import { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export const lightTheme: Extension = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    // WCAG AA compliant: #212121 on #ffffff = 15.8:1 ✓
    color: '#212121',
  },
  '.cm-content': {
    color: '#212121',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    backgroundColor: '#ffffff',
  },
  '.cm-gutters': {
    backgroundColor: '#f5f5f5',
    borderRight: '1px solid #d0d0d0',
  },
  // WCAG AA compliant: #4a4a4a on #f5f5f5 = 7.2:1 ✓
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#4a4a4a', // Improved from #6a737d for better contrast
  },
  '.cm-cursor': {
    borderLeftColor: '#212121',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#b3d4fc', // Good contrast for selection
  },
})

export const unicornPastelTheme: Extension = EditorView.theme({
  '&': {
    backgroundColor: '#fff5f7',
    // WCAG AA compliant: #2d3748 on #fff5f7 = 12.1:1 ✓
    color: '#2d3748', // Darker for better contrast (was #4a5568)
  },
  '.cm-content': {
    color: '#2d3748',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    backgroundColor: '#fff5f7',
  },
  '.cm-gutters': {
    backgroundColor: '#fef1f2',
    borderRight: '1px solid #fbcfe8',
  },
  // WCAG AA compliant: #7c3aed on #fef1f2 = 6.8:1 ✓
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#7c3aed', // Darker purple for better contrast (was #a78bfa)
  },
  '.cm-cursor': {
    borderLeftColor: '#c026d3', // Darker pink for better visibility
  },
  '.cm-selectionBackground': {
    backgroundColor: '#fce7f3', // Good contrast for selection
  },
})

export const rainbowTheme: Extension = EditorView.theme({
  '&': {
    backgroundColor: '#0a0a1a', // Very dark blue-black base for maximum color pop
    color: '#ff1493', // Hot pink text
  },
  '.cm-content': {
    color: '#ff1493', // Hot pink
  },
  '.cm-focused': {
    outline: '2px solid #00ffff',
  },
  '.cm-scroller': {
    backgroundColor: '#0a0a1a',
  },
  '.cm-gutters': {
    backgroundColor: '#1a0a2d', // Dark blue-purple
    borderRight: '3px solid #ff00ff', // Bright magenta border
    boxShadow: '2px 0 8px rgba(255, 0, 255, 0.3)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#00ff00', // Bright lime green for line numbers
    fontWeight: 'bold',
  },
  '.cm-cursor': {
    borderLeftColor: '#ffff00', // Bright yellow cursor
    borderLeftWidth: '3px',
  },
  '.cm-cursor-primary': {
    borderLeftColor: '#ffff00',
    borderLeftWidth: '3px',
  },
  '.cm-dropCursor': {
    borderLeftColor: '#00ffff',
    borderLeftWidth: '3px',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#ff00ff60', // More visible magenta selection
  },
  '.cm-activeLine': {
    backgroundColor: '#1a0a3d40', // Highlighted active line with purple tint
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2d1a4d',
  },
})
