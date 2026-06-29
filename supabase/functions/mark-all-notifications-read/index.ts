/**
 * Mark All Notifications as Read Edge Function
 * Deletes all unread notifications for the authenticated user
 */

import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
import {
  getAuthenticatedUser,
  createSupabaseAdminClient,
} from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('origin');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(requestOrigin);
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return corsErrorResponse('Method not allowed', 405, requestOrigin);
  }

  try {
    // Verify authentication
    const user = await getAuthenticatedUser(req);

    const supabase = createSupabaseAdminClient();

    // Get count of unread notifications first
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);

    if (countError) {
      console.error('Error counting notifications:', countError);
    }

    const notificationCount = count || 0;

    if (notificationCount === 0) {
      return corsResponse({ success: true, deleted: 0 }, 200, requestOrigin);
    }

    // Delete all unread notifications for user
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('recipient_id', user.id)
      .eq('is_read', false);

    if (deleteError) {
      console.error('Error deleting notifications:', deleteError);
      return corsErrorResponse(
        'Failed to delete notifications',
        500,
        requestOrigin
      );
    }

    console.log(`🗑️ Deleted ${notificationCount} notifications for user ${user.id}`);

    return corsResponse(
      { success: true, deleted: notificationCount },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('[MarkAllNotificationsRead] Error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';

    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
