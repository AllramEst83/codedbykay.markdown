import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';
import { encrypt } from '../_shared/crypto.ts';

interface UpdateNoteRequest {
  id: string;
  title?: string;
  content?: string;
  content_format?: 'plain' | 'yjs';
  device_id?: string;
  expected_updated_at?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== 'PUT' && req.method !== 'PATCH') {
      return jsonResponse(
        { error: 'Method not allowed' },
        { status: 405, headers: corsHeaders },
      );
    }

    const { userId } = await getAuthenticatedUser(req);
    const body = await req.json() as UpdateNoteRequest;

    if (!body.id) {
      return jsonResponse(
        { error: 'Missing required field: id' },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!body.expected_updated_at) {
      return jsonResponse(
        { error: 'Missing required field: expected_updated_at' },
        { status: 400, headers: corsHeaders },
      );
    }

    // Get auth token for RLS
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return jsonResponse(
        { error: 'Missing authorization token' },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createSupabaseClientWithAuth(authToken);

    // Build update object
    const updates: any = {
      last_synced_at: new Date().toISOString(),
    };

    if (body.title !== undefined) {
      updates.title = body.title;
    }

    if (body.content !== undefined) {
      // Encrypt the content
      const encrypted = await encrypt(body.content);
      updates.content = encrypted.encryptedKey;
      updates.encrypted_key = encrypted.encryptedKey;
      updates.iv = encrypted.iv;
      updates.auth_tag = encrypted.authTag;
    }

    if (body.content_format !== undefined) {
      updates.content_format = body.content_format;
    }

    if (body.device_id !== undefined) {
      updates.device_id = body.device_id;
    }

    // Update note in database with optimistic concurrency check
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', body.id)
      .eq('user_id', userId)
      .eq('updated_at', body.expected_updated_at)
      .select();

    if (error) {
      console.error('Failed to update note:', error);
      return jsonResponse(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    const updatedNote = data?.[0];
    if (!updatedNote) {
      const { data: existing, error: existingError } = await supabase
        .from('notes')
        .select('id, updated_at')
        .eq('id', body.id)
        .eq('user_id', userId)
        .limit(1);

      if (existingError) {
        console.error('Failed to check note existence:', existingError);
        return jsonResponse(
          { error: existingError.message },
          { status: 500, headers: corsHeaders },
        );
      }

      if (!existing || existing.length === 0) {
        return jsonResponse(
          { error: 'Note not found' },
          { status: 404, headers: corsHeaders },
        );
      }

      // Return 200 + conflict marker so clients can resolve gracefully without a noisy 409 network error.
      return jsonResponse(
        { 
          conflict: true,
          error: 'Conflict: note has been updated',
          server_updated_at: existing[0].updated_at,
          server_time: new Date().toISOString(),
        },
        { status: 200, headers: corsHeaders },
      );
    }

    // Never echo ciphertext/encryption metadata back to the client - only the
    // fields callers actually use (id/updated_at/etc). Content is fetched
    // (and decrypted) separately via get-note/get-notes.
    const note = {
      id: updatedNote.id,
      user_id: updatedNote.user_id,
      title: updatedNote.title,
      content_format: updatedNote.content_format,
      created_at: updatedNote.created_at,
      updated_at: updatedNote.updated_at,
      last_synced_at: updatedNote.last_synced_at,
      device_id: updatedNote.device_id,
      local_id: updatedNote.local_id,
    };

    return jsonResponse(
      { note, server_time: new Date().toISOString() },
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('update-note failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

