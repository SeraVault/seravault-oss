// Service Worker for SeraVault PWA
// Provides offline support and caching for better performance

const CACHE_VERSION = 'v1'; // Only bump manually when icons/manifest actually change
const CACHE_NAME = `seravault-${CACHE_VERSION}`;
const SW_VERSION = '1.0.448'; // Built: 2026-06-05T21:35:11.990Z

// Files to cache for offline use (excluding index.html - always fetch fresh)
const STATIC_CACHE = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/offline.html',
];

// ============================================================================
// Function Definitions (must be defined before event listeners)
// ============================================================================


// ============================================================================
// Event Listeners
// ============================================================================

// Install event - cache static assets and immediately take over.
// Always calling skipWaiting() here is the industry-standard pattern (used by
// Workbox, Vite PWA plugin, Create React App). It ensures:
//   • Fresh page loads after a deploy are served by the new SW immediately.
//   • A normal F5 refresh never gets caught with a stale-chunk / waiting-SW mismatch.
// On active sessions, clients.claim() fires controllerchange on every open tab;
// UpdatePrompt detects this and offers a graceful reload with a countdown.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_CACHE))
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches, claim all open tabs, then notify
// them that a new SW version is in control so UpdatePrompt can show a reload
// prompt on any existing sessions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION })
        );
      })
  );
});

// Fetch event - serve from cache when possible, fall back to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip Firebase APIs and authentication
  if (url.pathname.includes('firebaseapp.com') || 
      url.pathname.includes('googleapis.com') ||
      url.pathname.includes('firebasestorage.googleapis.com')) {
    return;
  }

  // ALWAYS fetch fresh for index.html to prevent MIME type errors
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .catch(async (error) => {
          console.error('[SW] Failed to fetch index.html:', error);
          // Serve the cached offline page instead of a bare text response.
          const cached = await caches.match('/offline.html');
          if (cached) return cached;
          // Last-resort fallback if the cache somehow doesn't have the page.
          return new Response(
            '<!doctype html><html><head><meta charset="UTF-8"><title>SeraVault — Offline</title></head><body style="font-family:sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px"><div><h1>You\'re offline</h1><p>Check your connection and <a href="/" style="color:#667eea">try again</a>.</p></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // Always fetch fresh for JS and CSS assets (they have content hashes in filenames)
  if (url.pathname.includes('/assets/') && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(
      fetch(request, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            console.error('[SW] Asset fetch failed:', url.pathname, response.status);
            throw new Error(`Asset not found: ${url.pathname}`);
          }

          // If the server returned HTML instead of JS (catch-all rewrite hit a missing chunk),
          // treat it as a missing asset and trigger a reload to pick up the latest index.html.
          const contentType = response.headers.get('content-type') || '';
          if (url.pathname.endsWith('.js') && contentType.includes('text/html')) {
            console.warn('[SW] Server returned HTML for JS asset — stale chunk reference. Reloading.');
            return new Response(
              // Guard against infinite reload loops only: if the page was already
              // reloaded for stale chunks and chunks are still missing, stop trying.
              // We use the *chunk filename* as the guard key so that simultaneous
              // failures from different chunks all get their own reload slot — the
              // old single key caused the second chunk's reload to be suppressed,
              // leaving the page blank.
              `(function(){
                var key='__svStale:'+location.pathname;
                if(!sessionStorage.getItem(key)){
                  sessionStorage.setItem(key,'1');
                  window.location.reload();
                } else {
                  console.warn('[SW] Chunk still missing after reload, giving up:', location.pathname);
                }
              })();`,
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/javascript; charset=utf-8',
                  'Cache-Control': 'no-store'
                }
              }
            );
          }

          // Cache successful asset responses for recovery/offline resilience
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, responseToCache))
            .catch((error) => {
              console.warn('[SW] Failed to cache asset response:', error);
            });

          return response;
        })
        .catch(async (error) => {
          console.error('[SW] Fetch failed for asset:', url.pathname, error);

          // Try cached version first (supports returning users with stale HTML references)
          const cachedAsset = await caches.match(request);
          if (cachedAsset) {
            console.log('[SW] Serving cached asset fallback for:', url.pathname);
            return cachedAsset;
          }

          // Final fallback: return valid MIME responses to avoid hard MIME crashes
          // JS fallback forces a single-page reload attempt to recover to latest HTML/assets
          if (url.pathname.endsWith('.js')) {
            return new Response(
              `(function(){
                var key='__svStale:'+location.pathname;
                if(!sessionStorage.getItem(key)){
                  sessionStorage.setItem(key,'1');
                  window.location.reload();
                } else {
                  console.warn('[SW] Chunk still missing after reload, giving up:', location.pathname);
                }
              })();`,
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/javascript; charset=utf-8',
                  'Cache-Control': 'no-store'
                }
              }
            );
          }

          // CSS fallback keeps page render path alive instead of hard-failing
          return new Response('/* asset unavailable - fallback */', {
            status: 200,
            headers: {
              'Content-Type': 'text/css; charset=utf-8',
              'Cache-Control': 'no-store'
            }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the fetched response for future use
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Only cache GET requests
                if (request.method === 'GET') {
                  cache.put(request, responseToCache);
                }
              });

            return response;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', error);
            // Don't return index.html as fallback - it causes MIME type errors
            // Just let the fetch fail properly
            throw error;
          });
      })
  );
});

