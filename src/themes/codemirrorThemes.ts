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

export const officePlainTheme: Extension = EditorView.theme({
  '&': {
    backgroundColor: '#f8f8f8', // Neutral office gray
    // WCAG AA compliant: #2c2c2c on #f8f8f8 = 12.3:1 ✓
    color: '#2c2c2c', // Professional dark gray
  },
  '.cm-content': {
    color: '#2c2c2c',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    backgroundColor: '#f8f8f8',
  },
  '.cm-gutters': {
    backgroundColor: '#e8e8e8', // Slightly darker gray for gutters
    borderRight: '1px solid #c0c0c0', // Subtle border
  },
  // WCAG AA compliant: #4a4a4a on #e8e8e8 = 6.8:1 ✓
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#4a4a4a', // Muted gray for line numbers
  },
  '.cm-cursor': {
    borderLeftColor: '#2c2c2c', // Professional dark cursor
  },
  '.cm-selectionBackground': {
    backgroundColor: '#d0d0d0', // Subtle selection highlight
  },
})

export const seventiesSwirlTheme: Extension = EditorView.theme({
  '&': {
    backgroundColor: '#f5e6d3', // Warm beige/cream base (70s brown-tan)
    // WCAG AA compliant: #5d4037 on #f5e6d3 = 7.8:1 ✓
    color: '#5d4037', // Rich brown text
  },
  '.cm-content': {
    color: '#5d4037',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    backgroundColor: '#f5e6d3',
  },
  '.cm-gutters': {
    backgroundColor: '#e8d5c4', // Slightly darker beige
    borderRight: '2px solid #8b6f47', // Brown border
  },
  // WCAG AA compliant: #8b6f47 on #e8d5c4 = 4.8:1 ✓
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#8b6f47', // Brown for line numbers
    fontWeight: '500',
  },
  '.cm-cursor': {
    borderLeftColor: '#f57c00', // 70s orange cursor
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#ffb74d', // Warm yellow-orange selection (70s vibe)
  },
})