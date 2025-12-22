import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';
import { encrypt } from '../_shared/crypto.ts';

interface UpdateNoteRequest {
  id: string;
  title?: string;
  content?: string;
  device_id?: string;
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

    if (body.device_id !== undefined) {
      updates.device_id = body.device_id;
    }

    // Update note in database
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', body.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update note:', error);
      return jsonResponse(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!data) {
      return jsonResponse(
        { error: 'Note not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    return jsonResponse({ note: data }, { status: 200, headers: corsHeaders });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('update-note failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

