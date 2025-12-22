/**
 * CORS utility for Edge Functions
 * Provides unified CORS header management with configurable allowed origins
 */

/**
 * Get allowed origins from environment variable
 * Format: Comma-separated list of origins, e.g., "http://localhost:3000,https://app.example.com"
 * If not set, defaults to '*' (all origins)
 */
function getAllowedOrigins(): string[] {
    const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
    
    if (!envOrigins || envOrigins.trim() === '') {
      return ['*'];
    }
    
    return envOrigins
      .split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0);
  }
  
  /**
   * Determine the appropriate origin to return in the Access-Control-Allow-Origin header
   * If the request origin is in the allowed list, return it
   * If '*' is in the allowed list, return '*'
   * Otherwise, return the first allowed origin
   */
  function getOriginHeader(requestOrigin: string | null): string {
    const allowedOrigins = getAllowedOrigins();
    
    // If wildcard is allowed, return it
    if (allowedOrigins.includes('*')) {
      return '*';
    }
    
    // If request origin is in the allowed list, return it
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    
    // Default to first allowed origin
    return allowedOrigins[0] || '*';
  }
  
  /**
   * Get CORS headers for a response
   */
  export function getCorsHeaders(request?: Request): HeadersInit {
    const origin = request?.headers.get('origin') || null;
    const allowOrigin = getOriginHeader(origin);
    
    return {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
  }
  
  /**
   * Handle CORS preflight OPTIONS request
   */
  export function handleCorsPreflightRequest(request: Request): Response {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }
  
  /**
   * Add CORS headers to an existing response
   */
  export function addCorsHeaders(response: Response, request?: Request): Response {
    const corsHeaders = getCorsHeaders(request);
    
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  }
  
  