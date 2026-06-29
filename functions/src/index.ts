import {onDocumentUpdated, onDocumentCreated, onDocumentDeleted} from "firebase-functions/v2/firestore";
import {onRequest, onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import cors from "cors";
import * as nodemailer from "nodemailer";
import {getI18n} from "./i18n";
import {renderEmailTemplate} from "./emailTemplates";

// Define secrets for email and Stripe
const smtpHost = defineSecret('SMTP_HOST');
const smtpPort = defineSecret('SMTP_PORT');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const smtpFromAddress = defineSecret('SMTP_FROM_ADDRESS');

// CORS allowed origins - centralized list
const CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

// Configure CORS for web clients
const corsHandler = cors({
  origin: CORS_ORIGINS,
  credentials: true
});

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Helper to get the base URL for email links based on environment
function getBaseUrl(): string {
  // For local development with Firebase Emulator
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    // This should match the local frontend development server from CORS_ORIGINS
    return 'http://localhost:5173';
  }

  // For production, the APP_URL environment variable MUST be set.
  if (!process.env.APP_URL) {
    // This will cause the function to fail on startup in production if the variable is missing.
    // This is a "fail-fast" best practice to prevent misconfiguration.
    throw new Error('CRITICAL: The APP_URL environment variable must be set for production deployments.');
  }

  return process.env.APP_URL;
}


// Helper to create email transporter (called at runtime with secret values)
function createEmailTransporter() {
  const port = parseInt(smtpPort.value(), 10);
  return nodemailer.createTransport({
    host: smtpHost.value(),
    port: port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user: smtpUser.value(),
      pass: smtpPass.value(),
    },
  });
}

// Helper to escape HTML special characters to prevent XSS in email bodies
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Helper to send emails
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  console.log(`📧 sendEmail called for ${to}`);
  try {
    // In development, just log the email
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      console.log('📧 [DEV MODE] Would send email:');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${html}`);
      return;
    }

    // Check if secrets are available
    if (!smtpHost.value() || !smtpPort.value() || !smtpUser.value() || !smtpPass.value() || !smtpFromAddress.value()) {
      console.error('❌ SMTP secrets are missing! Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_ADDRESS.');
      throw new Error('Email configuration missing');
    }

    const transporter = createEmailTransporter();
    await transporter.sendMail({
      from: `"SeraVault" <${smtpFromAddress.value()}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error);
    throw error;
  }
}

interface NotificationData {
  recipientId: string;
  senderId: string;
  senderDisplayName?: string;
  type: 'file_shared' | 'file_modified' | 'file_unshared' | 'contact_request' | 'contact_accepted' | 'file_share_request' | 'chat_message' | 'user_invitation';
  title: string;
  message: string;
  fileId?: string;
  fileName?: string;
  contactRequestId?: string;
  conversationId?: string;
  messageId?: string;
  invitationId?: string;
  isRead: boolean;
  createdAt: FieldValue;
  metadata?: {[key: string]: any};
}

/**
 * Create a notification securely on the server side
 */
async function createNotification(notificationData: Omit<NotificationData, 'createdAt'>): Promise<string> {
  try {
    const notification = {
      ...notificationData,
      createdAt: FieldValue.serverTimestamp(),
    };
    
    const docRef = await db.collection('notifications').add(notification);
    console.log(`✅ Notification created: ${docRef.id} for user ${notificationData.recipientId}`);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
}

/**
 * Send an FCM push notification to all registered devices for a user.
 * Automatically cleans up invalid/expired tokens.
 */
async function sendFCMToUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  const snapshot = await db.collection('users').doc(userId).collection('fcmTokens').get();
  if (snapshot.empty) return;

  const tokens = snapshot.docs.map(d => d.data().token as string);
  const response = await admin.messaging().sendEachForMulticast({
    // Data-only: no 'notification' field so Android/iOS don't auto-display a
    // generic notification. The SW push event handler in sw.js receives the
    // raw push and shows a fully-customised native notification instead.
    data: { title, body, ...data },
    tokens,
    webpush: {
      headers: { Urgency: 'high' },
    },
  });

  if (response.failureCount > 0) {
    const tokensToDelete: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || 'unknown';
        const msg  = r.error?.message || '';
        console.error(`❌ FCM failure [${code}] token[${i}] (${tokens[i].substring(0, 20)}...): ${msg}`);
        // Remove any permanently-invalid token regardless of specific error code
        tokensToDelete.push(tokens[i]);
      }
    });

    if (tokensToDelete.length > 0) {
      const batch = db.batch();
      tokensToDelete.forEach(token =>
        batch.delete(db.collection('users').doc(userId).collection('fcmTokens').doc(token))
      );
      await batch.commit();
      console.log(`🗑️ Cleaned up ${tokensToDelete.length} failed FCM tokens for ${userId}`);
    }
  }

  console.log(`📱 FCM sent to ${response.successCount}/${tokens.length} devices for ${userId}`);
}

/**
 * Get user display name from user profile
 */
async function getUserDisplayName(userId: string): Promise<string> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      return userData?.displayName || userData?.email || 'Unknown User';
    }
    return 'Unknown User';
  } catch (error) {
    console.error('Error fetching user display name:', error);
    return 'Unknown User';
  }
}

/**
 * Get user's language preference from their profile
 */
async function getUserLanguage(userId: string): Promise<string> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      return userData?.language || 'en';
    }
    return 'en';
  } catch (error) {
    console.error('Error fetching user language:', error);
    return 'en';
  }
}

/**
 * Validate that user has access to a file
 */
async function validateFileAccess(fileId: string, userId: string): Promise<boolean> {
  try {
    const fileDoc = await db.collection('files').doc(fileId).get();
    if (!fileDoc.exists) {
      return false;
    }
    
    const fileData = fileDoc.data();
    if (!fileData) return false;
    
    // User must be owner or in sharedWith array
    return fileData.owner === userId || 
           (Array.isArray(fileData.sharedWith) && fileData.sharedWith.includes(userId));
  } catch (error) {
    console.error('Error validating file access:', error);
    return false;
  }
}

/**
 * Firestore Trigger: File sharing/unsharing notifications
 * Triggered when a file document is updated (sharedWith array changes)
 */
export const onFileShared = onDocumentUpdated("files/{fileId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const fileId = event.params.fileId;
  
  console.log(`📋 onFileShared triggered for file: ${fileId}`);
  
  if (!beforeData || !afterData) return;
  
  const beforeSharedWith: string[] = beforeData.sharedWith || [];
  const afterSharedWith: string[] = afterData.sharedWith || [];
  const ownerId = afterData.owner;
  
  // Get owner's display name
  const ownerDisplayName = await getUserDisplayName(ownerId);
  
  // Find newly added users (shared)
  const newlySharedUsers = afterSharedWith.filter(userId => !beforeSharedWith.includes(userId));
  
  // Find removed users (unshared)
  const unsharedUsers = beforeSharedWith.filter(userId => !afterSharedWith.includes(userId));
  
  // Create notifications for newly shared users
  for (const userId of newlySharedUsers) {
    // Don't notify the owner when they share with themselves
    if (userId === ownerId) continue;
    
    // Get recipient's language preference
    const userLanguage = await getUserLanguage(userId);
    const t = await getI18n(userLanguage);

    const notifTitle = t('fileShared.title');
    const notifMessage = t('fileShared.message', { senderName: ownerDisplayName });
    
    const fileSharedNotifId = await createNotification({
      recipientId: userId,
      senderId: ownerId,
      senderDisplayName: ownerDisplayName,
      type: 'file_shared',
      title: notifTitle,
      message: notifMessage,
      fileId,
      isRead: false,
      metadata: {
        action: 'shared',
        timestamp: new Date().toISOString()
      }
    });

    // Send FCM push notification
    await sendFCMToUser(userId, notifTitle, notifMessage, {
      type: 'file_shared',
      fileId,
      url: `/?file=${fileId}`,
      senderId: ownerId,
      senderName: ownerDisplayName,
      notificationId: fileSharedNotifId,
    }).catch(err => console.error(`⚠️ FCM error for file_shared to ${userId}:`, err));
  }
  
  // Don't notify users when they're unshared - they'll simply lose access
  // This is cleaner UX and avoids notifying users about negative actions
  
  console.log(`📤 File sharing notifications processed: +${newlySharedUsers.length} shared, ${unsharedUsers.length} unshared (no notification)`);
});

/**
 * Firestore Trigger: File modification notifications
 * Triggered when a file document is updated (content changes)
 */
export const onFileModified = onDocumentUpdated("files/{fileId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const fileId = event.params.fileId;
  
  console.log(`📋 onFileModified triggered for file: ${fileId}`);
  
  if (!beforeData || !afterData) return;
  
  // Check if this is a sharing/unsharing event (sharedWith array changed)
  const beforeSharedWith: string[] = beforeData.sharedWith || [];
  const afterSharedWith: string[] = afterData.sharedWith || [];
  const sharingChanged = beforeSharedWith.length !== afterSharedWith.length ||
    beforeSharedWith.some(id => !afterSharedWith.includes(id)) ||
    afterSharedWith.some(id => !beforeSharedWith.includes(id));
  
  // If sharing changed at all, don't send modification notification (onFileShared handles it)
  // Even if content also changed, we only want one notification per action
  if (sharingChanged) {
    console.log(`🔄 Ignoring modification notification - sharing event (onFileShared handles it)`);
    return;
  }
  
  // Only notify on actual content modifications (ignore metadata-only updates)
  const contentFields = ['storagePath', 'size', 'encryptedName'];
  const hasContentChange = contentFields.some(field => {
    const before = beforeData[field];
    const after = afterData[field];
    
    // Handle encrypted fields
    if (typeof before === 'object' && before?.ciphertext) {
      return before.ciphertext !== after?.ciphertext;
    }
    
    return before !== after;
  });
  
  if (!hasContentChange) {
    console.log(`ℹ️ No content changes detected, skipping notification`);
    return;
  }
  
  const ownerId = afterData.owner;
  const sharedWith: string[] = afterData.sharedWith || [];
  
  // Get modifier's display name (for now assume it's the owner, could be enhanced)
  const modifierDisplayName = await getUserDisplayName(ownerId);
  
  // Notify all users with access except the modifier
  const usersToNotify = sharedWith.filter(userId => userId !== ownerId);
  
  for (const userId of usersToNotify) {
    // Get recipient's language preference
    const userLanguage = await getUserLanguage(userId);
    const t = await getI18n(userLanguage);

    const notifTitle = t('fileModified.title');
    const notifMessage = t('fileModified.message', { senderName: modifierDisplayName });
    
    const fileModifiedNotifId = await createNotification({
      recipientId: userId,
      senderId: ownerId,
      senderDisplayName: modifierDisplayName,
      type: 'file_modified',
      title: notifTitle,
      message: notifMessage,
      fileId,
      isRead: false,
      metadata: {
        action: 'modified',
        timestamp: new Date().toISOString()
      }
    });

    // Send FCM push notification
    await sendFCMToUser(userId, notifTitle, notifMessage, {
      type: 'file_modified',
      fileId,
      url: `/?file=${fileId}`,
      senderId: ownerId,
      senderName: modifierDisplayName,
      notificationId: fileModifiedNotifId,
    }).catch(err => console.error(`⚠️ FCM error for file_modified to ${userId}:`, err));
  }
  
  console.log(`📝 File modification notifications sent to ${usersToNotify.length} users`);
});

/**
 * Firestore Trigger: Contact request notifications
 * Triggered when a contact request document is created
 */
