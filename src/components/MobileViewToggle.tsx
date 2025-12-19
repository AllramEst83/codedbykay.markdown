import { memo } from 'react'
import { Edit, Eye } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { MobileViewToggleProps } from '../types/components'
import './MobileViewToggle.css'

const MobileViewToggleComponent = ({ viewMode, onViewModeChange }: MobileViewToggleProps) => {
  const { previewTheme } = useTheme()

  return (
    <div 
      className="mobile-view-toggle"
      style={{
        backgroundColor: previewTheme.toggleBg,
        borderBottomColor: previewTheme.borderColor,
        '--toggle-text': previewTheme.toggleText,
        '--toggle-active-bg': previewTheme.toggleActiveBg,
        '--toggle-inactive-bg': previewTheme.toggleInactiveBg,
        '--toggle-border': previewTheme.borderColor,
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
