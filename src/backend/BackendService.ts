/**
 * Centralized backend service for Seravault
 * This is the main interface that components should use for all backend operations
 * Easily swappable for different backend implementations
 */

import type { BackendInterface, User } from './BackendInterface';
import { backend as currentBackend } from '@backend-provider';

// This is where you can easily swap backends
// Configuration is now handled via VITE_BACKEND_TYPE env var and vite.config.ts aliases
// const currentBackend: BackendInterface = firebaseBackend;

// ============================================================================
// CENTRALIZED BACKEND SERVICE
// ============================================================================

export class BackendService {
  private backend: BackendInterface;

  constructor(backend: BackendInterface) {
    this.backend = backend;
  }

  // ============================================================================
  // AUTHENTICATION SERVICES
  // ============================================================================

  auth = {
    getAuthInstance: () => this.backend.getAuthInstance(),
    getCurrentUser: () => this.backend.getCurrentUser(),
    signIn: (email: string, password: string) => this.backend.signInWithEmailAndPassword(email, password),
    signUp: (email: string, password: string) => this.backend.createUserWithEmailAndPassword(email, password),
    signInWithGoogle: () => this.backend.signInWithGoogle(),
    linkWithGoogle: () => this.backend.linkWithGoogle(),
    signInWithOAuth: (providerId: string) => this.backend.signInWithOAuth(providerId),
    linkWithOAuth: (providerId: string) => this.backend.linkWithOAuth(providerId),
    createRecaptchaVerifier: (containerOrId: HTMLElement | string, parameters?: any) => this.backend.createRecaptchaVerifier(containerOrId, parameters),
    signInWithPhoneNumber: (phoneNumber: string, appVerifier: any) => this.backend.signInWithPhoneNumber(phoneNumber, appVerifier),
    linkWithPhoneNumber: (phoneNumber: string, appVerifier: any) => this.backend.linkWithPhoneNumber(phoneNumber, appVerifier),
    verifyPhoneCode: (confirmationResult: any, code: string) => this.backend.verifyPhoneCode(confirmationResult, code),
    sendPasswordResetEmail: (email: string) => this.backend.sendPasswordResetEmail(email),
    sendEmailVerification: (language?: string) => this.backend.sendEmailVerification(language),
    updatePassword: (currentPassword: string, newPassword: string) => this.backend.updatePassword(currentPassword, newPassword),
    updateEmail: (currentPassword: string, newEmail: string) => this.backend.updateEmail(currentPassword, newEmail),
    linkEmailPassword: (email: string, password: string) => this.backend.linkEmailPassword(email, password),
    unlinkProvider: (providerId: string) => this.backend.unlinkProvider(providerId),
    getLinkedProviders: () => this.backend.getLinkedProviders(),
    refreshAuthToken: () => this.backend.refreshAuthToken(),
    reloadUser: () => this.backend.reloadUser(),
    signOut: () => this.backend.signOut(),
    deleteAccount: () => this.backend.deleteCurrentAccount(),
    onAuthStateChanged: (callback: (user: User | null) => void) => this.backend.onAuthStateChanged(callback),
  };

  // ============================================================================
  // USER PROFILE SERVICES
  // ============================================================================

  users = {
    get: (userId: string) => this.backend.getUserProfile(userId),
    update: (userId: string, data: any) => this.backend.updateUserProfile(userId, data),
    create: (profile: any) => this.backend.createUserProfile(profile),
  };

  // ============================================================================
  // FILE SERVICES
  // ============================================================================

  files = {
    create: (file: any) => this.backend.createFile(file),
    get: (fileId: string, forceServerFetch?: boolean) => this.backend.getFile(fileId, forceServerFetch),
    update: (fileId: string, data: any) => this.backend.updateFile(fileId, data),
    delete: (fileId: string) => this.backend.deleteFile(fileId),
    getUserFiles: (userId: string) => this.backend.getUserFiles(userId),
    getSharedFiles: (userId: string) => this.backend.getSharedFiles(userId),
    getFilesInFolder: (userId: string, folderId: string | null) => this.backend.getFilesInFolder(userId, folderId),
    subscribe: (userId: string, folderId: string | null, callback: (files: any[]) => void) =>
      this.backend.subscribeToUserFiles(userId, folderId, callback),
    subscribeAll: (userId: string, callback: (files: any[]) => void) =>
      this.backend.subscribeToAllUserFiles(userId, callback),
  };