export const onContactRequest = onDocumentCreated({
  document: "contactRequests/{requestId}",
  secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpFromAddress], // Bind secrets to this function for email sending
}, async (event) => {
  const requestData = event.data?.data();
  const requestId = event.params.requestId;
  
  if (!requestData) return;
  
  // Skip if this is an invitation (not a request to a registered user)
  // Invitations are handled by onContactRequestCreated function
  if (requestData.isInvitation === true || !requestData.toUserId) {
    console.log('⏭️ Skipping invitation - handled by onContactRequestCreated');
    return;
  }
  
  const fromUserId = requestData.fromUserId;
  const toUserId = requestData.toUserId;
  const fromUserDisplayName = requestData.fromUserDisplayName;
  const fromUserEmail = requestData.fromUserEmail;
  const toEmail = requestData.toEmail; // Updated field name to match ContactRequest interface
  const message = requestData.message || '';
  
  // Check if recipient wants notifications for contact requests
  const recipientSettings = await db.collection('contactSettings').doc(toUserId).get();
  const settings = recipientSettings.data();
  
  if (settings && !settings.notifyOnContactRequest) {
    console.log(`📪 Contact request notification skipped - user ${toUserId} has notifications disabled`);
    return;
  }
  
  // Get recipient's language preference for in-app notification
  const recipientLanguage = await getUserLanguage(toUserId);
  const t = await getI18n(recipientLanguage);
  
  const notificationTitle = t('contactRequest.title');
  const notificationMessage = message 
    ? t('contactRequest.messageWithText', { senderName: fromUserDisplayName, message })
    : t('contactRequest.messageWithoutText', { senderName: fromUserDisplayName });
  
  // Create in-app notification
  const contactReqNotifId = await createNotification({
    recipientId: toUserId,
    senderId: fromUserId,
    senderDisplayName: fromUserDisplayName,
    type: 'contact_request',
    title: notificationTitle,
    message: notificationMessage,
    contactRequestId: requestId,
    isRead: false,
    metadata: {
      action: 'contact_request',
      timestamp: new Date().toISOString()
    }
  });
  
  console.log(`📨 Contact request notification sent to ${toUserId} from ${fromUserId}`);
  
  // Send email notification to the recipient
  try {
    console.log(`📧 Attempting to send email to user ${toUserId}`);
    console.log(`🔑 Secrets check - User: ${!!smtpUser.value()}, Pass: ${!!smtpPass.value()}`);

    const recipientDoc = await db.collection('users').doc(toUserId).get();
    console.log(`🔍 Recipient doc exists: ${recipientDoc.exists}`);
    
    let recipientEmail = toEmail; // Use toEmail field (not toUserEmail)
    let recipientLanguage = 'en';

    if (recipientDoc.exists) {
      const recipientData = recipientDoc.data();
      if (recipientData?.email) {
        recipientEmail = recipientData.email;
      }
      recipientLanguage = recipientData?.language || 'en';
    } else {
      console.warn(`⚠️ Recipient ${toUserId} not found in users collection. Using provided email from request data.`);
    }
      
    console.log(`📧 Recipient email: ${recipientEmail}`);
    
    if (recipientEmail) {
      // Generate contact accept link
      const contactLink = `${getBaseUrl()}/contacts?request=${requestId}`;
      
      // Email subjects by language
      const subjects: { [key: string]: string } = {
        en: `${fromUserDisplayName} wants to connect on SeraVault`,
        fr: `${fromUserDisplayName} souhaite se connecter sur SeraVault`,
        es: `${fromUserDisplayName} quiere conectarse en SeraVault`
      };
      const subject = subjects[recipientLanguage] || subjects.en;
      
      // Render email template with recipient's language
      const html = renderEmailTemplate('contact-request-email', {
        fromUserDisplayName: fromUserDisplayName,
        fromUserEmail: fromUserEmail,
        contactLink: contactLink,
        message: message,
        hasMessage: !!message,
      }, recipientLanguage);
      
      await sendEmail(recipientEmail, subject, html);
      console.log(`✅ Contact request email sent to ${recipientEmail}`);
    } else {
      console.error(`❌ No email address found for recipient ${toUserId}`);
    }
  } catch (error) {
    console.error('❌ Error sending contact request email:', error);
    // Don't fail the entire function if email fails
  }
  
  // Send FCM push notification to all user's devices
  try {
    const fcmTokensSnapshot = await db.collection('users')
      .doc(toUserId)
      .collection('fcmTokens')
      .get();
    
    if (!fcmTokensSnapshot.empty) {
      const tokens = fcmTokensSnapshot.docs.map(doc => doc.data().token);
      console.log(`📱 Found ${tokens.length} FCM tokens for user ${toUserId}`);
      
      const fcmMessage = {
        data: {
          title: notificationTitle,
          body: notificationMessage,
          type: 'contact_request',
          contactRequestId: requestId,
          url: '/contacts?tab=requests',
          senderId: fromUserId,
          senderName: fromUserDisplayName,
          notificationId: contactReqNotifId,
        },
        tokens: tokens,
        webpush: {
          headers: { Urgency: 'high' },
          notification: {
            title: notificationTitle,
            body: notificationMessage,
            icon: '/icon-192x192.png',
            badge: '/favicon.ico',
          },
          fcmOptions: { link: 'https://app.seravault.com' },
        },
      };
      
      const response = await admin.messaging().sendEachForMulticast(fcmMessage);
      console.log(`📱 Sent contact request FCM to ${response.successCount}/${tokens.length} devices`);
      
      if (response.failureCount > 0) {
        const tokensToDelete: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`❌ FCM [${resp.error?.code}] token[${idx}] (${tokens[idx].substring(0, 20)}...): ${resp.error?.message}`);
            tokensToDelete.push(tokens[idx]);
          }
        });
        if (tokensToDelete.length > 0) {
          const deleteBatch = db.batch();
          tokensToDelete.forEach(token => {
            const tokenRef = db.collection('users')
              .doc(toUserId)
              .collection('fcmTokens')
              .doc(token);
            deleteBatch.delete(tokenRef);
          });
          await deleteBatch.commit();
          console.log(`🗑️ Cleaned up ${tokensToDelete.length} failed FCM tokens`);
        }
      }
    } else {
      console.log(`📵 No FCM tokens found for user ${toUserId}`);
    }
  } catch (error) {
    console.error('❌ Error sending contact request FCM:', error);
  }
});

/**
 * Firestore Trigger: Contact acceptance notifications
 * Triggered when a contact request is accepted (status changes to 'accepted')
 */
export const onContactAccepted = onDocumentUpdated("contactRequests/{requestId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const requestId = event.params.requestId;
  
  if (!beforeData || !afterData) return;
  
  // Check if status changed from 'pending' to 'accepted'
  if (beforeData.status === 'pending' && afterData.status === 'accepted') {
    // If acceptedByUserId is set, this was handled by the acceptInvitation callable function
    // which already sends notifications to both parties. Skip to avoid duplicates.
    if (afterData.acceptedByUserId) {
      console.log(`⏭️ Skipping onContactAccepted for ${requestId} — already handled by acceptInvitation CF`);
      return;
    }

    const fromUserId = afterData.fromUserId;
    // For email invitations toUserId is not set; fall back to acceptedByUserId
    const acceptorId = afterData.toUserId || afterData.acceptedByUserId;

    if (!acceptorId) {
      console.error(`❌ Cannot send acceptance notification for ${requestId}: no acceptor ID found`);
      return;
    }

    // Look up acceptor display name from their profile (toUserDisplayName may be absent for invitations)
    const acceptorDisplayName = afterData.toUserDisplayName || await getUserDisplayName(acceptorId);
    
    // Get inviter's language preference
    const recipientLanguage = await getUserLanguage(fromUserId);
    const t = await getI18n(recipientLanguage);
    
    // Notify the original sender that their request/invitation was accepted
    await createNotification({
      recipientId: fromUserId,
      senderId: acceptorId,
      senderDisplayName: acceptorDisplayName,
      type: 'contact_accepted',
      title: t('contactAccepted.title'),
      message: t('contactAccepted.message', { senderName: acceptorDisplayName }),
      contactRequestId: requestId,
      isRead: false,
      metadata: {
        action: 'contact_accepted',
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`✅ Contact acceptance notification sent to ${fromUserId} from ${acceptorId}`);
  }
});

/**
 * Firestore Trigger: File sharing from unknown users
 * Enhanced to check contact status and create approval notifications
 */
export const onUnknownFileShare = onDocumentUpdated("files/{fileId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const fileId = event.params.fileId;
  
  if (!beforeData || !afterData) return;
  
  const beforeSharedWith: string[] = beforeData.sharedWith || [];
  const afterSharedWith: string[] = afterData.sharedWith || [];
  const ownerId = afterData.owner;
  
  // Get owner's display name
  const ownerDisplayName = await getUserDisplayName(ownerId);
  
  // Find newly added users (shared)
  const newlySharedUsers = afterSharedWith.filter(userId => !beforeSharedWith.includes(userId));
  
  // Check each newly shared user to see if they are connected to the owner
  for (const userId of newlySharedUsers) {
    // Don't notify the owner
    if (userId === ownerId) continue;
    
    // Check if users are connected contacts
    const contactId = [ownerId, userId].sort().join('_');
    const contactDoc = await db.collection('contacts').doc(contactId).get();
    const contact = contactDoc.data();
    
    // If users are not connected or contact is blocked, create approval notification
    if (!contact || contact.status !== 'accepted') {
      // Get recipient's settings
      const recipientSettings = await db.collection('contactSettings').doc(userId).get();
      const settings = recipientSettings.data();
      
      // Check if user allows notifications from unknown users
      if (settings && !settings.notifyOnFileShareFromUnknown) {
        console.log(`📪 File share approval notification skipped - user ${userId} has notifications disabled`);
        continue;
      }
      
      // Check if user blocks unknown users entirely
      if (settings && settings.blockUnknownUsers) {
        console.log(`🚫 File sharing blocked - user ${userId} blocks unknown users`);
        continue;
      }
      
      // Get recipient's language preference
      const userLanguage = await getUserLanguage(userId);
      const t = await getI18n(userLanguage);
      
      await createNotification({
        recipientId: userId,
        senderId: ownerId,
        senderDisplayName: ownerDisplayName,
        type: 'file_share_request',
        title: t('fileShareRequest.title'),
        message: t('fileShareRequest.message', { senderName: ownerDisplayName }),
        fileId,
        isRead: false,
        metadata: {
          action: 'file_share_request_unknown',
          timestamp: new Date().toISOString(),
          requiresApproval: true
        }
      });
      
      console.log(`🔔 File share approval notification sent to ${userId} from unknown user ${ownerId}`);
    }
  }
});

/**
 * Callable Function: Mark a single notification as read (deletes it)
 */
export const markNotificationAsRead = onCall(
  { cors: CORS_ORIGINS },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { notificationId } = request.data as { notificationId: string };
    if (!notificationId) {
      throw new HttpsError('invalid-argument', 'notificationId is required');
    }

    const notificationDoc = await db.collection('notifications').doc(notificationId).get();
    if (!notificationDoc.exists) {
      throw new HttpsError('not-found', 'Notification not found');
    }

    if (notificationDoc.data()?.recipientId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'You can only delete your own notifications');
    }

    await notificationDoc.ref.delete();
    console.log(`🗑️ Notification ${notificationId} deleted by user ${request.auth.uid}`);
    return { success: true };
  }
);

/**
 * Callable Function: Mark all notifications as read for user
 */
export const markAllNotificationsAsRead = onCall({ }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;

  try {
    // Get all unread notifications for user
    const unreadNotifications = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    if (unreadNotifications.empty) {
      return { success: true, updated: 0 };
    }

    // Batch delete all unread notifications (500 max per batch)
    const BATCH_SIZE = 500;
    const docs = unreadNotifications.docs;
    let count = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      docs.slice(i, i + BATCH_SIZE).forEach((doc) => {
        batch.delete(doc.ref);
        count++;
      });
      await batch.commit();
    }

    console.log(`🗑️ Deleted ${count} notifications for user ${uid}`);
    return { success: true, updated: count };

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw new HttpsError('internal', 'Failed to mark notifications as read');
  }
});

// Send invitation email when userInvitation is created
/**
 * Cloud Function triggered when a new contact request is created
 * Handles both registered user requests and email invitations (unified collection)
 * Sets expiration date and sends notification emails
 */
