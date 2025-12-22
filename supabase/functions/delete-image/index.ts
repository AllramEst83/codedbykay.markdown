import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth } from '../_shared/supabase.ts';
import { HttpError, jsonResponse } from '../_shared/errors.ts';

interface DeleteImageRequest {
  path: string;
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
    const body = await req.json() as DeleteImageRequest;

    if (!body.path) {
      return jsonResponse(
        { error: 'Missing required field: path' },
        { status: 400, headers: corsHeaders },
      );
    }

    // Verify the path starts with user_id to prevent deleting other users' images
    if (!body.path.startsWith(`${userId}/`)) {
      return jsonResponse(
        { error: 'Unauthorized: Cannot delete images from other users' },
        { status: 403, headers: corsHeaders },
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

    // Delete from Supabase Storage
    const { error } = await supabase.storage
      .from('user-images')
      .remove([body.path]);

    if (error) {
      console.error('Failed to delete image:', error);
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
    console.error('delete-image failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

