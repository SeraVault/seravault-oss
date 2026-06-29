/**
 * Centralized storage keys for localStorage and sessionStorage
 *
 * Using constants prevents typos and makes refactoring easier.
 * All storage keys used throughout the application should be defined here.
 */

export const STORAGE_KEYS = {
  // Authentication & Setup
  PENDING_INVITATION: 'pendingInvitation',
  SIGNUP_PASSWORD: 'signupPassword',

  // UI State - File Table
  FILE_TABLE_SORT_FIELD: 'fileTable.sortField',
  FILE_TABLE_SORT_DIRECTION: 'fileTable.sortDirection',

  // Cache Keys - Functions that return user-specific keys
  recentItems: (userId: string) => `seravault_recent_items_${userId}`,
  storageUsage: (userId: string) => `simple_storage_usage_${userId}`,
} as const;

// Type helpers for TypeScript autocompletion
export type StorageKey = typeof STORAGE_KEYS[keyof Omit<typeof STORAGE_KEYS, 'recentItems' | 'storageUsage'>];