export const onContactRequestCreated = onDocumentCreated(
  {
    document: "contactRequests/{requestId}",
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpFromAddress],
  },
  async (event) => {
    try {
      const request = event.data?.data();
      if (!request || !event.data) return;

      const requestId = event.params.requestId;
      
      console.log(`📧 Contact request created for ${request.toEmail} from ${request.fromUserDisplayName}`);
      console.log(`📝 Is invitation: ${request.isInvitation || false}`);
      console.log(`🔗 Request ID: ${requestId}`);
      
      // Rate limit: max 20 invitation emails per user per 24 hours
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentInvitations = await db.collection('contactRequests')
          .where('fromUserId', '==', request.fromUserId)
          .where('createdAt', '>', oneDayAgo)
          .limit(21)
          .get();
        if (recentInvitations.size > 20) {
          console.warn(`⚠️ Rate limit: user ${request.fromUserId} has sent too many invitations in the last 24h`);
          return;
        }
      } catch (rateLimitError) {
        console.warn('⚠️ Could not check invitation rate limit:', rateLimitError);
      }

      // Fetch sender's language preference
      let senderLanguage = 'en';
      try {
        const senderDoc = await db.collection('users').doc(request.fromUserId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderLanguage = senderData?.language || 'en';
        }
      } catch (error) {
        console.warn('Could not fetch sender language, using default:', error);
      }

      // Set expiry date on the invitation document (30 days)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await event.data!.ref.update({ expiresAt });
      console.log(`⏰ Invitation ${requestId} expires at ${expiresAt.toISOString()}`);

      if (request.toUserId) {
        // ── Registered user ── send "wants to connect" email + in-app notification
        console.log(`👤 Recipient is a registered user (${request.toUserId}) — sending connection request email & notification`);

        const recipientLanguage = await getUserLanguage(request.toUserId);
        const tRecipient = await getI18n(recipientLanguage);

        const notificationTitle = tRecipient('contactRequest.title');
        const notificationMessage = request.message
          ? tRecipient('contactRequest.messageWithText', { senderName: request.fromUserDisplayName, message: request.message })
          : tRecipient('contactRequest.messageWithoutText', { senderName: request.fromUserDisplayName });

        // In-app notification
        const contactReqCreatedNotifId = await createNotification({
          recipientId: request.toUserId,
          senderId: request.fromUserId,
          senderDisplayName: request.fromUserDisplayName,
          type: 'contact_request',
          title: notificationTitle,
          message: notificationMessage,
          contactRequestId: requestId,
          isRead: false,
          metadata: { action: 'contact_request', timestamp: new Date().toISOString() }
        });
        console.log(`📲 In-app notification sent to ${request.toUserId}`);

        // Email: "wants to connect" using the contact-request-email template
        try {
          const recipientDoc = await db.collection('users').doc(request.toUserId).get();
          const recipientEmail = recipientDoc.data()?.email || request.toEmail;
          const contactLink = `${getBaseUrl()}/contacts?tab=requests`;
          const subjects: { [key: string]: string } = {
            en: `${request.fromUserDisplayName} wants to connect on SeraVault`,
            fr: `${request.fromUserDisplayName} souhaite se connecter sur SeraVault`,
            es: `${request.fromUserDisplayName} quiere conectarse en SeraVault`,
            de: `${request.fromUserDisplayName} möchte sich mit Ihnen auf SeraVault verbinden`,
          };
          const subject = subjects[recipientLanguage] || subjects.en;
          const html = renderEmailTemplate('contact-request-email', {
            fromUserDisplayName: request.fromUserDisplayName,
            fromUserEmail: request.fromUserEmail,
            contactLink,
            message: request.message || '',
            hasMessage: !!request.message,
          }, recipientLanguage);

          await sendEmail(recipientEmail, subject, html);
          console.log(`✅ Connection request email sent to ${recipientEmail}`);
        } catch (emailErr) {
          console.error('⚠️ Error sending connection request email:', emailErr);
        }

        // FCM push notification
        try {
          const fcmTokensSnapshot = await db.collection('users')
            .doc(request.toUserId).collection('fcmTokens').get();
          if (!fcmTokensSnapshot.empty) {
            const tokens = fcmTokensSnapshot.docs.map(doc => doc.data().token);
            const fcmMessage = {
              data: {
                title: notificationTitle,
                body: notificationMessage,
                type: 'contact_request',
                contactRequestId: requestId,
                url: '/contacts?tab=requests',
                senderId: request.fromUserId,
                senderName: request.fromUserDisplayName,
                notificationId: contactReqCreatedNotifId,
              },
              tokens,
              webpush: {
                headers: { Urgency: 'high' },
                notification: {
                  title: notificationTitle,
                  body: notificationMessage,
                  icon: '/icon-192x192.png',
                  badge: '/favicon.ico',
                },
                fcmOptions: { link: 'https://app.seravault.com' },
              },
            };
            const fcmResp = await admin.messaging().sendEachForMulticast(fcmMessage);
            console.log(`📱 FCM sent to ${fcmResp.successCount}/${tokens.length} devices`);
            if (fcmResp.failureCount > 0) {
              const toDelete: string[] = [];
              fcmResp.responses.forEach((r, i) => {
                if (!r.success) {
                  console.error(`❌ FCM [${r.error?.code}] token[${i}] (${tokens[i].substring(0, 20)}...): ${r.error?.message}`);
                  toDelete.push(tokens[i]);
                }
              });
              if (toDelete.length > 0) {
                const batch = db.batch();
                toDelete.forEach(token => batch.delete(
                  db.collection('users').doc(request.toUserId!).collection('fcmTokens').doc(token)
                ));
                await batch.commit();
                console.log(`🗑️ Cleaned up ${toDelete.length} failed FCM tokens`);
              }
            }
          }
        } catch (fcmErr) {
          console.error('⚠️ Error sending FCM for connection request:', fcmErr);
        }

      } else {
        // ── Non-registered user ── send "join SeraVault" invitation email
        console.log(`📧 Recipient is not registered — sending invitation email to ${request.toEmail}`);

        const inviteLink = `${getBaseUrl()}/signup?invite=${requestId}`;
        const subjects: { [key: string]: string } = {
          en: `${request.fromUserDisplayName} invited you to SeraVault`,
          fr: `${request.fromUserDisplayName} vous a invité sur SeraVault`,
          es: `${request.fromUserDisplayName} te ha invitado a SeraVault`,
          de: `${request.fromUserDisplayName} hat Sie zu SeraVault eingeladen`,
        };
        const subject = subjects[senderLanguage] || subjects.en;
        const html = renderEmailTemplate('invitation-email', {
          fromUserDisplayName: request.fromUserDisplayName,
          fromUserEmail: request.fromUserEmail,
          inviteLink,
          message: request.message || '',
          hasMessage: !!request.message,
        }, senderLanguage);

        await sendEmail(request.toEmail, subject, html);
        console.log(`✅ Invitation email sent to ${request.toEmail}`);
      }
    } catch (error) {
      console.error('Error in onContactRequestCreated:', error);
    }
  }
);

/**
 * Legacy function for userInvitations collection (will be deprecated)
 * Keep for backward compatibility during migration
 */
export const onUserInvitationCreated = onDocumentCreated(
  {
    document: "userInvitations/{invitationId}",
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpFromAddress], // Bind secrets to this function
  },
  async (event) => {
    try {
      const invitation = event.data?.data();
      if (!invitation) return;

      const invitationId = event.params.invitationId;
      
      console.log(`📧 Invitation created for ${invitation.toEmail} from ${invitation.fromUserDisplayName} (${invitation.fromUserEmail})`);
      console.log(`🔗 Invitation ID: ${invitationId}`);      
      console.log(`🔑 Secrets check - User: ${!!smtpUser.value()}, Pass: ${!!smtpPass.value()}`);

      // Rate limit: max 20 invitation emails per user per 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentInvitations = await db.collection('userInvitations')
        .where('fromUserId', '==', invitation.fromUserId)
        .where('createdAt', '>', oneDayAgo)
        .limit(21)
        .get();
      if (recentInvitations.size > 20) {
        console.warn(`⚠️ Rate limit: user ${invitation.fromUserId} has sent too many invitations in the last 24h`);
        return;
      }

      // Fetch sender's language preference
      let senderLanguage = 'en'; // Default to English
      try {
        const senderDoc = await db.collection('users').doc(invitation.fromUserId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderLanguage = senderData?.language || 'en';
          console.log(`📝 Using sender's language: ${senderLanguage}`);
        }
      } catch (error) {
        console.warn('Could not fetch sender language, using default:', error);
      }
      
      // Generate invitation link - use the app hosting target, not the landing page
      const inviteLink = `${getBaseUrl()}/signup?invite=${invitationId}`;
      
      // Email subjects by language
      const subjects: { [key: string]: string } = {
        en: `${invitation.fromUserDisplayName} invited you to SeraVault`,
        fr: `${invitation.fromUserDisplayName} vous a invité sur SeraVault`,
        es: `${invitation.fromUserDisplayName} te ha invitado a SeraVault`,
        de: `${invitation.fromUserDisplayName} hat Sie zu SeraVault eingeladen`
      };
      const subject = subjects[senderLanguage] || subjects.en;
      
      // Render email template with sender's language
      const html = renderEmailTemplate('invitation-email', {
        fromUserDisplayName: invitation.fromUserDisplayName,
        fromUserEmail: invitation.fromUserEmail,
        inviteLink: inviteLink,
        message: invitation.message || '',
        // For {{#if message}} conditional
        hasMessage: !!invitation.message,
      }, senderLanguage);
      
      // Send the email
      await sendEmail(invitation.toEmail, subject, html);
      
      console.log(`✅ Invitation email sent to ${invitation.toEmail}`);
      
      // Check if the invited user already has an account
      try {
        const existingUsers = await db.collection('users')
          .where('email', '==', invitation.toEmail)
          .limit(1)
          .get();
        
        if (!existingUsers.empty) {
          // User exists - send them an in-app notification and FCM push notification
          const existingUser = existingUsers.docs[0];
          const userId = existingUser.id;
          
          // Get existing user's language preference
          const existingUserLanguage = await getUserLanguage(userId);
          const t = await getI18n(existingUserLanguage);
          
          const notificationTitle = t('userInvitation.title', { senderName: invitation.fromUserDisplayName });
          const notificationMessage = invitation.message 
            ? t('userInvitation.messageWithText', { message: invitation.message })
            : t('userInvitation.messageWithoutText');
          
          // Create in-app notification
          const invitationNotifId = await createNotification({
            recipientId: userId,
            senderId: invitation.fromUserId,
            senderDisplayName: invitation.fromUserDisplayName,
            type: 'user_invitation',
            title: notificationTitle,
            message: notificationMessage,
            invitationId: invitationId,
            isRead: false,
            metadata: {
              action: 'user_invitation',
              inviteLink: inviteLink,
              timestamp: new Date().toISOString()
            }
          });
          
          console.log(`📲 In-app notification created for existing user ${userId}`);
          
          // Send FCM push notification
          const fcmTokensSnapshot = await db.collection('users')
            .doc(userId)
            .collection('fcmTokens')
            .get();
          
          if (!fcmTokensSnapshot.empty) {
            const tokens = fcmTokensSnapshot.docs.map(doc => doc.data().token);
            
            const fcmMessage = {
              data: {
                title: notificationTitle,
                body: notificationMessage,
                type: 'user_invitation',
                invitationId: invitationId,
                url: '/contacts',
                senderId: invitation.fromUserId,
                senderName: invitation.fromUserDisplayName,
                inviteLink: inviteLink,
                notificationId: invitationNotifId,
              },
              tokens: tokens,
              webpush: {
                headers: { Urgency: 'high' },
                notification: {
                  title: notificationTitle,
                  body: notificationMessage,
                  icon: '/icon-192x192.png',
                  badge: '/favicon.ico',
                },
                fcmOptions: { link: 'https://app.seravault.com' },
              },
            };
            
            const response = await admin.messaging().sendEachForMulticast(fcmMessage);
            console.log(`📱 Sent invitation FCM to ${response.successCount}/${tokens.length} devices`);
            
            // Clean up all failed tokens and log error codes
            if (response.failureCount > 0) {
              const tokensToDelete: string[] = [];
              response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                  console.error(`❌ FCM [${resp.error?.code}] token[${idx}] (${tokens[idx].substring(0, 20)}...): ${resp.error?.message}`);
                  tokensToDelete.push(tokens[idx]);
                }
              });
              if (tokensToDelete.length > 0) {
                const deleteBatch = db.batch();
                tokensToDelete.forEach(token => {
                  const tokenRef = db.collection('users')
                    .doc(userId)
                    .collection('fcmTokens')
                    .doc(token);
                  deleteBatch.delete(tokenRef);
                });
                await deleteBatch.commit();
                console.log(`🗑️ Cleaned up ${tokensToDelete.length} failed FCM tokens`);
              }
            }
          } else {
            console.log(`📵 No FCM tokens found for user ${userId}`);
          }
        } else {
          console.log(`📧 User with email ${invitation.toEmail} not found - email only sent`);
        }
      } catch (error) {
        console.error('⚠️ Error checking for existing user:', error);
      }
      
    } catch (error) {
      console.error('Error sending invitation email:', error);
      // Don't throw - we don't want to fail the invitation creation if email fails
    }
  }
);

