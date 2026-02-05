/**
 * Conflict Resolver Service
 * Implements merge-first conflict resolution for note synchronization.
 */

import type { TabData } from '../types/services'
import type { CloudNote, ConflictResolution, ResolveConflictOptions } from '../types/services/sync'
import { getServerTimeOffsetMs } from './serverTimeService'

const DEFAULT_TITLE = 'Untitled'
const MERGE_SEPARATOR = '\n\n---\n\n'

type NoteContent = Pick<TabData, 'title' | 'content'> | Pick<CloudNote, 'title' | 'content'>

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function normalizeTitle(value: string): string {
  return normalizeText(value).trim()
}

function mergeTitles(localTitle: string, cloudTitle: string): string {
  const local = normalizeTitle(localTitle)
  const cloud = normalizeTitle(cloudTitle)

  if (!local || local === DEFAULT_TITLE) return cloud || DEFAULT_TITLE
  if (!cloud || cloud === DEFAULT_TITLE) return local
  if (local === cloud) return local
  if (local.includes(cloud)) return local
  if (cloud.includes(local)) return cloud

  return `${local} / ${cloud}`
}

function commonPrefixLength(local: string[], cloud: string[]): number {
  const minLength = Math.min(local.length, cloud.length)
  let index = 0
  while (index < minLength && local[index] === cloud[index]) {
    index += 1
  }
  return index
}

function commonSuffixLength(local: string[], cloud: string[], prefixLength: number): number {
  const minLength = Math.min(local.length, cloud.length)
  let index = 0
  while (
    index < minLength - prefixLength &&
    local[local.length - 1 - index] === cloud[cloud.length - 1 - index]
  ) {
    index += 1
  }
  return index
}

function mergeContent(localContent: string, cloudContent: string): string {
  const normalizedLocal = normalizeText(localContent)
  const normalizedCloud = normalizeText(cloudContent)

  if (normalizedLocal === normalizedCloud) {
    return localContent
  }

  const localTrimmed = normalizedLocal.trim()
  const cloudTrimmed = normalizedCloud.trim()

  if (!localTrimmed) return cloudContent
  if (!cloudTrimmed) return localContent

  if (normalizedLocal.includes(normalizedCloud)) return localContent
  if (normalizedCloud.includes(normalizedLocal)) return cloudContent

  const localLines = normalizedLocal.split('\n')
  const cloudLines = normalizedCloud.split('\n')
  const prefixLength = commonPrefixLength(localLines, cloudLines)
  const suffixLength = commonSuffixLength(localLines, cloudLines, prefixLength)

  if (prefixLength === 0 && suffixLength === 0) {
    return `${normalizedLocal}${MERGE_SEPARATOR}${normalizedCloud}`
  }

  const prefix = localLines.slice(0, prefixLength)
  const suffix = suffixLength > 0 ? localLines.slice(localLines.length - suffixLength) : []
  const localMiddle = localLines.slice(prefixLength, localLines.length - suffixLength)
  const cloudMiddle = cloudLines.slice(prefixLength, cloudLines.length - suffixLength)

  const mergedLines: string[] = [...prefix]

  if (localMiddle.length > 0) {
    mergedLines.push(...localMiddle)
  }

  if (localMiddle.length > 0 && cloudMiddle.length > 0) {
    mergedLines.push('', '---', '')
  }

  if (cloudMiddle.length > 0) {
    mergedLines.push(...cloudMiddle)
  }

  if (suffix.length > 0) {
    mergedLines.push(...suffix)
  }

  if (mergedLines.length === 0) {
    return localContent || cloudContent
  }

  return mergedLines.join('\n')
}

function getAlignedLocalTimestamp(localNote: TabData): number {
  const localTimestamp = localNote.lastSaved || 0
  const serverOffset = getServerTimeOffsetMs()

  // If local timestamp is already aligned (or we don't know the offset), use as-is.
  if (localNote.lastSavedServerTime || serverOffset === null) {
    return localTimestamp
  }

  return localTimestamp + serverOffset
}

/**
 * Resolves conflicts between local and cloud notes.
 *
 * Strategy:
 * - If one side is clearly newer (based on timestamps), pick the winner.
 * - If timestamps are equal/ambiguous, merge to avoid data loss.
 * - Optionally force merge (e.g. after an optimistic concurrency conflict).
 */
export function resolveConflict(
  localNote: TabData,
  cloudNote: CloudNote,
  options?: ResolveConflictOptions
): ConflictResolution {
  const cloudTimestamp = Date.parse(cloudNote.updated_at)
  const hasValidCloudTimestamp = Number.isFinite(cloudTimestamp)
  const localTimestampAligned = getAlignedLocalTimestamp(localNote)

  if (options?.forceMerge) {
    return {
      strategy: 'merge',
      resolvedNote: mergeNotes(localNote, cloudNote, hasValidCloudTimestamp ? cloudTimestamp : null),
    }
  }

  if (hasValidCloudTimestamp) {
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
          ...localNote,
          title: cloudNote.title,
          content: cloudNote.content,
          lastSaved: cloudTimestamp,
          lastSavedServerTime: true,
          cloudId: localNote.cloudId || cloudNote.id,
          cloudUpdatedAt: cloudNote.updated_at,
        },
      }
    }
  }

  return {
    strategy: 'merge',
    resolvedNote: mergeNotes(localNote, cloudNote, hasValidCloudTimestamp ? cloudTimestamp : null),
  }
}

/**
 * Merges two notes by combining titles and content.
 */
function mergeNotes(localNote: TabData, cloudNote: CloudNote, cloudTimestamp: number | null): TabData {
  const title = mergeTitles(localNote.title, cloudNote.title)
  const content = mergeContent(localNote.content, cloudNote.content)

  return {
    ...localNote,
    title,
    content,
    ...(cloudTimestamp !== null
      ? {
          // Make the merged note slightly newer than the cloud version to ensure it can be uploaded.
          lastSaved: cloudTimestamp + 1,
          lastSavedServerTime: true,
        }
      : {}),
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

  const resolution = resolveConflict(localNote, cloudNote)
  if (resolution.strategy === 'cloud-wins') {
    return false
  }
  return !areNotesIdentical(resolution.resolvedNote, cloudNote)
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

  const resolution = resolveConflict(localNote, cloudNote)
  if (resolution.strategy === 'local-wins') {
    return false
  }
  return !areNotesIdentical(resolution.resolvedNote, localNote)
}

/**
 * Compares content to detect if notes are identical
 */
export function areNotesIdentical(
  localNote: NoteContent,
  cloudNote: NoteContent
): boolean {
  return (
    normalizeTitle(localNote.title) === normalizeTitle(cloudNote.title) &&
    normalizeText(localNote.content) === normalizeText(cloudNote.content)
  )
}

