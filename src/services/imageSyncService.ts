/**
 * Image Sync Service
 * Handles uploading images to Supabase Storage and managing local cache
 */

import * as Y from 'yjs'
import { getSupabaseClient } from '../supabase/client'
import { uploadImage, deleteImage } from './cloudStorageService'
import {
  getImageUrl,
  getAllStoredImages
} from '../utils/imageStorage'
import { openDB, IDBPDatabase } from 'idb'
import { getOrCreateNoteDoc, REMOTE_UPDATE_ORIGIN } from './yjsDocService'

const CACHE_DB_NAME = 'markdown-editor-cloud-images'
const CACHE_DB_VERSION = 1
const CACHE_STORE_NAME = 'cloud-images'

interface CachedCloudImage {
  url: string // Supabase Storage URL (key)
  blob: Blob
  timestamp: number
}

interface CloudImageDB {
  'cloud-images': {
    key: string
    value: CachedCloudImage
  }
}

let cacheDbPromise: Promise<IDBPDatabase<CloudImageDB>> | null = null

/**
 * Gets or creates the cloud image cache database
 */
function getCacheDB(): Promise<IDBPDatabase<CloudImageDB>> {
  if (!cacheDbPromise) {
    cacheDbPromise = openDB<CloudImageDB>(CACHE_DB_NAME, CACHE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
          const store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'url' })
          store.createIndex('by-timestamp', 'timestamp')
        }
      },
    })
  }
  return cacheDbPromise
}

/**
 * Uploads a local image to Supabase Storage
 * Returns the Supabase Storage URL
 */
export async function uploadLocalImageToCloud(
  imageId: string,
  noteId?: string
): Promise<string> {
  try {
    // Get the image from IndexedDB
    const localUrl = await getImageUrl(imageId)
    if (!localUrl) {
      throw new Error(`Image ${imageId} not found in local storage`)
    }

    // Convert blob URL to File
    const response = await fetch(localUrl)
    const blob = await response.blob()
    
    // Get original filename or create one
    const ext = blob.type.split('/')[1] || 'jpg'
    const file = new File([blob], `${imageId}.${ext}`, { type: blob.type })

    // Upload to Supabase Storage
    const result = await uploadImage(file, imageId, noteId)

    // Cache the uploaded image
    await cacheCloudImage(result.url, blob)

    // Revoke the local blob URL to free memory
    URL.revokeObjectURL(localUrl)

    return result.url
  } catch (error) {
    console.error(`Failed to upload image ${imageId}:`, error)
    throw error
  }
}

/**
 * Caches a cloud image in IndexedDB for offline access
 */
