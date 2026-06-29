import { backendService } from '../backend/BackendService';
import type { QueryConstraint } from '../backend/BackendInterface';

export interface Contact {
  id?: string;
  userId1: string; // First user ID (lexicographically smaller)
  userId2: string; // Second user ID (lexicographically larger)
  user1Email: string;
  user2Email: string;
  user1DisplayName: string;
  user2DisplayName: string;
  status: 'pending' | 'accepted' | 'blocked';
  initiatorUserId: string; // Who sent the contact request
  createdAt: any;
  acceptedAt?: any;
  blockedAt?: any;
  blockedByUserId?: string; // Who blocked the contact
  lastInteractionAt: any; // Last time users interacted (file sharing, etc)
  metadata?: {
    autoAccepted?: boolean; // If contact was auto-accepted due to domain settings
    sharedFilesCount?: number; // Number of files shared between users
    [key: string]: any;
  };
}

export interface ContactRequest {
  id?: string;
  fromUserId: string;
  fromUserEmail: string;
  fromUserDisplayName: string;
  
  // For registered users - both toUserId and toUserDisplayName will be set
  // For invitations - only toEmail is set initially
  toUserId?: string;
  toUserDisplayName?: string;
  
  // Always set - normalized lowercase email (primary query field)
  toEmail: string;
  
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: any;
  respondedAt?: any;
  expiresAt?: any; // Set by Cloud Function on creation (30 days)
  
  // Indicates if this was sent to a non-registered user
  isInvitation?: boolean;
  
  // Set when a non-user signs up and accepts
  acceptedByUserId?: string;
  acceptedAt?: any;
  
  triggerEvent?: {
    type: 'file_share_attempt';
    fileId: string;
    fileName?: string;
  };
}

export interface ContactSettings {
  userId: string;
  autoAcceptDomains: string[]; // Auto-accept requests from these email domains
  autoAcceptFromContacts: boolean; // Auto-accept from existing contacts' contacts
  allowFileShareFromUnknown: boolean; // Allow files from unknown users (with prompt)
  blockUnknownUsers: boolean; // Block all interactions from unknown users
  notifyOnContactRequest: boolean;
  notifyOnFileShareFromUnknown: boolean;
  updatedAt: any;
}

// Type alias for backward compatibility - UserInvitation is now just a ContactRequest
export type UserInvitation = ContactRequest;

// Helper to get user profile
async function getUserProfile(userId: string) {
  return await backendService.users.get(userId);
}

// Helper to get user by email
async function getUserByEmail(email: string) {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'email', operator: '==', value: email }
  ];
  const users = await backendService.query.getPath('users', constraints);
  return users.length > 0 ? users[0] : null;
}

export class ContactService {
  private static readonly CONTACTS_COLLECTION = 'contacts';
  private static readonly CONTACT_REQUESTS_COLLECTION = 'contactRequests';
  private static readonly CONTACT_SETTINGS_COLLECTION = 'contactSettings';
  private static readonly REQUEST_EXPIRY_DAYS = 30;

  /**
   * Create a standardized contact ID from two user IDs
   * Ensures consistent ordering regardless of who initiates
   */
  private static createContactId(userId1: string, userId2: string): string {
    const [smallerId, largerId] = [userId1, userId2].sort();
    return `${smallerId}_${largerId}`;
  }

  /**
   * Get contact relationship between two users
   */
  static async getContactRelationship(userId1: string, userId2: string): Promise<Contact | null> {
    const contactId = this.createContactId(userId1, userId2);
    const contact = await backendService.documents.get(this.CONTACTS_COLLECTION, contactId);
    return contact as Contact | null;
  }

  /**
   * Check if two users are connected contacts
   */
  static async areUsersConnected(userId1: string, userId2: string): Promise<boolean> {
    const contact = await this.getContactRelationship(userId1, userId2);
    return contact?.status === 'accepted';
  }

