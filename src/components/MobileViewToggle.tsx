import { memo } from 'react'
import { Edit, Eye } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { MobileViewToggleProps } from '../types/components'
import './MobileViewToggle.css'

const MobileViewToggleComponent = ({ viewMode, onViewModeChange }: MobileViewToggleProps) => {
  const { theme, previewTheme } = useTheme()

  // Determine colors based on theme
  const bgColor = theme === 'dark' 
    ? '#252526' 
    : theme === 'light' 
    ? '#f5f5f5'
    : theme === 'rainbow'
    ? '#1a0a2d' // Dark blue-purple
    : '#fef1f2'
  const borderColor = previewTheme.borderColor
  const textColor = theme === 'dark' 
    ? '#e8e8e8'
    : theme === 'light'
    ? '#212121'
    : theme === 'rainbow'
    ? '#ffff00' // Bright yellow
    : '#2d3748'
  const activeBg = theme === 'dark'
    ? '#007acc'
    : theme === 'light'
    ? '#0066cc'
    : theme === 'rainbow'
    ? '#ff00ff' // Bright magenta for active
    : '#ff6b9d'
  const inactiveBg = theme === 'dark'
    ? '#2a2d2e'
    : theme === 'light'
    ? '#e8e8e8'
    : theme === 'rainbow'
    ? '#2d1a4d' // Lighter purple
    : '#fce7f3'

  return (
    <div 
      className="mobile-view-toggle"
      style={{
        backgroundColor: bgColor,
        borderBottomColor: borderColor,
        '--toggle-text': textColor,
        '--toggle-active-bg': activeBg,
        '--toggle-inactive-bg': inactiveBg,
        '--toggle-border': borderColor,
      } as React.CSSProperties}
    >
      <button
        className={`mobile-view-toggle-button ${viewMode === 'editor' ? 'active' : ''}`}
        onClick={() => onViewModeChange('editor')}
        aria-label="Editor view"
        title="Editor"
      >
        <Edit size={18} />
        <span>Editor</span>
      </button>
      <button
        className={`mobile-view-toggle-button ${viewMode === 'preview' ? 'active' : ''}`}
        onClick={() => onViewModeChange('preview')}
        aria-label="Preview view"
        title="Preview"
      >
        <Eye size={18} />
        <span>Preview</span>
      </button>
    </div>
  )
}

// Memoize MobileViewToggle to prevent unnecessary re-renders
const MobileViewToggle = memo(MobileViewToggleComponent, (prevProps, nextProps) => {
  return prevProps.viewMode === nextProps.viewMode &&
         prevProps.onViewModeChange === nextProps.onViewModeChange
})

MobileViewToggle.displayName = 'MobileViewToggle'

export default MobileViewToggle
