/**
 * Authentication utilities for Supabase Edge Functions
 */

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface AuthenticatedUser {
  id: string;
  email: string;
  uid: string; // Alias for id (compatibility)
}

/**
 * Create Supabase client from request
 */
export function createSupabaseClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader || '',
      },
    },
  });
}

/**
 * Get authenticated user from request
 * Throws error if not authenticated
 */
export async function getAuthenticatedUser(
  req: Request
): Promise<AuthenticatedUser> {
  const supabase = createSupabaseClient(req);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized: No valid authentication token');
  }

  return {
    id: user.id,
    email: user.email || '',
    uid: user.id, // Alias for compatibility
  };
}

/**
 * Get user from service role key (admin operations)
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Verify user has access to a resource
 */
export async function verifyResourceAccess(
  supabase: SupabaseClient,
  userId: string,
  resourceId: string,
  resourceType: 'file' | 'folder' | 'contact'
): Promise<boolean> {
  let query;

  switch (resourceType) {
    case 'file': {
      const { data, error } = await supabase
        .from('files')
        .select('owner, shared_with')
        .eq('id', resourceId)
        .single();

      if (error || !data) return false;

      return (
        data.owner === userId ||
        (data.shared_with && data.shared_with.includes(userId))
      );
    }

    case 'folder': {
      const { data, error } = await supabase
        .from('folders')
        .select('owner')
        .eq('id', resourceId)
        .single();

      if (error || !data) return false;

      return data.owner === userId;
    }

    case 'contact': {
      const { data, error } = await supabase
        .from('contacts')
        .select('user_id_1, user_id_2')
        .eq('id', resourceId)
        .single();

      if (error || !data) return false;

      return data.user_id_1 === userId || data.user_id_2 === userId;
    }

    default:
      return false;
  }
}

