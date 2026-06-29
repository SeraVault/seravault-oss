// @ts-nocheck
import { backendService } from '../backend/BackendService';
import type { QueryConstraint } from '../backend/BackendInterface';

export interface Notification {
  id?: string;
  recipientId: string; // User ID who receives the notification
  senderId: string; // User ID who triggered the notification
  senderDisplayName?: string; // Cached sender display name for performance
  type: 'file_shared' | 'file_modified' | 'file_unshared' | 'contact_request' | 'contact_accepted' | 'file_share_request' | 'chat_message' | 'user_invitation';
  title: string; // Short notification title
  message: string; // Detailed notification message
  fileId?: string; // Related file ID (if applicable)
  fileName?: string; // Cached file name for performance
  folderId?: string; // Related folder ID (if applicable)
  folderName?: string; // Cached folder name for performance
  contactRequestId?: string; // Related contact request ID (if applicable)
  conversationId?: string; // Related chat conversation ID (if applicable)
  messageId?: string; // Related message ID (if applicable)
  invitationId?: string; // Related user invitation ID (if applicable)
  isRead: boolean;
  createdAt: any;
  readAt?: any;
  metadata?: Record<string, unknown>; // Additional context data
}

export class NotificationService {
  private static readonly COLLECTION_NAME = 'notifications';
  
  // NOTE: File notifications are now handled automatically by Cloud Functions
  // when file documents are updated (sharedWith array changes or content modifications)
  // No need for manual notification creation from client side

  /**
   * Get notifications for a specific user
   */
  static async getUserNotifications(userId: string, limitCount: number = 50): Promise<Notification[]> {
    try {
      // Use simpler query until Firestore index is created
      const constraints: QueryConstraint[] = [
        { type: 'where', field: 'recipientId', operator: '==', value: userId },
        { type: 'limit', limitValue: limitCount }
      ];
      
      const notifications = await backendService.query.getPath(this.COLLECTION_NAME, constraints);
      
      console.log(`📬 Retrieved ${notifications.length} notifications for user: ${userId}`);
      return notifications as Notification[];
    } catch (error) {
      console.error('❌ Error fetching user notifications:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time notifications for a user
   */
  static subscribeToUserNotifications(
    userId: string,
    callback: (notifications: Notification[]) => void,
    limitCount: number = 100
  ): () => void {
    console.log(`🔔 Setting up notification subscription for user: ${userId}`);
    try {
      // Query only unread notifications, ordered by creation time (newest first)
      const constraints: QueryConstraint[] = [
        { type: 'where', field: 'recipientId', operator: '==', value: userId },
        { type: 'where', field: 'isRead', operator: '==', value: false },
        { type: 'orderBy', field: 'createdAt', direction: 'desc' },
        { type: 'limit', limitValue: limitCount }
      ];
      
      return backendService.query.subscribePath(this.COLLECTION_NAME, constraints, (data) => {
        const notifications = data as Notification[];
        // No need to sort - already ordered by Firestore query
        console.log(`📬 Real-time update: ${notifications.length} unread notifications`);
        callback(notifications);
      });
      
    } catch (error) {
      console.error('❌ Error setting up notification subscription:', error);
      return () => {};
    }
  }

  /**
   * Mark a specific notification as read (via Cloud Function)
   */
  static async markAsRead(notificationId: string): Promise<void> {
    console.log(`🔄 Attempting to mark notification as read: ${notificationId}`);
    try {
      console.log('📞 Calling Cloud Function markNotificationAsRead...');
      
      const result = await backendService.functions.call<{ success: boolean; error?: string }>('markNotificationAsRead', { notificationId });
      
      if (result.success) {
        console.log(`✅ Notification ${notificationId} marked as read successfully`);
        // Dismiss any displayed push notification with this ID as its tag
        NotificationService.dismissPushNotification(notificationId);
      } else {
        console.error('❌ Cloud Function returned failure:', result);
        throw new Error(result.error || 'Failed to mark notification as read');
      }
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Tell the service worker to close any displayed push notification
   * whose tag matches this notificationId.
   */
  static dismissPushNotification(notificationId: string, conversationId?: string): void {
    if (!('serviceWorker' in navigator)) return;
    const msg = { type: 'DISMISS_NOTIFICATION', notificationId, conversationId };
    // Post to the main app SW (sw.js)
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
    // Also post to the Firebase Messaging SW (firebase-messaging-sw.js) if registered
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => {
        if (reg.active && reg !== navigator.serviceWorker.controller?.registration) {
          reg.active.postMessage(msg);
        }
      });
    }).catch(() => {});
  }

  /**
   * Immediately mark notifications as read in the local Firestore cache using client-side batch writes.
   * Firestore applies local writes optimistically before server confirmation, so the
   * isRead==false subscription fires from cache right away and the bell clears instantly.
   * The Firestore security rules allow authenticated users to flip isRead→true on their own notifications.
   */
  static async markAllAsReadClientSide(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;
    await backendService.batch.update(
      notificationIds.map(id => ({
        collection: NotificationService.COLLECTION_NAME,
        id,
        data: { isRead: true },
      }))
    );
  }

  /**
   * Mark all notifications as read for current user (via Cloud Function)
   */
  static async markAllAsRead(userId: string): Promise<number> {
    try {
      console.log('📞 Calling Cloud Function markAllNotificationsAsRead...');
      
      const result = await backendService.functions.call<{ success: boolean; updated?: number; error?: string }>('markAllNotificationsAsRead');
      
      if (result.success) {
        console.log(`✅ Marked ${result.updated} notifications as read for user: ${userId}`);
        return result.updated || 0;
      } else {
        throw new Error(result.error || 'Failed to mark all notifications as read');
      }
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get count of unread notifications for a user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    try {
      const constraints: QueryConstraint[] = [
        { type: 'where', field: 'recipientId', operator: '==', value: userId },
        { type: 'where', field: 'isRead', operator: '==', value: false }
      ];
      
      const notifications = await backendService.query.getPath(this.COLLECTION_NAME, constraints);
      const count = notifications.length;
      
      console.log(`📊 Unread notifications for user ${userId}: ${count}`);
      return count;
    } catch (error) {
      console.error('❌ Error fetching unread notification count:', error);
      throw error;
    }
  }
}