/**
 * Firestore Trigger: Invitation Accepted
 * Automatically creates a contact connection when an invitation is accepted
 */
export const onInvitationAccepted = onDocumentUpdated("userInvitations/{invitationId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const invitationId = event.params.invitationId;

  if (!beforeData || !afterData) return;

  // Check if status changed to accepted
  if (beforeData.status !== 'accepted' && afterData.status === 'accepted') {
    const inviterId = afterData.fromUserId;
    const inviteeId = afterData.acceptedByUserId;

    if (!inviterId || !inviteeId) {
      console.error(`❌ Invitation ${invitationId} accepted but missing user IDs`);
      return;
    }

    console.log(`🤝 Invitation accepted: ${inviterId} invited ${inviteeId}`);

    try {
      // 1. Get user profiles to ensure we have correct display names
      const [inviterDoc, inviteeDoc] = await Promise.all([
        db.collection('users').doc(inviterId).get(),
        db.collection('users').doc(inviteeId).get()
      ]);

      const inviterData = inviterDoc.data();
      const inviteeData = inviteeDoc.data();

      const inviterEmail = inviterData?.email || afterData.fromUserEmail;
      const inviterName = inviterData?.displayName || afterData.fromUserDisplayName;
      
      const inviteeEmail = inviteeData?.email || afterData.toEmail;
      const inviteeName = inviteeData?.displayName || inviteeEmail;

      // 2. Create Contact ID (lexicographically sorted)
      const [userId1, userId2] = [inviterId, inviteeId].sort();
      const contactId = `${userId1}_${userId2}`;

      // 3. Create Contact Document
      const contactData = {
        userId1,
        userId2,
        user1Email: userId1 === inviterId ? inviterEmail : inviteeEmail,
        user2Email: userId2 === inviterId ? inviterEmail : inviteeEmail,
        user1DisplayName: userId1 === inviterId ? inviterName : inviteeName,
        user2DisplayName: userId2 === inviterId ? inviterName : inviteeName,
        status: 'accepted',
        initiatorUserId: inviterId, // The inviter initiated the connection via invitation
        createdAt: FieldValue.serverTimestamp(),
        acceptedAt: FieldValue.serverTimestamp(),
        lastInteractionAt: FieldValue.serverTimestamp(),
        metadata: {
          source: 'invitation',
          invitationId: invitationId,
          autoAccepted: true
        }
      };

      await db.collection('contacts').doc(contactId).set(contactData);
      console.log(`✅ Auto-created contact connection: ${contactId}`);

      // 4. Notify the inviter that their invitation was accepted
      // Get inviter's language preference
      const inviterLanguage = await getUserLanguage(inviterId);
      const t = await getI18n(inviterLanguage);
      
      await createNotification({
        recipientId: inviterId,
        senderId: inviteeId,
        senderDisplayName: inviteeName,
        type: 'contact_accepted',
        title: t('invitationAccepted.title'),
        message: t('invitationAccepted.message', { senderName: inviteeName }),
        invitationId: invitationId,
        isRead: false,
        metadata: {
          action: 'invitation_accepted',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error processing accepted invitation:', error);
    }
  }
});

/**
 * Callable: Accept an invitation
 * Handles acceptance server-side to avoid Firestore rule edge-cases and
 * ensure both the contact document and notifications are created atomically.
 */
export const acceptInvitation = onCall(
  { cors: CORS_ORIGINS },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const inviteeId = request.auth.uid;
    const { invitationId } = request.data as { invitationId: string };

    if (!invitationId) {
      throw new HttpsError('invalid-argument', 'invitationId is required');
    }

    const invitationRef = db.collection('contactRequests').doc(invitationId);
    const invitationDoc = await invitationRef.get();

    if (!invitationDoc.exists) {
      throw new HttpsError('not-found', 'Invitation not found');
    }

    const invitation = invitationDoc.data()!;

    if (invitation.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Invitation is already ${invitation.status}`);
    }

    const expiresAt = invitation.expiresAt?.toDate?.();
    if (expiresAt && expiresAt < new Date()) {
      throw new HttpsError('failed-precondition', 'Invitation has expired');
    }

    const inviterId = invitation.fromUserId;

    if (inviteeId === inviterId) {
      throw new HttpsError('invalid-argument', 'Cannot accept your own invitation');
    }

    // Fetch both profiles for accurate display names
    const [inviterDoc, inviteeDoc] = await Promise.all([
      db.collection('users').doc(inviterId).get(),
      db.collection('users').doc(inviteeId).get(),
    ]);

    const inviterData = inviterDoc.data();
    const inviteeData = inviteeDoc.data();

    const inviterEmail = inviterData?.email || invitation.fromUserEmail;
    const inviterName = inviterData?.displayName || invitation.fromUserDisplayName;
    const inviteeEmail = inviteeData?.email || invitation.toEmail;
    const inviteeName = inviteeData?.displayName || inviteeEmail;

    const [userId1, userId2] = [inviterId, inviteeId].sort();
    const contactId = `${userId1}_${userId2}`;

    const contactData = {
      userId1,
      userId2,
      user1Email: userId1 === inviterId ? inviterEmail : inviteeEmail,
      user2Email: userId2 === inviterId ? inviterEmail : inviteeEmail,
      user1DisplayName: userId1 === inviterId ? inviterName : inviteeName,
      user2DisplayName: userId2 === inviterId ? inviterName : inviteeName,
      status: 'accepted',
      initiatorUserId: inviterId,
      createdAt: FieldValue.serverTimestamp(),
      acceptedAt: FieldValue.serverTimestamp(),
      lastInteractionAt: FieldValue.serverTimestamp(),
      metadata: {
        source: 'invitation',
        invitationId,
        autoAccepted: true,
      },
    };

    // Mark invitation accepted and create contact atomically
    const batch = db.batch();
    batch.update(invitationRef, {
      status: 'accepted',
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedByUserId: inviteeId,
    });
    batch.set(db.collection('contacts').doc(contactId), contactData);
    await batch.commit();

    console.log(`✅ Invitation ${invitationId} accepted — contact created: ${contactId}`);

    // Notify the inviter their invitation was accepted
    const inviterLanguage = await getUserLanguage(inviterId);
    const t = await getI18n(inviterLanguage);

    await createNotification({
      recipientId: inviterId,
      senderId: inviteeId,
      senderDisplayName: inviteeName,
      type: 'contact_accepted',
      title: t('invitationAccepted.title'),
      message: t('invitationAccepted.message', { senderName: inviteeName }),
      invitationId,
      isRead: false,
      metadata: {
        action: 'invitation_accepted',
        timestamp: new Date().toISOString(),
      },
    });

    // Notify the invitee that the connection is now active
    const inviteeLanguage = await getUserLanguage(inviteeId);
    const tInvitee = await getI18n(inviteeLanguage);

    await createNotification({
      recipientId: inviteeId,
      senderId: inviterId,
      senderDisplayName: inviterName,
      type: 'contact_accepted',
      title: tInvitee('invitationAccepted.title'),
      message: tInvitee('invitationAccepted.message', { senderName: inviterName }),
      invitationId,
      isRead: false,
      metadata: {
        action: 'invitation_accepted',
        timestamp: new Date().toISOString(),
      },
    });

    return { contactId, inviterName, inviteeName };
  }
);

/**
 * Firestore Trigger: Chat message notifications
 * Sends notifications to participants when new messages are added
 * - Only notifies users who don't have the chat open
 * - Removes previous unread notifications from the same conversation to avoid overwhelming
 */
export const onChatMessageCreated = onDocumentCreated(
  "files/{chatId}/messages/{messageId}",
  async (event) => {
    try {
      const messageData = event.data?.data();
      const chatId = event.params.chatId;
      const messageId = event.params.messageId;
      
      if (!messageData) return;
      
      const senderId = messageData.senderId;
      
      // Get sender's display name from their profile
      let senderName = 'Someone';
      try {
        const senderDoc = await db.collection('users').doc(senderId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderName = senderData?.displayName || senderData?.email || 'Someone';
        }
      } catch (error) {
        console.error(`⚠️ Failed to fetch sender name:`, error);
      }
      
      // Get the chat document to find all participants
      const chatDoc = await db.collection('files').doc(chatId).get();
      if (!chatDoc.exists) {
        console.log(`⚠️ Chat ${chatId} not found`);
        return;
      }
      
      const chatData = chatDoc.data();
      if (!chatData || chatData.fileType !== 'chat') {
        console.log(`⚠️ Document ${chatId} is not a chat`);
        return;
      }
      
      const participants: string[] = chatData.participants || [];
      const chatType = chatData.type || 'individual';
      
      // Get active chat sessions to check who has the chat open
      // Simplified query to avoid index requirement - get all sessions and filter by time in code
      const activeSessionsSnapshot = await db.collection('activeChatSessions')
        .where('chatId', '==', chatId)
        .get();
      
      // Filter sessions to only those active within last 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const usersWithChatOpen = new Set<string>();
      
      activeSessionsSnapshot.docs.forEach(doc => {
        const sessionData = doc.data();
        const sessionTimestamp = sessionData.timestamp?.toDate?.()?.getTime() || 0;
        if (sessionTimestamp > fiveMinutesAgo) {
          usersWithChatOpen.add(sessionData.userId);
        }
      });
      
      console.log(`💬 New message in chat ${chatId} from ${senderName}`);
      console.log(`👥 Participants: ${participants.length}, Active: ${usersWithChatOpen.size}`);
      
      // Notify each participant (except the sender and those with chat open)
      for (const participantId of participants) {
        // Skip the sender
        if (participantId === senderId) continue;
        
        // Skip if user has chat open
        if (usersWithChatOpen.has(participantId)) {
          console.log(`⏭️ Skipping notification for ${participantId} - chat is open`);
          continue;
        }
        
        // Remove previous unread chat notifications from this conversation
        const previousNotifications = await db.collection('notifications')
          .where('recipientId', '==', participantId)
          .where('conversationId', '==', chatId)
          .where('type', '==', 'chat_message')
          .where('isRead', '==', false)
          .get();
        
        // Delete previous notifications
        const batch = db.batch();
        previousNotifications.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        if (!previousNotifications.empty) {
          await batch.commit();
          console.log(`🗑️ Removed ${previousNotifications.size} previous notifications for ${participantId}`);
        }
        
        // Get recipient's language preference
        const participantLanguage = await getUserLanguage(participantId);
        const t = await getI18n(participantLanguage);
        
        // Create new notification
        const notificationTitle = chatType === 'group' 
          ? t('chatMessage.groupTitle')
          : t('chatMessage.individualTitle', { senderName });
        
        const notificationMessage = chatType === 'group'
          ? t('chatMessage.groupMessage', { senderName })
          : t('chatMessage.individualMessage');
        
        const chatNotifId = await createNotification({
          recipientId: participantId,
          senderId: senderId,
          senderDisplayName: senderName,
          type: 'chat_message',
          title: notificationTitle,
          message: notificationMessage,
          conversationId: chatId,
          messageId: messageId,
          isRead: false,
          metadata: {
            chatType: chatType,
            timestamp: new Date().toISOString()
          }
        });
        
        console.log(`✅ Chat notification created for ${participantId}`);
        
        // Send FCM push notification to all user's devices
        try {
          const fcmTokensSnapshot = await db.collection('users')
            .doc(participantId)
            .collection('fcmTokens')
            .get();
          
          if (!fcmTokensSnapshot.empty) {
            const tokens = fcmTokensSnapshot.docs.map(doc => doc.data().token);
            
            // Send to all tokens
            const fcmMessage = {
              data: {
                title: notificationTitle,
                body: notificationMessage,
                type: 'chat_message',
                conversationId: chatId,
                messageId: messageId,
                url: `/?chat=${chatId}`,
                senderId: senderId,
                senderName: senderName,
                notificationId: chatNotifId,
              },
              tokens: tokens,
              webpush: {
                headers: { Urgency: 'high' },
                notification: {
                  title: notificationTitle,
                  body: notificationMessage,
                  icon: '/icon-192x192.png',
                  badge: '/favicon.ico',
                },
                fcmOptions: { link: 'https://app.seravault.com' },
              },
            };
            
            const response = await admin.messaging().sendEachForMulticast(fcmMessage);
            console.log(`📱 Sent FCM to ${response.successCount}/${tokens.length} devices for ${participantId}`);
            
            // Clean up all failed tokens and log error codes
            if (response.failureCount > 0) {
              const tokensToDelete: string[] = [];
              response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                  console.error(`❌ FCM [${resp.error?.code}] token[${idx}] (${tokens[idx].substring(0, 20)}...): ${resp.error?.message}`);
                  tokensToDelete.push(tokens[idx]);
                }
              });
              if (tokensToDelete.length > 0) {
                const deleteBatch = db.batch();
                tokensToDelete.forEach(token => {
                  const tokenRef = db.collection('users')
                    .doc(participantId)
                    .collection('fcmTokens')
                    .doc(token);
                  deleteBatch.delete(tokenRef);
                });
                await deleteBatch.commit();
                console.log(`🗑️ Cleaned up ${tokensToDelete.length} failed FCM tokens`);
              }
            }
          } else {
            console.log(`📵 No FCM tokens found for ${participantId}`);
          }
        } catch (fcmError) {
          console.error(`❌ Error sending FCM to ${participantId}:`, fcmError);
          // Don't fail the whole function if FCM fails
        }
      }
      
    } catch (error) {
      console.error('❌ Error creating chat notification:', error);
    }
  }
);

/**
 * Callable Cloud Function to delete a user's account and all associated data.
 * This function performs server-side deletion with elevated privileges to ensure
 * complete data removal including cleanup of shared files references.
 */
export const deleteUserAccount = onCall(
  {
    cors: CORS_ORIGINS,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    // Verify the user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to delete their account');
    }

    const userId = request.auth.uid;
    console.log(`🗑️ Starting account deletion for user: ${userId}`);

    try {
      const results = {
        storageFiles: 0,
        fileRecords: 0,
        folders: 0,
        contacts: 0,
        contactRequests: 0,
        groups: 0,
        notifications: 0,
        conversations: 0,
        sharedFilesCleaned: 0,
        profile: false,
        auth: false
      };

      // 1. Delete user's storage files and folder
      try {
        const bucket = admin.storage().bucket();
        const [files] = await bucket.getFiles({prefix: `files/${userId}/`});
        
        console.log(`Found ${files.length} storage files to delete`);
        
        // Delete all files in batches to avoid timeout
        const deletePromises = files.map(file => 
          file.delete().catch(err => {
            console.error(`Failed to delete ${file.name}:`, err);
            return null;
          })
        );
        
        await Promise.all(deletePromises);
        results.storageFiles = files.length;
        
        console.log(`✅ Deleted ${results.storageFiles} storage files from files/${userId}/`);
      } catch (error) {
        console.error('❌ Error deleting storage files:', error);
      }

      // 2. Delete file records
      try {
        const filesSnapshot = await db.collection('files')
          .where('owner', '==', userId)
          .get();
        
        const batch = db.batch();
        let batchCount = 0;

        // Process files - use recursive delete for chats to clean subcollections (messages)
        for (const doc of filesSnapshot.docs) {
          const data = doc.data();
          if (data.fileType === 'chat') {
            try {
              await db.recursiveDelete(doc.ref);
              results.fileRecords++;
            } catch (e) {
              console.error(`Failed to delete chat ${doc.id}:`, e);
            }
          } else {
            batch.delete(doc.ref);
            batchCount++;
            results.fileRecords++;
          }
        }
        
        if (batchCount > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.fileRecords} file records`);
      } catch (error) {
        console.error('❌ Error deleting file records:', error);
      }

      // 3. Delete folders
      try {
        const foldersSnapshot = await db.collection('folders')
          .where('owner', '==', userId)
          .get();
        
        const batch = db.batch();
        foldersSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.folders++;
        });
        
        if (results.folders > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.folders} folders`);
      } catch (error) {
        console.error('❌ Error deleting folders:', error);
      }

      // 3b. Delete custom form templates
      try {
        const templatesSnapshot = await db.collection('formTemplates')
          .where('author', '==', userId)
          .get();
        
        const batch = db.batch();
        let templatesDeleted = 0;
        templatesSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          templatesDeleted++;
        });
        
        if (templatesDeleted > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${templatesDeleted} custom form templates`);
      } catch (error) {
        console.error('❌ Error deleting form templates:', error);
      }

      // 4. Delete contacts (user's contact list)
      try {
        const contactsSnapshot = await db.collection('contacts')
          .where(admin.firestore.Filter.or(
            admin.firestore.Filter.where('userId1', '==', userId),
            admin.firestore.Filter.where('userId2', '==', userId)
          ))
          .get();
        
        const batch = db.batch();
        contactsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.contacts++;
        });
        
        // Also delete contact settings
        const settingsRef = db.collection('contactSettings').doc(userId);
        batch.delete(settingsRef);
        
        if (results.contacts > 0) {
          await batch.commit();
        } else {
          // Commit just the settings deletion if no contacts
          await settingsRef.delete();
        }
        console.log(`✅ Deleted ${results.contacts} contacts and contact settings`);
      } catch (error) {
        console.error('❌ Error deleting contacts:', error);
      }

      // 4b. Remove user from other users' contact lists
      try {
        const otherUsersContactsSnapshot = await db.collection('contacts')
          .where('contactId', '==', userId)
          .get();
        
        const batch = db.batch();
        let otherContactsRemoved = 0;
        otherUsersContactsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          otherContactsRemoved++;
        });
        
        if (otherContactsRemoved > 0) {
          await batch.commit();
        }
        console.log(`✅ Removed user from ${otherContactsRemoved} other users' contact lists`);
      } catch (error) {
        console.error('❌ Error removing user from other contact lists:', error);
      }

      // 5. Delete contact requests (sent and received)
      try {
        const sentRequests = await db.collection('contactRequests')
          .where('fromUserId', '==', userId)
          .get();
        
        const receivedRequests = await db.collection('contactRequests')
          .where('toUserId', '==', userId)
          .get();

        // Email invitations never have toUserId - match by toEmail
        const userEmail = request.auth?.token.email || '';
        const emailInvitations = userEmail
          ? await db.collection('contactRequests')
              .where('toEmail', '==', userEmail)
              .get()
          : { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] };
        
        const batch = db.batch();
        const seen = new Set<string>();
        [...sentRequests.docs, ...receivedRequests.docs, ...emailInvitations.docs].forEach(doc => {
          if (!seen.has(doc.id)) {
            seen.add(doc.id);
            batch.delete(doc.ref);
            results.contactRequests++;
          }
        });
        
        if (results.contactRequests > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.contactRequests} contact requests`);
      } catch (error) {
        console.error('❌ Error deleting contact requests:', error);
      }

      // 6. Delete groups
      try {
        const groupsSnapshot = await db.collection('groups')
          .where('owner', '==', userId)
          .get();
        
        const batch = db.batch();
        groupsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.groups++;
        });
        
        if (results.groups > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.groups} groups`);
      } catch (error) {
        console.error('❌ Error deleting groups:', error);
      }

      // 7. Delete notifications
      try {
        const notificationsSnapshot = await db.collection('notifications')
          .where('recipientId', '==', userId)
          .get();
        
        const batch = db.batch();
        notificationsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          results.notifications++;
        });
        
        if (results.notifications > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${results.notifications} notifications`);
      } catch (error) {
        console.error('❌ Error deleting notifications:', error);
      }

      // 8. Delete conversations
      try {
        const conversationsSnapshot = await db.collection('conversations')
          .where('participants', 'array-contains', userId)
          .get();
        
        // Use recursive delete to ensure messages subcollection is removed
        for (const doc of conversationsSnapshot.docs) {
          try {
            await db.recursiveDelete(doc.ref);
            results.conversations++;
          } catch (e) {
            console.error(`Failed to delete conversation ${doc.id}:`, e);
          }
        }
        
        console.log(`✅ Deleted ${results.conversations} conversations`);
      } catch (error) {
        console.error('❌ Error deleting conversations:', error);
      }

      // 9. Remove user from sharedWith arrays AND encryptedKeys in files
      try {
        const sharedFilesSnapshot = await db.collection('files')
          .where('sharedWith', 'array-contains', userId)
          .get();
        
        const batch = db.batch();
        sharedFilesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const updates: any = {
            sharedWith: FieldValue.arrayRemove(userId)
          };
          
          // Remove user's encryption key from encryptedKeys object
          if (data.encryptedKeys && data.encryptedKeys[userId]) {
            updates[`encryptedKeys.${userId}`] = FieldValue.delete();
          }
          
          batch.update(doc.ref, updates);
          results.sharedFilesCleaned++;
        });
        
        if (results.sharedFilesCleaned > 0) {
          await batch.commit();
        }
        console.log(`✅ Cleaned user from ${results.sharedFilesCleaned} shared files (sharedWith + encryptedKeys)`);
      } catch (error) {
        console.error('❌ Error cleaning shared files:', error);
      }

      // 9b. Remove user's encryptedKeys from conversations
      try {
        const conversationKeysSnapshot = await db.collection('conversations')
          .get();
        
        const batch = db.batch();
        let conversationKeysCleaned = 0;
        
        conversationKeysSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.encryptedKeys && data.encryptedKeys[userId]) {
            batch.update(doc.ref, {
              [`encryptedKeys.${userId}`]: FieldValue.delete()
            });
            conversationKeysCleaned++;
          }
        });
        
        if (conversationKeysCleaned > 0) {
          await batch.commit();
        }
        console.log(`✅ Removed user's encryption keys from ${conversationKeysCleaned} conversations`);
      } catch (error) {
        console.error('❌ Error cleaning conversation keys:', error);
      }

      // 9c. Delete legacy userInvitations (sent and received)
      try {
        const legacyUserEmail = request.auth?.token.email || '';
        const sentInvitations = await db.collection('userInvitations')
          .where('fromUserId', '==', userId)
          .get();
        
        const receivedInvitations = legacyUserEmail
          ? await db.collection('userInvitations')
              .where('toEmail', '==', legacyUserEmail)
              .get()
          : { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] };
        
        const batch = db.batch();
        let invitationsDeleted = 0;
        
        [...sentInvitations.docs, ...receivedInvitations.docs].forEach(doc => {
          batch.delete(doc.ref);
          invitationsDeleted++;
        });
        
        if (invitationsDeleted > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${invitationsDeleted} legacy user invitations`);
      } catch (error) {
        console.error('❌ Error deleting legacy user invitations:', error);
      }


      // 11. Delete user profile document
      try {
        await db.collection('users').doc(userId).delete();
        results.profile = true;
        console.log('✅ Deleted user profile');
      } catch (error) {
        console.error('❌ Error deleting user profile:', error);
      }

      // 12. Delete FCM tokens subcollection
      try {
        const tokensSnapshot = await db.collection('users')
          .doc(userId)
          .collection('fcmTokens')
          .get();
        
        const batch = db.batch();
        tokensSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        if (tokensSnapshot.size > 0) {
          await batch.commit();
        }
        console.log(`✅ Deleted ${tokensSnapshot.size} FCM tokens`);
      } catch (error) {
        console.error('❌ Error deleting FCM tokens:', error);
      }

      // 13. Delete Firebase Auth account
      try {
        await admin.auth().deleteUser(userId);
        results.auth = true;
        console.log('✅ Deleted Firebase Auth account');
      } catch (error) {
        console.error('❌ Error deleting auth account:', error);
        throw new HttpsError('internal', 'Failed to delete authentication account');
      }

      console.log(`✅ Account deletion completed for user: ${userId}`);
      return {
        success: true,
        message: 'Account successfully deleted',
        results
      };

    } catch (error) {
      console.error('❌ Account deletion failed:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to delete account'
      );
    }
  }
);

/**
 * Calculate storage usage for a user
 * Much faster than client-side calculation since it runs server-side
 * Includes regular files, form files, and chat file attachments
 */
export const calculateStorageUsage = onCall(
  {
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      // Get all files owned by the user (includes regular files and form files)
      const filesSnapshot = await db.collection('files')
        .where('owner', '==', userId)
        .select('storagePath')  // Only fetch the storagePath field for efficiency
        .get();

      const fileStoragePaths: string[] = [];

      for (const doc of filesSnapshot.docs) {
        const storagePath = doc.data().storagePath;
        if (storagePath) {
          fileStoragePaths.push(storagePath);
        }
      }

      // Get all conversations where user is a participant (to find chat file attachments)
      const conversationsSnapshot = await db.collection('files')
        .where('fileType', '==', 'chat')
        .where('participants', 'array-contains', userId)
        .get();

      // For each conversation, get messages with file attachments
      const chatFilePromises = conversationsSnapshot.docs.map(async (convDoc) => {
        const messagesSnapshot = await db.collection('files')
          .doc(convDoc.id)
          .collection('messages')
          .where('type', '==', 'file')
          .get();

        const storagePaths: string[] = [];
        for (const msgDoc of messagesSnapshot.docs) {
          const fileMetadata = msgDoc.data().fileMetadata;
          // Only count files uploaded by this user (they own the storage)
          if (fileMetadata?.storagePath && msgDoc.data().senderId === userId) {
            storagePaths.push(fileMetadata.storagePath);
          }
        }
        return storagePaths;
      });

      const chatFilePaths = (await Promise.all(chatFilePromises)).flat();
      const allStoragePaths = [...fileStoragePaths, ...chatFilePaths];

      console.log(`📊 User ${userId}: Found ${fileStoragePaths.length} regular files + ${chatFilePaths.length} chat attachments = ${allStoragePaths.length} total`);

      // Get file sizes from storage metadata
      const bucket = admin.storage().bucket();
      const sizePromises = allStoragePaths.map(async (storagePath) => {
        try {
          const file = bucket.file(storagePath);
          const [metadata] = await file.getMetadata();
          return parseInt(metadata.size as string) || 0;
        } catch (error) {
          console.warn(`Failed to get size for ${storagePath}:`, error);
          return 0;
        }
      });

      const sizes = await Promise.all(sizePromises);
      const totalBytes = sizes.reduce((sum, size) => sum + size, 0);

      return {
        usedBytes: totalBytes,
        fileCount: allStoragePaths.length,
      };

    } catch (error) {
      console.error('Failed to calculate storage usage:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to calculate storage usage'
      );
    }
  }
);

/**
 * Update user storage usage when a file is created
 * Maintains a running total in the user's profile
 * ALSO ENFORCES QUOTA - deletes file if it exceeds the user's plan limit
 */
export const updateStorageOnFileCreate = onDocumentCreated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const fileData = event.data?.data();
      if (!fileData) return;

      const owner = fileData.owner;
      const storagePath = fileData.storagePath;
      const fileId = event.params.fileId;

      // Only process files with actual storage (skip conversation records, etc.)
      if (!owner || !storagePath) return;

      // Get file size from Storage metadata
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);

      const [metadata] = await file.getMetadata();
      const fileSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

      if (fileSize === 0) return;

      const userRef = db.collection('users').doc(owner);


      // Update user's storage usage atomically
      await userRef.set(
        {
          storageUsed: FieldValue.increment(fileSize),
          storageUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Added ${fileSize} bytes to user ${owner} storage (file created)`);
    } catch (error) {
      console.error('Error updating storage on file create:', error);
      // Don't throw - we don't want to fail the file creation
    }
  }
);

