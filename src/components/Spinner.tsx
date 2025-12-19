import { Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { SpinnerProps } from '../types/components'
import './Spinner.css'

export const Spinner = ({ size = 24, className = '', message }: SpinnerProps) => {
  const { theme, previewTheme } = useTheme()
  
  // Determine spinner color based on theme
  const spinnerColor = theme === 'dark' 
    ? '#e8e8e8'
    : theme === 'light'
    ? '#212121'
    : theme === 'rainbow'
    ? '#00ffff'
    : theme === 'office-plain'
    ? '#2c2c2c' // Professional dark gray
    : theme === '70s-swirl'
    ? '#5d4037' // Rich brown for 70s
    : '#2d3748'

  return (
    <div className={`spinner-container ${className}`}>
      <Loader2 
        className="spinner-icon" 
        size={size}
        color={spinnerColor}
      />
      {message && (
        <p className="spinner-message" style={{ color: previewTheme.textColor }}>
          {message}
        </p>
      )}
    </div>
  )
}

export default Spinner

