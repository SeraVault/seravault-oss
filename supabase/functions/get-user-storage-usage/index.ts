/**
 * Get User Storage Usage Edge Function
 * Returns current storage usage stats for authenticated user
 * Much faster than recalculating from scratch
 */

import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
import { getAuthenticatedUser, createSupabaseAdminClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(requestOrigin);
  }

  if (req.method !== 'POST') {
    return corsErrorResponse('Method not allowed', 405, requestOrigin);
  }

  try {
    const user = await getAuthenticatedUser(req);
    const userId = user.id;

    const supabase = createSupabaseAdminClient();

    // Get storage usage from user_storage_usage table
    const { data: storageData, error: storageError } = await supabase
      .from('user_storage_usage')
      .select('storage_bytes, file_count, last_updated')
      .eq('user_id', userId)
      .single();

    if (storageError && storageError.code !== 'PGRST116') {
      // PGRST116 = not found, which is fine (means 0 usage)
      console.error('Error fetching storage usage:', storageError);
      throw new Error('Failed to fetch storage usage');
    }

    const storageUsedBytes = storageData?.storage_bytes || 0;
    const fileCount = storageData?.file_count || 0;
    const lastUpdated = storageData?.last_updated || null;

    // Note: In Supabase we only track storage (not separate Firestore usage)
    // since PostgreSQL storage is typically not counted against user quotas
    return corsResponse(
      {
        storageUsedBytes,
        totalUsedBytes: storageUsedBytes,
        fileCount,
        storageLastUpdated: lastUpdated,
      },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('[GetUserStorageUsage] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to get storage usage';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
