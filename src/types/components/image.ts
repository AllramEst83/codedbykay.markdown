export interface ImageManagerProps {
  isOpen: boolean
  onClose: () => void
}

// Re-export StoredImage from services for convenience
export type { StoredImage } from '../services/image'

