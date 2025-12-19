import { DBSchema } from 'idb'

export interface ImageDB extends DBSchema {
  images: {
    key: string // image ID
    value: {
      id: string
      blob: Blob // Store as Blob instead of data URL
      filename: string
      timestamp: number
      size: number
    }
    indexes: { 'by-timestamp': number }
  }
}

export interface StoredImage {
  id: string
  dataUrl: string // Object URL created from Blob
  filename: string
  timestamp: number
  size: number
}

