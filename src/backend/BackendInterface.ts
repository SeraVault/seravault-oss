/**
 * Backend abstraction layer for Seravault
 * This interface defines all backend operations to allow easy swapping of Firebase with other backends
 */

// ============================================================================
// DATA TYPES
// ============================================================================

export interface UserProviderData {
  providerId: string;
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber?: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
  providerData?: UserProviderData[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  publicKey?: string;
  encryptedPrivateKey?: { ciphertext: string; salt: string; nonce: string };
  createdAt?: any;
  lastModified?: any;
  keyVersion?: number;
  theme: 'light' | 'dark';
  language?: string;
  termsAcceptedAt?: string; // ISO timestamp when user accepted terms
  
  // Storage and Quota
  storageUsed?: number;
  storageUpdatedAt?: any;

  // UI Preferences
  columnVisibility?: {
    type: boolean;
    size: boolean;
    shared: boolean;
    created: boolean;
    modified: boolean;
    owner: boolean;
  };
  showPrintWarning?: boolean;
  
  // Recents
  recentItems?: Array<{
    id: string;
    type: 'file' | 'form';
    parent: string | null;
    accessedAt: string;
  }>;
  
  // Biometric unlock (cross-device via Firestore)
  // Ciphertext encrypted with WebAuthn PRF output — useless without a biometric challenge
  biometricKey?: {
    encryptedKey: string; // hex AES-256-GCM ciphertext
    iv: string;           // hex 12-byte IV
    version: 'prf-v2';
    credentialId: string; // WebAuthn credential ID hint (not a secret)
  } | null;
  // prf-v3: per-credential map so multiple keys (fingerprint + YubiKey) can coexist
  biometricKeys?: Record<string, {
    encryptedKey: string;
    iv: string;
    version: string;
  }> | null;

  // Legacy or other fields
  emailVerified?: boolean;
  emailVerifiedAt?: any;

  // Biometric setup prompt dismissal — per-device.
  // Keyed by a stable client-generated device ID (stored in localStorage on each device).
  // This way, dismissing on a desktop doesn't suppress the prompt on a new phone
  // where biometrics actually work well.
  biometricPromptDismissedDevices?: Record<string, {
    dismissed?: boolean;       // permanent
    snoozedUntil?: number;     // epoch ms
    updatedAt?: number;        // epoch ms — for housekeeping
  }>;
}

export interface FileRecord {
  id?: string;
  owner: string;
  name: { ciphertext: string; nonce: string } | string;
  size: { ciphertext: string; nonce: string } | string;
  storagePath: string;
  encryptedKeys: { [uid: string]: string };
  sharedWith: string[];
  parent?: string | null;
  createdAt: any;
  lastModified: any;
  userFavorites?: { [uid: string]: boolean };
  userFolders?: { [uid: string]: string };
  userTags?: { [uid: string]: { ciphertext: string; nonce: string } };
  userNames?: { [uid: string]: { ciphertext: string; nonce: string } };
}

export interface FolderRecord {
  id?: string;
  owner: string;
  name: { ciphertext: string; nonce: string } | string;
  parent?: string | null;
  encryptedKeys?: { [uid: string]: string };
  createdAt: any;
  lastModified: any;
}

export interface ContactRecord {
  id?: string;
  userId1: string;
  userId2: string;
  user1Email: string;
  user2Email: string;
  user1DisplayName: string;
  user2DisplayName: string;
  status: 'pending' | 'accepted' | 'blocked';
  initiatorUserId: string;
  createdAt: any;
  lastInteractionAt: any;
  acceptedAt?: any;
  blockedAt?: any;
  blockedByUserId?: string;
  metadata?: any;
}

export interface ContactRequest {
  id?: string;
  fromUserId: string;
  fromUserEmail: string;
  fromUserDisplayName: string;
  toUserId?: string;
  toUserDisplayName?: string;
  toEmail: string; // Email address of recipient (normalized to lowercase)
  isInvitation?: boolean; // True if sent to non-registered user
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  message?: string;
  createdAt: any;
  respondedAt?: any;
  acceptedAt?: any;
  acceptedByUserId?: string; // Who accepted the invitation (for invitations)
  expiresAt?: any; // When the invitation expires (set by Cloud Function)
  triggerEvent?: {
    type: 'file_share_attempt';
    fileId: string;
    fileName?: string;
  };
}

export interface QueryConstraint {
  type?: 'where' | 'orderBy' | 'limit' | 'startAfter';
  field?: string;
  operator?: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any';
  value?: any;
  direction?: 'asc' | 'desc';
  limitValue?: number;
  startAfter?: any; // Document snapshot or field values for pagination
}

export interface StorageFile {
  data: Uint8Array;
  metadata?: {
    contentType?: string;
    customMetadata?: { [key: string]: string };
  };
}

// ============================================================================
// BACKEND INTERFACE
// ============================================================================

export interface BackendInterface {
  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  getAuthInstance(): any; // Returns the raw auth instance (Firebase Auth, etc.)
  getCurrentUser(): User | null;
  signInWithEmailAndPassword(email: string, password: string): Promise<User>;
  createUserWithEmailAndPassword(email: string, password: string): Promise<User>;
  signInWithGoogle(): Promise<User>;
  linkWithGoogle(): Promise<User>;
  signInWithOAuth(providerId: string): Promise<User>;
  linkWithOAuth(providerId: string): Promise<User>;
  createRecaptchaVerifier(containerOrId: HTMLElement | string, parameters?: any): any;
  signInWithPhoneNumber(phoneNumber: string, appVerifier: any): Promise<any>;
  linkWithPhoneNumber(phoneNumber: string, appVerifier: any): Promise<any>;
  verifyPhoneCode(confirmationResult: any, code: string): Promise<User>;
  sendPasswordResetEmail(email: string): Promise<void>;
  sendEmailVerification(language?: string): Promise<void>;
  updatePassword(currentPassword: string, newPassword: string): Promise<void>;
  updateEmail(currentPassword: string, newEmail: string): Promise<void>;
  linkEmailPassword(email: string, password: string): Promise<void>;
  unlinkProvider(providerId: string): Promise<void>;
  getLinkedProviders(): string[];
  refreshAuthToken(): Promise<void>;
  reloadUser(): Promise<void>;
  signOut(): Promise<void>;
  deleteCurrentAccount(): Promise<void>;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;

