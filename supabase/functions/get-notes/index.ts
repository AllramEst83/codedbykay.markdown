import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';
import { decrypt } from '../_shared/crypto.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== 'GET') {
      return jsonResponse(
        { error: 'Method not allowed' },
        { status: 405, headers: corsHeaders },
      );
    }

    const { userId } = await getAuthenticatedUser(req);

    // Get auth token for RLS
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return jsonResponse(
        { error: 'Missing authorization token' },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createSupabaseClientWithAuth(authToken);

    // Fetch all user notes
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch notes:', error);
      return jsonResponse(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    // Decrypt content for each note
    const decryptedNotes = await Promise.all(
      (data || []).map(async (note) => {
        try {
          const decryptedContent = await decrypt({
            encryptedKey: note.encrypted_key,
            iv: note.iv,
            authTag: note.auth_tag,
          });

          return {
            id: note.id,
            user_id: note.user_id,
            title: note.title,
            content: decryptedContent,
            created_at: note.created_at,
            updated_at: note.updated_at,
            last_synced_at: note.last_synced_at,
            device_id: note.device_id,
            local_id: note.local_id,
          };
        } catch (err) {
          console.error(`Failed to decrypt note ${note.id}:`, err);
          // Return note with empty content if decryption fails
          return {
            id: note.id,
            user_id: note.user_id,
            title: note.title,
            content: '',
            created_at: note.created_at,
            updated_at: note.updated_at,
            last_synced_at: note.last_synced_at,
            device_id: note.device_id,
            local_id: note.local_id,
          };
        }
      })
    );

    return jsonResponse({ notes: decryptedNotes }, { status: 200, headers: corsHeaders });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('get-notes failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

