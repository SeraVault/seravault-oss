/**
 * Cache Logger Utility
 *
 * Provides console logging that only shows in development mode.
 * Production builds will suppress these informational logs.
 */

const isDevelopment = import.meta.env?.DEV ?? process.env.NODE_ENV === 'development';

export const cacheLogger = {
  /**
   * Log informational cache messages (only in development)
   */
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log cache warnings (always shown)
   */
  warn: (...args: any[]) => {
    console.warn(...args);
  },

  /**
   * Log cache errors (always shown)
   */
  error: (...args: any[]) => {
    console.error(...args);
  },

  /**
   * Check if we're in development mode
   */
  isDevelopment: () => isDevelopment,
};
