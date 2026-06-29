/**
 * Remove/Block Contact Edge Function
 * Removes contact relationship and cleans up shared files
 *
 * Actions:
 * - Delete contact document
 * - Delete pending contact requests (both directions)
 * - Remove contact from shared files (sharedWith array + encrypted keys)
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
    const { contactUserId } = await req.json();

    if (!contactUserId) {
      return corsErrorResponse('contactUserId is required', 400, requestOrigin);
    }

    if (userId === contactUserId) {
      return corsErrorResponse(
        'Cannot remove yourself as a contact',
        400,
        requestOrigin
      );
    }

    console.log(`🚫 Removing contact: ${userId} removing ${contactUserId}`);

    const supabase = createSupabaseAdminClient();

    const results = {
      contactDeleted: false,
      requestsDeleted: 0,
      filesUnshared: 0,
    };

    // 1. Delete the contact document
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .or(
          `and(user_id_1.eq.${userId},user_id_2.eq.${contactUserId}),and(user_id_1.eq.${contactUserId},user_id_2.eq.${userId})`
        );

      if (!error) {
        results.contactDeleted = true;
        console.log(`✅ Deleted contact relationship`);
      }
    } catch (error) {
      console.error('❌ Error deleting contact:', error);
    }

    // 2. Delete pending contact requests (both directions)
    try {
      const { count, error } = await supabase
        .from('contact_requests')
        .delete({ count: 'exact' })
        .or(
          `and(from_user_id.eq.${userId},to_user_id.eq.${contactUserId}),and(from_user_id.eq.${contactUserId},to_user_id.eq.${userId})`
        );

      if (!error) {
        results.requestsDeleted = count || 0;
        console.log(`✅ Deleted ${results.requestsDeleted} contact requests`);
      }
    } catch (error) {
      console.error('❌ Error deleting contact requests:', error);
    }

    // 3. Remove blocked user from all files shared by the removing user
    try {
      const { data: sharedFiles, error: fetchError } = await supabase
        .from('files')
        .select('id, shared_with, encrypted_keys')
        .eq('owner', userId)
        .contains('shared_with', [contactUserId]);

      if (!fetchError && sharedFiles && sharedFiles.length > 0) {
        for (const file of sharedFiles) {
          // Remove from shared_with array
          const updatedSharedWith = (file.shared_with || []).filter(
            (id: string) => id !== contactUserId
          );

          // Remove from encrypted_keys
          const encryptedKeys = { ...(file.encrypted_keys || {}) };
          delete encryptedKeys[contactUserId];

          await supabase
            .from('files')
            .update({
              shared_with: updatedSharedWith,
              encrypted_keys: encryptedKeys,
            })
            .eq('id', file.id);

          results.filesUnshared++;
        }

        console.log(
          `✅ Removed contact from ${results.filesUnshared} shared files`
        );
      }
    } catch (error) {
      console.error('❌ Error cleaning shared files:', error);
    }

    console.log(`✅ Contact removal completed: ${userId} removed ${contactUserId}`);

    return corsResponse(
      {
        success: true,
        message: 'Contact successfully removed',
        results,
      },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('❌ Contact removal failed:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to remove contact';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
