# SeraVault

Your digital safe deposit box. SeraVault is a post-quantum encrypted vault for storing passwords, credit cards, bank accounts, identity documents, secure notes, Wi-Fi credentials, and sensitive files — protected from fire, flood, theft, and unauthorized access.

All encryption and decryption happens on the user's device. No plaintext ever leaves the browser.

---

## Features

- **Post-quantum encryption** — ML-KEM-768 (CRYSTALS-Kyber) key pairs with Argon2id passphrase-based key derivation
- **Encrypted file storage** — Upload, organize, and share files with end-to-end encryption
- **Secure forms** — Built-in templates for passwords, credit cards, bank accounts, identities, Wi-Fi credentials, OTP codes, and secure notes
- **Custom form builder** — Create your own encrypted form templates
- **Encrypted chat** — End-to-end encrypted messaging between contacts
- **Contact sharing** — Share encrypted files and forms with trusted contacts
- **Folder organization** — Hierarchical folders with per-folder encryption
- **Archive** — Archive files and forms without deleting them
- **Favorites** — Star frequently accessed items
- **Tagging** — Tag files and forms for cross-folder organization
- **Full-text search** — Deep index for searching inside encrypted content
- **Biometric unlock** — WebAuthn PRF extension for hardware-backed passphrase storage (fingerprint, Face ID, hardware keys)
- **Push notifications** — Web push for shared file approvals and contact activity
- **Import / Export** — Bulk import from JSON, export encrypted data
- **Progressive Web App** — Installable on desktop and mobile, offline-capable service worker, Web Share Target
- **Internationalization** — English, Spanish, French, German

---

## Security Architecture

SeraVault uses a layered, zero-knowledge encryption model:

| Layer | Algorithm | Purpose |
|---|---|---|
| Key pair | ML-KEM-768 (CRYSTALS-Kyber) | Asymmetric encryption of file keys |
| Key derivation | Argon2id (64 MB, 3 iterations) | Passphrase → symmetric key |
| Symmetric encryption | XChaCha20-Poly1305 | File content, metadata, private key at rest |
| Biometric binding | WebAuthn PRF extension | Hardware-backed key storage |

**Key design principles:**
- Private keys are encrypted with Argon2id before being stored — the server never sees the plaintext private key
- Each file is encrypted with a unique random key; that key is then encrypted with the recipient's ML-KEM-768 public key
- File names, sizes, and metadata are encrypted separately from content
- Argon2id hashing runs in a dedicated Web Worker to keep the UI thread responsive
- All cryptography is implemented via `@noble/post-quantum`, `@noble/ciphers`, and `@noble/hashes` — audited, dependency-free libraries

---

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7 |
| UI | Material UI v7 |
| Routing | React Router v7 |
| Crypto | @noble/post-quantum, @noble/ciphers, @noble/hashes |
| Offline storage | Dexie (IndexedDB) |
| i18n | i18next, react-i18next |
| Testing | Vitest, Playwright |
| PWA | Custom service worker, Workbox Window |
| Rich text | Quill, @uiw/react-md-editor |

---

## Project Structure

```
src/
├── auth/           # Auth context, route guards (ProtectedRoute, ProfileCheck, SubscriptionCheck)
├── backend/        # Backend abstraction layer (FirebaseBackend / MockBackend)
├── components/     # Shared UI components
├── constants/      # Auth config, plan limits, storage keys
├── context/        # React contexts (clipboard, loading, recents, metadata, import)
├── crypto/         # quantumSafeCrypto.ts — all ML-KEM-768 + XChaCha20 primitives
├── hooks/          # Custom React hooks (file upload, global file index, image attachments, etc.)
├── i18n/           # Translation files (en, es, fr, de)
├── pages/          # Top-level page components
├── services/       # Business logic (key management, file encryption, storage quota, etc.)
├── theme/          # MUI theme configuration
├── types/          # Shared TypeScript types
├── utils/          # Utilities (form files, password strength, biometric auth, etc.)
└── workers/        # Web Workers (argon2.worker.ts — off-thread key derivation)

public/
├── sw.js           # Service worker (cache strategy, stale chunk recovery)
└── manifest.json   # PWA manifest

functions/
└── src/index.ts    # Cloud Functions (email verification, push notifications, etc.)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install dependencies

```bash
npm install
```

### Environment setup

```bash
cp .env.example .env
```

Fill in the required values in `.env`. See [Environment Variables](#environment-variables) below.

### Run locally

```bash
npm run dev
```

Run in demo mode (mock backend, no live services required):

```bash
npm run dev:demo
```

### Build

```bash
npm run build
```

### Run tests

```bash
# Unit tests
npm run test:run

