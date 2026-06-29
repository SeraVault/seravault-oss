import { backendService } from '../backend/BackendService';

export class FCMService {
  /**
   * Request notification permission from the user
   */
  static async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return 'denied';
    }

    const permission = await backendService.messaging.requestPermission() as NotificationPermission;
    console.log('Notification permission:', permission);
    return permission;
  }

  /**
   * Get FCM token for this device
   */
  static async getToken(): Promise<string | null> {
    try {
      // Request permission first
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission not granted');
        return null;
      }

      // Get the FCM token
      const token = await backendService.messaging.getToken();
      
      if (token) {
        console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
        return token;
      } else {
        console.log('No registration token available');
        return null;
      }
    } catch (error) {
      // Silently handle unsupported browser errors
      if ((error as {code?: string})?.code === 'messaging/unsupported-browser') {
        console.log('Push notifications not supported in this browser');
        return null;
      }
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Save FCM token to Firestore for this user
   */
  static async saveTokenToFirestore(userId: string, token: string): Promise<void> {
    try {
      const tokenPath = `users/${userId}/fcmTokens`;
      // Use token as document ID to prevent duplicates
      await backendService.documents.set(tokenPath, token, {
        token,
        createdAt: backendService.utils.serverTimestamp(),
        lastUsed: backendService.utils.serverTimestamp(),
      });
      console.log('✅ FCM token saved to Firestore');
    } catch (error) {
      console.error('Error saving FCM token to Firestore:', error);
      throw error;
    }
  }

  /**
   * Delete FCM token from Firestore
   */
  static async deleteTokenFromFirestore(userId: string, token: string): Promise<void> {
    try {
      await backendService.documents.delete(`users/${userId}/fcmTokens`, token);
      console.log('✅ FCM token deleted from Firestore');
    } catch (error) {
      console.error('Error deleting FCM token from Firestore:', error);
    }
  }

  /**
   * Initialize FCM for the current user
   */
  static async initialize(userId: string): Promise<string | null> {
    try {
      // Get FCM token
      const token = await this.getToken();
      
      if (token) {
        // Save token to Firestore
        await this.saveTokenToFirestore(userId, token);
        
        // Set up foreground message handler
        this.setupForegroundMessageHandler();
        
        return token;
      }
      
      return null;
    } catch (error) {
      console.error('Error initializing FCM:', error);
      return null;
    }
  }

  /**
   * Handle messages when app is in foreground.
   *
   * Strategy (mirrors how Facebook/Slack work):
   *   - App tab is VISIBLE  → dispatch a DOM event so the in-app toast shows
   *   - App tab is HIDDEN   → show a native browser notification via the SW
   */
  static setupForegroundMessageHandler(): void {
    try {
      backendService.messaging.onMessage((payload: any) => {
        console.log('📬 Foreground message received:', payload);

        const data = payload.data || {};
        const type = data.type || '';
        const title = payload.notification?.title || data.title || 'SeraVault';
        const body  = payload.notification?.body  || data.body  || '';

        // Compute navigation URL based on notification type
        let url = '/';
        if (type === 'chat_message' && data.conversationId) {
          url = `/?chat=${data.conversationId}`;
        } else if (type === 'contact_request' || type === 'contact_accepted') {
          url = '/contacts?tab=requests';
        } else if ((type === 'file_shared' || type === 'file_modified' || type === 'file_unshared') && data.fileId) {
          url = `/?file=${data.fileId}`;
        }

        if (document.visibilityState === 'visible') {
          // App is open and visible — show an in-app toast instead of a native popup
          window.dispatchEvent(new CustomEvent('seravault:notification', {
            detail: { title, body, url, type, data },
          }));
        } else {
          // Tab is hidden or minimised — ask the SW to show a native notification.
          // We post a message to the SW rather than calling showNotification()
          // from the main thread, because on Android Chrome the main-thread call
          // is unreliable when the tab is backgrounded.
          if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
            let tag = 'seravault-default';
            if (type === 'chat_message' && data.conversationId) {
              tag = `chat-${data.conversationId}`;
            } else if (type === 'contact_request' && data.contactRequestId) {
              tag = `contact-req-${data.contactRequestId}`;
            } else if (type === 'contact_accepted' && data.senderId) {
              tag = `contact-acc-${data.senderId}`;
            } else if (data.fileId) {
              tag = `file-${data.fileId}`;
            }

            navigator.serviceWorker.ready
              .then(registration => {
                // Ask the SW to display the notification — more reliable on Android
                // than calling showNotification() from a backgrounded page.
                registration.active?.postMessage({
                  type: 'SHOW_NOTIFICATION',
                  title,
                  body,
                  tag,
                  url,
                  data,
                });
              })
              .catch(err => console.error('Error posting SHOW_NOTIFICATION to SW:', err));
          }
        }
      });
    } catch (error) {
      // Silently handle unsupported browser errors
      if ((error as {code?: string})?.code === 'messaging/unsupported-browser') {
        return;
      }
      console.error('Error setting up foreground message handler:', error);
    }
  }

  /**
   * Unregister FCM for the current user
   */
  static async unregister(userId: string): Promise<void> {
    try {
      // Get current token
      const token = await backendService.messaging.getToken();
      
      if (token) {
        // Delete from Firestore
        await this.deleteTokenFromFirestore(userId, token);
        
        // Delete the token from FCM
        await backendService.messaging.deleteToken();
        console.log('✅ FCM token unregistered');
      }
    } catch (error) {
      // Silently handle unsupported browser errors
      if ((error as {code?: string})?.code === 'messaging/unsupported-browser') {
        return;
      }
      console.error('Error unregistering FCM:', error);
    }
  }

  /**
   * Check if notifications are supported and enabled
   */
  static isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Get current notification permission status
   */
  static getPermissionStatus(): NotificationPermission {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }
}
