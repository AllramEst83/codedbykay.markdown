/**
 * Cloud Storage Service
 * Handles all communication with Supabase Edge Functions for note CRUD operations
 * IMPORTANT: Always uses supabase.functions.invoke() instead of direct HTTP requests
 */

import { getSupabaseClient } from '../supabase/client'
import { updateServerTime } from './serverTimeService'
import * as yjsDocService from './yjsDocService'
import type { CloudNote } from '../types/services/sync'
import type { TabData } from '../types/services'

export interface CreateNoteParams {
  title: string
  content: string
  content_format?: 'plain' | 'yjs'
  local_id?: string
  device_id?: string
}

export interface UpdateNoteParams {
  id: string
  title?: string
  content?: string
  content_format?: 'plain' | 'yjs'
  device_id?: string
  expected_updated_at?: string
}

export interface DeleteNoteParams {
  id: string
}

export class CloudStorageError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'CloudStorageError'
    this.status = status
  }
}

export class CloudConflictError extends CloudStorageError {
  serverUpdatedAt?: string

  constructor(message = 'Conflict', serverUpdatedAt?: string) {
    super(message, 409)
    this.name = 'CloudConflictError'
    this.serverUpdatedAt = serverUpdatedAt
  }
}

export function isConflictError(error: unknown): error is CloudConflictError {
  return Boolean(error && typeof error === 'object' && (error as { status?: number }).status === 409)
}

/**
 * Creates a new note in the cloud.
 * Note: the returned CloudNote's `content` is not populated by this call (the
 * create-note function omits ciphertext from its response) - fetch via getNote/getNotes
 * if the decrypted content is needed.
 */
export async function createNote(params: CreateNoteParams): Promise<CloudNote> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.functions.invoke('create-note', {
    body: params,
  })

  if (error) {
    console.error('Failed to create note:', error)
    throw new Error(error.message || 'Failed to create note')
  }

  if (!data?.note) {
    throw new Error('Invalid response from create-note function')
  }
  if (data?.server_time) {
    updateServerTime(data.server_time)
  }

  return data.note as CloudNote
}

/**
 * Fetches all notes for the current user
 */
export async function getNotes(): Promise<CloudNote[]> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.functions.invoke('get-notes', {
    method: 'GET',
  })

  if (error) {
    console.error('Failed to fetch notes:', error)
    throw new Error(error.message || 'Failed to fetch notes')
  }

  if (!data?.notes) {
    throw new Error('Invalid response from get-notes function')
  }
  if (data?.server_time) {
    updateServerTime(data.server_time)
  }

  return data.notes as CloudNote[]
}

/**
 * Fetches a single note by ID (decrypted)
 */
export async function getNote(noteId: string): Promise<CloudNote> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.functions.invoke('get-note', {
    body: { id: noteId },
    method: 'POST',
  })

  if (error) {
    console.error('Failed to fetch note:', error)
    throw new Error(error.message || 'Failed to fetch note')
  }

  if (!data?.note) {
    throw new Error('Invalid response from get-note function')
  }
  if (data?.server_time) {
    updateServerTime(data.server_time)
  }

  return data.note as CloudNote
}

/**
 * Extracts HTTP status code from Supabase FunctionsHttpError
 * The status can be in different locations depending on SDK version
 */
function getErrorStatus(error: { status?: number; context?: { status?: number } }): number | undefined {
  // Check direct status property first
  if (typeof error.status === 'number') {
    return error.status
  }
  // Check context.status (Supabase SDK v2 structure)
  if (error.context && typeof error.context.status === 'number') {
    return error.context.status
  }
  return undefined
}

/**
 * Updates an existing note in the cloud.
 * Note: the returned CloudNote's `content` is not populated by this call (the
 * update-note function omits ciphertext from its response) - fetch via getNote/getNotes
 * if the decrypted content is needed.
 */
export async function updateNote(params: UpdateNoteParams): Promise<CloudNote> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.functions.invoke('update-note', {
    body: params,
    method: 'PUT',
  })

  if (error) {
    const status = getErrorStatus(error)
    console.error('Failed to update note:', error, 'status:', status)
    throw new CloudStorageError(error.message || 'Failed to update note', status)
  }

  // Graceful conflict path: Edge Function returns 200 with a conflict marker.
  if (data?.conflict) {
    if (data?.server_time) {
      updateServerTime(data.server_time)
    }
    throw new CloudConflictError('Conflict', data?.server_updated_at)
  }

  if (!data?.note) {
    throw new Error('Invalid response from update-note function')
  }
  if (data?.server_time) {
    updateServerTime(data.server_time)
  }

  return data.note as CloudNote
}

