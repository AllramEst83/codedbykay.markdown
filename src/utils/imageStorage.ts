/**
 * Image Storage Utility
 * Handles efficient storage of images in IndexedDB with compression
 * Uses IndexedDB instead of localStorage for much larger capacity and better performance
 */

import imageCompression from 'browser-image-compression'
import { openDB, IDBPDatabase } from 'idb'
import type { ImageDB, StoredImage } from '../types/services'

const DB_NAME = 'markdown-editor-images'
const DB_VERSION = 1
const STORE_NAME = 'images'

const MAX_FILE_SIZE_MB = 5 // Increased since we're using IndexedDB (can handle larger files)
const MAX_WIDTH_OR_HEIGHT = 1920 // Max width or height in pixels

// Cache for database instance
let dbPromise: Promise<IDBPDatabase<ImageDB>> | null = null

/**
 * Gets or creates the IndexedDB database
 */
function getDB(): Promise<IDBPDatabase<ImageDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ImageDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('by-timestamp', 'timestamp')
        }
      },
    })
  }
  return dbPromise
}

/**
 * Compresses and resizes an image file using browser-image-compression
 * Returns a Blob instead of a data URL for better efficiency
 */
async function compressImage(
  file: File, 
  options?: {
    maxSizeMB?: number
    maxWidthOrHeight?: number
    initialQuality?: number
  }
): Promise<Blob> {
  try {
    const compressionOptions = {
      maxSizeMB: options?.maxSizeMB ?? MAX_FILE_SIZE_MB,
      maxWidthOrHeight: options?.maxWidthOrHeight ?? MAX_WIDTH_OR_HEIGHT,
      useWebWorker: true, // Use web worker for non-blocking compression (better performance)
      initialQuality: options?.initialQuality ?? 0.85, // Start with 85% quality
      // Let the library automatically decide on file type conversion
      // It will preserve PNG if transparency exists, convert to JPEG otherwise
    }

    const compressedFile = await imageCompression(file, compressionOptions)
    return compressedFile
  } catch (error) {
    console.error('Image compression error:', error)
    throw new Error(error instanceof Error ? error.message : 'Failed to compress image')
  }
}

/**
 * Custom URL scheme for stored images
 * Format: md-editor-image://{id}
 */
const IMAGE_URL_PREFIX = 'md-editor-image://'

/**
 * Stores an image in IndexedDB
 * Automatically compresses images that are too large instead of throwing an error
 * Returns a custom URL (md-editor-image://{id}) that can be used in markdown
 * This URL persists across page reloads and can be converted to an object URL when rendering
 */
export async function storeImage(file: File): Promise<string> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image')
    }
    
    // Try compression with progressively more aggressive settings
    let compressedBlob: Blob | null = null
    let compressionAttempt = 0
    const maxAttempts = 4
    
    while (compressionAttempt < maxAttempts) {
      // Progressive compression: start normal, get more aggressive each attempt
      const maxSizeMB = compressionAttempt === 0 ? MAX_FILE_SIZE_MB : 
                        compressionAttempt === 1 ? 3 : 
                        compressionAttempt === 2 ? 2 : 1
      
      const maxWidthOrHeight = compressionAttempt === 0 ? MAX_WIDTH_OR_HEIGHT :
                               compressionAttempt === 1 ? 1280 :
                               compressionAttempt === 2 ? 960 : 640
      
      const initialQuality = compressionAttempt === 0 ? 0.85 :
                            compressionAttempt === 1 ? 0.75 :
                            compressionAttempt === 2 ? 0.65 : 0.5
      
      try {
        compressedBlob = await compressImage(file, {
          maxSizeMB,
          maxWidthOrHeight,
          initialQuality
        })
        
        // With IndexedDB, we can handle much larger files, so break after first successful compression
        break
      } catch (error) {
        // If compression fails, try next attempt or throw if last attempt
        if (compressionAttempt === maxAttempts - 1) {
          throw error
        }
        compressionAttempt++
      }
    }
    
    if (!compressedBlob) {
      throw new Error('Failed to compress image after multiple attempts')
    }
    
    // Generate unique ID
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Store in IndexedDB
    const db = await getDB()
    await db.put(STORE_NAME, {
      id,
      blob: compressedBlob,
      filename: file.name,
      timestamp: Date.now(),
      size: compressedBlob.size
    })
    
    // Return custom URL scheme that persists across page reloads
    return `${IMAGE_URL_PREFIX}${id}`
  } catch (error) {
    console.error('Failed to store image:', error)
    throw error
  }
}

/**
 * Converts a custom image URL (md-editor-image://{id}) or blob URL to an object URL
 * This is used when rendering markdown to ensure images display correctly
 * Also handles Supabase Storage URLs with caching
 */
