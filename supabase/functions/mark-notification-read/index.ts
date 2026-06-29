/**
 * Mark Notification as Read Edge Function
 * Deletes a notification for the authenticated user
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

    // Parse request body
    const { notificationId } = await req.json();

    if (!notificationId) {
      return corsErrorResponse(
        'notificationId is required',
        400,
        requestOrigin
      );
    }

    const supabase = createSupabaseAdminClient();

    // Verify notification belongs to the authenticated user
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('recipient_id')
      .eq('id', notificationId)
      .single();

    if (fetchError || !notification) {
      return corsErrorResponse('Notification not found', 404, requestOrigin);
    }

    if (notification.recipient_id !== user.id) {
      return corsErrorResponse(
        'You can only delete your own notifications',
        403,
        requestOrigin
      );
    }

    // Delete the notification
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (deleteError) {
      console.error('Error deleting notification:', deleteError);
      return corsErrorResponse(
        'Failed to delete notification',
        500,
        requestOrigin
      );
    }

    console.log(`🗑️ Notification ${notificationId} deleted by user ${user.id}`);

    return corsResponse({ success: true }, 200, requestOrigin);
  } catch (error) {
    console.error('[MarkNotificationRead] Error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';

    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
