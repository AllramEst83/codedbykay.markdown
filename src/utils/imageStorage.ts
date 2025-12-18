/**
 * Image Storage Utility
 * Handles efficient storage of images in localStorage with compression
 */

const IMAGE_PREFIX = 'md-editor-img-'
const MAX_IMAGE_DIMENSION = 1920 // Max width or height
const JPEG_QUALITY = 0.85 // 85% quality for good balance

interface StoredImage {
  id: string
  dataUrl: string
  filename: string
  timestamp: number
  size: number
}

/**
 * Compresses and resizes an image file
 */
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onload = () => {
        // Create canvas for resizing
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }
        
        // Calculate new dimensions
        let width = img.width
        let height = img.height
        
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = (height / width) * MAX_IMAGE_DIMENSION
            width = MAX_IMAGE_DIMENSION
          } else {
            width = (width / height) * MAX_IMAGE_DIMENSION
            height = MAX_IMAGE_DIMENSION
          }
        }
        
        canvas.width = width
        canvas.height = height
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height)
        
        // Convert to data URL with compression
        // Use JPEG for photos, PNG for images with transparency
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const dataUrl = canvas.toDataURL(mimeType, JPEG_QUALITY)
        
        resolve(dataUrl)
      }
      
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Stores an image in localStorage
 */
export async function storeImage(file: File): Promise<string> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image')
    }
    
    // Compress image
    const dataUrl = await compressImage(file)
    
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
    
    // Check localStorage space (rough estimate)
    const estimatedSize = dataUrl.length * 2 // UTF-16 encoding
    if (estimatedSize > 5 * 1024 * 1024) { // 5MB limit (conservative)
      throw new Error('Image too large. Please use a smaller image.')
    }
    
    // Store in localStorage
    try {
      localStorage.setItem(key, JSON.stringify(storedImage))
    } catch (error) {
      // localStorage quota exceeded
      throw new Error('Storage quota exceeded. Please delete some images.')
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
