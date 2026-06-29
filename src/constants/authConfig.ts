/**
 * Authentication & security configuration.
 * Change values here to update requirements across the entire app.
 */

/**
 * OAuth providers to show in the Sign-in Methods section.
 * Each entry must match a provider enabled in the Firebase Console.
 *
 * Driven by VITE_OAUTH_PROVIDERS env var (comma-separated provider IDs).
 * Defaults to google.com if the var is not set.
 *
 * Supported values: google.com, github.com, microsoft.com, apple.com,
 *                   facebook.com, twitter.com, yahoo.com
 *
 * Example .env:
 *   VITE_OAUTH_PROVIDERS=google.com,github.com,microsoft.com
 */
export interface OAuthProviderConfig {
  providerId: string;
  label: string;
  icon: string; // key used to render the right icon in the UI
}

const PROVIDER_DEFAULTS: Record<string, Omit<OAuthProviderConfig, 'providerId'>> = {
  'google.com':    { label: 'Google',    icon: 'google' },
  'github.com':    { label: 'GitHub',    icon: 'github' },
  'microsoft.com': { label: 'Microsoft', icon: 'microsoft' },
  'apple.com':     { label: 'Apple',     icon: 'apple' },
  'facebook.com':  { label: 'Facebook',  icon: 'facebook' },
  'twitter.com':   { label: 'Twitter / X', icon: 'twitter' },
  'yahoo.com':     { label: 'Yahoo',     icon: 'yahoo' },
};

function parseEnabledOAuthProviders(): OAuthProviderConfig[] {
  const raw = import.meta.env.VITE_OAUTH_PROVIDERS as string | undefined;
  const ids = raw
    ? raw.split(',').map(s => s.trim()).filter(Boolean)
    : ['google.com'];
  return ids
    .filter(id => PROVIDER_DEFAULTS[id])
    .map(id => ({ providerId: id, ...PROVIDER_DEFAULTS[id] }));
}

export const ENABLED_OAUTH_PROVIDERS: OAuthProviderConfig[] = parseEnabledOAuthProviders();

export const AUTH_CONFIG = {
  /**
   * Login password requirements (used at signup / password change).
   * These are for the Firebase Auth password, not the encryption passphrase.
   */
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
  },

  /**
   * Encryption passphrase requirements.
   * The passphrase encrypts the user's private key — intentionally simpler
   * than the login password so non-technical users can manage it.
   */
  passphrase: {
    minLength: 10,
    requireUppercase: false,
    requireLowercase: false,
    requireNumber: false,
    requireSpecial: false,
  },

  /**
   * Thresholds used by the password strength meter (0–100 score).
   * Each tier adds 25 points when met.
   */
  strengthMeter: {
    tier1Length: 8,   // first length tier
    tier2Length: 12,  // second length tier (adds another 25 pts)
  },
} as const;