/**
 * Update user storage usage when a file is updated
 * Handles storage path changes (file content updates)
 */
export const updateStorageOnFileUpdate = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      if (!beforeData || !afterData) return;

      const owner = afterData.owner;
      if (!owner) return;

      const oldStoragePath = beforeData.storagePath;
      const newStoragePath = afterData.storagePath;

      // Only update if storage path changed (content was updated)
      if (oldStoragePath === newStoragePath) return;

      const bucket = admin.storage().bucket();
      
      // Get old file size
      let oldSize = 0;
      if (oldStoragePath) {
        try {
          const oldFile = bucket.file(oldStoragePath);
          const [oldMetadata] = await oldFile.getMetadata();
          oldSize = typeof oldMetadata.size === 'number' ? oldMetadata.size : parseInt(oldMetadata.size || '0');
        } catch (error) {
          console.warn(`Could not get old file size for ${oldStoragePath}:`, error);
        }
      }

      // Get new file size
      let newSize = 0;
      if (newStoragePath) {
        try {
          const newFile = bucket.file(newStoragePath);
          const [newMetadata] = await newFile.getMetadata();
          newSize = typeof newMetadata.size === 'number' ? newMetadata.size : parseInt(newMetadata.size || '0');
        } catch (error) {
          console.warn(`Could not get new file size for ${newStoragePath}:`, error);
        }
      }

      const sizeDelta = newSize - oldSize;
      if (sizeDelta === 0) return;

      // Update user's storage usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          storageUsed: FieldValue.increment(sizeDelta),
          storageUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Updated user ${owner} storage by ${sizeDelta} bytes (file updated)`);
    } catch (error) {
      console.error('Error updating storage on file update:', error);
      // Don't throw - we don't want to fail the file update
    }
  }
);

/**
 * Update user storage usage when a file is deleted
 * Decrements the storage usage
 */
export const updateStorageOnFileDelete = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      // Check if this is a deletion (document still exists but marked for deletion)
      // Or handle actual document deletion with onDocumentDeleted if needed
      if (!beforeData || afterData) return;

      const owner = beforeData.owner;
      const storagePath = beforeData.storagePath;

      if (!owner || !storagePath) return;

      // Get file size from Storage metadata
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      
      try {
        const [metadata] = await file.getMetadata();
        const fileSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

        if (fileSize === 0) return;

        // Update user's storage usage atomically
        const userRef = db.collection('users').doc(owner);
        await userRef.set(
          {
            storageUsed: FieldValue.increment(-fileSize),
            storageUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log(`✅ Removed ${fileSize} bytes from user ${owner} storage (file deleted)`);
      } catch (error) {
        // File might already be deleted from storage, that's okay
        console.warn(`Could not get file size for ${storagePath}:`, error);
      }
    } catch (error) {
      console.error('Error updating storage on file delete:', error);
      // Don't throw - we don't want to fail the file deletion
    }
  }
);

/**
 * Update user storage usage when a file document is actually deleted
 * This handles the case where the Firestore document is deleted (not just updated)
 */
export const decrementStorageOnFileDelete = onDocumentDeleted(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const deletedData = event.data?.data();
      
      if (!deletedData) {
        console.warn('No data found in deleted file document');
        return;
      }

      const owner = deletedData.owner;
      const storagePath = deletedData.storagePath;

      if (!owner || !storagePath) {
        console.warn('Missing owner or storagePath in deleted file');
        return;
      }

      // Get file size from Storage metadata
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      
      try {
        const [metadata] = await file.getMetadata();
        const fileSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

        if (fileSize === 0) {
          console.log('File size is 0, skipping storage decrement');
          return;
        }

        // Update user's storage usage atomically
        const userRef = db.collection('users').doc(owner);
        await userRef.set(
          {
            storageUsed: FieldValue.increment(-fileSize),
            storageUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log(`✅ Removed ${fileSize} bytes from user ${owner} storage after file deletion (fileId: ${event.params.fileId})`);
      } catch (error) {
        // File might already be deleted from storage, that's okay
        // This can happen if the storage file was deleted before the Firestore document
        console.warn(`Could not get file size for ${storagePath} (may already be deleted):`, error);
        // We still want to log this as a deletion event
        console.log(`File document deleted for user ${owner}, but storage file already gone`);
      }
    } catch (error) {
      console.error('Error updating storage on file document delete:', error);
      // Don't throw - we don't want to fail the file deletion
    }
  }
);

/**
 * Calculate the size of a Firestore document in bytes
 */
function calculateDocumentSize(data: any): number {
  // Firebase calculates document size as:
  // - Each field name: length in bytes
  // - Each field value: depends on type
  // - Document name: 16 bytes
  // - Plus overhead for indexing
  
  let size = 32; // Base overhead (document name + metadata)
  
  function calculateFieldSize(key: string, value: any): number {
    let fieldSize = key.length; // Field name size
    
    if (value === null || value === undefined) {
      fieldSize += 1;
    } else if (typeof value === 'boolean') {
      fieldSize += 1;
    } else if (typeof value === 'number') {
      fieldSize += 8;
    } else if (typeof value === 'string') {
      fieldSize += value.length + 1;
    } else if (value instanceof Date) {
      fieldSize += 8;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        fieldSize += calculateFieldSize(index.toString(), item);
      });
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        fieldSize += calculateFieldSize(nestedKey, nestedValue);
      });
    } else {
      // Unknown type, estimate as string
      fieldSize += JSON.stringify(value).length;
    }
    
    return fieldSize;
  }
  
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([key, value]) => {
      size += calculateFieldSize(key, value);
    });
  }
  
  return size;
}

/**
 * Update user Firestore document usage when a file document is created
 */
export const updateFirestoreOnFileCreate = onDocumentCreated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const fileData = event.data?.data();
      if (!fileData) return;

      const owner = fileData.owner;
      if (!owner) return;

      // Calculate document size
      const docSize = calculateDocumentSize(fileData);

      // Update user's Firestore usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          firestoreUsed: FieldValue.increment(docSize),
          firestoreUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Added ${docSize} bytes to user ${owner} Firestore usage (file doc created)`);
    } catch (error) {
      console.error('Error updating Firestore usage on file create:', error);
    }
  }
);