  /**
   * Get all contacts for a user
   */
  static async getUserContacts(userId: string): Promise<Contact[]> {
    try {
      console.log(`🔍 Fetching contacts for user: ${userId}`);
      
      // Query where user is either userId1 or userId2
      const constraints1: QueryConstraint[] = [
        { type: 'where', field: 'userId1', operator: '==', value: userId },
        { type: 'where', field: 'status', operator: '==', value: 'accepted' }
      ];
      
      const constraints2: QueryConstraint[] = [
        { type: 'where', field: 'userId2', operator: '==', value: userId },
        { type: 'where', field: 'status', operator: '==', value: 'accepted' }
      ];

      console.log('📋 Executing contact queries...');
      const [contacts1, contacts2] = await Promise.all([
        backendService.query.getPath(this.CONTACTS_COLLECTION, constraints1),
        backendService.query.getPath(this.CONTACTS_COLLECTION, constraints2)
      ]);

      const contacts = [...contacts1, ...contacts2] as Contact[];

      console.log(`✅ Found ${contacts.length} contacts for user ${userId}`);
      return contacts;
    } catch (error) {
      console.error('Error fetching user contacts:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time contact updates
   * Returns unsubscribe function
   */
  static subscribeToContacts(
    userId: string,
    callback: (contacts: Contact[]) => void
  ): () => void {
    // Query where user is userId1
    const constraints1: QueryConstraint[] = [
      { type: 'where', field: 'userId1', operator: '==', value: userId },
      { type: 'where', field: 'status', operator: '==', value: 'accepted' }
    ];
    
    // Query where user is userId2
    const constraints2: QueryConstraint[] = [
      { type: 'where', field: 'userId2', operator: '==', value: userId },
      { type: 'where', field: 'status', operator: '==', value: 'accepted' }
    ];

    let unsubscribed = false;
    let unsubscribe1: (() => void) | null = null;
    let unsubscribe2: (() => void) | null = null;
    
    // State for the two subscriptions
    let contacts1: Contact[] = [];
    let contacts2: Contact[] = [];

    const emit = () => {
      if (!unsubscribed) {
        const allContacts = [...contacts1, ...contacts2];
        const uniqueContacts = Array.from(new Map(allContacts.map(c => [c.id, c])).values());
        callback(uniqueContacts as Contact[]);
      }
    };

    unsubscribe1 = backendService.query.subscribePath(this.CONTACTS_COLLECTION, constraints1, (data) => {
      contacts1 = data as Contact[];
      emit();
    });

    unsubscribe2 = backendService.query.subscribePath(this.CONTACTS_COLLECTION, constraints2, (data) => {
      contacts2 = data as Contact[];
      emit();
    });

    // Return combined unsubscribe function
    return () => {
      unsubscribed = true;
      if (unsubscribe1) unsubscribe1();
      if (unsubscribe2) unsubscribe2();
    };
  }

  /**
   * Send contact request
   */
  static async sendContactRequest(
    fromUserId: string,
    toUserEmail: string,
    message?: string,
    triggerEvent?: ContactRequest['triggerEvent']
  ): Promise<string> {
    console.log('🚀 sendContactRequest called with:', { fromUserId, toUserEmail, message, triggerEvent });

    const normalizedEmail = toUserEmail.toLowerCase();

    try {
      const fromUserProfile = await getUserProfile(fromUserId);
      if (!fromUserProfile) throw new Error('Sender profile not found');

      const currentUser = backendService.auth.getCurrentUser();
      if (!currentUser) throw new Error('User not authenticated');

      // Look up whether the recipient is already registered
      const targetUser = await getUserByEmail(normalizedEmail);

      if (targetUser) {
        const toUserId = targetUser.id;
        console.log(`✅ Found registered target user: ${toUserId}`);

        // Guard: already connected or blocked
        const existingContact = await this.getContactRelationship(fromUserId, toUserId);
        if (existingContact?.status === 'accepted') throw new Error('Users are already connected');
        if (existingContact?.status === 'blocked') throw new Error('Cannot send contact request to blocked user');

        // Guard: pending request already exists
        try {
          const constraints: QueryConstraint[] = [
            { type: 'where', field: 'fromUserId', operator: '==', value: fromUserId },
            { type: 'where', field: 'toUserId', operator: '==', value: toUserId },
            { type: 'where', field: 'status', operator: '==', value: 'pending' }
          ];
          const existing = await backendService.query.getPath(this.CONTACT_REQUESTS_COLLECTION, constraints);
          if (existing.length > 0) throw new Error('Contact request already sent');
        } catch (err: any) {
          if (err.message === 'Contact request already sent') throw err;
          console.warn('⚠️ Could not check for duplicates, proceeding:', err.message);
        }

        const toUserProfile = await getUserProfile(toUserId);

        const invitation: Omit<ContactRequest, 'id'> = {
          fromUserId,
          fromUserEmail: fromUserProfile.email,
          fromUserDisplayName: fromUserProfile.displayName || 'Unknown',
          toUserId,
          toEmail: normalizedEmail,
          toUserDisplayName: toUserProfile?.displayName || 'Unknown',
          isInvitation: true,
          status: 'pending',
          createdAt: backendService.utils.serverTimestamp(),
          ...(message && { message }),
          ...(triggerEvent && { triggerEvent }),
        };

        const invitationId = await backendService.documents.add(this.CONTACT_REQUESTS_COLLECTION, invitation);
        console.log(`📨 Invitation sent to registered user ${toUserId} (${normalizedEmail})`);
        return invitationId;

      } else {
        // Non-registered user
        console.log(`📧 User ${normalizedEmail} not registered — creating invitation`);

        // Guard: pending invitation already sent to this email
        try {
          const constraints: QueryConstraint[] = [
            { type: 'where', field: 'fromUserId', operator: '==', value: fromUserId },
            { type: 'where', field: 'toEmail', operator: '==', value: normalizedEmail },
            { type: 'where', field: 'status', operator: '==', value: 'pending' }
          ];
          const existing = await backendService.query.getPath(this.CONTACT_REQUESTS_COLLECTION, constraints);
          if (existing.length > 0) throw new Error('Invitation already sent to this email');
        } catch (err: any) {
          if (err.message === 'Invitation already sent to this email') throw err;
          console.warn('⚠️ Could not check for duplicates, proceeding:', err.message);
        }

        const invitation: Omit<ContactRequest, 'id'> = {
          fromUserId,
          fromUserEmail: fromUserProfile.email,
          fromUserDisplayName: fromUserProfile.displayName || 'Unknown',
          toEmail: normalizedEmail,
          isInvitation: true,
          status: 'pending',
          createdAt: backendService.utils.serverTimestamp(),
          ...(message && { message }),
          ...(triggerEvent && { triggerEvent }),
        };

        const invitationId = await backendService.documents.add(this.CONTACT_REQUESTS_COLLECTION, invitation);
        console.log(`📨 Invitation sent to non-registered email ${normalizedEmail}`);
        return invitationId;
      }
    } catch (error) {
      console.error('Error sending contact request:', error);
      throw error;
    }
  }

  /**
   * Accept contact request
   */
  static async acceptContactRequest(requestId: string, acceptingUserId: string): Promise<void> {
    try {
      const request = await backendService.documents.get(this.CONTACT_REQUESTS_COLLECTION, requestId) as ContactRequest;
      
      if (!request) {
        throw new Error('Contact request not found');
      }
      
      // Verify the accepting user is the recipient
      if (request.toUserId !== acceptingUserId) {
        throw new Error('Not authorized to accept this request');
      }

      if (request.status !== 'pending') {
        throw new Error('Request is no longer pending');
      }

      // Create or update contact relationship
      const contactId = this.createContactId(request.fromUserId, request.toUserId!);
      const [userId1, userId2] = [request.fromUserId, request.toUserId!].sort();

      const contact: Omit<Contact, 'id'> = {
        userId1,
        userId2,
        user1Email: userId1 === request.fromUserId ? request.fromUserEmail : request.toEmail,
        user2Email: userId2 === request.fromUserId ? request.fromUserEmail : request.toEmail,
        user1DisplayName: userId1 === request.fromUserId ? request.fromUserDisplayName : (request.toUserDisplayName || 'Unknown'),
        user2DisplayName: userId2 === request.fromUserId ? request.fromUserDisplayName : (request.toUserDisplayName || 'Unknown'),
        status: 'accepted',
        initiatorUserId: request.fromUserId,
        createdAt: request.createdAt,
        acceptedAt: backendService.utils.serverTimestamp(),
        lastInteractionAt: backendService.utils.serverTimestamp(),
        metadata: {
          sharedFilesCount: 0
        }
      };

      console.log('🔍 Attempting to create contact with ID:', contactId);

      // Update request status and create contact relationship
      await Promise.all([
        backendService.documents.update(this.CONTACT_REQUESTS_COLLECTION, requestId, {
          status: 'accepted',
          respondedAt: backendService.utils.serverTimestamp()
        }),
        backendService.documents.set(this.CONTACTS_COLLECTION, contactId, contact)
      ]);

      console.log(`✅ Contact request accepted: ${request.fromUserId} <-> ${request.toUserId}`);
    } catch (error) {
      console.error('Error accepting contact request:', error);
      throw error;
    }
  }

  /**
   * Decline contact request
   */
  static async declineContactRequest(requestId: string, decliningUserId: string): Promise<void> {
    try {
      const request = await backendService.documents.get(this.CONTACT_REQUESTS_COLLECTION, requestId) as ContactRequest;
      
      if (!request) {
        throw new Error('Contact request not found');
      }
      
      // Verify the declining user is the recipient
      if (request.toUserId !== decliningUserId) {
        throw new Error('Not authorized to decline this request');
      }

      if (request.status !== 'pending') {
        throw new Error('Request is no longer pending');
      }

      await backendService.documents.update(this.CONTACT_REQUESTS_COLLECTION, requestId, {
        status: 'declined',
        respondedAt: backendService.utils.serverTimestamp()
      });

      console.log(`❌ Contact request declined: ${request.fromUserId} -> ${request.toUserId}`);
    } catch (error) {
      console.error('Error declining contact request:', error);
      throw error;
    }
  }

  /**
   * Cancel a sent contact request (for the sender to withdraw it)
   */
  static async cancelContactRequest(requestId: string): Promise<void> {
    try {
      const user = backendService.auth.getCurrentUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const request = await backendService.documents.get(this.CONTACT_REQUESTS_COLLECTION, requestId) as ContactRequest;
      
      if (!request) {
        throw new Error('Contact request not found');
      }
      
      // Verify the canceling user is the sender
      if (request.fromUserId !== user.uid) {
        throw new Error('Not authorized to cancel this request');
      }

      if (request.status !== 'pending') {
        throw new Error('Request is no longer pending');
      }

      // Delete the request
      await backendService.documents.delete(this.CONTACT_REQUESTS_COLLECTION, requestId);

      console.log(`🚫 Contact request canceled: ${request.fromUserId} -> ${request.toUserId}`);
    } catch (error) {
      console.error('Error canceling contact request:', error);
      throw error;
    }
  }

  /**
   * Block a user
   */
  static async blockUser(blockingUserId: string, blockedUserId: string): Promise<void> {
    try {
      const contactId = this.createContactId(blockingUserId, blockedUserId);
      const [userId1, userId2] = [blockingUserId, blockedUserId].sort();

      // Get user profiles
      const [blockingUserProfile, blockedUserProfile] = await Promise.all([
        getUserProfile(blockingUserId),
        getUserProfile(blockedUserId)
      ]);

      if (!blockingUserProfile || !blockedUserProfile) {
        throw new Error('User profile not found');
      }

      const contact: Omit<Contact, 'id'> = {
        userId1,
        userId2,
        user1Email: userId1 === blockingUserId ? blockingUserProfile.email : blockedUserProfile.email,
        user2Email: userId2 === blockingUserId ? blockingUserProfile.email : blockedUserProfile.email,
        user1DisplayName: userId1 === blockingUserId ? blockingUserProfile.displayName : blockedUserProfile.displayName,
        user2DisplayName: userId2 === blockingUserId ? blockingUserProfile.displayName : blockedUserProfile.displayName,
        status: 'blocked',
        initiatorUserId: blockingUserId,
        createdAt: backendService.utils.serverTimestamp(),
        blockedAt: backendService.utils.serverTimestamp(),
        blockedByUserId: blockingUserId,
        lastInteractionAt: backendService.utils.serverTimestamp()
      };

      await backendService.documents.set(this.CONTACTS_COLLECTION, contactId, contact);
      console.log(`🚫 User blocked: ${blockingUserId} blocked ${blockedUserId}`);
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  /**
   * Unblock a user
   */
  static async unblockUser(unblockingUserId: string, unblockedUserId: string): Promise<void> {
    try {
      const contactId = this.createContactId(unblockingUserId, unblockedUserId);
      await backendService.documents.delete(this.CONTACTS_COLLECTION, contactId);
      console.log(`✅ User unblocked: ${unblockingUserId} unblocked ${unblockedUserId}`);
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }

  /**
   * Get pending contact requests for a user
   */
  static async getPendingContactRequests(userId: string): Promise<ContactRequest[]> {
    try {
      const constraints: QueryConstraint[] = [
        { type: 'where', field: 'toUserId', operator: '==', value: userId },
        { type: 'where', field: 'status', operator: '==', value: 'pending' },
        { type: 'orderBy', field: 'createdAt', direction: 'desc' }
      ];

      const requests = await backendService.query.getPath(this.CONTACT_REQUESTS_COLLECTION, constraints);
      return requests as ContactRequest[];
    } catch (error) {
      console.error('Error fetching pending contact requests:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time contact requests for a user
   */
  static subscribeToContactRequests(
    userId: string,
    callback: (requests: ContactRequest[]) => void
  ): () => void {
    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'toUserId', operator: '==', value: userId },
      { type: 'where', field: 'status', operator: '==', value: 'pending' },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' }
    ];

    let debounceTimer: NodeJS.Timeout | null = null;
    
    // Using subscribePath which returns the full list
    return backendService.query.subscribePath(this.CONTACT_REQUESTS_COLLECTION, constraints, (data) => {
      // Clear any pending callback
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce to batch rapid contact request changes
      debounceTimer = setTimeout(() => {
        callback(data as ContactRequest[]);
      }, 150); // 150ms debounce
    });
  }

  /**
   * Get sent contact requests (outgoing) for a user
   */
  static async getSentContactRequests(userId: string): Promise<ContactRequest[]> {
    try {
      const constraints: QueryConstraint[] = [
        { type: 'where', field: 'fromUserId', operator: '==', value: userId },
        { type: 'where', field: 'status', operator: '==', value: 'pending' },
        { type: 'orderBy', field: 'createdAt', direction: 'desc' }
      ];

      const requests = await backendService.query.getPath(this.CONTACT_REQUESTS_COLLECTION, constraints);
      return requests as ContactRequest[];
    } catch (error) {
      console.error('Error fetching sent contact requests:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time sent contact requests for a user
   */
  static subscribeToSentContactRequests(
    userId: string,
    callback: (requests: ContactRequest[]) => void
  ): () => void {
    console.log(`📤 Setting up real-time subscription for sent contact requests from user: ${userId}`);
    
    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'fromUserId', operator: '==', value: userId },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' }
    ];
    
    return backendService.query.subscribePath(this.CONTACT_REQUESTS_COLLECTION, constraints, (data) => {
      console.log(`📤 Sent requests snapshot received: ${data.length} requests`);
      callback(data as ContactRequest[]);
    });
  }

  /**
   * Get or create contact settings for a user
   */
  static async getContactSettings(userId: string): Promise<ContactSettings> {
    try {
      const settings = await backendService.documents.get(this.CONTACT_SETTINGS_COLLECTION, userId);
      
      if (settings) {
        return settings as ContactSettings;
      }

      // Create default settings
      const defaultSettings: ContactSettings = {
        userId,
        autoAcceptDomains: [],
        autoAcceptFromContacts: false,
        allowFileShareFromUnknown: true,
        blockUnknownUsers: false,
        notifyOnContactRequest: true,
        notifyOnFileShareFromUnknown: true,
        updatedAt: backendService.utils.serverTimestamp()
      };

      await backendService.documents.set(this.CONTACT_SETTINGS_COLLECTION, userId, defaultSettings);
      return defaultSettings;
    } catch (error) {
      console.error('Error fetching contact settings:', error);
      throw error;
    }
  }

  /**
   * Update contact settings
   */
  static async updateContactSettings(userId: string, updates: Partial<ContactSettings>): Promise<void> {
    try {
      await backendService.documents.update(this.CONTACT_SETTINGS_COLLECTION, userId, {
        ...updates,
        updatedAt: backendService.utils.serverTimestamp()
      });
      
      console.log(`⚙️ Contact settings updated for user ${userId}`);
    } catch (error) {
      console.error('Error updating contact settings:', error);
      throw error;
    }
  }

  /**
   * Check if file sharing should be allowed between users
   * Returns: { allowed: boolean, requiresApproval: boolean, reason?: string }
   */
  static async checkFileSharingPermission(
    fromUserId: string, 
    toUserId: string
  ): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
    try {
      // Get contact relationship
      const contact = await this.getContactRelationship(fromUserId, toUserId);
      
      // If users are connected, allow sharing
      if (contact?.status === 'accepted') {
        return { allowed: true, requiresApproval: false };
      }

      // If users are blocked, deny sharing
      if (contact?.status === 'blocked') {
        return { 
          allowed: false, 
          requiresApproval: false, 
          reason: 'User has been blocked' 
        };
      }

      // Get recipient's contact settings
      const settings = await this.getContactSettings(toUserId);

      // If recipient blocks unknown users, deny
      if (settings.blockUnknownUsers) {
        return { 
          allowed: false, 
          requiresApproval: false, 
          reason: 'User does not accept files from unknown contacts' 
        };
      }

      // If recipient allows files from unknown users, allow with approval prompt
      if (settings.allowFileShareFromUnknown) {
        return { allowed: true, requiresApproval: true };
      }

      // Default: deny sharing
      return { 
        allowed: false, 
        requiresApproval: false, 
        reason: 'User only accepts files from contacts' 
      };
    } catch (error) {
      console.error('Error checking file sharing permission:', error);
      return { 
        allowed: false, 
        requiresApproval: false, 
        reason: 'Error checking permissions' 
      };
    }
  }

  /**
   * Update last interaction time between users
   */
  static async updateLastInteraction(userId1: string, userId2: string): Promise<void> {
    try {
      const contact = await this.getContactRelationship(userId1, userId2);
      if (contact) {
        await backendService.documents.update(this.CONTACTS_COLLECTION, contact.id!, {
          lastInteractionAt: backendService.utils.serverTimestamp(),
          'metadata.sharedFilesCount': backendService.utils.increment(1) // increment is better than manual count
        });
      }
    } catch (error) {
      console.error('Error updating last interaction:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Remove a contact relationship (unfriend)
   */
  static async removeContact(userId: string, contactUserId: string): Promise<void> {
    try {
      const contact = await this.getContactRelationship(userId, contactUserId);
      if (!contact || contact.status !== 'accepted') {
        throw new Error('Contact relationship not found');
      }

      await backendService.documents.delete(this.CONTACTS_COLLECTION, contact.id!);
      
      console.log(`🗑️ Contact removed: ${userId} removed ${contactUserId}`);
    } catch (error) {
      console.error('Error removing contact:', error);
      throw error;
    }
  }

  /**
   * Send invitation to non-existing user
   */
  static async sendUserInvitation(
    fromUserId: string,
    toEmail: string,
    message?: string,
    triggerEvent?: ContactRequest['triggerEvent']
  ): Promise<{ invitationId: string; invitationData: Omit<ContactRequest, 'id'> }> {
    try {
      // Normalize email to lowercase for consistent querying
      const normalizedToEmail = toEmail.toLowerCase();
      console.log(`📧 Creating invitation for ${normalizedToEmail} (original: ${toEmail}) from ${fromUserId}`);
      
      // Get sender's profile
      const fromUserProfile = await getUserProfile(fromUserId);
      if (!fromUserProfile) {
        throw new Error('Sender profile not found');
      }

      // Check if invitation already exists (using normalized email)
      const constraints: QueryConstraint[] = [
        { type: 'where', field: 'fromUserId', operator: '==', value: fromUserId },
        { type: 'where', field: 'toEmail', operator: '==', value: normalizedToEmail },
        { type: 'where', field: 'status', operator: '==', value: 'pending' }
      ];
      
      const existingInvitations = await backendService.query.getPath(this.CONTACT_REQUESTS_COLLECTION, constraints);
      if (existingInvitations.length > 0) {
        throw new Error('Invitation already sent to this email');
      }

      // Create invitation with normalized email (expiration will be set by Cloud Function)
      const invitation: Omit<ContactRequest, 'id'> = {
        fromUserId,
        fromUserEmail: fromUserProfile.email,
        fromUserDisplayName: fromUserProfile.displayName,
        toEmail: normalizedToEmail,
        isInvitation: true, // Mark as invitation to non-registered user
        status: 'pending',
        createdAt: backendService.utils.serverTimestamp(),
        // expiresAt will be set by Cloud Function
        ...(message && { message }),
        ...(triggerEvent && { triggerEvent })
      };

      const invitationId = await backendService.documents.add(this.CONTACT_REQUESTS_COLLECTION, invitation);

      console.log(`📧 Invitation created for ${normalizedToEmail} from ${fromUserId}`);
      
      // Return invitation data for client-side mailto link
      const result = {
        invitationId,
        invitationData: invitation
      };
      
      console.log('📧 Returning invitation result:', result);
      return result;
    } catch (error) {
      console.error('Error sending user invitation:', error);
      throw error;
    }
  }

  /**
   * Get invitations sent by the current user
   */
  static async getSentInvitations(userId: string): Promise<UserInvitation[]> {
    try {
      const constraints: QueryConstraint[] = [
        { type: 'where', field: 'fromUserId', operator: '==', value: userId },
        { type: 'orderBy', field: 'createdAt', direction: 'desc' }
      ];
      
      const invitations = await backendService.query.getPath(this.CONTACT_REQUESTS_COLLECTION, constraints);
      return invitations as UserInvitation[];
    } catch (error) {
      console.error('Error fetching sent invitations:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time updates for sent invitations
   */
  static subscribeToSentInvitations(
    userId: string,
    callback: (invitations: UserInvitation[]) => void
  ): () => void {
    console.log(`📧 Setting up real-time subscription for invitations from user: ${userId}`);
    
    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'fromUserId', operator: '==', value: userId },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' }
    ];

    return backendService.query.subscribePath(this.CONTACT_REQUESTS_COLLECTION, constraints, (data) => {
      console.log(`📧 Invitations snapshot received: ${data.length} invitations`);
      callback(data as UserInvitation[]);
    });
  }

  /**
   * Cancel/delete a pending invitation
   */
  static async cancelInvitation(invitationId: string): Promise<void> {
    try {
      const invitation = await backendService.documents.get(this.CONTACT_REQUESTS_COLLECTION, invitationId) as UserInvitation;
      
      if (!invitation) {
        throw new Error('Invitation not found');
      }
      
      // Only allow canceling pending invitations
      if (invitation.status !== 'pending') {
        throw new Error(`Cannot cancel invitation with status: ${invitation.status}`);
      }
      
      await backendService.documents.delete(this.CONTACT_REQUESTS_COLLECTION, invitationId);
      console.log(`🗑️ Invitation ${invitationId} cancelled`);
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      throw error;
    }
  }

  /**
   * Resend invitation email — deletes the old document and creates a new one
   * so the onContactRequestCreated Cloud Function fires again and sends the email.
   */
  static async resendInvitation(invitationId: string): Promise<string> {
    try {
      const invitation = await backendService.documents.get(this.CONTACT_REQUESTS_COLLECTION, invitationId) as UserInvitation;

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw new Error(`Cannot resend invitation with status: ${invitation.status}`);
      }

      // Delete the old document first
      await backendService.documents.delete(this.CONTACT_REQUESTS_COLLECTION, invitationId);

      // Recreate with a fresh timestamp so the Cloud Function fires again
      const newInvitation: Omit<ContactRequest, 'id'> = {
        fromUserId: invitation.fromUserId,
        fromUserEmail: invitation.fromUserEmail,
        fromUserDisplayName: invitation.fromUserDisplayName,
        toEmail: invitation.toEmail,
        isInvitation: true,
        status: 'pending',
        createdAt: backendService.utils.serverTimestamp(),
        ...(invitation.message && { message: invitation.message }),
        ...(invitation.triggerEvent && { triggerEvent: invitation.triggerEvent }),
      };

      const newInvitationId = await backendService.documents.add(this.CONTACT_REQUESTS_COLLECTION, newInvitation);
      console.log(`📧 Invitation resent — new ID: ${newInvitationId} (replaced ${invitationId})`);
      return newInvitationId;
    } catch (error) {
      console.error('Error resending invitation:', error);
      throw error;
    }
  }

  /**
   * Generate mailto link for invitation
   */
  static generateInvitationMailtoLink(
    invitationId: string,
    invitation: Omit<UserInvitation, 'id'>,
    baseUrl: string = import.meta.env.VITE_APP_URL || window.location.origin
  ): string {
    const inviteLink = `${baseUrl}/signup?invite=${invitationId}`;
    
    const subject = encodeURIComponent(`${invitation.fromUserDisplayName} invited you to SeraVault`);
    
    const body = encodeURIComponent(`Hi there!

${invitation.fromUserDisplayName} (${invitation.fromUserEmail}) has invited you to connect on SeraVault, a secure file sharing platform with end-to-end encryption.

${invitation.message ? `Personal message: "${invitation.message}"` : ''}

To accept this invitation and create your account, click the link below:
${inviteLink}

SeraVault Features:
• End-to-end encrypted file storage and sharing
• Secure contact management 
• Zero-knowledge architecture - even we can't see your files

This invitation will expire in 30 days.

Best regards,
${invitation.fromUserDisplayName}

---
This invitation was sent through SeraVault. If you don't want to receive these invitations, please contact the sender directly.`);

    return `mailto:${invitation.toEmail}?subject=${subject}&body=${body}`;
  }

  /**
   * Subscribe to incoming invitations for an email address
   */
  static subscribeToIncomingInvitations(
    email: string,
    callback: (invitations: UserInvitation[]) => void
  ): () => void {
    const normalizedEmail = email.toLowerCase();
    console.warn(`🔍 [INVITATION SUB] Subscribing to invitations for email: "${normalizedEmail}" (original: "${email}")`);
    
    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'toEmail', operator: '==', value: normalizedEmail },
      { type: 'where', field: 'status', operator: '==', value: 'pending' },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' }
    ];

    return backendService.query.subscribePath(this.CONTACT_REQUESTS_COLLECTION, constraints, (data) => {
      console.warn(`📨 [INVITATION SUB] Snapshot SUCCESS for "${normalizedEmail}": ${data.length} docs`);
      callback(data as UserInvitation[]);
    });
  }

  /**
   * Accept an invitation
   */
  static async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    try {
      await backendService.documents.update(this.CONTACT_REQUESTS_COLLECTION, invitationId, {
        status: 'accepted',
        acceptedAt: backendService.utils.serverTimestamp(),
        acceptedByUserId: userId
      });
      console.log(`✅ Invitation ${invitationId} accepted by user ${userId}`);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      throw error;
    }
  }

  /**
   * Respond to a contact request (accept/decline)
   */
  static async respondToContactRequest(requestId: string, status: 'accepted' | 'declined'): Promise<void> {
    try {
      await backendService.documents.update(this.CONTACT_REQUESTS_COLLECTION, requestId, {
        status,
        respondedAt: backendService.utils.serverTimestamp()
      });
      console.log(`✅ Contact request ${requestId} ${status}`);
    } catch (error) {
      console.error(`Error responding to contact request ${requestId}:`, error);
      throw error;
    }
  }
}