  // ============================================================================
  // FOLDER SERVICES
  // ============================================================================

  folders = {
    create: (folder: any) => this.backend.createFolder(folder),
    get: (folderId: string) => this.backend.getFolder(folderId),
    update: (folderId: string, data: any) => this.backend.updateFolder(folderId, data),
    delete: (folderId: string) => this.backend.deleteFolder(folderId),
    getUserFolders: (userId: string) => this.backend.getUserFolders(userId),
    subscribe: (userId: string, callback: (folders: any[]) => void) =>
      this.backend.subscribeToUserFolders(userId, callback),
  };

  // ============================================================================
  // STORAGE SERVICES
  // ============================================================================

  storage = {
    upload: (path: string, data: Uint8Array, metadata?: any) => this.backend.uploadFile(path, data, metadata),
    download: (path: string) => this.backend.downloadFile(path),
    getDownloadURL: (path: string) => this.backend.getFileDownloadURL(path),
    delete: (path: string) => this.backend.deleteStorageFile(path),
    list: (path: string) => this.backend.listStorageFiles(path),
  };

  // ============================================================================
  // CONTACT SERVICES
  // ============================================================================

  contacts = {
    get: (contactId: string) => this.backend.getContact(contactId),
    create: (contact: any) => this.backend.createContact(contact),
    update: (contactId: string, data: any) => this.backend.updateContact(contactId, data),
    delete: (contactId: string) => this.backend.deleteContact(contactId),
    getUserContacts: (userId: string) => this.backend.getUserContacts(userId),
  };

  contactRequests = {
    create: (request: any) => this.backend.createContactRequest(request),
    get: (requestId: string) => this.backend.getContactRequest(requestId),
    update: (requestId: string, data: any) => this.backend.updateContactRequest(requestId, data),
    delete: (requestId: string) => this.backend.deleteContactRequest(requestId),
    getUserRequests: (userId: string) => this.backend.getUserContactRequests(userId),
  };

  // ============================================================================
  // ADVANCED QUERY SERVICES
  // ============================================================================

  query = {
    get: (collection: string, constraints: any[]) => this.backend.query(collection, constraints),
    subscribe: (collection: string, constraints: any[], callback: (data: any[]) => void) =>
      this.backend.subscribeToQuery(collection, constraints, callback),
    
    /**
     * Query documents with support for subcollections
     * @param path - Collection path (e.g., 'users' or 'customers/uid/subscriptions')
     * @param constraints - Query constraints
     */
    getPath: (path: string, constraints: any[]) => this.backend.queryPath(path, constraints),
    
    /**
     * Subscribe to query with support for subcollections
     * @param path - Collection path (e.g., 'users' or 'customers/uid/subscriptions')
     * @param constraints - Query constraints
     * @param callback - Function to call when data changes
     */
    subscribePath: (path: string, constraints: any[], callback: (data: any[]) => void) =>
      this.backend.subscribeToQueryPath(path, constraints, callback),
  };

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  batch = {
    update: (operations: any[]) => this.backend.batchUpdate(operations),
    set: (operations: any[]) => this.backend.batchSet(operations),
    delete: (operations: any[]) => this.backend.batchDelete(operations),
  };

  // ============================================================================
  // CLOUD FUNCTIONS
  // ============================================================================

  functions = {
    /**
     * Call a cloud function
     * @param name - Function name
     * @param data - Data to send to function
     * @returns Promise with function result
     */
    call: <TRequest = unknown, TResponse = unknown>(name: string, data?: TRequest) =>
      this.backend.callFunction<TRequest, TResponse>(name, data),
  };

  // ============================================================================
  // MESSAGING / PUSH NOTIFICATIONS
  // ============================================================================