/**
 * Update user Firestore document usage when a file document is updated
 */
export const updateFirestoreOnFileUpdate = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      if (!beforeData || !afterData) return;

      const owner = afterData.owner;
      if (!owner) return;

      // Calculate size difference
      const oldSize = calculateDocumentSize(beforeData);
      const newSize = calculateDocumentSize(afterData);
      const sizeDelta = newSize - oldSize;

      if (sizeDelta === 0) return;

      // Update user's Firestore usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          firestoreUsed: FieldValue.increment(sizeDelta),
          firestoreUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Updated user ${owner} Firestore usage by ${sizeDelta} bytes (file doc updated)`);
    } catch (error) {
      console.error('Error updating Firestore usage on file update:', error);
    }
  }
);

/**
 * Update user Firestore document usage when a file document is deleted
 */
export const updateFirestoreOnFileDelete = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      // Check if document was actually deleted
      if (!beforeData || afterData) return;

      const owner = beforeData.owner;
      if (!owner) return;

      // Calculate document size
      const docSize = calculateDocumentSize(beforeData);

      // Update user's Firestore usage atomically
      const userRef = db.collection('users').doc(owner);
      await userRef.set(
        {
          firestoreUsed: FieldValue.increment(-docSize),
          firestoreUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Removed ${docSize} bytes from user ${owner} Firestore usage (file doc deleted)`);
    } catch (error) {
      console.error('Error updating Firestore usage on file delete:', error);
    }
  }
);

/**
 * Get user's current storage usage from their profile
 * Much faster than calculating from scratch
 */