export async function getImageUrlForRendering(url: string): Promise<string> {
  // Check if it's our custom URL scheme
  if (url.startsWith(IMAGE_URL_PREFIX)) {
    const id = url.replace(IMAGE_URL_PREFIX, '')
    const objectUrl = await getImageUrl(id)
    if (objectUrl) {
      return objectUrl
    }
    // If image not found, return a placeholder or the original URL
    return url
  }
  
  // If it's already a blob URL or data URL, return as-is
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url
  }
  
  // If it's a Supabase Storage URL, use cloud image rendering with cache
  if (url.includes('/storage/v1/object/public/user-images/')) {
    // Dynamically import to avoid circular dependency
    const { getCloudImageForRendering } = await import('../services/imageSyncService')
    return getCloudImageForRendering(url)
  }
  
  // For other URLs (http/https), return as-is
  return url
}

/**
 * Extracts image ID from a custom URL
 */
export function getImageIdFromUrl(url: string): string | null {
  if (url.startsWith(IMAGE_URL_PREFIX)) {
    return url.replace(IMAGE_URL_PREFIX, '')
  }
  return null
}

/**
 * Gets all stored images
 * Converts Blobs to object URLs for compatibility
 */
export async function getAllStoredImages(): Promise<StoredImage[]> {
  try {
    const db = await getDB()
    const images = await db.getAll(STORE_NAME)
    
    return images
      .map(({ blob, ...rest }) => ({
        ...rest,
        dataUrl: URL.createObjectURL(blob), // Create object URL from Blob
        size: blob.size
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('Failed to get stored images:', error)
    return []
  }
}

/**
 * Gets an image by ID and returns its object URL
 * Creates a new object URL each time (caller should manage cleanup if needed)
 */
export async function getImageUrl(id: string): Promise<string | null> {
  try {
    const db = await getDB()
    const image = await db.get(STORE_NAME, id)
    if (!image) {
      return null
    }
    return URL.createObjectURL(image.blob)
  } catch (error) {
    console.error('Failed to get image:', error)
    return null
  }
}

/**
 * Deletes a stored image
 */
export async function deleteImage(id: string): Promise<void> {
  try {
    const db = await getDB()
    await db.delete(STORE_NAME, id)
  } catch (error) {
    console.error('Failed to delete image:', error)
    throw error
  }
}

/**
 * Clears all stored images
 */
export async function clearAllImages(): Promise<void> {
  try {
    const db = await getDB()
    await db.clear(STORE_NAME)
  } catch (error) {
    console.error('Failed to clear images:', error)
    throw error
  }
}

/**
 * Gets total storage size used by images
 */
export async function getStorageSize(): Promise<number> {
  try {
    const db = await getDB()
    const images = await db.getAll(STORE_NAME)
    return images.reduce((total, image) => total + image.size, 0)
  } catch (error) {
    console.error('Failed to get storage size:', error)
    return 0
  }
}

/**
 * Migrates images from localStorage to IndexedDB (one-time migration)
 * Call this on app startup to migrate existing images
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const db = await getDB()
    const existingImages = await db.getAll(STORE_NAME)
    
    // Only migrate if IndexedDB is empty
    if (existingImages.length > 0) {
      return
    }
    
    const IMAGE_PREFIX = 'md-editor-img-'
    const imagesToMigrate: Array<{ key: string; data: any }> = []
    
    // Collect all localStorage images
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(IMAGE_PREFIX)) {
        try {
          const data = localStorage.getItem(key)
          if (data) {
            const parsed = JSON.parse(data)
            if (parsed.dataUrl) {
              imagesToMigrate.push({ key, data: parsed })
            }
          }
        } catch (error) {
          console.error('Failed to parse stored image:', error)
        }
      }
    }
    
    // Migrate each image
    for (const { key, data } of imagesToMigrate) {
      try {
        // Convert data URL to Blob
        const response = await fetch(data.dataUrl)
        const blob = await response.blob()
        
        // Store in IndexedDB
        await db.put(STORE_NAME, {
          id: data.id,
          blob,
          filename: data.filename,
          timestamp: data.timestamp,
          size: blob.size
        })
        
        // Remove from localStorage
        localStorage.removeItem(key)
      } catch (error) {
        console.error(`Failed to migrate image ${data.id}:`, error)
      }
    }
    
    if (imagesToMigrate.length > 0) {
      console.log(`Migrated ${imagesToMigrate.length} images from localStorage to IndexedDB`)
    }
  } catch (error) {
    console.error('Failed to migrate from localStorage:', error)
  }
}
