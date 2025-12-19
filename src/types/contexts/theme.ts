import { Extension } from '@codemirror/state'

export type Theme = 'dark' | 'light' | 'unicorn-pastel' | 'office-plain' | '70s-swirl'

export interface PreviewTheme {
  // Preview pane colors
  backgroundColor: string
  textColor: string
  codeBackground: string
  codeTextColor: string
  borderColor: string
  linkColor: string
  blockquoteColor: string
  blockquoteBorder: string
  tableBorder: string
  tableHeaderBg: string
  h1Color: string
  h2Color: string
  h3Color: string
  h4Color: string
  
  // Toolbar colors
  toolbarBg: string
  toolbarText: string
  toolbarHoverBg: string
  toolbarSelectBg: string
  
  // Tab bar colors
  tabBarBg: string
  tabBg: string
  tabActiveBg: string
  tabText: string
  
  // Mobile toolbar colors
  mobileToolbarBg: string
  mobileToolbarText: string
  mobileToolbarHoverBg: string
  
  // Mobile view toggle colors
  toggleBg: string
  toggleText: string
  toggleActiveBg: string
  toggleInactiveBg: string
  
  // Spinner color
  spinnerColor: string
  
  // Syntax highlighter theme name for react-syntax-highlighter
  codeHighlightTheme: 'dark' | 'light'
}

export interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  editorTheme: Extension
  previewTheme: PreviewTheme
}

export interface ThemeProviderProps {
  children: React.ReactNode
}

/**
 * Extended theme interface for CodeMirror-specific colors
 * These can be provided or will be derived from PreviewTheme
 */
export interface CodeMirrorThemeColors extends PreviewTheme {
  // CodeMirror-specific colors (optional, will be derived if not provided)
  gutterBg?: string
  lineNumberColor?: string
  cursorColor?: string
  selectionBg?: string
  gutterBorderWidth?: string
  cursorWidth?: string
  lineNumberFontWeight?: string
}

