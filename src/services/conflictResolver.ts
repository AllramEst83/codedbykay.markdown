/**
 * Conflict Resolver Service
 * Implements timestamp-based conflict resolution for note synchronization
 */

import type { TabData } from '../types/services'
import type { CloudNote, ConflictResolution } from '../types/services/sync'
import { getServerTimeOffsetMs } from './serverTimeService'

/**
 * Resolves conflicts between local and cloud notes
 * 
 * Strategy:
 * 1. Compare timestamps - most recent wins
 * 2. If timestamps equal, merge content
 * 3. If still conflicted, use device priority (last_synced_at)
 */
export function resolveConflict(
  localNote: TabData,
  cloudNote: CloudNote
): ConflictResolution {
  const localTimestamp = localNote.lastSaved || 0
  const cloudTimestamp = new Date(cloudNote.updated_at).getTime()
  const serverOffset = getServerTimeOffsetMs()
  const localTimestampAligned = localNote.lastSavedServerTime || serverOffset === null
    ? localTimestamp
    : localTimestamp + serverOffset

  // Local is newer - local wins
  if (localTimestampAligned > cloudTimestamp) {
    return {
      strategy: 'local-wins',
      resolvedNote: {
        ...localNote,
        cloudId: localNote.cloudId || cloudNote.id,
        cloudUpdatedAt: cloudNote.updated_at,
      },
    }
  }

  // Cloud is newer - cloud wins
  if (cloudTimestamp > localTimestampAligned) {
    return {
      strategy: 'cloud-wins',
      resolvedNote: {
        id: localNote.id,
        title: cloudNote.title,
        content: cloudNote.content,
        lastSaved: cloudTimestamp,
        lastSavedServerTime: true,
        cloudId: cloudNote.id,
        cloudUpdatedAt: cloudNote.updated_at,
      },
    }
  }

  // Timestamps are equal - merge content
  return {
    strategy: 'merge',
    resolvedNote: mergeNotes(localNote, cloudNote),
  }
}

/**
 * Merges two notes with the same timestamp
 * Combines unique content from both versions
 */
function mergeNotes(localNote: TabData, cloudNote: CloudNote): TabData {
  // Use the longer content as base (assumes more work was done)
  const baseContent = localNote.content.length >= cloudNote.content.length
    ? localNote.content
    : cloudNote.content

  // Use the most descriptive title
  const title = localNote.title !== 'Untitled' 
    ? localNote.title 
    : cloudNote.title

  return {
    id: localNote.id,
    title,
    content: baseContent,
    lastSaved: new Date(cloudNote.updated_at).getTime() + 1, // +1ms to ensure sync
    lastSavedServerTime: true,
    cloudId: localNote.cloudId || cloudNote.id,
    cloudUpdatedAt: cloudNote.updated_at,
  }
}

/**
 * Determines if a local note needs to be uploaded to cloud
 */
export function shouldUploadToCloud(
  localNote: TabData,
  cloudNote: CloudNote | null
): boolean {
  // No cloud version - upload
  if (!cloudNote) {
    return true
  }

  // Local is newer - upload
  const localTimestamp = localNote.lastSaved || 0
  const cloudTimestamp = new Date(cloudNote.updated_at).getTime()
  const serverOffset = getServerTimeOffsetMs()
  const localTimestampAligned = localNote.lastSavedServerTime || serverOffset === null
    ? localTimestamp
    : localTimestamp + serverOffset

  return localTimestampAligned > cloudTimestamp
}

/**
 * Determines if a cloud note needs to be downloaded to local
 */
export function shouldDownloadFromCloud(
  localNote: TabData | null,
  cloudNote: CloudNote
): boolean {
  // No local version - download
  if (!localNote) {
    return true
  }

  // Cloud is newer - download
  const localTimestamp = localNote.lastSaved || 0
  const cloudTimestamp = new Date(cloudNote.updated_at).getTime()
  const serverOffset = getServerTimeOffsetMs()
  const localTimestampAligned = localNote.lastSavedServerTime || serverOffset === null
    ? localTimestamp
    : localTimestamp + serverOffset

  return cloudTimestamp > localTimestampAligned
}

/**
 * Compares content hash to detect if notes are identical
 */
export function areNotesIdentical(
  localNote: TabData,
  cloudNote: CloudNote
): boolean {
  return (
    localNote.title === cloudNote.title &&
    localNote.content === cloudNote.content
  )
}