# E2E tests (requires a running dev server)
npm run test:e2e

# All tests
npm run test:all
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|---|---|
| `VITE_APP_URL` | Production URL of the app |
| `VITE_LANDING_URL` | Production URL of the landing page |
| `VITE_FUNCTIONS_BASE_URL` | Base URL for cloud functions |
| `VITE_DEMO_MODE` | Set to `true` to use mock backend |

---

## Firebase Deployment

SeraVault's default backend is Firebase (Firestore, Storage, Auth, Cloud Functions, Hosting). To deploy your own instance:

### 1. Create a Firebase project

Create a project at the [Firebase Console](https://console.firebase.google.com/), then enable Firestore, Storage, Authentication, and Cloud Functions for it.

### 2. Point the CLI at your project

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

`firebase use --add` will prompt you for your project ID and an alias (e.g. `default`) and write them to a local `.firebaserc` — this file is gitignored on purpose so your project ID never gets committed.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `VITE_FIREBASE_*` with the values from **Project Settings → General → Your apps** in the Firebase Console, plus the other variables described in [Environment Variables](#environment-variables).

### 4. Deploy Firestore rules, Storage rules, and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 5. Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

Cloud Functions that send email or push notifications expect their secrets to be set via Secret Manager first, e.g.:

```bash
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

### 6. Build and deploy hosting

```bash
npm run build
firebase deploy --only hosting
```

By default `firebase.json` deploys to a single hosting site tied to your project. If you want separate sites for the app and a landing page, configure [hosting targets](https://firebase.google.com/docs/hosting/multisites) with `firebase target:apply hosting <target-name> <site-name>` and add matching entries to `firebase.json`.

### Deploy everything at once

```bash
firebase deploy
```

---

## PWA

SeraVault is a fully installable PWA:

- **Service worker** — Caches static assets, serves the app shell offline, and handles stale chunk recovery on deploy
- **Web Share Target** — Accepts shared files, images, and URLs from the OS share sheet
- **App shortcuts** — Quick actions for Upload, New Password, New Credit Card from the home screen
- **Display** — Standalone (no browser chrome), with Window Controls Overlay on desktop

The service worker version is automatically incremented by `scripts/increment-sw-version.cjs` on each build.

---

## Internationalization

Supported languages: **English**, **Spanish**, **French**, **German**

Translation files are in `src/i18n/locales/`. Language is detected automatically from the browser and can be changed in the user profile. The selected language is persisted in the user profile for consistency across devices.

---

## Biometric Authentication

SeraVault supports passwordless unlock via the **WebAuthn PRF extension**:

- On supported devices (Touch ID, Face ID, Windows Hello, hardware security keys), the vault can be unlocked with biometrics instead of typing the passphrase
- The PRF extension derives a deterministic secret from the hardware authenticator, which is used to decrypt the private key — the passphrase never needs to be entered again on that device
- Falls back to passphrase entry on devices without PRF support

---

## Demo Mode

Run with `VITE_DEMO_MODE=true` (or `npm run dev:demo`) to use a fully in-memory mock backend. No live services are required. Useful for UI development and testing.

---

## License

GPL-3.0. See [LICENSE](LICENSE) for the full text.
