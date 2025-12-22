import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth, getSupabaseClient } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';

interface DeleteNoteRequest {
  id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== 'DELETE') {
      return jsonResponse(
        { error: 'Method not allowed' },
        { status: 405, headers: corsHeaders },
      );
    }

    const { userId } = await getAuthenticatedUser(req);
    const body = await req.json() as DeleteNoteRequest;

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

    // Delete note from database
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', body.id)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete note:', error);
      return jsonResponse(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    // Best-effort: Delete associated images from storage
    // Images are stored at {user_id}/note_{note_id}_*
    try {
      const serviceSupabase = getSupabaseClient();
      const { data: listed } = await serviceSupabase.storage
        .from('user-images')
        .list(`${userId}`, { limit: 1000 });

      if (listed && listed.length > 0) {
        const noteImagePaths = listed
          .filter((obj) => obj.name.startsWith(`note_${body.id}_`))
          .map((obj) => `${userId}/${obj.name}`);

        if (noteImagePaths.length > 0) {
          await serviceSupabase.storage.from('user-images').remove(noteImagePaths);
        }
      }
    } catch (storageError) {
      console.warn('Failed to clean up note images:', storageError);
      // Don't fail the request if image cleanup fails
    }

    return jsonResponse({ success: true }, { status: 200, headers: corsHeaders });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('delete-note failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});
