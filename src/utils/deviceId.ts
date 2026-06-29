/**
 * Stable per-device identifier.
 *
 * Used to scope per-device user preferences (e.g. biometric setup prompt
 * dismissal) so a choice made on one physical device doesn't bleed onto
 * another device the same user owns.
 *
 * Storage strategy (durability through redundancy):
 *   1. localStorage  — fast synchronous reads on every page load.
 *   2. IndexedDB     — survives some scenarios that wipe localStorage and
 *                      vice versa (e.g. selective site-data clears).
 *   3. StorageManager.persist() — asks the browser to mark our origin's
 *      storage as persistent, which exempts it from automatic eviction
 *      (notably the iOS 7-day eviction rule for installed PWAs).
 *
 * The ID is a random UUID and contains no PII / no hardware fingerprint.
 *
 * Reading is synchronous (returns the cached or freshly-minted ID
 * immediately); IndexedDB sync and persistent-storage requests happen
 * lazily in the background.
 */

const DEVICE_ID_KEY = 'sv_device_id';
const IDB_NAME = 'seravault-device';
const IDB_STORE = 'kv';

let memoryCachedId: string | null = null;
let bootstrapStarted = false;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function writeLocal(id: string): void {
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // private mode / quota — ignore
  }
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(IDB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      try {
        req.result.createObjectStore(IDB_STORE);
      } catch { /* ignore */ }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function readIdb(): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(DEVICE_ID_KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      try { db.close(); } catch { /* ignore */ }
    }
  });
}

async function writeIdb(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(id, DEVICE_ID_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    } finally {
      // Note: don't close inside try — let the transaction settle; the
      // resolve handlers above run after the tx is done.
      setTimeout(() => { try { db.close(); } catch { /* ignore */ } }, 0);
    }
  });
}

// ─── Persistent storage request ──────────────────────────────────────────

let persistRequested = false;
async function requestPersistentStorage(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      // Returns true if granted (no UI prompt in modern browsers — granted
      // automatically for installed PWAs and frequently-visited sites).
      await navigator.storage.persist();
    }
  } catch {
    // No-op — we tried. Eviction will still be possible.
  }
}

// ─── Bootstrap (background reconciliation) ───────────────────────────────

/**
 * Kick off background reconciliation between localStorage and IndexedDB:
 *   • If one has the ID and the other doesn't, copy across.
 *   • If they disagree, prefer the localStorage value (it was used by the
 *     synchronous getDeviceId() call already, so changing it would be a
 *     behaviour change mid-session).
 *   • Request persistent storage so neither layer gets evicted.
 */
function bootstrap(syncId: string): void {
  if (bootstrapStarted) return;
  bootstrapStarted = true;
  // Run in microtask so getDeviceId() returns immediately.
  Promise.resolve().then(async () => {
    try {
      const idbId = await readIdb();
      if (idbId !== syncId) {
        await writeIdb(syncId);
      }
    } catch { /* ignore */ }
    requestPersistentStorage();
  });
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Returns a stable, random per-device ID.
 *
 * Synchronous: returns immediately from memory or localStorage. Background
 * tasks ensure IndexedDB stays in sync and the origin's storage is marked
 * persistent. If both localStorage and IndexedDB have been wiped, a new ID
 * is generated.
 */
export function getDeviceId(): string {
  if (memoryCachedId) {
    bootstrap(memoryCachedId);
    return memoryCachedId;
  }

  const fromLocal = readLocal();
  if (fromLocal) {
    memoryCachedId = fromLocal;
    bootstrap(fromLocal);
    return fromLocal;
  }

  // localStorage miss — try to recover from IndexedDB synchronously is
  // impossible, so generate a new ID immediately and let bootstrap pull
  // any pre-existing IDB value next session if available. To handle the
  // common case where localStorage was cleared but IDB survived, callers
  // can use getDeviceIdAsync() at app startup to recover the original.
  const fresh = generateId();
  memoryCachedId = fresh;
  writeLocal(fresh);
  bootstrap(fresh);
  return fresh;
}

/**
 * Async variant that consults IndexedDB before generating a fresh ID.
 * Call this once at app bootstrap (e.g. in main.tsx) to recover a
 * previously-issued ID when localStorage was cleared but IDB survived.
 *
 * If both stores already contain the same ID, this is a no-op.
 * If only IDB has one, it's restored to localStorage and used going forward.
 * If neither has one, a new one is generated and written to both.
 */
export async function ensureDeviceId(): Promise<string> {
  const fromLocal = readLocal();
  const fromIdb = await readIdb();

  // Both present and matching — perfect.
  if (fromLocal && fromIdb && fromLocal === fromIdb) {
    memoryCachedId = fromLocal;
    requestPersistentStorage();
    return fromLocal;
  }

  // Recovery: IDB has a value but localStorage was cleared.
  if (!fromLocal && fromIdb) {
    writeLocal(fromIdb);
    memoryCachedId = fromIdb;
    requestPersistentStorage();
    return fromIdb;
  }

  // Mirror: localStorage has a value but IDB was cleared.
  if (fromLocal && !fromIdb) {
    await writeIdb(fromLocal);
    memoryCachedId = fromLocal;
    requestPersistentStorage();
    return fromLocal;
  }

  // Disagreement — prefer localStorage (likely already used this session).
  if (fromLocal && fromIdb && fromLocal !== fromIdb) {
    await writeIdb(fromLocal);
    memoryCachedId = fromLocal;
    requestPersistentStorage();
    return fromLocal;
  }

  // Both empty — generate fresh and write to both.
  const fresh = generateId();
  writeLocal(fresh);
  await writeIdb(fresh);
  memoryCachedId = fresh;
  requestPersistentStorage();
  return fresh;
}
