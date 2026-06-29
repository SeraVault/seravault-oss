import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx'
import './index.css'
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './auth/AuthContext';
import { DemoAuthProvider } from './auth/DemoAuthContext';
import { AppThemeProvider } from './theme/ThemeContext';
import { cleanupObsoleteCaches } from './services/cacheCleanup';
import { ensureDeviceId } from './utils/deviceId';

console.warn('🚀 SeraVault App Starting - Image Upload System v2.0 - Build:', new Date().toISOString());

// Filter out Firestore permission-denied console warnings
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = function(...args: any[]) {
  try {
    const message = args[0];
    // Suppress permission-denied errors that are handled elsewhere
    if (typeof message === 'string' && 
        message.includes('permission-denied')) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  } catch (e) {
    // If console override fails, use original
    originalConsoleWarn.apply(console, args);
  }
};

// Add error logging to help debug mobile issues
console.error = function(...args: any[]) {
  try {
    originalConsoleError.apply(console, args);
    // Store critical errors for debugging
    if (typeof args[0] === 'string' && args[0].includes('Error')) {
      try {
        localStorage.setItem('last_error', JSON.stringify({
          message: args[0],
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  } catch (e) {
    originalConsoleError.apply(console, args);
  }
};

// Global error handlers for uncaught promise rejections
window.addEventListener('unhandledrejection', (event) => {
  // Silently suppress permission-denied errors as they're handled by subscription error callbacks
  if (event.reason?.code === 'permission-denied' && event.reason?.message?.includes('Missing or insufficient permissions')) {
    event.preventDefault();
    return;
  }
  
  // Silently suppress messaging unsupported browser errors
  if (event.reason?.code === 'messaging/unsupported-browser') {
    event.preventDefault();
    return;
  }
  
  console.error('❌ Unhandled Promise Rejection:', {
    reason: event.reason,
    promise: event.promise,
    stack: event.reason?.stack,
    message: event.reason?.message,
    code: event.reason?.code,
    details: event.reason
  });
  
  // Check if it's a Backend error
  if (event.reason?.code) {
    console.error('🔥 Backend Error Code:', event.reason.code);
    console.error('🔥 Backend Error Message:', event.reason.message);
    
    // Log full stack trace to help identify source
    if (event.reason?.stack) {
      console.error('🔥 Full Stack Trace:', event.reason.stack);
    }
  }
  
  // Try to identify which collection/query is failing
  const stackStr = event.reason?.stack || '';
  if (stackStr.includes('contacts')) console.error('💡 Likely related to: CONTACTS collection');
  if (stackStr.includes('folders')) console.error('💡 Likely related to: FOLDERS collection');
  if (stackStr.includes('files')) console.error('💡 Likely related to: FILES collection');
  if (stackStr.includes('users')) console.error('💡 Likely related to: USERS collection');
  if (stackStr.includes('notifications')) console.error('💡 Likely related to: NOTIFICATIONS collection');
  if (stackStr.includes('invitations')) console.error('💡 Likely related to: INVITATIONS collection');
  
  // Prevent default browser behavior
  event.preventDefault();
});

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('❌ Uncaught Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack
  });
});

// Cleanup obsolete cache databases from previous versions
cleanupObsoleteCaches();

// Reconcile the per-device ID across localStorage + IndexedDB and request
// persistent storage so neither layer gets evicted by the browser. Runs in
// the background; getDeviceId() remains synchronous elsewhere.
ensureDeviceId().catch(() => { /* best-effort */ });

// Clear the stale-chunk recovery guard on every successful app startup.
// The SW uses a timestamp in sessionStorage to deduplicate parallel chunk
// failures, but the flag must be cleared once the app loads correctly so
// future failures can trigger a fresh recovery cycle.
sessionStorage.removeItem('__svRecovering');

// Handle Vite's dynamic import failures (lazy-loaded chunks missing after deploy).
// When the app has stale chunk references, dynamic import() throws before the
// service worker can intercept. The vite:preloadError event is the correct hook.
window.addEventListener('vite:preloadError', () => {
  const key = '__svRecovering';
  const now = Date.now();
  const last = parseInt(sessionStorage.getItem(key) || '0', 10);
  if (now - last > 10000) {
    sessionStorage.setItem(key, String(now));
    window.location.reload();
  }
});

// ── Android PWA back-gesture trap ───────────────────────────────────────────
// Android's system back gesture calls history.back(). In a PWA there may be
// no previous history entry, which closes the app — or worse, React Router
// pops to /login and ProtectedRoute redirects the user as if they logged out.
//
// Strategy: always keep a sentinel entry BEHIND the current page so there is
// always something to pop back to that we control.  We do this by pushing a
// sentinel on startup AND after every React Router navigation (via pushState /
// replaceState monkey-patch), so the buffer never runs dry no matter how the
// user moves through the app.
if (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true) {

  const pushSentinel = () => history.pushState({ _pwaSentinel: true }, '');

  // Push an initial sentinel so the very first back-swipe is caught.
  pushSentinel();

  // Intercept React Router's history mutations to keep a fresh sentinel behind
  // every real navigation entry.
  const _origPushState = history.pushState.bind(history);
  const _origReplaceState = history.replaceState.bind(history);

  history.pushState = (state: any, ...rest: any[]) => {
    if (!state?._pwaSentinel) {
      // Insert sentinel before the new entry so back-swipe always hits it.
      _origPushState({ _pwaSentinel: true }, '');
    }
    return (_origPushState as any)(state, ...rest);
  };

  history.replaceState = (state: any, ...rest: any[]) => {
    return (_origReplaceState as any)(state, ...rest);
  };

  window.addEventListener('popstate', (e) => {
    // When the user pops back to (or past) the sentinel, re-insert it so
    // subsequent back-swipes are still caught.
    if (!e.state || e.state._pwaSentinel) {
      pushSentinel();
    }
  });
}
// ────────────────────────────────────────────────────────────────────────────

// PWA Service Worker Registration
// Register immediately (not on 'load') so crawlers like PWABuilder can detect it.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      // Clean up any old service workers from previous implementations
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          if (reg.active &&
              !reg.active.scriptURL.endsWith('/sw.js') &&
              !reg.active.scriptURL.endsWith('/firebase-messaging-sw.js')) {
            reg.unregister();
          }
        });
      });

      // Poll for SW updates every 60 seconds so long-lived open tabs detect
      // new deployments without requiring a manual page reload or navigation.
      // A manual refresh already triggers a SW check natively — this only
      // helps tabs that have been sitting idle.
      setInterval(() => {
        registration.update().catch(() => {
          // Ignore update check errors (e.g. offline)
        });
      }, 60_000);

      // Also check for updates when the tab becomes visible again, so users
      // returning to a long-idle tab get the latest version without waiting
      // for the next 60s poll tick.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {
            // Ignore update check errors (e.g. offline)
          });
        }
      });
    })
    .catch((registrationError) => {
      console.log('❌ SW registration failed: ', registrationError);
    });
}

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const ActiveAuthProvider = IS_DEMO ? DemoAuthProvider : AuthProvider;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ActiveAuthProvider>
      <AppThemeProvider>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppThemeProvider>
    </ActiveAuthProvider>
  </React.StrictMode>,
)