/**
 * Deletes a note from the cloud
 */
export async function deleteNote(params: DeleteNoteParams): Promise<void> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.functions.invoke('delete-note', {
    body: params,
    method: 'DELETE',
  })

  if (error) {
    console.error('Failed to delete note:', error)
    throw new Error(error.message || 'Failed to delete note')
  }

  if (!data?.success) {
    throw new Error('Failed to delete note')
  }
}

/**
 * Uploads an image to Supabase Storage
 */
export async function uploadImage(
  file: File,
  imageId: string,
  noteId?: string
): Promise<{ path: string; url: string; imageId: string }> {
  const supabase = getSupabaseClient()

  const formData = new FormData()
  formData.append('file', file)
  formData.append('image_id', imageId)
  if (noteId) {
    formData.append('note_id', noteId)
  }

  const { data, error } = await supabase.functions.invoke('upload-image', {
    body: formData,
  })

  if (error) {
    console.error('Failed to upload image:', error)
    throw new Error(error.message || 'Failed to upload image')
  }

  if (!data?.url) {
    throw new Error('Invalid response from upload-image function')
  }

  return {
    path: data.path,
    url: data.url,
    imageId: data.imageId,
  }
}

/**
 * Deletes an image from Supabase Storage
 */
export async function deleteImage(path: string): Promise<void> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.functions.invoke('delete-image', {
    body: { path },
    method: 'DELETE',
  })

  if (error) {
    console.error('Failed to delete image:', error)
    throw new Error(error.message || 'Failed to delete image')
  }

  if (!data?.success) {
    throw new Error('Failed to delete image')
  }
}

/**
 * Converts a TabData to CreateNoteParams.
 * For a Yjs-backed tab, `content` is the tab's *live doc* state (not `tab.content`,
 * which is only a display mirror) - this guarantees the upload always reflects the
 * doc's current state even if the mirror hasn't caught up yet.
 */
export async function tabDataToCreateParams(
  tab: TabData,
  deviceId: string
): Promise<CreateNoteParams> {
  if (tab.contentFormat === 'yjs') {
    return {
      title: tab.title,
      content: await yjsDocService.encodeStateBase64(tab.id),
      content_format: 'yjs',
      local_id: tab.id,
      device_id: deviceId,
    }
  }
  return {
    title: tab.title,
    content: tab.content,
    local_id: tab.id,
    device_id: deviceId,
  }
}

/**
 * Converts a TabData to UpdateNoteParams. Requires the cloud note ID.
 * See tabDataToCreateParams for why Yjs-backed tabs encode from the live doc.
 */
export async function tabDataToUpdateParams(
  tab: TabData,
  cloudId: string,
  deviceId: string
): Promise<UpdateNoteParams> {
  if (tab.contentFormat === 'yjs') {
    return {
      id: cloudId,
      title: tab.title,
      content: await yjsDocService.encodeStateBase64(tab.id),
      content_format: 'yjs',
      device_id: deviceId,
      expected_updated_at: tab.cloudUpdatedAt,
    }
  }
  return {
    id: cloudId,
    title: tab.title,
    content: tab.content,
    device_id: deviceId,
    expected_updated_at: tab.cloudUpdatedAt,
  }
}

/**
 * Converts a CloudNote to TabData for a note with no local counterpart yet.
 * By using the cloud ID, each synced note gets a unique local ID that won't collide.
 * For 'yjs' notes this only sets up the plain-format-shaped fields - callers must
 * still merge the Yjs content into the doc themselves (see syncService.deriveDisplayFields),
 * since decoding requires the doc registry this module doesn't have access to.
 */
export function cloudNoteToTabData(cloudNote: CloudNote): TabData {
  return {
    id: cloudNote.id,
    title: cloudNote.title,
    content: cloudNote.content,
    lastSaved: new Date(cloudNote.updated_at).getTime(),
    lastSavedServerTime: true,
    cloudId: cloudNote.id,
    cloudUpdatedAt: cloudNote.updated_at,
    contentFormat: cloudNote.content_format,
  }
}
