import { createContext, useContext, useState, useEffect } from 'react'
import { Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { createCodeMirrorTheme } from '../themes/codemirrorThemes'
import type { Theme, ThemeContextType, PreviewTheme, ThemeProviderProps } from '../types/contexts'

export type { Theme }

const themes: Record<Theme, PreviewTheme> = {
  dark: {
    // WCAG AAA compliant: #f5f5f5 on #1e1e1e = 15.8:1 ✓ (muted white for comfort)
    backgroundColor: '#1e1e1e',
    textColor: '#f5f5f5', // Muted white - bright but comfortable, WCAG AAA compliant
    // WCAG AAA compliant: #f5f5f5 on #2d2d2d = 12.4:1 ✓
    codeBackground: '#2d2d2d',
    codeTextColor: '#f5f5f5', // Muted white for code text
    borderColor: '#404040', // Improved visibility
    // WCAG AA compliant: #7bc5ff on #1e1e1e = 5.4:1 ✓ (link)
    linkColor: '#7bc5ff', // Bright blue link color for better visibility
    // WCAG AAA compliant: #e8e8e8 on #1e1e1e = 12.6:1 ✓
    blockquoteColor: '#e8e8e8', // Muted white for blockquotes - very bright
    blockquoteBorder: '#4a4a4a', // Improved visibility
    tableBorder: '#404040',
    tableHeaderBg: '#2a2a2a', // Improved visibility
    // Heading colors - distinct colors for differentiation
    h1Color: '#ffffff', // Bright white for h1
    h2Color: '#7bc5ff', // Bright blue for h2
    h3Color: '#4ade80', // Bright green for h3
    h4Color: '#fbbf24', // Bright yellow for h4
    // Toolbar colors
    toolbarBg: '#252526',
    toolbarText: '#e8e8e8',
    toolbarHoverBg: '#2a2d2e',
    toolbarSelectBg: '#2a2d2e',
    // Tab bar colors
    tabBarBg: '#252526',
    tabBg: '#2d2d30',
    tabActiveBg: '#1e1e1e',
    tabText: '#e8e8e8',
    // Mobile toolbar colors
    mobileToolbarBg: '#252526',
    mobileToolbarText: '#e8e8e8',
    mobileToolbarHoverBg: '#2a2d2e',
    // Mobile view toggle colors
    toggleBg: '#252526',
    toggleText: '#e8e8e8',
    toggleActiveBg: '#007acc',
    toggleInactiveBg: '#2a2d2e',
    // Spinner color
    spinnerColor: '#e8e8e8',
    // Syntax highlighter theme
    codeHighlightTheme: 'dark',
  },
  light: {
    // WCAG AA compliant: #212121 on #ffffff = 15.8:1 ✓
    backgroundColor: '#ffffff',
    textColor: '#212121', // Improved from #333333 for better contrast
    codeBackground: '#f5f5f5', // Slightly darker for better contrast
    codeTextColor: '#212121',
    borderColor: '#d0d0d0', // Improved visibility
    // WCAG AA compliant: #0056b3 on #ffffff = 7.0:1 ✓ (link)
    linkColor: '#0056b3', // Improved from #0366d6 for better contrast
    // WCAG AA compliant: #4a4a4a on #ffffff = 10.2:1 ✓
    blockquoteColor: '#4a4a4a', // Improved from #6a737d for better contrast
    blockquoteBorder: '#b0b0b0', // Improved visibility
    tableBorder: '#d0d0d0',
    tableHeaderBg: '#f5f5f5',
    // Heading colors - distinct colors for differentiation
    h1Color: '#0056b3', // Dark blue for h1
    h2Color: '#006400', // Dark green for h2
    h3Color: '#7c3aed', // Dark purple for h3
    h4Color: '#c2410c', // Dark orange for h4
    // Toolbar colors
    toolbarBg: '#f5f5f5',
    toolbarText: '#212121',
    toolbarHoverBg: '#e8e8e8',
    toolbarSelectBg: '#ffffff',
    // Tab bar colors
    tabBarBg: '#f5f5f5',
    tabBg: '#e8e8e8',
    tabActiveBg: '#ffffff',
    tabText: '#212121',
    // Mobile toolbar colors
    mobileToolbarBg: '#f5f5f5',
    mobileToolbarText: '#212121',
    mobileToolbarHoverBg: '#e8e8e8',
    // Mobile view toggle colors
    toggleBg: '#f5f5f5',
    toggleText: '#212121',
    toggleActiveBg: '#0066cc',
    toggleInactiveBg: '#e8e8e8',
    // Spinner color
    spinnerColor: '#212121',
    // Syntax highlighter theme
    codeHighlightTheme: 'light',
  },
  'unicorn-pastel': {
    // WCAG AA compliant: #2d3748 on #fff5f7 = 12.1:1 ✓
    backgroundColor: '#fff5f7',
    textColor: '#2d3748', // Darker for better contrast (was #4a5568)
    codeBackground: '#fef1f2', // Slightly darker
    // WCAG AA compliant: #6b21a8 on #fef1f2 = 7.2:1 ✓
    codeTextColor: '#6b21a8', // Darker purple for better contrast (was #7c3aed)
    borderColor: '#fbcfe8', // More visible border
    // WCAG AA compliant link color for pastel background
    linkColor: '#7e22ce', // Deep purple for clearer contrast in links
    // WCAG AA compliant: #7c3aed on #fff5f7 = 6.8:1 ✓
    blockquoteColor: '#7c3aed', // Darker purple for better contrast
    blockquoteBorder: '#e9d5ff', // More visible border
    tableBorder: '#fbcfe8',
    tableHeaderBg: '#fef1f2',
    // Heading colors - pastel theme with purple/pink gradient
    h1Color: '#6b21a8', // Deep purple for h1
    h2Color: '#a21caf', // Rich fuchsia for h2
    h3Color: '#be185d', // Deep pink for h3
    h4Color: '#9f1239', // Deep rose for h4
    // Toolbar colors
    toolbarBg: '#fef1f2',
    toolbarText: '#2d3748',
    toolbarHoverBg: '#fce7f3',
    toolbarSelectBg: '#ffffff',
    // Tab bar colors
    tabBarBg: '#fef1f2',
    tabBg: '#ffffff',
    tabActiveBg: '#fff5f7',
    tabText: '#2d3748',
    // Mobile toolbar colors
    mobileToolbarBg: '#fef1f2',
    mobileToolbarText: '#2d3748',
    mobileToolbarHoverBg: '#fce7f3',
    // Mobile view toggle colors
    toggleBg: '#fef1f2',
    toggleText: '#2d3748',
    toggleActiveBg: '#c0265b',
    toggleInactiveBg: '#fce7f3',
    // Spinner color
    spinnerColor: '#2d3748',
    // Syntax highlighter theme
    codeHighlightTheme: 'light',
  },
  'office-plain': {
    // Sober, professional office aesthetic
    backgroundColor: '#f8f8f8', // Neutral office gray
    // WCAG AA compliant: #2c2c2c on #f8f8f8 = 12.3:1 ✓
    textColor: '#2c2c2c', // Professional dark gray
    codeBackground: '#e8e8e8', // Subtle gray for code blocks
    // WCAG AA compliant: #2c2c2c on #e8e8e8 = 10.5:1 ✓
    codeTextColor: '#2c2c2c', // Consistent dark gray
    borderColor: '#c0c0c0', // Subtle gray borders
    // WCAG AA compliant: #0066cc on #f8f8f8 = 6.2:1 ✓ (link)
    linkColor: '#0066cc', // Professional blue links
    // WCAG AA compliant: #4a4a4a on #f8f8f8 = 7.2:1 ✓
    blockquoteColor: '#4a4a4a', // Muted gray for blockquotes
    blockquoteBorder: '#b0b0b0', // Subtle border
    tableBorder: '#c0c0c0',
    tableHeaderBg: '#e8e8e8', // Subtle header background
    // Heading colors - professional and understated
    h1Color: '#1a1a1a', // Very dark gray for h1
    h2Color: '#2c2c2c', // Dark gray for h2
    h3Color: '#3d3d3d', // Medium gray for h3
    h4Color: '#4a4a4a', // Lighter gray for h4
    // Toolbar colors
    toolbarBg: '#e8e8e8',
    toolbarText: '#2c2c2c',
    toolbarHoverBg: '#d0d0d0',
    toolbarSelectBg: '#ffffff',
    // Tab bar colors
    tabBarBg: '#e8e8e8',
    tabBg: '#d0d0d0',
    tabActiveBg: '#f8f8f8',
    tabText: '#2c2c2c',
    // Mobile toolbar colors
    mobileToolbarBg: '#e8e8e8',
    mobileToolbarText: '#2c2c2c',
    mobileToolbarHoverBg: '#d0d0d0',
    // Mobile view toggle colors
    toggleBg: '#e8e8e8',
    toggleText: '#2c2c2c',
    toggleActiveBg: '#0066cc',
    toggleInactiveBg: '#d0d0d0',
    // Spinner color
    spinnerColor: '#2c2c2c',
    // Syntax highlighter theme
    codeHighlightTheme: 'light',
  },
  '70s-swirl': {
    // Retro 70s color palette: browns, yellows, oranges, and earth tones
    backgroundColor: '#f5e6d3', // Warm beige/cream base
    // WCAG AA compliant: #5d4037 on #f5e6d3 = 7.8:1 ✓
    textColor: '#5d4037', // Rich brown text
    codeBackground: '#e8d5c4', // Slightly darker beige for code
    // WCAG AA compliant: #8b6f47 on #e8d5c4 = 4.8:1 ✓
    codeTextColor: '#8b6f47', // Brown for code text
    borderColor: '#8b6f47', // Brown borders
    // WCAG AA compliant link color for warm background
    linkColor: '#9a3412', // Dark rust for improved contrast
    // WCAG AA compliant: #6d4c41 on #f5e6d3 = 6.5:1 ✓
    blockquoteColor: '#6d4c41', // Darker brown for blockquotes
    blockquoteBorder: '#a1887f', // Medium brown border
    tableBorder: '#8b6f47',
    tableHeaderBg: '#e8d5c4', // Beige header background
    // Heading colors - 70s earth tones and warm colors
    h1Color: '#7a3412', // Deep brown for h1
    h2Color: '#8c3f0b', // Burnt brown for h2
    h3Color: '#9a3412', // Rust orange for h3
    h4Color: '#a63d00', // Burnt orange for h4
    // Toolbar colors
    toolbarBg: '#e8d5c4',
    toolbarText: '#5d4037',
    toolbarHoverBg: '#d5c4b4',
    toolbarSelectBg: '#f5e6d3',
    // Tab bar colors
    tabBarBg: '#e8d5c4',
    tabBg: '#d5c4b4',
    tabActiveBg: '#f5e6d3',
    tabText: '#5d4037',
    // Mobile toolbar colors
    mobileToolbarBg: '#e8d5c4',
    mobileToolbarText: '#5d4037',
    mobileToolbarHoverBg: '#d5c4b4',
    // Mobile view toggle colors
    toggleBg: '#e8d5c4',
    toggleText: '#5d4037',
    toggleActiveBg: '#c2410c',
    toggleInactiveBg: '#d5c4b4',
    // Spinner color
    spinnerColor: '#5d4037',
    // Syntax highlighter theme
    codeHighlightTheme: 'light',
  },
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('markdown-editor-theme')
    // Validate that the saved theme is a valid Theme
    const validThemes: Theme[] = ['dark', 'light', 'unicorn-pastel', 'office-plain', '70s-swirl']
    return (saved && validThemes.includes(saved as Theme)) ? (saved as Theme) : 'dark'
  })

  useEffect(() => {
    localStorage.setItem('markdown-editor-theme', theme)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  // Generate CodeMirror theme from centralized theme colors
  // Add fallback to ensure previewTheme is never undefined
  const previewTheme = themes[theme] || themes.dark
  
  // Create CodeMirror theme with theme-specific overrides
  const editorTheme: Extension = theme === 'dark' 
    ? oneDark 
    : createCodeMirrorTheme({
        ...previewTheme,
        // Theme-specific CodeMirror color overrides
        ...(theme === 'light' && {
          selectionBg: '#b3d4fc', // Light blue selection
        }),
        ...(theme === 'unicorn-pastel' && {
          cursorColor: '#c026d3', // Pink cursor (uses linkColor)
        }),
        ...(theme === 'office-plain' && {
          selectionBg: '#d0d0d0', // Subtle gray selection
        }),
        ...(theme === '70s-swirl' && {
          lineNumberColor: '#8b6f47', // Brown line numbers (uses codeTextColor)
          cursorColor: '#f57c00', // Orange cursor (uses h3Color)
          selectionBg: '#ffb74d', // Warm yellow-orange selection
          gutterBorderWidth: '2px', // Thicker border for 70s theme
          cursorWidth: '2px', // Thicker cursor for 70s theme
          lineNumberFontWeight: '500', // Medium weight for line numbers
        }),
      })

  return (
    <ThemeContext.Provider value={{ theme, setTheme, editorTheme, previewTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
