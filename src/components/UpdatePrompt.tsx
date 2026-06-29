import React, { useEffect, useRef, useState } from 'react';
import { Snackbar, Button, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { NotificationService } from '../services/notificationService';

// Pull the current SW_VERSION string out of the served sw.js body. We can't
// rely on a single regex source because the file is dual-purpose (script +
// version manifest), so we keep the matcher lenient.
const SW_VERSION_REGEX = /SW_VERSION\s*=\s*['"]([^'"]+)['"]/;

async function fetchServerSwVersion(): Promise<string | null> {
  try {
    // cache:'no-store' bypasses the HTTP cache; the cache-busting query string
    // additionally defeats any intermediary (CDN edge, corporate proxy) that
    // might ignore the header. The host already sends no-store on /sw.js, but
    // we don't trust the network path.
    const res = await fetch(`/sw.js?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(SW_VERSION_REGEX);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export const UpdatePrompt: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [showUpdate, setShowUpdate] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const reloadingRef = useRef(false);
  const initialVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Snapshot whether a SW was already controlling this page at load time.
    // null  → first install; no reload needed when new SW claims the page.
    // value → active session; show the reload prompt when the controller changes.
    const hadController = !!navigator.serviceWorker.controller;

    // SW_ACTIVATED is broadcast by the activate event after clients.claim().
    // We also get the new version string this way.
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_ACTIVATED') {
        setNewVersion(event.data.version ?? null);
      } else if (event.data?.type === 'SW_NAVIGATE' && event.data.url) {
        navigate(event.data.url);
        if (event.data.notificationId) {
          NotificationService.markAsRead(event.data.notificationId).catch(() => {});
        }
      }
    };

    // controllerchange fires when the new SW calls clients.claim().
    // If the page had a previous controller, this is an update mid-session.
    const handleControllerChange = () => {
      if (reloadingRef.current) return;
      if (hadController) {
        setUpdatePending(true);
        setShowUpdate(true);
      }
      // If !hadController: first install taking control of a fresh page load —
      // no reload needed, the page is already loading the correct assets.
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // ─── Belt-and-suspenders version probe ──────────────────────────────────
    // The controllerchange / SW_ACTIVATED pipeline can silently fail in real
    // browsers (background-tab throttling delays update polling, races during
    // React mount drop the event, intermediate proxies serve stale sw.js to
    // the SW update fetch, etc.). To guarantee long-lived tabs eventually see
    // a new deploy, we ALSO directly poll the served sw.js for its version
    // string and compare against what the page first observed. If they
    // diverge, we show the same reload prompt. This works even when the
    // browser hasn't activated the new SW yet, and even when the page was
    // never controlled by any SW.
    const checkServerVersion = async () => {
      if (reloadingRef.current || updatePending) return;
      const serverVersion = await fetchServerSwVersion();
      if (!serverVersion) return;
      if (initialVersionRef.current === null) {
        initialVersionRef.current = serverVersion;
        return;
      }
      if (serverVersion !== initialVersionRef.current) {
        setNewVersion(serverVersion);
        setUpdatePending(true);
        setShowUpdate(true);
        // Nudge the SW to actually install/activate the new version so the
        // reload picks it up immediately rather than via stale cache.
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          await reg?.update().catch(() => {});
        } catch { /* ignore */ }
      }
    };
    // Fire once on mount to seed initialVersionRef, then poll every 60s.
    checkServerVersion();
    const versionPollId = window.setInterval(checkServerVersion, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkServerVersion();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.clearInterval(versionPollId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const doReload = () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    window.location.reload();
  };

  const handleReloadNow = () => {
    setUpdatePending(false);
    setShowUpdate(false);
    doReload();
  };

  const handleDismiss = () => {
    // Hide for now — re-show on the next navigation.
    setShowUpdate(false);
  };

  // Re-show the prompt on the next route change after the user dismissed it.
  useEffect(() => {
    if (updatePending && !reloadingRef.current) {
      setShowUpdate(true);
    }
  }, [location.pathname]);

  return (
    <>
      <Snackbar
        open={showUpdate}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 2 }}
      >
        <Alert
          severity="info"
          action={
            <>
              <Button color="inherit" size="small" onClick={handleDismiss}>
                {t('appUpdate.laterAction', 'Later')}
              </Button>
              <Button color="inherit" size="small" variant="outlined" onClick={handleReloadNow} sx={{ ml: 1 }}>
                {t('appUpdate.reloadNow', 'Reload Now')}
              </Button>
            </>
          }
        >
          {newVersion
            ? `${t('appUpdate.newVersion', 'A new version of SeraVault is available.')} (${newVersion})`
            : t('appUpdate.newVersion', 'A new version of SeraVault is available.')
          }
        </Alert>
      </Snackbar>
    </>
  );
};