  // ============================================================================
  // USER PROFILES
  // ============================================================================

  getUserProfile(userId: string): Promise<UserProfile | null>;
  updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void>;
  createUserProfile(profile: UserProfile): Promise<void>;

  // ============================================================================
  // FILES
  // ============================================================================

  // File CRUD operations
  createFile(file: Omit<FileRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string>;
  getFile(fileId: string, forceServerFetch?: boolean): Promise<FileRecord | null>;
  updateFile(fileId: string, data: Partial<FileRecord>): Promise<void>;
  deleteFile(fileId: string): Promise<void>;

  // File queries
  getUserFiles(userId: string): Promise<FileRecord[]>;
  getSharedFiles(userId: string): Promise<FileRecord[]>;
  getFilesInFolder(userId: string, folderId: string | null): Promise<FileRecord[]>;

  // Real-time subscriptions
  subscribeToUserFiles(userId: string, folderId: string | null, callback: (files: FileRecord[]) => void): () => void;
  subscribeToAllUserFiles(userId: string, callback: (files: FileRecord[]) => void): () => void;

  // ============================================================================
  // FOLDERS
  // ============================================================================

  createFolder(folder: Omit<FolderRecord, 'id' | 'createdAt' | 'lastModified'>): Promise<string>;
  getFolder(folderId: string): Promise<FolderRecord | null>;
  updateFolder(folderId: string, data: Partial<FolderRecord>): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  getUserFolders(userId: string): Promise<FolderRecord[]>;
  subscribeToUserFolders(userId: string, callback: (folders: FolderRecord[]) => void): () => void;

  // ============================================================================
  // STORAGE
  // ============================================================================

  uploadFile(path: string, data: Uint8Array, metadata?: any): Promise<void>;
  downloadFile(path: string): Promise<Uint8Array>;
  getFileDownloadURL(path: string): Promise<string>;
  deleteStorageFile(path: string): Promise<void>;
  listStorageFiles(path: string): Promise<{ items: string[]; prefixes: string[] }>;

  // ============================================================================
  // CONTACTS
  // ============================================================================

  getContact(contactId: string): Promise<ContactRecord | null>;
  createContact(contact: Omit<ContactRecord, 'id' | 'createdAt' | 'lastInteractionAt'>): Promise<string>;
  updateContact(contactId: string, data: Partial<ContactRecord>): Promise<void>;
  deleteContact(contactId: string): Promise<void>;
  getUserContacts(userId: string): Promise<ContactRecord[]>;

  // Contact requests
  createContactRequest(request: Omit<ContactRequest, 'id' | 'createdAt'>): Promise<string>;
  getContactRequest(requestId: string): Promise<ContactRequest | null>;
  updateContactRequest(requestId: string, data: Partial<ContactRequest>): Promise<void>;
  deleteContactRequest(requestId: string): Promise<void>;
  getUserContactRequests(userId: string): Promise<ContactRequest[]>;

  // ============================================================================
  // ADVANCED QUERIES
  // ============================================================================

  query(collection: string, constraints: QueryConstraint[]): Promise<any[]>;
  subscribeToQuery(collection: string, constraints: QueryConstraint[], callback: (data: any[]) => void): () => void;

  /**
   * Query documents with support for subcollections and nested paths
   * @param path - Collection path (e.g., 'users' or 'customers/uid/subscriptions')
   * @param constraints - Query constraints (where, orderBy, limit)
   * @returns Promise with array of documents
   */
  queryPath(path: string, constraints: QueryConstraint[]): Promise<any[]>;

  /**
   * Subscribe to query with support for subcollections and nested paths
   * @param path - Collection path (e.g., 'users' or 'customers/uid/subscriptions')
   * @param constraints - Query constraints (where, orderBy, limit)
   * @param callback - Function to call when data changes
   * @returns Unsubscribe function
   */
  subscribeToQueryPath(path: string, constraints: QueryConstraint[], callback: (data: any[]) => void): () => void;

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  batchUpdate(operations: Array<{
    collection: string;
    id: string;
    data: Partial<any>;
  }>): Promise<void>;

  batchSet(operations: Array<{
    collection: string;
    id: string;
    data: any;
  }>): Promise<void>;

  batchDelete(operations: Array<{
    collection: string;
    id: string;
  }>): Promise<void>;

  // ============================================================================
  // CLOUD FUNCTIONS
  // ============================================================================

  /**
   * Call a backend cloud function
   * @param functionName - Name of the function to call
   * @param data - Data to pass to the function
   * @returns Promise with the function result
   */
  callFunction<TRequest = any, TResponse = any>(
    functionName: string,
    data?: TRequest
  ): Promise<TResponse>;

  // ============================================================================
  // MESSAGING / PUSH NOTIFICATIONS
  // ============================================================================

  /**
   * Get the device's FCM/push notification token
   * @returns Promise with the token, or null if not available
   */
  getMessagingToken(): Promise<string | null>;

  /**
   * Subscribe to incoming messages
   * @param callback - Function to call when a message is received
   * @returns Unsubscribe function
   */
  onMessageReceived(callback: (payload: any) => void): () => void;

  /**
   * Request notification permission from the user
   * @returns Promise with permission status ('granted', 'denied', 'default')
   */
  requestNotificationPermission(): Promise<string>;

  /**
   * Delete the current messaging token (unregister)
   */
  deleteMessagingToken(): Promise<void>;

  // ============================================================================
  // REALTIME UPDATES
  // ============================================================================

  /**
   * Subscribe to a single document's changes
   * @param collection - Collection name
   * @param documentId - Document ID
   * @param callback - Function to call when document changes
   * @returns Unsubscribe function
   */
  subscribeToDocument(
    collection: string,
    documentId: string,
    callback: (data: any | null) => void
  ): () => void;

  /**
   * Subscribe to a document using a full path (supports subcollections)
   * @param path - Full document path (e.g., 'customers/uid/checkout_sessions/sessionId')
   * @param callback - Function to call when document changes
   * @returns Unsubscribe function
   */
  subscribeToDocumentPath(
    path: string,
    callback: (data: any | null) => void
  ): () => void;

  // ============================================================================
  // DOCUMENT OPERATIONS
  // ============================================================================

  /**
   * Get a single document from a collection
   * @param collection - Collection name
   * @param documentId - Document ID
   * @returns Promise with document data or null
   */
  getDocument(collection: string, documentId: string): Promise<any | null>;

  /**
   * Set/create a document in a collection
   * @param collection - Collection name
   * @param documentId - Document ID
   * @param data - Document data
   * @param options - Options like merge
   */
  setDocument(collection: string, documentId: string, data: any, options?: { merge?: boolean }): Promise<void>;

  /**
   * Add a document to a collection (auto-generated ID)
   * @param collection - Collection name
   * @param data - Document data
   * @returns Promise with the generated document ID
   */
  addDocument(collection: string, data: any): Promise<string>;
  addDocumentPath(path: string, data: any): Promise<string>;

  /**
   * Update fields in a document
   * @param collection - Collection name
   * @param documentId - Document ID
   * @param data - Fields to update
   */
  updateDocument(collection: string, documentId: string, data: Partial<any>): Promise<void>;

  /**
   * Delete a document from a collection
   * @param collection - Collection name
   * @param documentId - Document ID
   */
  deleteDocument(collection: string, documentId: string): Promise<void>;

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get a server-side timestamp value
   * Used for consistent timestamps across clients
   * @returns Server timestamp value (type depends on backend)
   */
  getServerTimestamp(): any;

  /**
   * Get a field value for array union operations
   * @param elements - Elements to add to array
   */
  arrayUnion(...elements: any[]): any;

  /**
   * Get a field value for array remove operations
   * @param elements - Elements to remove from array
   */
  arrayRemove(...elements: any[]): any;

  /**
   * Get a field value to increment a number
   * @param n - Amount to increment by
   */
  increment(n: number): any;

  /**
   * Get a field value to delete a field
   */
  deleteField(): any;
}
