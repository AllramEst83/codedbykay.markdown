import { handleCorsPreflightRequest, getCorsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { createSupabaseClientWithAuth } from '../_shared/supabase.ts';
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

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const noteId = formData.get('note_id') as string;
    const imageId = formData.get('image_id') as string;

    if (!file) {
      return jsonResponse(
        { error: 'Missing file in request' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!imageId) {
      return jsonResponse(
        { error: 'Missing image_id in request' },
        { status: 400, headers: corsHeaders },
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return jsonResponse(
        { error: 'File must be an image' },
        { status: 400, headers: corsHeaders },
      );
    }

    // Get file extension
    const ext = file.name.split('.').pop() || 'jpg';
    
    // Create storage path: {user_id}/note_{note_id}_{image_id}.{ext}
    const notePrefix = noteId ? `note_${noteId}_` : '';
    const storagePath = `${userId}/${notePrefix}${imageId}.${ext}`;

    // Get auth token for RLS
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return jsonResponse(
        { error: 'Missing authorization token' },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createSupabaseClientWithAuth(authToken);

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('user-images')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error('Failed to upload image:', error);
      return jsonResponse(
        { error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('user-images')
      .getPublicUrl(storagePath);

    return jsonResponse(
      { 
        path: data.path,
        url: urlData.publicUrl,
        imageId: imageId,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, { status: err.status, headers: corsHeaders });
    }
    console.error('upload-image failed:', err);
    return jsonResponse({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

