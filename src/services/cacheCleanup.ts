/**
 * Cache Cleanup Utilities
 * 
 * Removes obsolete cache databases from previous versions
 */

/**
 * Delete the old FileCacheService IndexedDB database
 * This was replaced by the in-memory cache
 */
export async function cleanupObsoleteCaches(): Promise<void> {
  try {
    // Check if indexedDB is available
    if (!('indexedDB' in window)) {
      return;
    }

    // Check if databases() method is available
    if (!indexedDB.databases) {
      return;
    }

    const databases = await indexedDB.databases();
    const obsoleteDbs = ['SeraVaultFileCache']; // Old database name
    
    for (const db of databases) {
      if (db.name && obsoleteDbs.includes(db.name)) {
        console.log(`🗑️ Removing obsolete database: ${db.name}`);
        await new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(db.name!);
          request.onsuccess = () => {
            console.log(`✅ Deleted obsolete database: ${db.name}`);
            resolve();
          };
          request.onerror = () => {
            // Silently ignore errors
            resolve();
          };
          request.onblocked = () => {
            // If blocked, just continue
            resolve();
          };
        });
      }
    }
  } catch (error) {
    // Silently ignore all errors - this is non-critical cleanup
  }
}
