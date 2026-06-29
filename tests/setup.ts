import '@testing-library/jest-dom'

// Mock Firebase
global.fetch = fetch
// Note: crypto is already available in Node.js global scope

// Provide minimal IndexedDB stub to satisfy services that initialize caches in tests
// This avoids ReferenceErrors in jsdom while keeping behavior no-op
const fakeIndexedDBOpen = vi.fn(() => {
  const request: any = {
    result: {
      objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          getAll: vi.fn(() => ({ onsuccess: undefined, onerror: undefined, result: [] })),
          put: vi.fn(),
          delete: vi.fn(),
          clear: vi.fn(),
        })),
      })),
    },
    onsuccess: undefined,
    onerror: undefined,
    onupgradeneeded: undefined,
  };

  // Trigger success asynchronously to mimic real IndexedDB behavior
  setTimeout(() => {
    if (request.onupgradeneeded) {
      request.onupgradeneeded({ target: { result: request.result } } as any);
    }
    if (request.onsuccess) {
      request.onsuccess({ target: { result: request.result } } as any);
    }
  }, 0);

  return request;
});

// @ts-expect-error - adding to global for tests
global.indexedDB = {
  open: fakeIndexedDBOpen,
};

// Make setInterval execute immediately in tests to unblock flows that poll
const realSetInterval = global.setInterval;
global.setInterval = ((fn: TimerHandler, _delay?: number, ...args: any[]) => {
  if (typeof fn === 'function') {
    (fn as any)(...args);
  }
  return 0 as any;
}) as any;
global.clearInterval = vi.fn();

// Mock Firebase Authentication
const mockAuth = {
  currentUser: null,
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}

// Mock Firebase Firestore
const mockFirestore = {
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}

// Mock Firebase Storage
const mockStorage = {
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}

// Mock modules
vi.mock('../src/firebase', () => ({
  auth: mockAuth,
  db: mockFirestore,
  storage: mockStorage,
}))

// Mock Firebase SDK modules used during backend initialization
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPhoneNumber: vi.fn(),
  linkWithPhoneNumber: vi.fn(),
  RecaptchaVerifier: vi.fn().mockImplementation(() => ({ clear: vi.fn() })),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn((_, cb) => {
    cb(null)
    return vi.fn()
  }),
  sendPasswordResetEmail: vi.fn(),
  updatePassword: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  linkWithCredential: vi.fn(),
  unlink: vi.fn(),
  setPersistence: vi.fn(() => Promise.resolve()),
  indexedDBLocalPersistence: {},
  browserSessionPersistence: {},
  inMemoryPersistence: {},
}))

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  increment: vi.fn(),
  deleteField: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn()),
}))

vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(() => Promise.resolve(null)),
  onMessage: vi.fn(),
  deleteToken: vi.fn(),
}))

// Mock the Firebase backend wrapper used by various modules so initialization stays inert
vi.mock('../src/backend/FirebaseBackend', () => ({
  firebaseBackend: {
    getAuthInstance: () => mockAuth,
  },
}))

// Mock crypto operations
vi.mock('../src/crypto/hpkeCrypto', () => ({
  generateKeyPair: vi.fn(),
  encryptData: vi.fn(),
  decryptData: vi.fn(),
  encryptForMultipleRecipients: vi.fn(),
  decryptFileContent: vi.fn(),
  encryptMetadata: vi.fn(),
  decryptMetadata: vi.fn(),
  hexToBytes: vi.fn(),
  bytesToHex: vi.fn(),
}))

vi.mock('../src/crypto/postQuantumCrypto', () => ({
  encryptString: vi.fn(),
  decryptString: vi.fn(),
  encryptMetadata: vi.fn(),
  decryptMetadata: vi.fn(),
  generateKeyPair: vi.fn(),
}))

// Mock React Router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
  Link: ({ children, to }: any) => ({ type: 'a', props: { href: to, children } }),
  BrowserRouter: ({ children }: any) => ({ type: 'div', props: { children } }),
  Routes: ({ children }: any) => ({ type: 'div', props: { children } }),
  Route: ({ element }: any) => ({ type: 'div', props: { children: element } }),
}))
