/**
 * Minimal row shape for Supabase realtime payloads on the `notes` table.
 * We keep this deliberately small to avoid coupling the sync service to Supabase SDK types.
 */
export type NotesChangeRow = {
  id: string
  device_id: string | null
}