  messaging = {
    /**
     * Get the device's push notification token
     */
    getToken: () => this.backend.getMessagingToken(),

    /**
     * Subscribe to incoming messages
     * @param callback - Function to call when message received
     * @returns Unsubscribe function
     */
    onMessage: (callback: (payload: unknown) => void) =>
      this.backend.onMessageReceived(callback),

    /**
     * Request notification permission from user
     * @returns Permission status
     */
    requestPermission: () => this.backend.requestNotificationPermission(),

    /**
     * Delete the current messaging token
     */
    deleteToken: () => this.backend.deleteMessagingToken(),
  };

  // ============================================================================
  // REALTIME UPDATES
  // ============================================================================

  realtime = {
    /**
     * Subscribe to a single document's changes
     * @param collection - Collection name
     * @param documentId - Document ID
     * @param callback - Function to call when document changes
     * @returns Unsubscribe function
     */
    subscribeToDocument: (collection: string, documentId: string, callback: (data: unknown | null) => void) =>
      this.backend.subscribeToDocument(collection, documentId, callback),

    /**
     * Subscribe to a document using a full path (supports subcollections)
     * @param path - Full document path (e.g., 'customers/uid/checkout_sessions/sessionId')
     * @param callback - Function to call when document changes
     * @returns Unsubscribe function
     */
    subscribeToDocumentPath: (path: string, callback: (data: unknown | null) => void) =>
      this.backend.subscribeToDocumentPath(path, callback),
  };

  // ============================================================================
  // DOCUMENT OPERATIONS
  // ============================================================================

  documents = {
    /**
     * Get a single document
     * @param collection - Collection name
     * @param documentId - Document ID
     */
    get: (collection: string, documentId: string) => this.backend.getDocument(collection, documentId),

    /**
     * Set/create a document
     * @param collection - Collection name
     * @param documentId - Document ID
     * @param data - Document data
     * @param options - Options like merge
     */
    set: (collection: string, documentId: string, data: any, options?: { merge?: boolean }) =>
      this.backend.setDocument(collection, documentId, data, options),

    /**
     * Add a document with auto-generated ID
     * @param collection - Collection name
     * @param data - Document data
     * @returns Promise with generated ID
     */
    add: (collection: string, data: any) => this.backend.addDocument(collection, data),
    addPath: (path: string, data: any) => this.backend.addDocumentPath(path, data),

    /**
     * Update document fields
     * @param collection - Collection name
     * @param documentId - Document ID
     * @param data - Fields to update
     */
    update: (collection: string, documentId: string, data: Partial<any>) =>
      this.backend.updateDocument(collection, documentId, data),

    /**
     * Delete a document
     * @param collection - Collection name
     * @param documentId - Document ID
     */
    delete: (collection: string, documentId: string) => this.backend.deleteDocument(collection, documentId),
  };

  // ============================================================================
  // UTILITY HELPERS
  // ============================================================================

  utils = {
    /**
     * Get a server timestamp value for consistent timestamps
     */
    serverTimestamp: () => this.backend.getServerTimestamp(),

    /**
     * Create a field value to add elements to an array
     */
    arrayUnion: (...elements: unknown[]) => this.backend.arrayUnion(...elements),

    /**
     * Create a field value to remove elements from an array
     */
    arrayRemove: (...elements: unknown[]) => this.backend.arrayRemove(...elements),

    /**
     * Create a field value to increment a number
     */
    increment: (n: number) => this.backend.increment(n),

    /**
     * Create a field value to delete a field
     */
    deleteField: () => this.backend.deleteField(),
  };

  // ============================================================================
  // BACKEND SWITCHING
  // ============================================================================

  /**
   * Switch to a different backend implementation
   * Example: backendService.switchBackend(supabaseBackend);
   */
  switchBackend(newBackend: BackendInterface): void {
    this.backend = newBackend;
    console.log('🔄 Backend switched successfully');
  }

  /**
   * Get the current backend type for debugging
   */
  getCurrentBackendType(): string {
    return this.backend.constructor.name;
  }
}

// Export singleton instance
export const backendService = new BackendService(currentBackend);

// For debugging - expose backend info
if (typeof window !== 'undefined') {
  (window as any).backendService = backendService;
}

// Export types for components to use
export type {
  BackendInterface,
  User,
  UserProfile,
  FileRecord,
  FolderRecord,
  ContactRecord,
  ContactRequest,
} from './BackendInterface';
