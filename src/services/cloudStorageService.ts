/**
 * Cloud Storage Service
 * Handles all communication with Supabase Edge Functions for note CRUD operations
 * IMPORTANT: Always uses supabase.functions.invoke() instead of direct HTTP requests
 */

import { getSupabaseClient } from '../supabase/client'
import { updateServerTime } from './serverTimeService'
import type { CloudNote } from '../types/services/sync'
import type { TabData } from '../types/services'

export interface CreateNoteParams {
  title: string
  content: string
  local_id?: string
  device_id?: string
}

export interface UpdateNoteParams {
  id: string
  title?: string
  content?: string
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
  constructor(message = 'Conflict') {
    super(message, 409)
    this.name = 'CloudConflictError'
  }
}

export function isConflictError(error: unknown): error is CloudConflictError {
  return Boolean(error && typeof error === 'object' && (error as { status?: number }).status === 409)
}

/**
 * Creates a new note in the cloud
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
 * Updates an existing note in the cloud
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
    if (status === 409) {
      throw new CloudConflictError(error.message || 'Conflict')
    }
    throw new CloudStorageError(error.message || 'Failed to update note', status)
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
 * Converts a TabData to CreateNoteParams
 */
export function tabDataToCreateParams(
  tab: TabData,
  deviceId: string
): CreateNoteParams {
  return {
    title: tab.title,
    content: tab.content,
    local_id: tab.id,
    device_id: deviceId,
  }
}

/**
 * Converts a TabData to UpdateNoteParams
 * Requires the cloud note ID
 */
export function tabDataToUpdateParams(
  tab: TabData,
  cloudId: string,
  deviceId: string
): UpdateNoteParams {
  return {
    id: cloudId,
    title: tab.title,
    content: tab.content,
    device_id: deviceId,
    expected_updated_at: tab.cloudUpdatedAt,
  }
}

/**
 * Converts a CloudNote to TabData 
 * By using the cloud ID, each synced note gets a unique local ID that won't collide.
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
  }
}
