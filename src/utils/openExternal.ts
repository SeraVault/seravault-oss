/**
 * Opens an external URL in a new tab/window without navigating away from the app.
 *
 * Uses an anchor-click approach which works reliably in iOS PWA standalone mode,
 * where window.open() is silently blocked. On all other platforms this behaves
 * identically to window.open(url, '_blank', 'noopener,noreferrer').
 */
export function openExternal(url: string): void {
  // Only allow https:// URLs — prevents javascript: XSS and accidental data: navigation
  if (!url.startsWith('https://')) {
    console.error('[openExternal] Blocked non-https URL:', url);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  // Must be in the DOM briefly for Firefox; use body to avoid layout shifts
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
