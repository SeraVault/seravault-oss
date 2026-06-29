/**
 * Notify Contact Request Edge Function
 * Triggered when a new contact request is inserted
 */

import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
import {
  createSupabaseAdminClient,
} from '../_shared/auth.ts';
import {
  getContactSettings,
  createNotificationRecord,
} from '../_shared/notifications.ts';
import {
  getUserLanguage,
  t,
} from '../_shared/i18n.ts';
import { sendEmail } from '../_shared/email.ts';

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
        'id, from_user_id, from_user_display_name, from_user_email, to_user_id, to_user_email, message'
      )
      .eq('id', request_id)
      .maybeSingle();

    if (error || !request) {
      console.error('[notify-contact-request] Request not found:', error);
      return corsErrorResponse('Contact request not found', 404);
    }

    if (!request.to_user_id) {
      // Invitations to non-users are handled elsewhere
      return corsResponse(
        { success: true, message: 'Invitation skips in-app notification' },
        200
      );
    }

    const settings = await getContactSettings(supabase, request.to_user_id);
    if (!settings.notifyContactRequests) {
      console.log(
        `[notify-contact-request] User ${request.to_user_id} disabled contact notifications`
      );
      return corsResponse({ success: true, skipped: true }, 200);
    }

    const language = await getUserLanguage(supabase, request.to_user_id);
    const messageText = request.message?.trim();

    await createNotificationRecord(supabase, {
      recipientId: request.to_user_id,
      senderId: request.from_user_id,
      senderDisplayName: request.from_user_display_name,
      type: 'contact_request',
      title: t('contactRequest.title', language),
      message: messageText
        ? t('contactRequest.messageWithText', language, {
            senderName: request.from_user_display_name,
            message: messageText,
          })
        : t('contactRequest.messageWithoutText', language, {
            senderName: request.from_user_display_name,
          }),
      contactRequestId: request.id,
      metadata: {
        action: 'contact_request',
        timestamp: new Date().toISOString(),
      },
    });

    // Send email notification
    const { data: recipient } = await supabase
      .from('users')
      .select('email, language')
      .eq('uid', request.to_user_id)
      .maybeSingle();

    const recipientEmail = recipient?.email || request.to_user_email;
    if (recipientEmail) {
      const appUrl = Deno.env.get('APP_URL') || 'https://app.seravault.com';
      const contactLink = `${appUrl}/contacts?request=${request.id}`;

      await sendEmail({
        to: recipientEmail,
        subject: `${request.from_user_display_name} wants to connect on SeraVault`,
        html: `
          <h2>${request.from_user_display_name} sent you a contact request</h2>
          ${messageText ? `<p>"${messageText}"</p>` : ''}
          <p><a href="${contactLink}">View request</a></p>
        `,
      });
    }

    return corsResponse({ success: true }, 200);
  } catch (error) {
    console.error('[notify-contact-request] Error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to process contact request';
    return corsErrorResponse(message, 500);
  }
});
