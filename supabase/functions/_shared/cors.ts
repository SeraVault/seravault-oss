/**
 * CORS configuration for Supabase Edge Functions
 * Matches the CORS setup from Firebase Cloud Functions
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Will be restricted based on origin
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

/**
 * Allowed origins for CORS
 */
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
];

/**
 * Get CORS headers with proper origin validation
 */
export function getCorsHeaders(requestOrigin?: string | null): HeadersInit {
  const origin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightResponse(
  requestOrigin?: string | null
): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(requestOrigin),
  });
}

/**
 * Wrap response with CORS headers
 */
export function corsResponse(
  data: unknown,
  status = 200,
  requestOrigin?: string | null
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(requestOrigin),
    },
  });
}

/**
 * Error response with CORS headers
 */
export function corsErrorResponse(
  error: string,
  status = 400,
  requestOrigin?: string | null
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(requestOrigin),
    },
  });
}
