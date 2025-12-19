import { Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { SpinnerProps } from '../types/components'
import './Spinner.css'

export const Spinner = ({ size = 24, className = '', message }: SpinnerProps) => {
  const { previewTheme } = useTheme()

  return (
    <div className={`spinner-container ${className}`}>
      <Loader2 
        className="spinner-icon" 
        size={size}
        color={previewTheme.spinnerColor}
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

