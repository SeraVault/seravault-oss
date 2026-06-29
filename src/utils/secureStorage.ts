/**
 * Secure storage for sensitive data with automatic idle timeout.
 *
 * Persistence model:
 *  - In-memory (Map)  — primary, zero disk footprint
 *  - sessionStorage   — survives page refreshes within the same tab;
 *                       cleared automatically when the tab is closed
 *
 * The sessionStorage entries use the "svk_" prefix and are distinct from the
 * old "privateKey*" entries written by a previous version of this module.
 */

import { secureWipe } from '../crypto/quantumSafeCrypto';

interface SecureStorageItem {
  data: Uint8Array;
  timestamp: number;
  lastActivity: number;
  timeoutId: NodeJS.Timeout;
  activityTimeout: number; // minutes
}

class SecureMemoryStorage {
  private storage = new Map<string, SecureStorageItem>();
  private activityListeners: (() => void)[] = [];
  private timeoutCallbacks = new Map<string, (() => void)[]>();

  constructor() {
    if (typeof window !== 'undefined') {
      // Purge legacy entries written by an older version of this module
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith('privateKey')) toRemove.push(k);
        }
        toRemove.forEach(k => sessionStorage.removeItem(k));
      } catch { /* ignore */ }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.reduceTimeouts();
        } else {
          this.updateActivity();
        }
      });

      const activityHandler = () => this.updateActivity();
      ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
        document.addEventListener(evt, activityHandler, { passive: true });
      });
    }
  }

  // ── sessionStorage helpers ──────────────────────────────────────────────────

  private static ssDataKey(key: string)  { return `svk_${key}`; }
  private static ssExpKey(key: string)   { return `svk_exp_${key}`; }
  private static ssMinsKey(key: string)  { return `svk_mins_${key}`; }

  private ssWrite(key: string, data: string, timeoutMinutes: number): void {
    try {
      const expiresAt = Date.now() + timeoutMinutes * 60 * 1000;
      sessionStorage.setItem(SecureMemoryStorage.ssDataKey(key), data);
      sessionStorage.setItem(SecureMemoryStorage.ssExpKey(key),  String(expiresAt));
      sessionStorage.setItem(SecureMemoryStorage.ssMinsKey(key), String(timeoutMinutes));
    } catch { /* storage quota — graceful degradation */ }
  }

  private ssClear(key: string): void {
    try {
      sessionStorage.removeItem(SecureMemoryStorage.ssDataKey(key));
      sessionStorage.removeItem(SecureMemoryStorage.ssExpKey(key));
      sessionStorage.removeItem(SecureMemoryStorage.ssMinsKey(key));
    } catch { /* ignore */ }
  }

  /** Read from sessionStorage. Returns null if missing or expired. */
  private ssRead(key: string): { data: string; remainingMinutes: number } | null {
    try {
      const data    = sessionStorage.getItem(SecureMemoryStorage.ssDataKey(key));
      const expStr  = sessionStorage.getItem(SecureMemoryStorage.ssExpKey(key));
      if (!data || !expStr) return null;

      const expiresAt = parseInt(expStr, 10);
      if (Date.now() >= expiresAt) {
        this.ssClear(key);
        return null;
      }

      const remainingMs      = expiresAt - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
      return { data, remainingMinutes };
    } catch {
      return null;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  store(key: string, data: string, timeoutMinutes = 30): void {
    this.remove(key);

    const dataBytes = new TextEncoder().encode(data);
    const now       = Date.now();
    const timeoutId = setTimeout(() => this.remove(key, true), timeoutMinutes * 60 * 1000);

    this.storage.set(key, {
      data: dataBytes,
      timestamp: now,
      lastActivity: now,
      timeoutId,
      activityTimeout: timeoutMinutes,
    });

    // Mirror to sessionStorage so page refreshes within this tab don't lose the key
    this.ssWrite(key, data, timeoutMinutes);

    if (!this.activityListeners.some(l => l.name === `update_${key}`)) {
      const listener = () => this.refreshTimeout(key);
      Object.defineProperty(listener, 'name', { value: `update_${key}` });
      this.activityListeners.push(listener);
    }
  }

  retrieve(key: string, refreshTimeout = true): string | null {
    let item = this.storage.get(key);

    // On a page refresh the Map is empty but sessionStorage still has the data.
    // Restore the item into memory so subsequent reads are fast.
    if (!item) {
      const ss = this.ssRead(key);
      if (ss) {
        this.store(key, ss.data, ss.remainingMinutes);
        item = this.storage.get(key);
      }
    }

    if (!item) return null;

    if (refreshTimeout) this.refreshTimeout(key);
    return new TextDecoder().decode(item.data);
  }

  has(key: string): boolean {
    if (this.storage.has(key)) return true;
    // Check sessionStorage without loading into memory — just a quick existence check
    return this.ssRead(key) !== null;
  }

  remove(key: string, isTimeout = false): void {
    const item = this.storage.get(key);
    if (item) {
      clearTimeout(item.timeoutId);
      secureWipe(item.data);
      this.storage.delete(key);
      this.activityListeners = this.activityListeners.filter(l => l.name !== `update_${key}`);

      if (isTimeout) {
        const callbacks = this.timeoutCallbacks.get(key) || [];
        callbacks.forEach(cb => { try { cb(); } catch { /* ignore */ } });
        this.timeoutCallbacks.delete(key);
      }
    }
    // Always clear sessionStorage, even if not in memory (e.g., just loaded from ss)
    this.ssClear(key);
  }

  onTimeout(key: string, callback: () => void): void {
    const callbacks = this.timeoutCallbacks.get(key) || [];
    callbacks.push(callback);
    this.timeoutCallbacks.set(key, callbacks);
  }

  removeTimeoutCallback(key: string, callback: () => void): void {
    const callbacks = (this.timeoutCallbacks.get(key) || []).filter(cb => cb !== callback);
    if (callbacks.length > 0) {
      this.timeoutCallbacks.set(key, callbacks);
    } else {
      this.timeoutCallbacks.delete(key);
    }
  }

  clearAll(): void {
    for (const [key] of this.storage) {
      this.remove(key);
    }
    // Also clear any sessionStorage entries whose in-memory counterpart was
    // already gone (e.g., after a refresh where clearAll is called before restore)
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('svk_')) toRemove.push(k);
      }
      toRemove.forEach(k => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
  }

  extendSession(key: string): void {
    this.refreshTimeout(key);
  }

  getTimeUntilExpiration(key: string): number {
    const item = this.storage.get(key);
    if (!item) return 0;
    const elapsed = Date.now() - item.lastActivity;
    return Math.max(0, item.activityTimeout * 60 * 1000 - elapsed);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private reduceTimeouts(): void {
    const shortMs = 5 * 60 * 1000;
    for (const [key, item] of this.storage) {
      clearTimeout(item.timeoutId);
      item.timeoutId = setTimeout(() => this.remove(key, true), shortMs);
    }
  }

  private updateActivity(): void {
    for (const [key] of this.storage) this.refreshTimeout(key);
  }

  private refreshTimeout(key: string): void {
    const item = this.storage.get(key);
    if (!item) return;
    item.lastActivity = Date.now();
    clearTimeout(item.timeoutId);
    item.timeoutId = setTimeout(() => this.remove(key, true), item.activityTimeout * 60 * 1000);
    // Keep the sessionStorage expiry in sync so a refresh after activity sees the right TTL
    this.ssWrite(key, new TextDecoder().decode(item.data), item.activityTimeout);
  }
}

// Singleton instance
export const secureStorage = new SecureMemoryStorage();

/**
 * Hook for managing private key storage with user preference.
 * Uses user-specific keys to prevent mixing keys between accounts.
 */
export const usePrivateKeyStorage = (userId?: string) => {
  const getStorageKey    = () => userId ? `privateKey_${userId}` : 'privateKey';
  const getPreferenceKey = () => userId ? `rememberPrivateKey_${userId}` : 'rememberPrivateKey';

  const storePrivateKey = (privateKey: string, rememberChoice: boolean) => {
    if (rememberChoice) {
      secureStorage.store(getStorageKey(), privateKey, 60); // 1 hour idle timeout
      localStorage.setItem(getPreferenceKey(), 'true');
    } else {
      secureStorage.store(getStorageKey(), privateKey, 15); // 15 min idle timeout
      localStorage.removeItem(getPreferenceKey());
    }
  };

  const getStoredPrivateKey  = (): string | null => secureStorage.retrieve(getStorageKey());
  const clearStoredPrivateKey = () => {
    secureStorage.remove(getStorageKey());
    localStorage.removeItem(getPreferenceKey());
  };
  const shouldRememberPrivateKey = (): boolean => localStorage.getItem(getPreferenceKey()) === 'true';
  const hasStoredPrivateKey      = (): boolean  => secureStorage.has(getStorageKey());
  const onPrivateKeyTimeout      = (cb: () => void) => secureStorage.onTimeout(getStorageKey(), cb);
  const removePrivateKeyTimeoutCallback = (cb: () => void) => secureStorage.removeTimeoutCallback(getStorageKey(), cb);

  const clearAllUserKeys = () => {
    secureStorage.clearAll();
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rememberPrivateKey')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  };

  return {
    storePrivateKey,
    getStoredPrivateKey,
    clearStoredPrivateKey,
    shouldRememberPrivateKey,
    hasStoredPrivateKey,
    onPrivateKeyTimeout,
    removePrivateKeyTimeoutCallback,
    clearAllUserKeys,
  };
};
