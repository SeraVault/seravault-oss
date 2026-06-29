import { AUTH_CONFIG } from '../constants/authConfig';

const { password: pwdCfg, passphrase: ppCfg, strengthMeter } = AUTH_CONFIG;

/**
 * Calculates password/passphrase strength (0–100).
 * Driven by authConfig — change thresholds there, not here.
 */
export const calculatePasswordStrength = (password: string): number => {
  if (!password) return 0;
  let strength = 0;
  if (password.length >= strengthMeter.tier1Length) strength += 25;
  if (password.length >= strengthMeter.tier2Length) strength += 25;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
  if (/\d/.test(password) && /[^a-zA-Z\d]/.test(password)) strength += 25;
  return strength;
};

export const getStrengthColor = (strength: number): 'error' | 'warning' | 'info' | 'success' => {
  if (strength <= 25) return 'error';
  if (strength <= 50) return 'warning';
  if (strength <= 75) return 'info';
  return 'success';
};

export const getStrengthLabel = (strength: number): string => {
  if (strength <= 25) return 'Weak';
  if (strength <= 50) return 'Fair';
  if (strength <= 75) return 'Good';
  return 'Strong';
};

/**
 * Validates login password complexity (signup / password change).
 * Rules driven by AUTH_CONFIG.password.
 */
export const validatePasswordComplexity = (password: string): string[] => {
  const errors: string[] = [];
  if (password.length < pwdCfg.minLength)
    errors.push(`Password must be at least ${pwdCfg.minLength} characters long`);
  if (pwdCfg.requireUppercase && !/[A-Z]/.test(password))
    errors.push('Password must contain at least one uppercase letter');
  if (pwdCfg.requireLowercase && !/[a-z]/.test(password))
    errors.push('Password must contain at least one lowercase letter');
  if (pwdCfg.requireNumber && !/\d/.test(password))
    errors.push('Password must contain at least one number');
  if (pwdCfg.requireSpecial && !/[^a-zA-Z\d]/.test(password))
    errors.push('Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)');
  return errors;
};

/**
 * Validates encryption passphrase complexity.
 * Rules driven by AUTH_CONFIG.passphrase.
 */
export const validatePassphraseComplexity = (passphrase: string): string[] => {
  const errors: string[] = [];
  if (passphrase.length < ppCfg.minLength)
    errors.push(`Passphrase must be at least ${ppCfg.minLength} characters long`);
  if (ppCfg.requireUppercase && !/[A-Z]/.test(passphrase))
    errors.push('Passphrase must contain at least one uppercase letter');
  if (ppCfg.requireLowercase && !/[a-z]/.test(passphrase))
    errors.push('Passphrase must contain at least one lowercase letter');
  if (ppCfg.requireNumber && !/\d/.test(passphrase))
    errors.push('Passphrase must contain at least one number');
  if (ppCfg.requireSpecial && !/[^a-zA-Z\d]/.test(passphrase))
    errors.push('Passphrase must contain at least one special character (!@#$%^&*(),.?":{}|<>)');
  return errors;
};
