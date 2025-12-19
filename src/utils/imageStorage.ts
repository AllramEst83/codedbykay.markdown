/**
 * Image Storage Utility
 * Handles efficient storage of images in localStorage with compression
 */

import imageCompression from 'browser-image-compression'

const IMAGE_PREFIX = 'md-editor-img-'
const MAX_FILE_SIZE_MB = 2 // Target max file size in MB
const MAX_WIDTH_OR_HEIGHT = 1920 // Max width or height in pixels
const MAX_STORAGE_SIZE_MB = 5 // Maximum size for localStorage (conservative estimate)

interface StoredImage {
  id: string
  dataUrl: string
  filename: string
  timestamp: number
  size: number
}

/**
 * Compresses and resizes an image file using browser-image-compression
 * The library automatically handles:
 * - Resizing images that exceed maxWidthOrHeight
 * - Compressing to target maxSizeMB
 * - Preserving PNG transparency when needed
 * - Converting PNG to JPEG when no transparency (better compression)
 */
async function compressImage(
  file: File, 
  options?: {
    maxSizeMB?: number
    maxWidthOrHeight?: number
    initialQuality?: number
  }
): Promise<string> {
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
    
    // Convert compressed file to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        resolve(e.target?.result as string)
      }
      reader.onerror = () => reject(new Error('Failed to read compressed file'))
      reader.readAsDataURL(compressedFile)
    })
  } catch (error) {
    console.error('Image compression error:', error)
    throw new Error(error instanceof Error ? error.message : 'Failed to compress image')
  }
}

/**
 * Stores an image in localStorage
 * Automatically compresses images that are too large instead of throwing an error
 */
export async function storeImage(file: File): Promise<string> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image')
    }
    
    // Try compression with progressively more aggressive settings
    let dataUrl: string | null = null
    let compressionAttempt = 0
    const maxAttempts = 4
    
    while (compressionAttempt < maxAttempts) {
      // Progressive compression: start normal, get more aggressive each attempt
      const maxSizeMB = compressionAttempt === 0 ? MAX_FILE_SIZE_MB : 
                        compressionAttempt === 1 ? 1.5 : 
                        compressionAttempt === 2 ? 1.0 : 0.5
      
      const maxWidthOrHeight = compressionAttempt === 0 ? MAX_WIDTH_OR_HEIGHT :
                               compressionAttempt === 1 ? 1280 :
                               compressionAttempt === 2 ? 960 : 640
      
      const initialQuality = compressionAttempt === 0 ? 0.85 :
                            compressionAttempt === 1 ? 0.75 :
                            compressionAttempt === 2 ? 0.65 : 0.5
      
      try {
        const compressed = await compressImage(file, {
          maxSizeMB,
          maxWidthOrHeight,
          initialQuality
        })
        
        // Check if compressed size fits in localStorage
        // Estimate: data URL length * 2 for UTF-16 encoding + JSON overhead
        const estimatedSize = (compressed.length * 2) + (compressed.length * 0.1) // Add 10% for JSON overhead
        
        dataUrl = compressed
        
        if (estimatedSize <= MAX_STORAGE_SIZE_MB * 1024 * 1024) {
          // Size is acceptable, break out of loop
          break
        }
        
        // If this was the last attempt, use what we have
        if (compressionAttempt === maxAttempts - 1) {
          console.warn('Image still large after maximum compression attempts, using best available compression')
          break
        }
        
        // Try more aggressive compression
        compressionAttempt++
        console.log(`Image still too large (${(estimatedSize / 1024 / 1024).toFixed(2)}MB), trying more aggressive compression...`)
      } catch (error) {
        // If compression fails, try next attempt or throw if last attempt
        if (compressionAttempt === maxAttempts - 1) {
          throw error
        }
        compressionAttempt++
      }
    }
    
    if (!dataUrl) {
      throw new Error('Failed to compress image after multiple attempts')
    }
    
    // Generate unique ID
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const key = IMAGE_PREFIX + id
    
    // Create stored image metadata
    const storedImage: StoredImage = {
      id,
      dataUrl,
      filename: file.name,
      timestamp: Date.now(),
      size: dataUrl.length
    }
    
    // Store in localStorage
    try {
      localStorage.setItem(key, JSON.stringify(storedImage))
    } catch (error) {
      // localStorage quota exceeded - try to free up space or inform user
      throw new Error('Storage quota exceeded. Please delete some images or use a smaller image.')
    }
    
    return dataUrl
  } catch (error) {
    console.error('Failed to store image:', error)
    throw error
  }
}

/**
 * Gets all stored images
 */
export function getAllStoredImages(): StoredImage[] {
  const images: StoredImage[] = []
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(IMAGE_PREFIX)) {
      try {
        const data = localStorage.getItem(key)
        if (data) {
          images.push(JSON.parse(data))
        }
      } catch (error) {
        console.error('Failed to parse stored image:', error)
      }
    }
  }
  
  return images.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Deletes a stored image
 */
export function deleteImage(id: string): void {
  const key = IMAGE_PREFIX + id
  localStorage.removeItem(key)
}

/**
 * Clears all stored images
 */
export function clearAllImages(): void {
  const keys: string[] = []
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(IMAGE_PREFIX)) {
      keys.push(key)
    }
  }
  
  keys.forEach(key => localStorage.removeItem(key))
}

/**
 * Gets total storage size used by images
 */
export function getStorageSize(): number {
  let totalSize = 0
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(IMAGE_PREFIX)) {
      const data = localStorage.getItem(key)
      if (data) {
        totalSize += data.length * 2 // UTF-16 encoding
      }
    }
  }
  
  return totalSize
}
