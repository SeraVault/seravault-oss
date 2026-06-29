/**
 * Supabase implementation of the Backend interface
 * This can be swapped with Firebase or other backend implementations
 */

import { createClient, SupabaseClient, AuthError } from '@supabase/supabase-js';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type {
  BackendInterface,
  User,
  UserProfile,
  FileRecord,
  FolderRecord,
  ContactRecord,
  ContactRequest,
  QueryConstraint,
} from './BackendInterface';

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

console.log('✅ Supabase initialized');

// Temporary exports for legacy services that haven't been migrated yet
export { supabase as legacySupabase };

export class SupabaseBackend implements BackendInterface {
  private client: SupabaseClient;

  constructor() {
    this.client = supabase;
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  getAuthInstance(): any {
    return this.client.auth;
  }

  getCurrentUser(): User | null {
    // Note: getSession() is synchronous in Supabase v2
    const session = this.client.auth.getSession();
    // We need to handle this synchronously - get from cached session
    const cachedSession = (this.client.auth as any)._currentSession;
    const supabaseUser = cachedSession?.user;

    if (!supabaseUser) return null;

    return this.convertSupabaseUser(supabaseUser);
  }

  private convertSupabaseUser(supabaseUser: SupabaseUser): User {
    return {
      uid: supabaseUser.id,
      email: supabaseUser.email || null,
      displayName: supabaseUser.user_metadata?.display_name || supabaseUser.user_metadata?.full_name || null,
      phoneNumber: supabaseUser.phone || null,
      photoURL: supabaseUser.user_metadata?.avatar_url || null,
      emailVerified: supabaseUser.email_confirmed_at !== null,
    };
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<User> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error('No user returned from sign in');

    return this.convertSupabaseUser(data.user);
  }

  async createUserWithEmailAndPassword(email: string, password: string): Promise<User> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/verify-email`,
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error('No user returned from sign up');

    return this.convertSupabaseUser(data.user);
  }

  async signInWithGoogle(): Promise<User> {
    await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/setup`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    // OAuth redirects away — this never resolves (same contract as Firebase)
    return new Promise(() => {});
  }