export const getUserStorageUsage = onCall(
  {
    region: "us-central1",
    cors: CORS_ORIGINS,
  },
  async (request) => {
    try {
      // Get authenticated user
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();

      // Get storage usage (files in Firebase Storage)
      const storageUsedRaw = userDoc.data()?.storageUsed;
      const storageUsed = typeof storageUsedRaw === 'number' && !isNaN(storageUsedRaw) ? storageUsedRaw : 0;
      const storageUpdatedAt = userDoc.data()?.storageUpdatedAt;

      // Get Firestore document usage
      const firestoreUsedRaw = userDoc.data()?.firestoreUsed;
      const firestoreUsed = typeof firestoreUsedRaw === 'number' && !isNaN(firestoreUsedRaw) ? firestoreUsedRaw : 0;
      const firestoreUpdatedAt = userDoc.data()?.firestoreUpdatedAt;

      // Count files for verification
      const filesSnapshot = await db
        .collection('files')
        .where('owner', '==', userId)
        .select('storagePath')
        .get();

      return {
        storageUsedBytes: storageUsed, // Firebase Storage (actual files)
        firestoreUsedBytes: firestoreUsed, // Firestore documents (metadata, forms with base64 images)
        totalUsedBytes: storageUsed + firestoreUsed, // Combined usage
        fileCount: filesSnapshot.size,
        storageLastUpdated: storageUpdatedAt,
        firestoreLastUpdated: firestoreUpdatedAt,
      };
    } catch (error) {
      console.error('Failed to get user storage usage:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to get storage usage'
      );
    }
  }
);

/**
 * Calculate total size for form files (form JSON + attachments)
 * Called via Cloud Function to update encryptedMetadata.size after file creation
 */
export const calculateFormTotalSize = onCall(
  {
    region: "us-central1",
    cors: CORS_ORIGINS,
  },
  async (request) => {
    try {
      // Get authenticated user
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const { fileId, formData } = request.data;

      if (!fileId || !formData) {
        throw new HttpsError('invalid-argument', 'fileId and formData are required');
      }

      // Verify user has access to this file
      const fileRef = db.collection('files').doc(fileId);
      const fileDoc = await fileRef.get();

      if (!fileDoc.exists) {
        throw new HttpsError('not-found', 'File not found');
      }

      const fileData = fileDoc.data();
      if (fileData?.owner !== userId && !fileData?.sharedWith?.includes(userId)) {
        throw new HttpsError('permission-denied', 'User does not have access to this file');
      }

      // Calculate JSON size from storage
      const storagePath = fileData.storagePath;
      if (!storagePath) {
        throw new HttpsError('invalid-argument', 'File has no storage path');
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [metadata] = await file.getMetadata();
      const formJsonSize = typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0');

      // Calculate total attachment sizes
      let totalAttachmentSize = 0;
      if (formData.attachments && typeof formData.attachments === 'object') {
        for (const attachment of Object.values(formData.attachments)) {
          const attachmentData = attachment as any;
          if (attachmentData.size && typeof attachmentData.size === 'number') {
            totalAttachmentSize += attachmentData.size;
          }
        }
      }

      const totalSize = formJsonSize + totalAttachmentSize;

      console.log(`📊 Form size calculation for ${fileId}: JSON=${formJsonSize}, Attachments=${totalAttachmentSize}, Total=${totalSize}`);

      return {
        formJsonSize,
        totalAttachmentSize,
        totalSize,
        attachmentCount: formData.attachments ? Object.keys(formData.attachments).length : 0
      };
    } catch (error) {
      console.error('Failed to calculate form total size:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to calculate form size'
      );
    }
  }
);

/**
 * Check if a file upload would exceed the user's storage quota
 * Should be called BEFORE uploading a file
 */
export const checkStorageQuotaBeforeUpload = onCall(
  {
    region: "us-central1",
    cors: CORS_ORIGINS,
  },
  async (request) => {
    try {
      // Get authenticated user
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const fileSize = request.data.fileSize;

      if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
        throw new HttpsError('invalid-argument', 'Valid fileSize is required');
      }

      console.log(`[QuotaCheck] Checking quota for user ${userId}, fileSize: ${fileSize} bytes`);


      console.log(`[QuotaCheck] Upload allowed, within quota`);
      return {
        allowed: true,
        fileSize,
      };
    } catch (error) {
      console.error('Failed to check storage quota:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to check storage quota'
      );
    }
  }
);



/**
 * Send support email for subscribed users
 * This keeps the admin email address hidden from clients
 */
