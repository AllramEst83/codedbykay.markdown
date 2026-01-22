import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';
import { decrypt } from '../_shared/crypto.ts';

interface GetNoteRequest {
  id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== 'POST') {
      return jsonResponse(
        { error: 'Method not allowed' },
        { status: 405, headers: corsHeaders },
      );
    }

    const { userId } = await getAuthenticatedUser(req);
    const body = await req.json() as GetNoteRequest;

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

    // Fetch the note
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .eq('id', body.id)
      .single();

    if (error) {
      console.error('Failed to fetch note:', error);
      const status = error.code === 'PGRST116' ? 404 : 500;
      return jsonResponse(
        { error: error.message },
        { status, headers: corsHeaders },
      );
    }

    if (!data) {
      return jsonResponse(
        { error: 'Note not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    const decryptedContent = await decrypt({
      encryptedKey: data.encrypted_key,
      iv: data.iv,
      authTag: data.auth_tag,
    });

    const note = {
      id: data.id,
      user_id: data.user_id,
      title: data.title,
      content: decryptedContent,
      created_at: data.created_at,
      updated_at: data.updated_at,
      last_synced_at: data.last_synced_at,
      device_id: data.device_id,
      local_id: data.local_id,
    };

    return jsonResponse(
      { note, server_time: new Date().toISOString() },
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('get-note failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});
