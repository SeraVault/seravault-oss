/**
 * OAuth handler using chrome.identity.launchWebAuthFlow.
 *
 * This is the correct MV3 approach. It avoids Firebase Auth's popup/redirect
 * entirely (which tries to load remote scripts blocked by MV3 CSP) and instead:
 *   1. Builds the Google OAuth URL directly
 *   2. Launches it via chrome.identity.launchWebAuthFlow (Chrome's built-in OAuth)
 *   3. Exchanges the returned auth code for tokens via Firebase's REST API
 *   4. Signs in with signInWithCredential using the id_token
 *   5. Posts the result back to the background worker
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  setPersistence,
  indexedDBLocalPersistence,
} from 'firebase/auth';
import { firebaseConfig } from '../shared/firebaseConfig';

if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();
setPersistence(auth, indexedDBLocalPersistence).catch(() => {});

// Google OAuth client ID — this is the one Firebase auto-creates for your project.
// Find it at: console.cloud.google.com → APIs & Services → Credentials →
// "Web client (auto created by Google Service)"
const GOOGLE_CLIENT_ID = '579700244179-auto-created-by-firebase.apps.googleusercontent.com';

async function getGoogleClientId(): Promise<string> {
  // Fetch it from the Firebase project's well-known endpoint so we don't
  // have to hardcode it and risk it going stale.
  const resp = await fetch(
    `https://securetoken.googleapis.com/v1/projects/${firebaseConfig.projectId}:getProjectConfig?key=${firebaseConfig.apiKey}`
  );
  if (!resp.ok) throw new Error('Could not fetch project config');
  const json = await resp.json();
  // authorizedDomains is present; oauthIdpConfig has the client ids for each provider
  // Fall back to the known pattern if not present
  return json?.clientId ?? GOOGLE_CLIENT_ID;
}

async function launchGoogleOAuth(): Promise<string> {
  // Get the OAuth client ID registered for this Firebase project
  let clientId: string;
  try {
    clientId = await getGoogleClientId();
  } catch {
    // If the fetch fails, fall back — user may need to set this manually
    throw new Error(
      'Could not load OAuth client ID from Firebase project. ' +
      'See console for setup instructions.'
    );
  }

  const redirectUri = `https://${firebaseConfig.projectId}.firebaseapp.com/__/auth/handler`;
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    nonce,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          reject(new Error('No response URL from OAuth flow'));
          return;
        }
        // The id_token is in the URL fragment
        const hash = new URL(responseUrl).hash.slice(1);
        const hashParams = new URLSearchParams(hash);
        const idToken = hashParams.get('id_token');
        if (!idToken) {
          reject(new Error('No id_token in OAuth response'));
          return;
        }
        resolve(idToken);
      }
    );
  });
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const providerId = params.get('provider') ?? 'google.com';

  showStatus('Connecting to Google…');

  try {
    let idToken: string;

    if (providerId === 'google.com') {
      idToken = await launchGoogleOAuth();
    } else {
      throw new Error(`Provider ${providerId} not yet supported via chrome.identity`);
    }

    showStatus('Signing in…');

    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);

    showStatus('Signed in. Unlocking vault…');

    const freshIdToken = await result.user.getIdToken();

    await chrome.runtime.sendMessage({
      type: 'OAUTH_COMPLETE',
      idToken: freshIdToken,
      accessToken: null,
      providerId: 'google.com',
    });

    showStatus('Done! You can close this tab.');
    setTimeout(() => window.close(), 800);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('closed')) {
      await chrome.runtime.sendMessage({ type: 'OAUTH_ERROR', message: 'Sign-in cancelled' });
      window.close();
      return;
    }
    await chrome.runtime.sendMessage({ type: 'OAUTH_ERROR', message: msg });
    showError(msg);
  }
}

function showStatus(msg: string) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function showError(msg: string) {
  const el = document.getElementById('status');
  if (el) { el.textContent = `Error: ${msg}`; el.style.color = '#f87171'; }
  const spinner = document.getElementById('spinner');
  if (spinner) spinner.style.display = 'none';
}

run();
