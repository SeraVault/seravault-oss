/**
 * Notify File Shared Edge Function
 * Triggered by PostgreSQL when files.shared_with changes
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
  getUserLanguage,
  getUserDisplayName,
  t,
} from '../_shared/i18n.ts';
import {
  createNotificationRecord,
  getContactSettings,
} from '../_shared/notifications.ts';

async function areUsersConnected(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userA: string,
  userB: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('contacts')
    .select('status')
    .or(
      `and(user_id_1.eq.${userA},user_id_2.eq.${userB}),and(user_id_1.eq.${userB},user_id_2.eq.${userA})`
    )
    .maybeSingle();

  if (error) {
    console.error('[notify-file-shared] Error checking contact status:', error);
    return false;
  }

  return data?.status === 'accepted';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req.headers.get('origin'));
  }

  if (req.method !== 'POST') {
    return corsErrorResponse('Method not allowed', 405);
  }

  try {
    const { file_id, owner_id, newly_shared_users } = await req.json();

    if (
      !file_id ||
      !owner_id ||
      !Array.isArray(newly_shared_users) ||
      newly_shared_users.length === 0
    ) {
      return corsResponse(
        { success: true, message: 'No recipients to notify' },
        200
      );
    }

    const supabase = createSupabaseAdminClient();
    const ownerDisplayName = await getUserDisplayName(supabase, owner_id);

    let createdCount = 0;
    for (const recipientId of newly_shared_users as string[]) {
      if (!recipientId || recipientId === owner_id) continue;

      const isContact = await areUsersConnected(supabase, owner_id, recipientId);

      if (!isContact) {
        const settings = await getContactSettings(supabase, recipientId);

        if (settings.blockUnknownUsers) {
          console.log(
            `[notify-file-shared] Skipping ${recipientId} - blocks unknown users`
          );
          continue;
        }

        if (!settings.notifyFileShareFromUnknown) {
          console.log(
            `[notify-file-shared] Skipping ${recipientId} - disabled unknown share notifications`
          );
          continue;
        }

        const language = await getUserLanguage(supabase, recipientId);
        await createNotificationRecord(supabase, {
          recipientId,
          senderId: owner_id,
          senderDisplayName: ownerDisplayName,
          type: 'file_share_request',
          title: t('fileShareRequest.title', language),
          message: t('fileShareRequest.message', language, {
            senderName: ownerDisplayName,
          }),
          fileId: file_id,
          metadata: {
            action: 'file_share_request_unknown',
            timestamp: new Date().toISOString(),
            requiresApproval: true,
          },
        });
        createdCount++;
        continue;
      }

      const language = await getUserLanguage(supabase, recipientId);
      await createNotificationRecord(supabase, {
        recipientId,
        senderId: owner_id,
        senderDisplayName: ownerDisplayName,
        type: 'file_shared',
        title: t('fileShared.title', language),
        message: t('fileShared.message', language, {
          senderName: ownerDisplayName,
        }),
        fileId: file_id,
        metadata: {
          action: 'shared',
          timestamp: new Date().toISOString(),
        },
      });
      createdCount++;
    }

    return corsResponse({ success: true, created: createdCount }, 200);
  } catch (error) {
    console.error('[notify-file-shared] Error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create notifications';
    return corsErrorResponse(message, 500);
  }
});
