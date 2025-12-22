import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { getSupabaseClient } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';

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
    const supabase = getSupabaseClient(); // service role client

    // Best-effort: delete all images in the user's folder to avoid orphaned storage.
    try {
      const { data: listed, error: listError } = await supabase.storage
        .from('user-images')
        .list(`${userId}`, { limit: 1000 });

      if (listError) {
        console.warn('Failed to list user images', listError);
      } else if (listed && listed.length > 0) {
        const paths = listed
          .filter((o) => o.name)
          .map((o) => `${userId}/${o.name}`);

        const { error: removeError } = await supabase.storage.from('user-images').remove(paths);
        if (removeError) {
          console.warn('Failed to remove user images', removeError);
        }
      }
    } catch (e) {
      console.warn('Storage cleanup failed', e);
    }

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    return jsonResponse({ success: true }, { status: 200, headers: corsHeaders });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('delete-user failed', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});