export const sendSupportEmail = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpFromAddress],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;

    const { subject, message, userName } = request.data as {
      subject: string;
      message: string;
      userName?: string;
    };

    if (!subject || !message) {
      throw new HttpsError('invalid-argument', 'Subject and message are required');
    }

    try {
      // Get user profile for additional context
      const userProfile = await db.collection('users').doc(userId).get();
      const displayName = userName || userProfile.data()?.displayName || 'User';
      const email = userEmail || 'no-email@seravault.com';

      // Prepare email content
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1976d2; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .user-info { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #1976d2; }
            .message-content { background: white; padding: 20px; margin: 20px 0; border: 1px solid #ddd; border-radius: 4px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🔐 SeraVault Support Request</h2>
            </div>
            <div class="content">
              <div class="user-info">
                <h3>User Information</h3>
                <p><strong>Name:</strong> ${escapeHtml(displayName)}</p>
                <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                <p><strong>User ID:</strong> ${escapeHtml(userId)}</p>
              </div>
              
              <div class="message-content">
                <h3>Subject: ${escapeHtml(subject)}</h3>
                <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
              </div>
              
              <div class="footer">
                <p>This message was sent from a SeraVault user via the in-app support system.</p>
                <p>Reply directly to this email to respond to the user at: ${escapeHtml(email)}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send email to admin (hidden from client)
      const adminEmail = 'admin@seravault.com';
      await sendEmail(
        adminEmail,
        `[SeraVault Support] ${subject}`,
        emailHtml
      );

      console.log(`✅ Support email sent from ${email} (${userId})`);

      // Send confirmation to user
      const confirmationHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .message { background: white; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>✅ Support Request Received</h2>
            </div>
            <div class="content">
              <div class="message">
                <p>Hi ${escapeHtml(displayName)},</p>
                <p>Thank you for contacting SeraVault support. We've received your message:</p>
                <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
                <p>Our team will review your request and respond as soon as possible, typically within 24-48 hours.</p>
                <p>You'll receive a reply at this email address: <strong>${escapeHtml(email)}</strong></p>
              </div>
              <div class="footer">
                <p>© 2025 SeraVault - Secure Document Storage</p>
                <p><a href="https://www.seravault.com">www.seravault.com</a></p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail(
        email,
        'SeraVault Support - We received your message',
        confirmationHtml
      );

      console.log(`✅ Support email confirmation sent to ${email}`);

      return {
        success: true,
        message: 'Support email sent successfully. You will receive a confirmation email shortly.'
      };
    } catch (error) {
      console.error('❌ Error sending support email:', error);
      throw new HttpsError('internal', `Failed to send support email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Send sales inquiry email (Public endpoint)
 * Allows potential enterprise customers to contact sales without exposing the email address
 */
export const sendSalesInquiry = onRequest(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpFromAddress],
  },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Handle preflight OPTIONS request
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
        
        if (req.method !== 'POST') {
          res.status(405).json({error: 'Method not allowed'});
          return;
        }

        const { name, email, company, message } = req.body as {
          name: string;
          email: string;
          company?: string;
          message: string;
        };

        // Basic validation
        if (!name || !email || !message) {
          res.status(400).json({error: 'Name, email, and message are required'});
          return;
        }

        // Email validation regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          res.status(400).json({error: 'Invalid email address'});
          return;
        }

        // --- SPAM PROTECTION RULES ---

        // 1. Name validation: Must contain at least one space (first + last name)
        // and only alphanumeric characters, spaces, hyphens, apostrophes
        const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]{2,}$/;
        if (!nameRegex.test(name)) {
          res.status(400).json({error: 'Please provide a valid name'});
          return;
        }

        // 2. Name must contain at least one space (first and last name)
        if (!name.includes(' ') || name.trim().split(/\s+/).length < 2) {
          res.status(400).json({error: 'Please provide your full name (first and last)'});
          return;
        }

        // 3. Reject names with excessive consecutive consonants (likely random strings)
        const consonantPattern = /[bcdfghjklmnpqrstvwxyz]{8,}/i;
        if (consonantPattern.test(name.replace(/\s/g, ''))) {
          res.status(400).json({error: 'Invalid name format'});
          return;
        }

        // 4. Reject names with excessive uppercase letters (spam pattern)
        const uppercaseCount = (name.match(/[A-Z]/g) || []).length;
        if (uppercaseCount > name.length * 0.5 && name.length > 10) {
          res.status(400).json({error: 'Invalid name format'});
          return;
        }

        // 5. Minimum length checks
        if (name.trim().length < 3 || message.trim().length < 10) {
          res.status(400).json({error: 'Name and message must meet minimum length requirements'});
          return;
        }

        // 6. Maximum length checks (prevent abuse)
        if (name.length > 100 || message.length > 5000 || (company && company.length > 200)) {
          res.status(400).json({error: 'Input exceeds maximum length'});
          return;
        }

        // 7. Check for suspicious email domains
        const suspiciousPatterns = [
          /tempmail/i,
          /throwaway/i,
          /guerrillamail/i,
          /10minutemail/i,
          /mailinator/i,
          /trashmail/i,
          /fakeinbox/i
        ];
        if (suspiciousPatterns.some(pattern => pattern.test(email))) {
          res.status(400).json({error: 'Temporary email addresses are not accepted'});
          return;
        }

        // 8. Company name validation (if provided)
        if (company && company.trim().length > 0) {
          // Only allow letters, numbers, spaces, and common business characters
          const companyRegex = /^[a-zA-ZÀ-ÿ0-9\s&.,'()-]+$/;
          if (!companyRegex.test(company)) {
            res.status(400).json({error: 'Please provide a valid company name'});
            return;
          }

          // Reject excessive consecutive consonants (random strings)
          if (consonantPattern.test(company.replace(/\s/g, ''))) {
            res.status(400).json({error: 'Invalid company name format'});
            return;
          }

          // Reject if mostly numbers (>60%)
          const companyNumbers = (company.match(/[0-9]/g) || []).length;
          if (companyNumbers > company.length * 0.6) {
            res.status(400).json({error: 'Invalid company name format'});
            return;
          }

          // Minimum length for company name
          if (company.trim().length < 2) {
            res.status(400).json({error: 'Company name too short'});
            return;
          }
        }

        // 9. Message content validation
        // Check for excessive URLs (spam pattern)
        const urlPattern = /(https?:\/\/[^\s]+)/gi;
        const urls = message.match(urlPattern) || [];
        if (urls.length > 3) {
          res.status(400).json({error: 'Message contains too many links'});
          return;
        }

        // Check for repetitive patterns (spam bots)
        const repetitivePattern = /(.{3,})\1{4,}/; // Same 3+ chars repeated 5+ times
        if (repetitivePattern.test(message)) {
          res.status(400).json({error: 'Message contains repetitive content'});
          return;
        }

        // Check for excessive consecutive consonants in message (gibberish)
        const messageWords = message.split(/\s+/);
        const hasGibberishWord = messageWords.some(word => {
          // Check words longer than 6 chars for excessive consonants
          if (word.length > 6) {
            return /[bcdfghjklmnpqrstvwxyz]{10,}/i.test(word);
          }
          return false;
        });
        if (hasGibberishWord) {
          res.status(400).json({error: 'Message contains invalid content'});
          return;
        }

        // Check for minimum word count (ensure it's not just random characters)
        const wordCount = message.trim().split(/\s+/).length;
        if (wordCount < 3) {
          res.status(400).json({error: 'Message must contain at least 3 words'});
          return;
        }

        // Check for excessive special characters (spam pattern)
        const specialChars = (message.match(/[^a-zA-Z0-9\s]/g) || []).length;
        if (specialChars > message.length * 0.4) {
          res.status(400).json({error: 'Message contains excessive special characters'});
          return;
        }

        // Common spam keywords
        const spamKeywords = [
          /\bcrypto\s*currency/i,
          /\bbitcoin/i,
          /\bmake\s*money\s*fast/i,
          /\bclick\s*here/i,
          /\bfree\s*money/i,
          /\bcongratulations.*won/i,
          /\bclaim.*prize/i,
          /\bverify.*account/i,
          /\bsuspended.*account/i,
          /\bunsubscribe/i
        ];
        const hasSpamKeywords = spamKeywords.some(pattern => pattern.test(message));
        if (hasSpamKeywords) {
          res.status(400).json({error: 'Message contains prohibited content'});
          return;
        }

        // Check vowel to consonant ratio (gibberish detection)
        const messageLetters = message.replace(/[^a-zA-Z]/g, '');
        const vowels = (messageLetters.match(/[aeiou]/gi) || []).length;
        const consonants = (messageLetters.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length;
        if (messageLetters.length > 20 && vowels < consonants * 0.2) {
          res.status(400).json({error: 'Message appears to be invalid'});
          return;
        }

        // 10. Rate limiting: Check submission frequency from this IP
        const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const rateLimitKey = `sales_inquiry_${clientIP}`;
        const rateLimitDoc = await db.collection('rateLimits').doc(rateLimitKey).get();
        
        if (rateLimitDoc.exists) {
          const data = rateLimitDoc.data();
          const lastSubmission = data?.lastSubmission?.toDate();
          const submissionCount = data?.count || 0;
          
          // Allow max 3 submissions per hour
          if (lastSubmission && Date.now() - lastSubmission.getTime() < 3600000) {
            if (submissionCount >= 3) {
              res.status(429).json({error: 'Too many requests. Please try again later.'});
              return;
            }
            // Update count
            await db.collection('rateLimits').doc(rateLimitKey).update({
              count: submissionCount + 1,
              lastSubmission: FieldValue.serverTimestamp()
            });
          } else {
            // Reset counter after an hour
            await db.collection('rateLimits').doc(rateLimitKey).set({
              count: 1,
              lastSubmission: FieldValue.serverTimestamp()
            });
          }
        } else {
          // First submission from this IP
          await db.collection('rateLimits').doc(rateLimitKey).set({
            count: 1,
            lastSubmission: FieldValue.serverTimestamp()
          });
        }

        // 11. Check for duplicate submissions (same email within 24 hours)
        const recentInquiries = await db.collection('salesInquiries')
          .where('email', '==', email)
          .where('timestamp', '>', new Date(Date.now() - 86400000))
          .limit(1)
          .get();
        
        if (!recentInquiries.empty) {
          res.status(429).json({error: 'You have already submitted an inquiry recently'});
          return;
        }

        // 12. Log the inquiry to Firestore for tracking
        await db.collection('salesInquiries').add({
          name,
          email,
          company: company || null,
          message,
          timestamp: FieldValue.serverTimestamp(),
          ip: clientIP,
          userAgent: req.headers['user-agent'] || 'unknown'
        });

        // Construct email content
        const subject = `New Enterprise Sales Inquiry from ${name}`;
        const html = `
          <h2>New Sales Inquiry</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Company:</strong> ${company || 'Not provided'}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `;

        // Send email to sales team (using the configured email user for now, or a specific sales alias if available)
        // For now, we'll send it to the same address as the sender (admin) or a hardcoded sales address if we had one.
        const targetEmail = smtpUser.value();

        await sendEmail(targetEmail, subject, html);

        res.status(200).json({success: true, message: 'Inquiry sent successfully'});
      } catch (error) {
        console.error('Error sending sales inquiry:', error);
        res.status(500).json({error: 'Failed to send inquiry'});
      }
    });
  }
);

/**
 * Callable Cloud Function to remove/block a contact
 * Deletes contact document, pending requests, and removes user from shared files
 */
export const removeContact = onCall(
  {
    cors: CORS_ORIGINS,
  },
  async (request) => {
    // Verify the user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to remove a contact');
    }

    const userId = request.auth.uid;
    const { contactUserId } = request.data as { contactUserId: string };

    if (!contactUserId) {
      throw new HttpsError('invalid-argument', 'contactUserId is required');
    }

    if (userId === contactUserId) {
      throw new HttpsError('invalid-argument', 'Cannot remove yourself as a contact');
    }

    console.log(`🚫 Removing contact: ${userId} removing ${contactUserId}`);

    try {
      const results = {
        contactDeleted: false,
        requestsDeleted: 0,
        filesUnshared: 0,
      };

      // 1. Delete the contact document
      const [userId1, userId2] = [userId, contactUserId].sort();
      const contactId = `${userId1}_${userId2}`;
      const contactRef = db.collection('contacts').doc(contactId);
      
      const contactDoc = await contactRef.get();
      if (contactDoc.exists) {
        await contactRef.delete();
        results.contactDeleted = true;
        console.log(`✅ Deleted contact document: ${contactId}`);
      }

      // 2. Delete any pending contact requests between these users (both directions)
      const batch1 = db.batch();
      let batchCount1 = 0;

      const requests1 = await db.collection('contactRequests')
        .where('fromUserId', '==', userId)
        .where('toUserId', '==', contactUserId)
        .get();

      const requests2 = await db.collection('contactRequests')
        .where('fromUserId', '==', contactUserId)
        .where('toUserId', '==', userId)
        .get();

      [...requests1.docs, ...requests2.docs].forEach(doc => {
        batch1.delete(doc.ref);
        batchCount1++;
        results.requestsDeleted++;
      });

      if (batchCount1 > 0) {
        await batch1.commit();
        console.log(`✅ Deleted ${results.requestsDeleted} contact requests`);
      }

      // 3. Remove blocked user from all files shared by the removing user
      const sharedFilesQuery = await db.collection('files')
        .where('userId', '==', userId)
        .where('sharedWith', 'array-contains', contactUserId)
        .get();

      if (!sharedFilesQuery.empty) {
        // Process in batches of 500 (Firestore batch limit)
        const batches = [];
        let batch = db.batch();
        let count = 0;

        sharedFilesQuery.docs.forEach((doc) => {
          const data = doc.data();
          const sharedWith = (data.sharedWith || []).filter((uid: string) => uid !== contactUserId);
          const encryptedKeys = { ...data.encryptedKeys };
          delete encryptedKeys[contactUserId];

          batch.update(doc.ref, { 
            sharedWith,
            encryptedKeys,
            [`userFavorites.${contactUserId}`]: FieldValue.delete(),
            [`userFolders.${contactUserId}`]: FieldValue.delete(),
            [`userTags.${contactUserId}`]: FieldValue.delete(),
            [`userNames.${contactUserId}`]: FieldValue.delete(),
          });
          
          count++;
          results.filesUnshared++;

          // Commit batch every 500 operations
          if (count === 500) {
            batches.push(batch.commit());
            batch = db.batch();
            count = 0;
          }
        });

        // Commit remaining operations
        if (count > 0) {
          batches.push(batch.commit());
        }

        await Promise.all(batches);
        console.log(`✅ Removed contact from ${results.filesUnshared} shared files`);
      }

      console.log(`✅ Contact removal completed: ${userId} removed ${contactUserId}`);
      return {
        success: true,
        message: 'Contact successfully removed',
        results
      };

    } catch (error) {
      console.error('❌ Contact removal failed:', error);
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to remove contact'
      );
    }
  }
);

/**
 * IMPORTANT: Automatic User Data Cleanup on Console Deletion
 * 
 * Firebase Functions v2 does NOT support auth deletion triggers (onUserDeleted).
 * 
 * To clean up user data when deleting from Firebase Console:
 * 
 * Option 1 (Recommended): Install the "Delete User Data" Firebase Extension
 *   - Run: firebase ext:install firebase/delete-user-data
 *   - Configure it to delete collections: users, files, folders, contacts, etc.
 * 
 * Option 2: Use a script to delete users programmatically
 *   - Call the deleteUserAccount cloud function via Admin SDK
 *   - This ensures proper cleanup before auth deletion
 * 
 * Option 3: Manual cleanup
 *   - Always use the "Delete Account" button in the app (calls deleteUserAccount)
 *   - Never delete users directly from Firebase Console
 */


// ============================================================================
// EMAIL VERIFICATION (Custom Multi-Language)
// ============================================================================

// ============================================================================
// EMAIL VERIFICATION (Custom Multi-Language)
// ============================================================================

/**
 * Send custom email verification
 * Called from frontend after user signup
 */
export const sendCustomEmailVerification = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpFromAddress],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const {userId, email, displayName, language = 'en'} = request.data;

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Can only send verification for own account');
    }

    try {
      // Generate verification token (24 hour expiry)
      const token = admin.firestore().collection('_').doc().id; // Generate unique ID
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store token in Firestore
      await db.collection('emailVerifications').doc(token).set({
        userId,
        email,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        verified: false,
      });

      // Generate verification link
      const verificationLink = `${getBaseUrl()}/verify-email?token=${token}`;

      // Determine template based on language
      let templateName = 'email-verification';
      if (language === 'es') templateName = 'email-verification-es';
      else if (language === 'fr') templateName = 'email-verification-fr';
      else if (language === 'de') templateName = 'email-verification-de';

      // Render email from template
      const emailHtml = renderEmailTemplate(templateName, {
        displayName: displayName || email,
        verificationLink,
      });

      const subject = language === 'es' ? 'Verifica tu correo electrónico - SeraVault' :
                      language === 'fr' ? 'Vérifiez votre e-mail - SeraVault' :
                      language === 'de' ? 'Verifizieren Sie Ihre E-Mail - SeraVault' :
                      'Verify Your Email - SeraVault';

      // Use the centralized sendEmail helper
      await sendEmail(email, subject, emailHtml);

      console.log(`✅ Verification email sent to ${email} (${language})`);
      return {success: true, message: 'Verification email sent'};

    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      throw new HttpsError('internal', 'Failed to send verification email');
    }
  }
);

/**
 * Verify email token
 * Called when user clicks verification link
 */
export const verifyEmailToken = onCall(
  {
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const {token} = request.data;

    if (!token) {
      throw new HttpsError('invalid-argument', 'Token is required');
    }

    try {
      // Get token document
      const tokenDoc = await db.collection('emailVerifications').doc(token).get();

      if (!tokenDoc.exists) {
        throw new HttpsError('not-found', 'Invalid or expired verification token');
      }

      const tokenData = tokenDoc.data()!;

      // Check if already verified
      if (tokenData.verified) {
        throw new HttpsError('already-exists', 'Email already verified');
      }

      // Check expiration
      const now = new Date();
      const expiresAt = tokenData.expiresAt.toDate();
      if (now > expiresAt) {
        throw new HttpsError('deadline-exceeded', 'Verification token has expired');
      }

      // Mark token as verified
      await tokenDoc.ref.update({
        verified: true,
        verifiedAt: FieldValue.serverTimestamp(),
      });

      // Update user's emailVerified custom claim
      await admin.auth().setCustomUserClaims(tokenData.userId, {emailVerified: true});

      // Update user profile in Firestore
      await db.collection('users').doc(tokenData.userId).update({
        emailVerified: true,
        emailVerifiedAt: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Email verified for user ${tokenData.userId}`);
      return {
        success: true,
        message: 'Email verified successfully',
        userId: tokenData.userId,
      };

    } catch (error) {
      console.error('❌ Error verifying email token:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to verify email');
    }
  }
);



/**
 * Join Waitlist (Public endpoint — no Firebase credentials required on the landing page)
 * Writes to the /waitlist collection server-side using the Admin SDK.
 * Rate-limiting: one entry per email address (duplicate emails are silently accepted).
 */
export const joinWaitlist = onRequest(
  {},
  async (req, res) => {
    return corsHandler(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({error: 'Method not allowed'});
        return;
      }

      const { email, source = 'landing', interest = 'self-hosted' } = req.body as {
        email: string;
        source?: string;
        interest?: string;
      };

      // Validate email
      if (!email || typeof email !== 'string') {
        res.status(400).json({error: 'Email is required'});
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || email.length > 254) {
        res.status(400).json({error: 'Invalid email address'});
        return;
      }

      // Sanitise free-text fields
      const safeSource   = String(source).slice(0, 50).replace(/[<>"']/g, '');
      const safeInterest = String(interest).slice(0, 100).replace(/[<>"']/g, '');

      // Deduplicate: check if email already exists
      const existing = await db
        .collection('waitlist')
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();

      if (!existing.empty) {
        // Silently succeed — don't leak whether the email is registered
        res.status(200).json({success: true});
        return;
      }

      await db.collection('waitlist').add({
        email: email.toLowerCase(),
        timestamp: FieldValue.serverTimestamp(),
        source: safeSource,
        interest: safeInterest,
      });

      console.log(`✅ Waitlist entry added: ${email}`);
      res.status(200).json({success: true});
    });
  }
);