// Handle FCM background push delivery (tab suspended, minimised, or closed).
// This fires when Android/iOS delivers a push to the SW directly, bypassing
// the page's onMessage handler (which only runs while the tab is alive).
// NOTE: FCM only routes here for data-only messages (no 'notification' field
// in the FCM payload). Messages sent with a 'notification' field are handled
// automatically by the browser/OS and won't invoke this handler.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const notification = payload.notification ?? {};
  const data = payload.data ?? {};
  const title = notification.title || data.title || 'SeraVault';
  const body  = notification.body  || data.body  || '';
  const url   = data.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192x192.png',
      badge: '/favicon.ico',
      tag: data.tag || 'seravault-default',
      data: { url, ...data },
      vibrate: [200, 100, 200],
    })
  );
});

// Listen for messages from clients
self.addEventListener('message', (event) => {
  // Claim all open clients immediately (used on first install when SW is active
  // but not yet controlling the page, so FCM and other SW-dependent features work).
  if (event.data && event.data.type === 'CLAIM_CLIENTS') {
    event.waitUntil(self.clients.claim());
  }

  // Reply with the current SW version so UpdatePrompt can display it in the snackbar.
  if (event.data && event.data.type === 'GET_VERSION') {
    if (event.source) {
      event.source.postMessage({ type: 'VERSION_CHECK', version: SW_VERSION });
    }
  }

  // Dismiss a displayed notification when the user reads it inside the app.
  if (event.data && event.data.type === 'DISMISS_NOTIFICATION') {
    const { notificationId, conversationId } = event.data;
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        notifications.forEach((n) => {
          if (
            (notificationId && n.tag === notificationId) ||
            (conversationId && n.tag === `chat-${conversationId}`)
          ) {
            n.close();
          }
        });
      })
    );
  }

  // Show a native notification on behalf of a backgrounded page tab.
  // The page's onMessage handler posts this when the tab is hidden so we
  // don't rely on showNotification() from the main thread (unreliable on Android).
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url, data } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || 'SeraVault', {
        body: body || '',
        icon: '/icon-192x192.png',
        badge: '/favicon.ico',
        tag: tag || 'seravault-default',
        data: { url: url || '/', ...data },
        vibrate: [200, 100, 200],
      })
    );
  }
});

// Handle clicks on notifications shown by this SW (via SHOW_NOTIFICATION above).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'SW_NAVIGATE', url: urlToOpen, notificationId: event.notification.data?.notificationId });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(new URL(urlToOpen, self.location.origin).href);
      }
    })
  );
});
