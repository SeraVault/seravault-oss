/**
 * Notify File Modified Edge Function
 * Triggered by PostgreSQL when file contents change
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
import { createNotificationRecord } from '../_shared/notifications.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(req.headers.get('origin'));
  }

  if (req.method !== 'POST') {
    return corsErrorResponse('Method not allowed', 405);
  }

  try {
    const { file_id, owner_id, shared_with } = await req.json();

    if (!file_id || !owner_id || !Array.isArray(shared_with)) {
      return corsResponse(
        { success: true, message: 'No shared users to notify' },
        200
      );
    }

    const supabase = createSupabaseAdminClient();
    const modifierDisplayName = await getUserDisplayName(supabase, owner_id);

    let createdCount = 0;
    for (const recipientId of shared_with as string[]) {
      if (!recipientId || recipientId === owner_id) continue;

      const language = await getUserLanguage(supabase, recipientId);

      await createNotificationRecord(supabase, {
        recipientId,
        senderId: owner_id,
        senderDisplayName: modifierDisplayName,
        type: 'file_modified',
        title: t('fileModified.title', language),
        message: t('fileModified.message', language, {
          senderName: modifierDisplayName,
        }),
        fileId: file_id,
        metadata: {
          action: 'modified',
          timestamp: new Date().toISOString(),
        },
      });

      createdCount++;
    }

    return corsResponse({ success: true, created: createdCount }, 200);
  } catch (error) {
    console.error('[notify-file-modified] Error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create notifications';
    return corsErrorResponse(message, 500);
  }
});
