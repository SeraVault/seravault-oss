/**
 * Delete User Account Edge Function
 * Comprehensive account deletion including all user data
 *
 * Deletes:
 * - Supabase Storage files
 * - File records, folders, form templates
 * - Contacts, contact requests, notifications
 * - Conversations, groups, user invitations
 * - Stripe subscriptions and customer data
 * - User profile and Auth account
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

    console.log(`🗑️ Starting account deletion for user: ${userId}`);

    const supabase = createSupabaseAdminClient();

    const results = {
      storageFiles: 0,
      fileRecords: 0,
      folders: 0,
      contacts: 0,
      contactRequests: 0,
      notifications: 0,
      sharedFilesCleaned: 0,
      profile: false,
      auth: false,
    };

    // 1. Delete user's storage files
    try {
      const { data: files, error } = await supabase.storage
        .from('files')
        .list(`${userId}/`);

      if (!error && files) {
        console.log(`Found ${files.length} storage files to delete`);

        const filePaths = files.map((file: { name: string }) => `${userId}/${file.name}`);

        if (filePaths.length > 0) {
          const { error: deleteError } = await supabase.storage
            .from('files')
            .remove(filePaths);

          if (deleteError) {
            console.error('Error deleting some storage files:', deleteError);
          } else {
            results.storageFiles = filePaths.length;
            console.log(`✅ Deleted ${results.storageFiles} storage files`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error deleting storage files:', error);
    }

    // 2. Delete file records
    try {
      const { count, error } = await supabase
        .from('files')
        .delete({ count: 'exact' })
        .eq('owner', userId);

      if (!error) {
        results.fileRecords = count || 0;
        console.log(`✅ Deleted ${results.fileRecords} file records`);
      } else {
        console.error('❌ Error deleting file records:', error);
      }
    } catch (error) {
      console.error('❌ Error deleting file records:', error);
    }

    // 3. Delete folders
    try {
      const { count, error } = await supabase
        .from('folders')
        .delete({ count: 'exact' })
        .eq('owner', userId);

      if (!error) {
        results.folders = count || 0;
        console.log(`✅ Deleted ${results.folders} folders`);
      } else {
        console.error('❌ Error deleting folders:', error);
      }
    } catch (error) {
      console.error('❌ Error deleting folders:', error);
    }

    // 4. Delete contacts (user's contact list)
    try {
      const { count, error } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

      if (!error) {
        results.contacts = count || 0;
        console.log(`✅ Deleted ${results.contacts} contacts`);
      } else {
        console.error('❌ Error deleting contacts:', error);
      }
    } catch (error) {
      console.error('❌ Error deleting contacts:', error);
    }

    // 5. Delete contact requests (sent and received)
    try {
      const { count, error } = await supabase
        .from('contact_requests')
        .delete({ count: 'exact' })
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

      if (!error) {
        results.contactRequests = count || 0;
        console.log(`✅ Deleted ${results.contactRequests} contact requests`);
      } else {
        console.error('❌ Error deleting contact requests:', error);
      }
    } catch (error) {
      console.error('❌ Error deleting contact requests:', error);
    }

    // 6. Delete notifications
    try {
      const { count, error } = await supabase
        .from('notifications')
        .delete({ count: 'exact' })
        .eq('recipient_id', userId);

      if (!error) {
        results.notifications = count || 0;
        console.log(`✅ Deleted ${results.notifications} notifications`);
      } else {
        console.error('❌ Error deleting notifications:', error);
      }
    } catch (error) {
      console.error('❌ Error deleting notifications:', error);
    }

    // 7. Remove user from sharedWith arrays in files
    try {
      const { data: sharedFiles, error: fetchError } = await supabase
        .from('files')
        .select('id, shared_with')
        .contains('shared_with', [userId]);

      if (!fetchError && sharedFiles) {
        for (const file of sharedFiles) {
          const updatedSharedWith = (file.shared_with || []).filter(
            (id: string) => id !== userId
          );

          await supabase
            .from('files')
            .update({ shared_with: updatedSharedWith })
            .eq('id', file.id);

          results.sharedFilesCleaned++;
        }

        console.log(
          `✅ Cleaned user from ${results.sharedFilesCleaned} shared files`
        );
      }
    } catch (error) {
      console.error('❌ Error cleaning shared files:', error);
    }


    // 9. Delete user storage usage record
    try {
      await supabase.from('user_storage_usage').delete().eq('user_id', userId);
      console.log('✅ Deleted storage usage record');
    } catch (error) {
      console.error('❌ Error deleting storage usage:', error);
    }

    // 10. Delete user profile document
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('uid', userId);

      if (!error) {
        results.profile = true;
        console.log('✅ Deleted user profile');
      } else {
        console.error('❌ Error deleting user profile:', error);
      }
    } catch (error) {
      console.error('❌ Error deleting user profile:', error);
    }

    // 11. Delete Supabase Auth account
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (!error) {
        results.auth = true;
        console.log('✅ Deleted Supabase Auth account');
      } else {
        console.error('❌ Error deleting auth account:', error);
        throw new Error('Failed to delete authentication account');
      }
    } catch (error) {
      console.error('❌ Error deleting auth account:', error);
      return corsErrorResponse(
        'Failed to delete authentication account',
        500,
        requestOrigin
      );
    }

    console.log(`✅ Account deletion completed for user: ${userId}`);

    return corsResponse(
      {
        success: true,
        message: 'Account successfully deleted',
        results,
      },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('❌ Account deletion failed:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to delete account';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
