/**
 * Notify Contact Accepted Edge Function
 * Triggered when a contact request status becomes 'accepted'
 */

import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
import {
  createSupabaseAdminClient,
} from '../_shared/auth.ts';
import { createNotificationRecord } from '../_shared/notifications.ts';
import { getUserLanguage, t } from '../_shared/i18n.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req.headers.get('origin'));
  }

  if (req.method !== 'POST') {
    return corsErrorResponse('Method not allowed', 405);
  }

  try {
    const { request_id } = await req.json();

    if (!request_id) {
      return corsErrorResponse('request_id is required', 400);
    }

    const supabase = createSupabaseAdminClient();

    const { data: request, error } = await supabase
      .from('contact_requests')
      .select(
        'id, from_user_id, to_user_id, from_user_display_name, to_user_display_name'
      )
      .eq('id', request_id)
      .maybeSingle();

    if (error || !request) {
      console.error('[notify-contact-accepted] Request not found:', error);
      return corsErrorResponse('Contact request not found', 404);
    }

    if (!request.from_user_id || !request.to_user_id) {
      return corsResponse(
        { success: true, message: 'No registered recipient' },
        200
      );
    }

    const language = await getUserLanguage(supabase, request.from_user_id);
    const senderName =
      request.to_user_display_name || 'Contact';

    await createNotificationRecord(supabase, {
      recipientId: request.from_user_id,
      senderId: request.to_user_id,
      senderDisplayName: senderName,
      type: 'contact_accepted',
      title: t('contactAccepted.title', language),
      message: t('contactAccepted.message', language, {
        senderName,
      }),
      contactRequestId: request.id,
      metadata: {
        action: 'contact_accepted',
        timestamp: new Date().toISOString(),
      },
    });

    return corsResponse({ success: true }, 200);
  } catch (error) {
    console.error('[notify-contact-accepted] Error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to process contact acceptance';
    return corsErrorResponse(message, 500);
  }
});
