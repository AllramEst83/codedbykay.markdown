import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';
import { encrypt } from '../_shared/crypto.ts';

interface CreateNoteRequest {
  title: string;
  content: string;
  local_id?: string;
  device_id?: string;
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
    const body = await req.json() as CreateNoteRequest;

    if (!body.title || body.content === undefined) {
      return jsonResponse(
        { error: 'Missing required fields: title and content' },
        { status: 400, headers: corsHeaders },
      );
    }

    // Encrypt the content
    const encrypted = await encrypt(body.content);

    // Get auth token for RLS
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return jsonResponse(
        { error: 'Missing authorization token' },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createSupabaseClientWithAuth(authToken);

    // Insert note into database
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        title: body.title,
        content: encrypted.encryptedKey,
        encrypted_key: encrypted.encryptedKey,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        local_id: body.local_id || null,
        device_id: body.device_id || null,
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create note:', error);
      return jsonResponse(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    return jsonResponse({ note: data }, { status: 201, headers: corsHeaders });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('create-note failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

