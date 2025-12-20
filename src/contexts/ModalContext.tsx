import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useTheme } from './ThemeContext'
import '../components/Modal.css'
import type { ModalOptions, ModalContextType, ModalProviderProps, ModalComponentProps } from '../types/contexts'

export type { ModalOptions }

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export const useModal = () => {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return context
}

export const ModalProvider = ({ children }: ModalProviderProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [modalOptions, setModalOptions] = useState<ModalOptions | null>(null)
  const [resolvePromise, setResolvePromise] = useState<((value: string | null) => void) | null>(null)

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalStyle
      }
    }
  }, [isOpen])

  const showModal = useCallback((options: ModalOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setModalOptions(options)
      setIsOpen(true)
      setResolvePromise(() => resolve)
    })
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
    if (resolvePromise) {
      resolvePromise(null)
      setResolvePromise(null)
    }
    setModalOptions(null)
  }, [resolvePromise])

  const handleConfirm = useCallback((value: string | null) => {
    setIsOpen(false)
    if (resolvePromise) {
      resolvePromise(value)
      setResolvePromise(null)
    }
    setModalOptions(null)
  }, [resolvePromise])

  return (
    <ModalContext.Provider value={{ showModal, closeModal, isOpen, modalOptions }}>
      {children}
      {isOpen && modalOptions && (
        <ModalComponent
          options={modalOptions}
          onConfirm={handleConfirm}
          onCancel={closeModal}
        />
      )}
    </ModalContext.Provider>
  )
}

const ModalComponent = ({ options, onConfirm, onCancel }: ModalComponentProps) => {
  const { theme } = useTheme()
  const [inputValue, setInputValue] = useState(options.defaultValue || '')
  const isPrompt = options.type === 'prompt' || (!options.type && options.defaultValue !== undefined)
  const isConfirm = options.type === 'confirm'

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onCancel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isPrompt) {
      onConfirm(inputValue)
    } else if (isConfirm) {
      // For confirm type, return a non-null value to indicate confirmation
      onConfirm('confirmed')
    } else {
      onConfirm(null)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-container" data-theme={theme}>
        <form onSubmit={handleSubmit} className="modal-form">
          {options.title && (
            <h2 className="modal-title">{options.title}</h2>
          )}
          {options.message && (
            <p className="modal-message">{options.message}</p>
          )}
          {isPrompt && (
            <input
              type="text"
              className="modal-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={options.placeholder}
              autoFocus
            />
          )}
          <div className="modal-actions">
            {(isPrompt || isConfirm) && (
              <button
                type="button"
                className="modal-button modal-button-cancel"
                onClick={onCancel}
              >
                {options.cancelText || 'Cancel'}
              </button>
            )}
            <button
              type="submit"
              className={`modal-button ${options.variant === 'danger' ? 'modal-button-danger' : 'modal-button-confirm'}`}
            >
              {options.confirmText || (isPrompt ? 'OK' : isConfirm ? 'Confirm' : 'OK')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

