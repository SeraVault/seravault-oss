/**
 * Firebase Helper Functions
 * 
 * This file provides convenient wrappers around backendService for components
 * that haven't been fully migrated yet. It serves as a compatibility layer
 * that allows gradual migration to the backend abstraction.
 * 
 * MIGRATION NOTE: Eventually all direct imports from this file should be
 * replaced with backendService calls. This file will be removed once
 * migration to Supabase or other backend is complete.
 */

import { backendService } from './BackendService';

// ============================================================================
// FIREBASE-SPECIFIC TYPE RE-EXPORTS
// These types are specific to Firebase and may not exist in other backends
// ============================================================================

export type { FieldValue, Timestamp } from 'firebase/firestore';
export type { User as FirebaseUser } from 'firebase/auth';

// ============================================================================
// UTILITY HELPERS - WRAPPER AROUND BACKEND SERVICE
// ============================================================================

/**
 * Get a server timestamp value
 * Compatible with Firebase's serverTimestamp()
 */
export const serverTimestamp = () => backendService.utils.serverTimestamp();

/**
 * Create a field value to add elements to an array
 * Compatible with Firebase's arrayUnion()
 */
export const arrayUnion = (...elements: unknown[]) => backendService.utils.arrayUnion(...elements);

/**
 * Create a field value to remove elements from an array
 * Compatible with Firebase's arrayRemove()
 */
export const arrayRemove = (...elements: unknown[]) => backendService.utils.arrayRemove(...elements);

/**
 * Create a field value to increment a number
 * Compatible with Firebase's increment()
 */
export const increment = (n: number) => backendService.utils.increment(n);

/**
 * Create a field value to delete a field
 * Compatible with Firebase's deleteField()
 */
export const deleteField = () => backendService.utils.deleteField();

// ============================================================================
// CLOUD FUNCTIONS HELPERS
// ============================================================================

/**
 * Call a cloud function
 * @param functionName - Name of the function to call
 * @param data - Data to pass to the function
 * @returns Promise with the function result
 * 
 * @example
 * const result = await callFunction<{ userId: string }, { success: boolean }>
 *   ('myFunction', { userId: '123' });
 */
export const callFunction = <TRequest = unknown, TResponse = unknown>(
  functionName: string,
  data?: TRequest
): Promise<TResponse> => {
  return backendService.functions.call<TRequest, TResponse>(functionName, data);
};

// ============================================================================
// MESSAGING HELPERS
// ============================================================================

/**
 * Get the device's FCM token
 */
export const getMessagingToken = () => backendService.messaging.getToken();

/**
 * Subscribe to incoming messages
 */
export const onMessageReceived = (callback: (payload: unknown) => void) =>
  backendService.messaging.onMessage(callback);

/**
 * Request notification permission
 */
export const requestNotificationPermission = () =>
  backendService.messaging.requestPermission();

// ============================================================================
// FIRESTORE/DATABASE HELPERS
// ============================================================================

/**
 * Subscribe to a document's realtime changes
 * @param collection - Collection name
 * @param documentId - Document ID
 * @param callback - Callback function when document changes
 * @returns Unsubscribe function
 */
export const subscribeToDocument = (
  collection: string,
  documentId: string,
  callback: (data: unknown | null) => void
) => backendService.realtime.subscribeToDocument(collection, documentId, callback);

/**
 * Subscribe to query results
 * @param collection - Collection name
 * @param constraints - Query constraints
 * @param callback - Callback function when results change
 * @returns Unsubscribe function
 */
export const subscribeToQuery = (
  collection: string,
  constraints: unknown[],
  callback: (data: unknown[]) => void
) => backendService.query.subscribe(collection, constraints, callback);

// ============================================================================
// LEGACY COMPATIBILITY NOTES
// ============================================================================

/*
 * MIGRATION CHECKLIST:
 * 
 * When migrating a component from direct Firebase imports to this helper:
 * 
 * 1. Replace Firebase imports:
 *    BEFORE: import { httpsCallable } from 'firebase/functions';
 *    AFTER:  import { callFunction } from '../backend/FirebaseHelpers';
 * 
 * 2. Replace Firebase instances:
 *    BEFORE: import { functions } from '../firebase';
 *    AFTER:  (use callFunction directly)
 * 
 * 3. Replace function calls:
 *    BEFORE: const fn = httpsCallable(functions, 'myFunction');
 *            const result = await fn(data);
 *    AFTER:  const result = await callFunction('myFunction', data);
 * 
 * 4. Replace serverTimestamp:
 *    BEFORE: import { serverTimestamp } from 'firebase/firestore';
 *    AFTER:  import { serverTimestamp } from '../backend/FirebaseHelpers';
 * 
 * 5. Test thoroughly!
 * 
 * Once all components use these helpers (not direct Firebase imports),
 * we can then migrate to backendService directly, which will make
 * switching to Supabase trivial.
 */
