import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import './MobileSelect.css'

interface Option {
  label: string
  value: string
  icon?: React.ReactNode
}

interface MobileSelectProps {
  options: Option[]
  value?: string
  onChange: (value: string) => void
  icon?: React.ReactNode
  label?: string
  placeholder?: string
  showPlaceholder?: boolean
}

export const MobileSelect: React.FC<MobileSelectProps> = ({
  options,
  value,
  onChange,
  icon,
  label,
  placeholder,
  showPlaceholder = true
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ bottom: number, left: number }>({ bottom: 0, left: 0 })

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) {
        return
      }
      
      const menu = document.getElementById('mobile-select-menu')
      if (menu && menu.contains(e.target as Node)) {
        return
      }

      setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    
    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPosition({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left
        })
      }
    }
    
    // Initial position
    updatePosition()
    
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen])

  const handleOpen = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  const selectedOption = options.find(o => o.value === value)
  const displayLabel = selectedOption ? selectedOption.label : placeholder

  return (
    <>
      <button
        ref={triggerRef}
        className={`mobile-select-trigger ${isOpen ? 'is-open' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleOpen}
        title={label}
        aria-label={label}
        aria-expanded={isOpen}
        type="button"
      >
        <span className="mobile-select-value">{displayLabel}</span>
        {icon && <span className="mobile-select-icon">{icon}</span>}
      </button>

      {isOpen && createPortal(
        <div 
          id="mobile-select-menu"
          className="mobile-select-menu"
          style={{
            position: 'fixed',
            bottom: `${position.bottom}px`,
            left: `${position.left}px`,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((option) => (
            <button
              key={option.value}
              className={`mobile-select-option ${value === option.value ? 'is-selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                handleSelect(option.value)
              }}
              type="button"
            >
              {option.icon && <span className="mobile-select-option-icon">{option.icon}</span>}
              <span className="mobile-select-option-label">{option.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
