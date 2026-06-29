import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface NotificationInput {
  recipientId: string;
  senderId?: string | null;
  senderDisplayName?: string | null;
  type: string;
  title: string;
  message: string;
  fileId?: string | null;
  fileName?: string | null;
  contactRequestId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  invitationId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ContactSettings {
  notifyContactRequests: boolean;
  notifyFileShareFromUnknown: boolean;
  blockUnknownUsers: boolean;
}

export async function createNotificationRecord(
  supabase: SupabaseClient,
  payload: NotificationInput
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    recipient_id: payload.recipientId,
    sender_id: payload.senderId || null,
    sender_display_name: payload.senderDisplayName || null,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    file_id: payload.fileId || null,
    file_name: payload.fileName || null,
    contact_request_id: payload.contactRequestId || null,
    conversation_id: payload.conversationId || null,
    message_id: payload.messageId || null,
    invitation_id: payload.invitationId || null,
    metadata: payload.metadata || {},
    is_read: false,
  });

  if (error) {
    console.error('[Notifications] Failed to insert notification:', error);
    throw new Error('Failed to create notification');
  }
}

export async function getContactSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<ContactSettings> {
  const { data, error } = await supabase
    .from('contact_settings')
    .select(
      'notify_contact_requests, notify_file_share_from_unknown, block_unknown_users'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Notifications] Failed to load contact settings:', error);
  }

  return {
    notifyContactRequests: data?.notify_contact_requests ?? true,
    notifyFileShareFromUnknown:
      data?.notify_file_share_from_unknown ?? true,
    blockUnknownUsers: data?.block_unknown_users ?? false,
  };
}
