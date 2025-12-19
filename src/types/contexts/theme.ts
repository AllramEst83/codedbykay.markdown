import { Extension } from '@codemirror/state'

export type Theme = 'dark' | 'light' | 'unicorn-pastel' | 'rainbow'

export interface PreviewTheme {
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