  async linkWithGoogle(): Promise<User> {
    const { error } = await this.client.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/profile` },
    });
    if (error) throw error;
    return new Promise(() => {}); // redirect flow
  }

  async signInWithOAuth(providerId: string): Promise<User> {
    const provider = this._mapProviderId(providerId);
    await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/setup` },
    });
    return new Promise(() => {});
  }

  async linkWithOAuth(providerId: string): Promise<User> {
    const provider = this._mapProviderId(providerId);
    const { error } = await this.client.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/profile` },
    });
    if (error) throw error;
    return new Promise(() => {});
  }

  private _mapProviderId(firebaseProviderId: string): any {
    const map: Record<string, string> = {
      'google.com': 'google',
      'github.com': 'github',
      'facebook.com': 'facebook',
      'twitter.com': 'twitter',
      'apple.com': 'apple',
      'microsoft.com': 'azure',
    };
    return map[firebaseProviderId] ?? firebaseProviderId.replace('.com', '');
  }

  createRecaptchaVerifier(_containerOrId: HTMLElement | string, _parameters?: any): any {
    // Supabase uses built-in bot protection — no reCAPTCHA verifier needed.
    // Return a no-op stub so callers that check for its existence don't crash.
    return { clear: () => {}, render: () => Promise.resolve(0) };
  }

  async signInWithPhoneNumber(phoneNumber: string, appVerifier: any): Promise<any> {
    // Supabase uses OTP for phone authentication
    const { data, error } = await this.client.auth.signInWithOtp({
      phone: phoneNumber,
    });

    if (error) throw error;

    // Return a confirmation object similar to Firebase
    return {
      confirm: async (code: string) => {
        return await this.verifyPhoneCode({ phone: phoneNumber }, code);
      },
    };
  }

  async linkWithPhoneNumber(phoneNumber: string, appVerifier: any): Promise<any> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('No user signed in');

    // In Supabase, we update the user's phone number
    const { data, error } = await this.client.auth.updateUser({
      phone: phoneNumber,
    });

    if (error) throw error;

    // Return a confirmation object
    return {
      confirm: async (code: string) => {
        return await this.verifyPhoneCode({ phone: phoneNumber }, code);
      },
    };
  }

  async verifyPhoneCode(confirmationResult: any, code: string): Promise<User> {
    const { data, error } = await this.client.auth.verifyOtp({
      phone: confirmationResult.phone,
      token: code,
      type: 'sms',
    });

    if (error) throw error;
    if (!data.user) throw new Error('No user returned from phone verification');

    return this.convertSupabaseUser(data.user);
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  }

  async sendEmailVerification(language?: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user || !user.email) {
      throw new Error('No user signed in or email not available');
    }

    // Get current session for authentication
    const { data: { session } } = await this.client.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Call our custom Edge Function for email verification
    const { data, error } = await this.client.functions.invoke('send-email-verification', {
      body: {
        userId: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        language: language || 'en',
      },
    });

    if (error) {
      console.error('Error calling send-email-verification:', error);
      throw new Error(error.message || 'Failed to send verification email');
    }

    if (!data?.success) {
      throw new Error(data?.message || 'Failed to send verification email');
    }
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    // Supabase requires re-authentication before password update
    const user = this.getCurrentUser();
    if (!user || !user.email) {
      throw new Error('No authenticated user found');
    }

    // Re-authenticate first
    const { error: signInError } = await this.client.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) throw signInError;

    // Update password
    const { error } = await this.client.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  }

  async updateEmail(currentPassword: string, newEmail: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user || !user.email) {
      throw new Error('No authenticated user found');
    }

    // Re-authenticate first
    const { error: signInError } = await this.client.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) throw signInError;

    // Update email (will send verification to new email)
    const { error } = await this.client.auth.updateUser({
      email: newEmail,
    });

    if (error) throw error;
  }

  async linkEmailPassword(email: string, password: string): Promise<void> {
    // Supabase doesn't have a direct equivalent to Firebase's linkWithCredential
    // Instead, we update the user's email if they signed in with OAuth
    const { error } = await this.client.auth.updateUser({
      email: email,
      password: password,
    });

    if (error) throw error;
  }

  async unlinkProvider(providerId: string): Promise<void> {
    const { data: { user }, error: userError } = await this.client.auth.getUser();
    if (userError || !user) throw new Error('No authenticated user found');

    const identities = user.identities ?? [];
    if (identities.length <= 1) {
      throw new Error('Cannot remove the only authentication method. Add another method first.');
    }

    const supabaseProvider = this._mapProviderId(providerId);
    const identity = identities.find(i => i.provider === supabaseProvider);
    if (!identity) throw new Error(`Provider ${providerId} not linked to this account`);

    const { error } = await this.client.auth.unlinkIdentity(identity);
    if (error) throw error;
  }

  getLinkedProviders(): string[] {
    const cachedSession = (this.client.auth as any)._currentSession;
    const user = cachedSession?.user;

    if (!user) return [];

    // Extract providers from user metadata and identities
    const providers: string[] = [];

    if (user.app_metadata?.provider) {
      providers.push(user.app_metadata.provider);
    }

    if (user.identities) {
      user.identities.forEach((identity) => {
        if (identity.provider && !providers.includes(identity.provider)) {
          providers.push(identity.provider);
        }
      });
    }

    return providers;
  }

  async reloadUser(): Promise<void> {
    const { error } = await this.client.auth.getUser();
    if (error) throw error;
    // User data is automatically refreshed
  }

  async refreshAuthToken(): Promise<void> {
    const { error } = await this.client.auth.refreshSession();
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async deleteCurrentAccount(): Promise<void> {
    const { data: { user } } = await this.client.auth.getUser();
    if (!user) throw new Error('No user signed in');

    // Call the edge function that handles full account deletion
    // (removes user data from all tables, storage, then deletes the auth user)
    const { error } = await this.client.functions.invoke('delete-user-account', {
      body: { userId: user.id },
    });
    if (error) throw error;
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    const { data: { subscription } } = this.client.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        callback(this.convertSupabaseUser(session.user));
      } else {
        callback(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }

  // ============================================================================
  // USER PROFILES
  // ============================================================================

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    // Check if user is authenticated
    const { data: { session } } = await this.client.auth.getSession();
    if (!session) {
      console.warn('Attempting to get user profile without authentication');
      return null;
    }

    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('uid', userId)
      .maybeSingle(); // Use maybeSingle() instead of single() - doesn't throw on not found

    if (error) {
      console.error('getUserProfile error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId
      });

      // Don't throw on 406 - it means the user doesn't have permission or doesn't exist
      if (error.code === 'PGRST116' || error.code === '406') {
        return null;
      }

      throw error;
    }

    return data as UserProfile | null;
  }

  async updateUserProfile(userId: string, profileData: Partial<UserProfile>): Promise<void> {
    const { error } = await this.client
      .from('users')
      .update({
        ...profileData,
        last_modified: new Date().toISOString(),
      })
      .eq('uid', userId);

    if (error) throw error;
  }

  async createUserProfile(profile: UserProfile): Promise<void> {
    const { error } = await this.client
      .from('users')
      .insert({
        ...profile,
        created_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
      });

    if (error) throw error;
  }

  // ============================================================================
  // FILES
  // ============================================================================

  async createFile(file: Omit<FileRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string> {
    const { data, error } = await this.client
      .from('files')
      .insert({
        ...file,
        created_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async getFile(fileId: string, _forceServerFetch?: boolean): Promise<FileRecord | null> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as FileRecord;
  }

  async updateFile(fileId: string, fileData: Partial<FileRecord>): Promise<void> {
    const { error } = await this.client
      .from('files')
      .update({
        ...fileData,
        last_modified: new Date().toISOString(),
      })
      .eq('id', fileId);

    if (error) throw error;
  }

  async deleteFile(fileId: string): Promise<void> {
    const { error } = await this.client
      .from('files')
      .delete()
      .eq('id', fileId);

    if (error) throw error;
  }

  async getUserFiles(userId: string): Promise<FileRecord[]> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .eq('owner', userId);

    if (error) {
      console.warn('Error fetching user files:', error);
      return [];
    }

    return (data || []) as FileRecord[];
  }

  async getSharedFiles(userId: string): Promise<FileRecord[]> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .contains('shared_with', [userId]);

    if (error) {
      console.warn('Error fetching shared files:', error);
      return [];
    }

    return (data || []) as FileRecord[];
  }

  async getFilesInFolder(userId: string, folderId: string | null): Promise<FileRecord[]> {
    let query = this.client
      .from('files')
      .select('*')
      .contains('shared_with', [userId]);

    if (folderId) {
      query = query.eq('parent', folderId);
    } else {
      query = query.is('parent', null);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []) as FileRecord[];
  }

  subscribeToUserFiles(userId: string, folderId: string | null, callback: (files: FileRecord[]) => void): () => void {
    // Create a combined subscription for both owned and shared files
    const fetchAndNotify = async () => {
      try {
        // Fetch both owned and shared files
        const [ownedFiles, sharedFiles] = await Promise.all([
          this.getUserFiles(userId),
          this.getSharedFiles(userId),
        ]);

        // Merge and deduplicate
        const allFilesMap = new Map<string, FileRecord>();
        [...ownedFiles, ...sharedFiles].forEach(file => {
          if (file.id) {
            allFilesMap.set(file.id, file);
          }
        });

        // Filter by folder
        const filteredFiles = Array.from(allFilesMap.values()).filter((file) => {
          const userFolder = file.userFolders?.[userId];
          const fileFolder = userFolder !== undefined ? userFolder : file.parent;
          return fileFolder === folderId;
        });

        callback(filteredFiles);
      } catch (error) {
        console.error('Error in real-time subscription:', error);
      }
    };

    // Initial fetch
    fetchAndNotify();

    // Subscribe to changes
    const subscription = this.client
      .channel('files-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'files',
          filter: `owner=eq.${userId}`,
        },
        () => {
          fetchAndNotify();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'files',
          filter: `shared_with=cs.{${userId}}`,
        },
        () => {
          fetchAndNotify();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  subscribeToAllUserFiles(userId: string, callback: (files: FileRecord[]) => void): () => void {
    const fetchAndNotify = async () => {
      try {
        const [ownedFiles, sharedFiles] = await Promise.all([
          this.getUserFiles(userId),
          this.getSharedFiles(userId),
        ]);
        const allFilesMap = new Map<string, FileRecord>();
        [...ownedFiles, ...sharedFiles].forEach(file => {
          if (file.id) allFilesMap.set(file.id, file);
        });
        callback(Array.from(allFilesMap.values()));
      } catch (error) {
        console.error('Error in subscribeToAllUserFiles:', error);
      }
    };

    fetchAndNotify();

    const subscription = this.client
      .channel(`all-files-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files', filter: `owner=eq.${userId}` }, () => fetchAndNotify())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files', filter: `shared_with=cs.{${userId}}` }, () => fetchAndNotify())
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }

  // ============================================================================
  // FOLDERS
  // ============================================================================

  async createFolder(folder: Omit<FolderRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string> {
    const { data, error } = await this.client
      .from('folders')
      .insert({
        ...folder,
        created_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async getFolder(folderId: string): Promise<FolderRecord | null> {
    const { data, error } = await this.client
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as FolderRecord;
  }

  async updateFolder(folderId: string, folderData: Partial<FolderRecord>): Promise<void> {
    const { error } = await this.client
      .from('folders')
      .update({
        ...folderData,
        last_modified: new Date().toISOString(),
      })
      .eq('id', folderId);

    if (error) throw error;
  }

  async deleteFolder(folderId: string): Promise<void> {
    const { error } = await this.client
      .from('folders')
      .delete()
      .eq('id', folderId);

    if (error) throw error;
  }

  async getUserFolders(userId: string): Promise<FolderRecord[]> {
    const { data, error } = await this.client
      .from('folders')
      .select('*')
      .eq('owner', userId);

    if (error) throw error;

    return (data || []) as FolderRecord[];
  }

  subscribeToUserFolders(userId: string, callback: (folders: FolderRecord[]) => void): () => void {
    const fetchAndNotify = async () => {
      const folders = await this.getUserFolders(userId);
      callback(folders);
    };

    // Initial fetch
    fetchAndNotify();

    // Subscribe to changes
    const subscription = this.client
      .channel('folders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'folders',
          filter: `owner=eq.${userId}`,
        },
        () => {
          fetchAndNotify();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  // ============================================================================
  // STORAGE
  // ============================================================================

  async uploadFile(path: string, data: Uint8Array, metadata?: any): Promise<void> {
    const { error } = await this.client.storage
      .from('files')
      .upload(path, data, {
        contentType: metadata?.contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (error) throw error;
  }

  async downloadFile(path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage
      .from('files')
      .download(path);

    if (error) throw error;

    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async getFileDownloadURL(path: string): Promise<string> {
    const { data } = this.client.storage
      .from('files')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async deleteStorageFile(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from('files')
      .remove([path]);

    if (error) throw error;
  }

  async listStorageFiles(path: string): Promise<{ items: string[]; prefixes: string[] }> {
    const parts = path.split('/');
    const bucket = parts[0];
    const prefix = parts.slice(1).join('/');

    const { data, error } = await this.client.storage
      .from(bucket || 'files')
      .list(prefix || undefined);

    if (error) throw error;

    const items: string[] = [];
    const prefixes: string[] = [];
    for (const entry of data ?? []) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        items.push(fullPath);
      } else {
        prefixes.push(fullPath);
      }
    }
    return { items, prefixes };
  }

  async getContact(contactId: string): Promise<ContactRecord | null> {
    const { data, error } = await this.client
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as ContactRecord;
  }

  async createContact(contact: Omit<ContactRecord, 'id' | 'createdAt' | 'lastInteractionAt'>): Promise<string> {
    const { data, error } = await this.client
      .from('contacts')
      .insert({
        ...contact,
        created_at: new Date().toISOString(),
        last_interaction_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async updateContact(contactId: string, contactData: Partial<ContactRecord>): Promise<void> {
    const { error } = await this.client
      .from('contacts')
      .update({
        ...contactData,
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    if (error) throw error;
  }

  async deleteContact(contactId: string): Promise<void> {
    const { error } = await this.client
      .from('contacts')
      .delete()
      .eq('id', contactId);

    if (error) throw error;
  }

  async getUserContacts(userId: string): Promise<ContactRecord[]> {
    const { data, error } = await this.client
      .from('contacts')
      .select('*')
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

    if (error) throw error;

    return (data || []) as ContactRecord[];
  }

  // Contact requests
  async createContactRequest(request: Omit<ContactRequest, 'id' | 'createdAt'>): Promise<string> {
    const { data, error } = await this.client
      .from('contact_requests')
      .insert({
        ...request,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async getContactRequest(requestId: string): Promise<ContactRequest | null> {
    const { data, error } = await this.client
      .from('contact_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as ContactRequest;
  }

  async updateContactRequest(requestId: string, requestData: Partial<ContactRequest>): Promise<void> {
    const { error } = await this.client
      .from('contact_requests')
      .update(requestData)
      .eq('id', requestId);

    if (error) throw error;
  }

  async deleteContactRequest(requestId: string): Promise<void> {
    const { error } = await this.client
      .from('contact_requests')
      .delete()
      .eq('id', requestId);

    if (error) throw error;
  }

  async getUserContactRequests(userId: string): Promise<ContactRequest[]> {
    const { data, error } = await this.client
      .from('contact_requests')
      .select('*')
      .eq('to_user_id', userId);

    if (error) throw error;

    return (data || []) as ContactRequest[];
  }

  // ============================================================================
  // ADVANCED QUERIES
  // ============================================================================

  async query(collection: string, constraints: QueryConstraint[]): Promise<any[]> {
    let query: any = this.client.from(collection).select('*');

    for (const constraint of constraints) {
      query = this.applyConstraint(query, constraint);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  }

  subscribeToQuery(collection: string, constraints: QueryConstraint[], callback: (data: any[]) => void): () => void {
    const fetchAndNotify = async () => {
      const data = await this.query(collection, constraints);
      callback(data);
    };

    // Initial fetch
    fetchAndNotify();

    // Subscribe to changes
    const subscription = this.client
      .channel(`${collection}-query`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: collection,
        },
        () => {
          fetchAndNotify();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  async queryPath(path: string, constraints: QueryConstraint[]): Promise<any[]> {
    // Handle nested paths from Firebase (e.g., 'customers/uid/subscriptions')
    // Convert to Supabase flat table structure
    const segments = path.split('/');

    if (segments.length === 3 && segments[0] === 'customers' && segments[2] === 'subscriptions') {
      // Firebase Stripe path: customers/{uid}/subscriptions
      // In Supabase, this is in the 'payment.subscriptions' schema with a customer_id column
      const customerId = segments[1];

      // Query the payment schema using schema() method
      let query = this.client
        .schema('payment')
        .from('subscriptions')
        .select('*')
        .eq('customer_id', customerId);

      // Apply any additional constraints
      for (const constraint of constraints) {
        query = this.applyConstraint(query, constraint);
      }

      const { data, error } = await query;

      if (error) {
        console.error('subscriptions query error:', error);
        // Return empty array for not found errors
        if (error.code === 'PGRST116' || error.code === 'PGRST204' || error.code === 'PGRST205') {
          return [];
        }
        throw error;
      }

      return data || [];
    }

    if (segments.length === 3 && segments[0] === 'customers' && segments[2] === 'checkout_sessions') {
      // Firebase Stripe path: customers/{uid}/checkout_sessions
      // In Supabase, this is in the 'payment.checkout_sessions' schema
      const customerId = segments[1];

      let query = this.client
        .schema('payment')
        .from('checkout_sessions')
        .select('*')
        .eq('customer_id', customerId);

      for (const constraint of constraints) {
        query = this.applyConstraint(query, constraint);
      }

      const { data, error } = await query;

      if (error) {
        console.error('checkout_sessions query error:', error);
        if (error.code === 'PGRST116' || error.code === 'PGRST204' || error.code === 'PGRST205') {
          return [];
        }
        throw error;
      }

      return data || [];
    }

    // For other paths, treat the last segment as the table name
    // This is a fallback - might need more specific handling
    const tableName = segments[segments.length - 1];
    return this.query(tableName, constraints);
  }

  subscribeToQueryPath(path: string, constraints: QueryConstraint[], callback: (data: any[]) => void): () => void {
    // Handle nested paths from Firebase (e.g., 'customers/uid/subscriptions')
    const segments = path.split('/');

    if (segments.length === 3 && segments[0] === 'customers' && segments[2] === 'subscriptions') {
      const customerId = segments[1];
      const customerConstraint: QueryConstraint = {
        type: 'where',
        field: 'customer_id',
        operator: '==',
        value: customerId,
      };
      return this.subscribeToQuery('payment.subscriptions', [customerConstraint, ...constraints], callback);
    }

    if (segments.length === 3 && segments[0] === 'customers' && segments[2] === 'checkout_sessions') {
      const customerId = segments[1];
      const customerConstraint: QueryConstraint = {
        type: 'where',
        field: 'customer_id',
        operator: '==',
        value: customerId,
      };
      return this.subscribeToQuery('payment.checkout_sessions', [customerConstraint, ...constraints], callback);
    }

    const tableName = segments[segments.length - 1];
    return this.subscribeToQuery(tableName, constraints, callback);
  }

  private applyConstraint(query: any, constraint: QueryConstraint): any {
    switch (constraint.type) {
      case 'where':
        return this.applyWhereConstraint(query, constraint);
      case 'orderBy':
        return query.order(constraint.field!, {
          ascending: constraint.direction === 'asc',
        });
      case 'limit':
        return query.limit(constraint.limitValue!);
      case 'startAfter':
        // Implement pagination using range
        if (constraint.startAfter) {
          // This would need to be customized based on your pagination strategy
          console.warn('startAfter pagination not fully implemented');
        }
        return query;
      default:
        return query;
    }
  }

  private applyWhereConstraint(query: any, constraint: QueryConstraint): any {
    const { field, operator, value } = constraint;

    switch (operator) {
      case '==':
        return query.eq(field!, value);
      case '!=':
        return query.neq(field!, value);
      case '<':
        return query.lt(field!, value);
      case '<=':
        return query.lte(field!, value);
      case '>':
        return query.gt(field!, value);
      case '>=':
        return query.gte(field!, value);
      case 'array-contains':
        return query.contains(field!, [value]);
      case 'in':
        return query.in(field!, value);
      case 'not-in':
        return query.not(field!, 'in', `(${value.join(',')})`);
      case 'array-contains-any':
        return query.overlaps(field!, value);
      default:
        console.warn(`Unsupported operator: ${operator}`);
        return query;
    }
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  async batchUpdate(operations: Array<{ collection: string; id: string; data: Partial<any> }>): Promise<void> {
    await Promise.all(
      operations.map(op =>
        this.client
          .from(op.collection)
          .update(op.data)
          .eq('id', op.id)
      )
    );
  }

  async batchSet(operations: Array<{ collection: string; id: string; data: any }>): Promise<void> {
    await Promise.all(
      operations.map(op =>
        this.client
          .from(op.collection)
          .upsert({ id: op.id, ...op.data })
      )
    );
  }

  async batchDelete(operations: Array<{ collection: string; id: string }>): Promise<void> {
    await Promise.all(
      operations.map(op =>
        this.client
          .from(op.collection)
          .delete()
          .eq('id', op.id)
      )
    );
  }

  // ============================================================================
  // CLOUD FUNCTIONS
  // ============================================================================

  async callFunction<TRequest = any, TResponse = any>(
    functionName: string,
    data?: TRequest
  ): Promise<TResponse> {
    const { data: result, error } = await this.client.functions.invoke(functionName, {
      body: data,
    });

    if (error) throw error;

    return result as TResponse;
  }

  // ============================================================================
  // MESSAGING / PUSH NOTIFICATIONS
  // ============================================================================

  async getMessagingToken(): Promise<string | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return JSON.stringify(existing);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? import.meta.env.VITE_FIREBASE_VAPID_KEY,
      });
      return JSON.stringify(sub);
    } catch {
      return null;
    }
  }

  onMessageReceived(callback: (payload: any) => void): () => void {
    if (!('serviceWorker' in navigator)) return () => {};
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'push-notification') callback(event.data.payload);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }

  async requestNotificationPermission(): Promise<string> {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
  }

  async deleteMessagingToken(): Promise<void> {
    // Unregister any push service worker subscription so future pushes stop
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        }
      } catch {
        // Best-effort — non-fatal if SW is not available
      }
    }
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  async getUserNotifications(userId: string, limitCount: number = 50): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('notifications')
        .select('*')
        .eq('recipientId', userId)
        .order('createdAt', { ascending: false })
        .limit(limitCount);

      if (error) {
        console.error('getUserNotifications error:', error);
        if (error.code === 'PGRST116' || error.code === '406') {
          return [];
        }
        throw error;
      }

      console.log(`📬 Retrieved ${data?.length || 0} notifications for user: ${userId}`);
      return data || [];
    } catch (error) {
      console.error('❌ Error fetching user notifications:', error);
      throw error;
    }
  }

  subscribeToUserNotifications(
    userId: string,
    callback: (notifications: any[]) => void,
    limitCount: number = 100
  ): () => void {
    console.log(`🔔 Setting up notification subscription for user: ${userId}`);

    try {
      // Initial fetch
      const fetchInitial = async () => {
        const { data, error } = await this.client
          .from('notifications')
          .select('*')
          .eq('recipientId', userId)
          .eq('isRead', false)
          .order('createdAt', { ascending: false })
          .limit(limitCount);

        if (error) {
          console.error('Initial fetch error:', error);
          callback([]);
          return;
        }

        console.log(`📬 Initial fetch: ${data?.length || 0} unread notifications`);
        callback(data || []);
      };

      fetchInitial();

      // Subscribe to realtime changes
      const subscription = this.client
        .channel(`notifications-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipientId=eq.${userId}`,
          },
          async (payload) => {
            console.log('📬 Notification change:', payload);

            // Refetch all unread notifications
            const { data, error } = await this.client
              .from('notifications')
              .select('*')
              .eq('recipientId', userId)
              .eq('isRead', false)
              .order('createdAt', { ascending: false })
              .limit(limitCount);

            if (error) {
              console.error('Refetch error:', error);
              return;
            }

            callback(data || []);
          }
        )
        .subscribe((status) => {
          console.log(`🔔 Notification subscription status: ${status}`);
        });

      console.log('✅ Notification subscription set up successfully');

      return () => {
        console.log('🔕 Unsubscribing from notifications');
        this.client.removeChannel(subscription);
      };
    } catch (error) {
      console.error('❌ Error setting up notification subscription:', error);
      return () => {};
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    console.log(`🔄 Marking notification as read: ${notificationId}`);

    try {
      const { error } = await this.client
        .from('notifications')
        .update({
          isRead: true,
          readAt: new Date().toISOString(),
        })
        .eq('id', notificationId);

      if (error) {
        console.error('markNotificationAsRead error:', error);
        throw error;
      }

      console.log(`✅ Notification ${notificationId} marked as read`);
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    try {
      const { data, error } = await this.client
        .from('notifications')
        .update({
          isRead: true,
          readAt: new Date().toISOString(),
        })
        .eq('recipientId', userId)
        .eq('isRead', false)
        .select();

      if (error) {
        console.error('markAllNotificationsAsRead error:', error);
        throw error;
      }

      const count = data?.length || 0;
      console.log(`✅ Marked ${count} notifications as read for user: ${userId}`);
      return count;
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      const { count, error } = await this.client
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipientId', userId)
        .eq('isRead', false);

      if (error) {
        console.error('getUnreadNotificationCount error:', error);
        throw error;
      }

      console.log(`📊 Unread notifications for user ${userId}: ${count || 0}`);
      return count || 0;
    } catch (error) {
      console.error('❌ Error fetching unread notification count:', error);
      throw error;
    }
  }

  // ============================================================================
  // REALTIME UPDATES
  // ============================================================================

  subscribeToDocument(
    collection: string,
    documentId: string,
    callback: (data: any | null) => void
  ): () => void {
    const fetchAndNotify = async () => {
      const { data, error } = await this.client
        .from(collection)
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) {
        callback(null);
        return;
      }

      callback(data);
    };

    // Initial fetch
    fetchAndNotify();

    // Subscribe to changes
    const subscription = this.client
      .channel(`${collection}-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: collection,
          filter: `id=eq.${documentId}`,
        },
        () => {
          fetchAndNotify();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  subscribeToDocumentPath(
    path: string,
    callback: (data: any | null) => void
  ): () => void {
    // Extract collection and document ID from path
    const parts = path.split('/');
    if (parts.length < 2) {
      throw new Error(`Invalid document path: ${path}`);
    }

    const collection = parts[parts.length - 2];
    const documentId = parts[parts.length - 1];

    return this.subscribeToDocument(collection, documentId, callback);
  }

  // ============================================================================
  // DOCUMENT OPERATIONS
  // ============================================================================

  async getDocument(collection: string, documentId: string): Promise<any | null> {
    // Special case: users table uses 'uid' as primary key instead of 'id'
    const idField = collection === 'users' ? 'uid' : 'id';

    const { data, error } = await this.client
      .from(collection)
      .select('*')
      .eq(idField, documentId)
      .maybeSingle(); // Use maybeSingle() to avoid throwing on not found

    if (error) {
      console.error(`getDocument error for ${collection}/${documentId}:`, error);
      // Return null for common error codes instead of throwing
      if (error.code === 'PGRST116' || error.code === '406') return null;
      throw error;
    }

    return data;
  }

  async setDocument(collection: string, documentId: string, data: any, options?: { merge?: boolean }): Promise<void> {
    if (options?.merge) {
      // Upsert with merge
      const { error } = await this.client
        .from(collection)
        .upsert({ id: documentId, ...data });

      if (error) throw error;
    } else {
      // Replace
      const { error } = await this.client
        .from(collection)
        .insert({ id: documentId, ...data });

      if (error) throw error;
    }
  }

  async addDocument(collection: string, data: any): Promise<string> {
    const { data: result, error } = await this.client
      .from(collection)
      .insert(data)
      .select('id')
      .single();

    if (error) throw error;

    return result.id;
  }

  async addDocumentPath(path: string, data: any): Promise<string> {
    // Firebase paths like 'customers/uid/checkout_sessions' — use last segment as table
    const segments = path.split('/');
    const tableName = segments[segments.length - 1];
    return this.addDocument(tableName, data);
  }

  async updateDocument(collection: string, documentId: string, data: Partial<any>): Promise<void> {
    const { error } = await this.client
      .from(collection)
      .update(data)
      .eq('id', documentId);

    if (error) throw error;
  }

  async deleteDocument(collection: string, documentId: string): Promise<void> {
    const { error } = await this.client
      .from(collection)
      .delete()
      .eq('id', documentId);

    if (error) throw error;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  getServerTimestamp(): any {
    return new Date().toISOString();
  }

  arrayUnion(...elements: any[]): any {
    // Supabase uses PostgreSQL array operations
    // This would need to be handled differently in the query
    return elements;
  }

  arrayRemove(...elements: any[]): any {
    // Supabase uses PostgreSQL array operations
    return elements;
  }

  increment(n: number): any {
    // In Supabase, you would use: .update({ field: db.raw('field + 1') })
    // For now, return the increment value
    return n;
  }

  deleteField(): any {
    // In Supabase, set to null or use .update({ field: null })
    return null;
  }
}

// Export singleton instance
export const supabaseBackend = new SupabaseBackend();
export const backend = supabaseBackend;
