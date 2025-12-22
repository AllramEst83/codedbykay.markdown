import { getSupabaseClient } from './supabase.ts';
import { AuthenticationError } from './errors.ts';

export interface AuthenticatedUser {
  userId: string;
  email?: string;
}

export async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  
  try {
    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Auth verification failed:', error);
      throw new AuthenticationError('Invalid or expired token');
    }

    return {
      userId: user.id,
      email: user.email,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    console.error('Unexpected error during auth verification:', error);
    throw new AuthenticationError('Authentication failed');
  }
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.replace('Bearer ', '');
}

