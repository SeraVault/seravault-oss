/**
 * Calculate Storage Usage Edge Function
 * Recalculates total storage usage for the authenticated user
 *
 * In Supabase, storage usage is automatically tracked via database triggers.
 * This function performs a full recalculation to ensure accuracy.
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

    console.log(`📊 Calculating storage usage for user: ${userId}`);

    const supabase = createSupabaseAdminClient();

    // Get all files owned by the user
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('storage_path, size')
      .eq('owner', userId);

    if (filesError) {
      console.error('Error fetching files:', filesError);
      throw new Error('Failed to fetch files');
    }

    let totalBytes = 0;
    let fileCount = 0;

    // Calculate total from file records
    // Note: In Supabase, the 'size' field is encrypted JSONB
    for (const file of files || []) {
      if (file.size && typeof file.size === 'object' && 'value' in file.size) {
        const fileSize = parseInt(file.size.value as string) || 0;
        totalBytes += fileSize;
        fileCount++;
      }
    }

    console.log(`📊 User ${userId}: Found ${fileCount} files totaling ${totalBytes} bytes`);

    // Update the user_storage_usage table with accurate values
    const { error: updateError } = await supabase
      .from('user_storage_usage')
      .upsert({
        user_id: userId,
        storage_bytes: totalBytes,
        file_count: fileCount,
        last_updated: new Date().toISOString(),
      });

    if (updateError) {
      console.error('Error updating storage usage:', updateError);
      // Don't throw - still return the calculated values
    }

    return corsResponse(
      {
        usedBytes: totalBytes,
        fileCount: fileCount,
      },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('[CalculateStorageUsage] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to calculate storage usage';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
