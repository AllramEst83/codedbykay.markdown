import { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { CodeMirrorThemeColors } from '../types/contexts'

/**
 * Creates a CodeMirror theme Extension from PreviewTheme colors
 * Derives CodeMirror-specific colors from the preview theme if not explicitly provided
 */
export const createCodeMirrorTheme = (previewTheme: CodeMirrorThemeColors): Extension => {
  // Derive CodeMirror-specific colors from preview theme
  const gutterBg = previewTheme.gutterBg ?? previewTheme.toolbarBg ?? previewTheme.codeBackground
  const lineNumberColor = previewTheme.lineNumberColor ?? previewTheme.blockquoteColor
  const cursorColor = previewTheme.cursorColor ?? previewTheme.textColor
  const selectionBg = previewTheme.selectionBg ?? previewTheme.toolbarHoverBg
  const gutterBorderWidth = previewTheme.gutterBorderWidth ?? '1px'
  const cursorWidth = previewTheme.cursorWidth ?? '1px'

  const themeConfig: Record<string, any> = {
    '&': {
      backgroundColor: previewTheme.backgroundColor,
      color: previewTheme.textColor,
    },
    '.cm-content': {
      color: previewTheme.textColor,
    },
    '.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      backgroundColor: previewTheme.backgroundColor,
    },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      borderRight: `${gutterBorderWidth} solid ${previewTheme.borderColor}`,
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: lineNumberColor,
    },
    '.cm-cursor': {
      borderLeftColor: cursorColor,
      borderLeftWidth: cursorWidth,
    },
    '.cm-selectionBackground': {
      backgroundColor: selectionBg,
    },
  }

  // Add optional line number font weight if specified
  if (previewTheme.lineNumberFontWeight) {
    themeConfig['.cm-lineNumbers .cm-gutterElement'].fontWeight = previewTheme.lineNumberFontWeight
  }

  return EditorView.theme(themeConfig)
}