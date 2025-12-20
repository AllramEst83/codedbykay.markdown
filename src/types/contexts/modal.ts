export interface ModalOptions {
  title?: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  type?: 'prompt' | 'alert' | 'confirm'
  variant?: 'primary' | 'danger'
}

export interface ModalContextType {
  showModal: (options: ModalOptions) => Promise<string | null>
  closeModal: () => void
  isOpen: boolean
  modalOptions: ModalOptions | null
}

export interface ModalProviderProps {
  children: React.ReactNode
}

export interface ModalComponentProps {
  options: ModalOptions
  onConfirm: (value: string | null) => void
  onCancel: () => void
}