export async function cacheCloudImage(url: string, blob: Blob): Promise<void> {
  try {
    const db = await getCacheDB()
    await db.put(CACHE_STORE_NAME, {
      url,
      blob,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('Failed to cache cloud image:', error)
    // Don't throw - caching is optional
  }
}

/**
 * Gets a cached cloud image from IndexedDB
 * Returns null if not cached
 */
export async function getCachedCloudImage(url: string): Promise<Blob | null> {
  try {
    const db = await getCacheDB()
    const cached = await db.get(CACHE_STORE_NAME, url)
    return cached?.blob || null
  } catch (error) {
    console.error('Failed to get cached cloud image:', error)
    return null
  }
}

/**
 * Extracts the storage object path (bucket-relative key) from a stored
 * Supabase Storage URL. The bucket is private, so this URL string is never
 * fetched directly - it's just a stable container the path was embedded in.
 */
function getStoragePathFromUrl(url: string): string {
  const marker = '/storage/v1/object/public/user-images/'
  const index = url.indexOf(marker)
  if (index === -1) {
    throw new Error(`Not a recognized Supabase Storage URL: ${url}`)
  }
  return decodeURIComponent(url.slice(index + marker.length))
}

/**
 * Fetches an image from Supabase Storage and caches it.
 * Uses the authenticated download route so the per-user folder RLS policies
 * on storage.objects are enforced - only the uploading user's own session can
 * retrieve it, unlike the unauthenticated /object/public/ endpoint.
 */
export async function fetchAndCacheCloudImage(url: string): Promise<Blob> {
  try {
    const supabase = getSupabaseClient()
    const path = getStoragePathFromUrl(url)
    const { data: blob, error } = await supabase.storage.from('user-images').download(path)
    if (error || !blob) {
      throw new Error(error?.message || 'Failed to fetch image')
    }

    // Cache for future use
    await cacheCloudImage(url, blob)

    return blob
  } catch (error) {
    console.error('Failed to fetch cloud image:', error)
    throw error
  }
}

/**
 * Gets an image URL for rendering
 * Checks cache first, then fetches from cloud if needed
 */
export async function getCloudImageForRendering(url: string): Promise<string> {
  try {
    // Check cache first
    const cachedBlob = await getCachedCloudImage(url)
    if (cachedBlob) {
      return URL.createObjectURL(cachedBlob)
    }

    // Fetch from cloud and cache
    const blob = await fetchAndCacheCloudImage(url)
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('Failed to get cloud image for rendering:', error)
    return url // Return original URL as fallback
  }
}

/**
 * Replaces IndexedDB image references with Supabase Storage URLs in markdown content
 */
export async function syncImageReferencesInContent(
  content: string,
  noteId?: string
): Promise<string> {
  // Match our custom image URL scheme: md-editor-image://{id}
  const imageUrlPattern = /md-editor-image:\/\/([a-zA-Z0-9-]+)/g
  const matches = Array.from(content.matchAll(imageUrlPattern))

  if (matches.length === 0) {
    return content
  }

  let updatedContent = content

  // Upload each local image and replace URL
  for (const match of matches) {
    const imageId = match[1]
    const localUrl = match[0]

    try {
      // Upload to cloud
      const cloudUrl = await uploadLocalImageToCloud(imageId, noteId)
      
      // Replace in content
      updatedContent = updatedContent.replace(localUrl, cloudUrl)
    } catch (error) {
      console.error(`Failed to sync image ${imageId}:`, error)
      // Keep local URL if upload fails
    }
  }

  return updatedContent
}

/**
 * Replaces IndexedDB image references with Supabase Storage URLs directly on a
 * Yjs-backed note's Y.Text, instead of a plain string `.replace()`. Each upload is
 * awaited sequentially (per image), so the placeholder's position is captured as a
 * Yjs relative position *before* the upload starts and resolved back to an absolute
 * index *after* it finishes - relative positions survive any concurrent edits made
 * to the doc while the upload is in flight (e.g. from a realtime merge or continued
 * local typing), which raw string offsets would not. If a range was concurrently
 * deleted, its relative position resolves to null and that replacement is skipped
 * rather than corrupting the doc at a stale offset.
 *
 * Returns true if any replacement was made.
 */
export async function syncImageReferencesInYText(tabId: string, noteId?: string): Promise<boolean> {
  const { doc, ytext } = getOrCreateNoteDoc(tabId)
  const imageUrlPattern = /md-editor-image:\/\/([a-zA-Z0-9-]+)/g
  const matches = Array.from(ytext.toString().matchAll(imageUrlPattern))

  if (matches.length === 0) {
    return false
  }

  let changed = false

  for (const match of matches) {
    const imageId = match[1]
    const start = match.index
    if (start === undefined) {
      continue
    }
    const end = start + match[0].length

    const startRelPos = Y.createRelativePositionFromTypeIndex(ytext, start)
    const endRelPos = Y.createRelativePositionFromTypeIndex(ytext, end)

    let cloudUrl: string
    try {
      cloudUrl = await uploadLocalImageToCloud(imageId, noteId)
    } catch (error) {
      console.error(`Failed to sync image ${imageId}:`, error)
      continue
    }

    const startAbs = Y.createAbsolutePositionFromRelativePosition(startRelPos, doc)
    const endAbs = Y.createAbsolutePositionFromRelativePosition(endRelPos, doc)

    if (!startAbs || !endAbs || startAbs.type !== ytext || endAbs.type !== ytext) {
      console.warn(`Skipping image URL replacement for ${imageId} - placeholder range no longer resolvable`)
      continue
    }

    // Not a user keystroke - use the same non-undoable origin as remote merges so
    // this background substitution doesn't show up in the user's local undo stack.
    doc.transact(() => {
      ytext.delete(startAbs.index, endAbs.index - startAbs.index)
      ytext.insert(startAbs.index, cloudUrl)
    }, REMOTE_UPDATE_ORIGIN)
    changed = true
  }

  return changed
}

/**
 * Migrates all IndexedDB images to Supabase Storage
 * Called once during initial sync on login
 */
export async function migrateAllImagesToCloud(): Promise<void> {
  try {
    const localImages = await getAllStoredImages()
    
    console.log(`Migrating ${localImages.length} images to cloud storage...`)

    for (const image of localImages) {
      try {
        await uploadLocalImageToCloud(image.id)
        console.log(`Migrated image ${image.id}`)
      } catch (error) {
        console.error(`Failed to migrate image ${image.id}:`, error)
        // Continue with other images
      }
    }

    console.log('Image migration complete')
  } catch (error) {
    console.error('Failed to migrate images:', error)
    throw error
  }
}

/**
 * Deletes an image from Supabase Storage
 */
export async function deleteCloudImage(url: string): Promise<void> {
  try {
    const supabase = getSupabaseClient()
    
    // Extract path from public URL
    const { data: { publicUrl } } = supabase.storage.from('user-images').getPublicUrl('')
    const basePath = publicUrl.replace(/\/$/, '')
    const path = url.replace(basePath + '/', '')

    await deleteImage(path)

    // Remove from cache
    const db = await getCacheDB()
    await db.delete(CACHE_STORE_NAME, url)
  } catch (error) {
    console.error('Failed to delete cloud image:', error)
    throw error
  }
}

/**
 * Clears the cloud image cache
 */
export async function clearCloudImageCache(): Promise<void> {
  try {
    const db = await getCacheDB()
    await db.clear(CACHE_STORE_NAME)
  } catch (error) {
    console.error('Failed to clear cloud image cache:', error)
  }
}

/**
 * Prefetches and caches images referenced in content
 */
export async function prefetchImagesInContent(content: string): Promise<void> {
  // Match Supabase Storage URLs
  const supabaseUrlPattern = /https?:\/\/[^\s]+\/storage\/v1\/object\/public\/user-images\/[^\s)]+/g
  const matches = Array.from(content.matchAll(supabaseUrlPattern))

  const prefetchPromises = matches.map(async (match) => {
    const url = match[0]
    try {
      // Check if already cached
      const cached = await getCachedCloudImage(url)
      if (!cached) {
        // Fetch and cache
        await fetchAndCacheCloudImage(url)
      }
    } catch (error) {
      console.error(`Failed to prefetch image ${url}:`, error)
      // Continue with other images
    }
  })

  await Promise.all(prefetchPromises)
}

