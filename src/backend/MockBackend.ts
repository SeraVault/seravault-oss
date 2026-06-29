/**
 * MockBackend — in-memory backend for demo/screenshot mode.
 *
 * Activated when VITE_DEMO_MODE=true (vite.config.ts swaps the @backend-provider alias).
 * All data is pre-decrypted plain text so the passphrase gate can be bypassed.
 * Subscriptions call their callbacks synchronously after a short delay to mimic Firestore.
 */

import type {
  BackendInterface,
  User,
  UserProfile,
  FileRecord,
  FolderRecord,
  ContactRecord,
  ContactRequest,
  QueryConstraint,
} from './BackendInterface';

// ============================================================================
// DEMO ENCRYPTION HELPERS
// Encodes plaintext strings in the {ciphertext, nonce} format that
// decryptMetadata / useFolders will recognize as demo passthrough
// (nonce = '0'.repeat(24) → ciphertext is just hex-encoded UTF-8 plaintext).
// ============================================================================

function demoEncode(text: string): { ciphertext: string; nonce: string } {
  const bytes = new TextEncoder().encode(text);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return { ciphertext: hex, nonce: '0'.repeat(24) };
}

// ============================================================================
// DEMO USER
// ============================================================================

export const DEMO_USER: User = {
  uid: 'demo_user_001',
  email: 'demo@seravault.com',
  displayName: 'Alex Chen',
  emailVerified: true,
  phoneNumber: null,
  photoURL: null,
};

export const DEMO_PRIVATE_KEY = 'demo_private_key_placeholder_not_real_crypto';

const now = new Date();
const ts = (offsetDays = 0) => new Date(now.getTime() - offsetDays * 86400000).toISOString();

// ============================================================================
// DEMO DATA STORE (mutable in-memory)
// ============================================================================

const DEMO_PROFILE: UserProfile = {
  uid: DEMO_USER.uid,
  email: DEMO_USER.email!,
  displayName: DEMO_USER.displayName!,
  publicKey: 'demo_public_key',
  encryptedPrivateKey: { ciphertext: 'demo', salt: 'demo', nonce: 'demo' },
  theme: 'dark',
  language: 'en',
  termsAcceptedAt: ts(30),
  storageUsed: 142_300_000,
  keyVersion: 1,
  columnVisibility: { type: true, size: true, shared: true, created: false, modified: false, owner: false },
};

// Folders
const foldersStore: { [id: string]: FolderRecord & { id: string } } = {
  folder_finance: {
    id: 'folder_finance',
    owner: DEMO_USER.uid,
    name: demoEncode('Finance'),
    parent: null,
    createdAt: ts(60),
    lastModified: ts(10),
  },
  folder_health: {
    id: 'folder_health',
    owner: DEMO_USER.uid,
    name: demoEncode('Health & Medical'),
    parent: null,
    createdAt: ts(45),
    lastModified: ts(5),
  },
  folder_work: {
    id: 'folder_work',
    owner: DEMO_USER.uid,
    name: demoEncode('Work'),
    parent: null,
    createdAt: ts(90),
    lastModified: ts(2),
  },
  folder_travel: {
    id: 'folder_travel',
    owner: DEMO_USER.uid,
    name: demoEncode('Travel'),
    parent: null,
    createdAt: ts(20),
    lastModified: ts(1),
  },
};

// Files — name/size encoded via demoEncode; encryptedKeys sentinel 'DEMO' bypasses ML-KEM
const filesStore: { [id: string]: FileRecord & { id: string } } = {
  file_passport: {
    id: 'file_passport',
    owner: DEMO_USER.uid,
    name: demoEncode('US Passport'),
    size: demoEncode('2048'),
    storagePath: `users/${DEMO_USER.uid}/files/file_passport`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: null,
    createdAt: ts(30),
    lastModified: ts(3),
    userFavorites: { [DEMO_USER.uid]: true },
    userFolders: {},
  },
  file_bank_main: {
    id: 'file_bank_main',
    owner: DEMO_USER.uid,
    name: demoEncode('Chase Checking Account'),
    size: demoEncode('1536'),
    storagePath: `users/${DEMO_USER.uid}/files/file_bank_main`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_finance',
    createdAt: ts(60),
    lastModified: ts(10),
    userFolders: { [DEMO_USER.uid]: 'folder_finance' },
  },
  file_cc_visa: {
    id: 'file_cc_visa',
    owner: DEMO_USER.uid,
    name: demoEncode('Visa Platinum Card'),
    size: demoEncode('1024'),
    storagePath: `users/${DEMO_USER.uid}/files/file_cc_visa`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_finance',
    createdAt: ts(55),
    lastModified: ts(8),
    userFolders: { [DEMO_USER.uid]: 'folder_finance' },
  },
  file_insurance: {
    id: 'file_insurance',
    owner: DEMO_USER.uid,
    name: demoEncode('Blue Cross Health Insurance'),
    size: demoEncode('3072'),
    storagePath: `users/${DEMO_USER.uid}/files/file_insurance`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_health',
    createdAt: ts(40),
    lastModified: ts(14),
    userFolders: { [DEMO_USER.uid]: 'folder_health' },
  },
  file_medical_card: {
    id: 'file_medical_card',
    owner: DEMO_USER.uid,
    name: demoEncode('Medicare Card'),
    size: demoEncode('512'),
    storagePath: `users/${DEMO_USER.uid}/files/file_medical_card`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_health',
    createdAt: ts(35),
    lastModified: ts(35),
    userFolders: { [DEMO_USER.uid]: 'folder_health' },
  },
  file_wifi_home: {
    id: 'file_wifi_home',
    owner: DEMO_USER.uid,
    name: demoEncode('Home Wi-Fi'),
    size: demoEncode('256'),
    storagePath: `users/${DEMO_USER.uid}/files/file_wifi_home`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO', 'demo_contact_001': 'DEMO' },
    sharedWith: ['demo_contact_001'],
    parent: null,
    createdAt: ts(20),
    lastModified: ts(20),
    userFavorites: { [DEMO_USER.uid]: true },
    userFolders: {},
  },
  file_github_token: {
    id: 'file_github_token',
    owner: DEMO_USER.uid,
    name: demoEncode('GitHub Personal Access Token'),
    size: demoEncode('512'),
    storagePath: `users/${DEMO_USER.uid}/files/file_github_token`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_work',
    createdAt: ts(15),
    lastModified: ts(2),
    userFolders: { [DEMO_USER.uid]: 'folder_work' },
  },
  file_aws_keys: {
    id: 'file_aws_keys',
    owner: DEMO_USER.uid,
    name: demoEncode('AWS Access Keys'),
    size: demoEncode('768'),
    storagePath: `users/${DEMO_USER.uid}/files/file_aws_keys`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO', 'demo_contact_002': 'DEMO' },
    sharedWith: ['demo_contact_002'],
    parent: 'folder_work',
    createdAt: ts(10),
    lastModified: ts(1),
    userFolders: { [DEMO_USER.uid]: 'folder_work' },
  },
  file_hotel_loyalty: {
    id: 'file_hotel_loyalty',
    owner: DEMO_USER.uid,
    name: demoEncode('Marriott Bonvoy Account'),
    size: demoEncode('512'),
    storagePath: `users/${DEMO_USER.uid}/files/file_hotel_loyalty`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_travel',
    createdAt: ts(5),
    lastModified: ts(0),
    userFavorites: { [DEMO_USER.uid]: true },
    userFolders: { [DEMO_USER.uid]: 'folder_travel' },
  },
  // Legal & estate documents (folder_finance)
  file_power_of_attorney: {
    id: 'file_power_of_attorney',
    owner: DEMO_USER.uid,
    name: demoEncode('Power of Attorney – Alex Chen'),
    size: demoEncode('87040'),
    storagePath: `users/${DEMO_USER.uid}/files/file_power_of_attorney`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_finance',
    createdAt: ts(180),
    lastModified: ts(12),
    userFavorites: { [DEMO_USER.uid]: true },
    userFolders: { [DEMO_USER.uid]: 'folder_finance' },
  },
  file_last_will: {
    id: 'file_last_will',
    owner: DEMO_USER.uid,
    name: demoEncode('Last Will & Testament'),
    size: demoEncode('114688'),
    storagePath: `users/${DEMO_USER.uid}/files/file_last_will`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_finance',
    createdAt: ts(180),
    lastModified: ts(45),
    userFolders: { [DEMO_USER.uid]: 'folder_finance' },
  },
  file_property_deed: {
    id: 'file_property_deed',
    owner: DEMO_USER.uid,
    name: demoEncode('Property Deed – 742 Evergreen Terrace'),
    size: demoEncode('204800'),
    storagePath: `users/${DEMO_USER.uid}/files/file_property_deed`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_finance',
    createdAt: ts(365),
    lastModified: ts(60),
    userFolders: { [DEMO_USER.uid]: 'folder_finance' },
  },
  // Health documents
  file_medical_directive: {
    id: 'file_medical_directive',
    owner: DEMO_USER.uid,
    name: demoEncode('Advance Medical Directive'),
    size: demoEncode('61440'),
    storagePath: `users/${DEMO_USER.uid}/files/file_medical_directive`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_health',
    createdAt: ts(120),
    lastModified: ts(30),
    userFolders: { [DEMO_USER.uid]: 'folder_health' },
  },
  file_vaccination_records: {
    id: 'file_vaccination_records',
    owner: DEMO_USER.uid,
    name: demoEncode('Vaccination Records'),
    size: demoEncode('38912'),
    storagePath: `users/${DEMO_USER.uid}/files/file_vaccination_records`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_health',
    createdAt: ts(90),
    lastModified: ts(18),
    userFolders: { [DEMO_USER.uid]: 'folder_health' },
  },
  // Form file — .identity.form extension triggers form viewer
  file_emergency_contacts: {
    id: 'file_emergency_contacts',
    owner: DEMO_USER.uid,
    name: demoEncode('Emergency Contacts.identity.form'),
    size: demoEncode('2048'),
    storagePath: `users/${DEMO_USER.uid}/files/file_emergency_contacts`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO' },
    sharedWith: [],
    parent: 'folder_health',
    createdAt: ts(10),
    lastModified: ts(1),
    userFolders: { [DEMO_USER.uid]: 'folder_health' },
  },
  // Chat conversation — fileType: 'chat'
  chat_family: {
    id: 'chat_family',
    owner: DEMO_USER.uid,
    name: demoEncode('Family Vault'),
    size: demoEncode('0'),
    storagePath: undefined,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO', 'demo_contact_001': 'DEMO' },
    sharedWith: ['demo_contact_001'],
    parent: null,
    userFolders: {},
    fileType: 'chat',
    type: 'group',
    participants: [DEMO_USER.uid, 'demo_contact_001'],
    createdBy: DEMO_USER.uid,
    createdAt: ts(14),
    lastModified: ts(0),
    lastMessageAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
    lastMessagePreview: demoEncode('Sounds good, I already uploaded it.'),
  } as any,
  // Shared file
  file_shared_with_me: {
    id: 'file_shared_with_me',
    owner: 'demo_contact_001',
    name: demoEncode('Shared Lease Agreement'),
    size: demoEncode('51200'),
    storagePath: `users/demo_contact_001/files/file_shared_with_me`,
    encryptedKeys: { [DEMO_USER.uid]: 'DEMO', 'demo_contact_001': 'DEMO' },
    sharedWith: [DEMO_USER.uid],
    parent: null,
    createdAt: ts(7),
    lastModified: ts(7),
  },
};

// Contacts
const contactsStore: { [id: string]: ContactRecord & { id: string } } = {
  contact_rel_1: {
    id: 'contact_rel_1',
    userId1: DEMO_USER.uid,
    userId2: 'demo_contact_001',
    user1Email: DEMO_USER.email!,
    user2Email: 'sarah.johnson@email.com',
    user1DisplayName: DEMO_USER.displayName!,
    user2DisplayName: 'Sarah Johnson',
    status: 'accepted',
    initiatorUserId: DEMO_USER.uid,
    createdAt: ts(90),
    lastInteractionAt: ts(2),
    acceptedAt: ts(89),
  },
  contact_rel_2: {
    id: 'contact_rel_2',
    userId1: DEMO_USER.uid,
    userId2: 'demo_contact_002',
    user1Email: DEMO_USER.email!,
    user2Email: 'mike.torres@company.com',
    user1DisplayName: DEMO_USER.displayName!,
    user2DisplayName: 'Mike Torres',
    status: 'accepted',
    initiatorUserId: 'demo_contact_002',
    createdAt: ts(60),
    lastInteractionAt: ts(1),
    acceptedAt: ts(59),
  },
  contact_rel_3: {
    id: 'contact_rel_3',
    userId1: DEMO_USER.uid,
    userId2: 'demo_contact_003',
    user1Email: DEMO_USER.email!,
    user2Email: 'emma.wilson@gmail.com',
    user1DisplayName: DEMO_USER.displayName!,
    user2DisplayName: 'Emma Wilson',
    status: 'accepted',
    initiatorUserId: DEMO_USER.uid,
    createdAt: ts(30),
    lastInteractionAt: ts(5),
    acceptedAt: ts(28),
  },
};

// Contact requests (pending incoming)
const contactRequestsStore: { [id: string]: ContactRequest & { id: string } } = {
  req_incoming_1: {
    id: 'req_incoming_1',
    fromUserId: 'demo_contact_004',
    fromUserEmail: 'david.park@email.com',
    fromUserDisplayName: 'David Park',
    toUserId: DEMO_USER.uid,
    toEmail: DEMO_USER.email!,
    status: 'pending',
    message: "Hi, I'd like to connect and share some documents with you.",
    createdAt: ts(1),
  },
};

// Chat messages for demo conversations
// Key: conversationId, Value: { [messageId]: ChatMessage }
const chatMessagesStore: { [conversationId: string]: { [messageId: string]: any } } = {
  chat_family: {
    msg_1: {
      id: 'msg_1',
      senderId: DEMO_USER.uid,
      senderName: 'Alex Chen',
      encryptedContent: {
        [DEMO_USER.uid]: demoEncode("Hey Sarah, I've uploaded the Power of Attorney doc to the vault."),
        'demo_contact_001': demoEncode("Hey Sarah, I've uploaded the Power of Attorney doc to the vault."),
      },
      timestamp: new Date(now.getTime() - 3 * 3600000).toISOString(),
      type: 'text',
      readBy: { [DEMO_USER.uid]: new Date() },
    },
    msg_2: {
      id: 'msg_2',
      senderId: 'demo_contact_001',
      senderName: 'Sarah Johnson',
      encryptedContent: {
        [DEMO_USER.uid]: demoEncode('Great! Did you share access with me? I need to review it before the meeting.'),
        'demo_contact_001': demoEncode('Great! Did you share access with me? I need to review it before the meeting.'),
      },
      timestamp: new Date(now.getTime() - 2.8 * 3600000).toISOString(),
      type: 'text',
      readBy: { [DEMO_USER.uid]: new Date(), 'demo_contact_001': new Date() },
    },
    msg_3: {
      id: 'msg_3',
      senderId: DEMO_USER.uid,
      senderName: 'Alex Chen',
      encryptedContent: {
        [DEMO_USER.uid]: demoEncode("Yes, I've shared the file with you. You should be able to see it now."),
        'demo_contact_001': demoEncode("Yes, I've shared the file with you. You should be able to see it now."),
      },
      timestamp: new Date(now.getTime() - 2.5 * 3600000).toISOString(),
      type: 'text',
      readBy: { [DEMO_USER.uid]: new Date() },
    },
    msg_4: {
      id: 'msg_4',
      senderId: 'demo_contact_001',
      senderName: 'Sarah Johnson',
      encryptedContent: {
        [DEMO_USER.uid]: demoEncode("Perfect, I can see it. I'll also need the Advance Medical Directive — can you add me there too?"),
        'demo_contact_001': demoEncode("Perfect, I can see it. I'll also need the Advance Medical Directive — can you add me there too?"),
      },
      timestamp: new Date(now.getTime() - 2.3 * 3600000).toISOString(),
      type: 'text',
      readBy: { [DEMO_USER.uid]: new Date(), 'demo_contact_001': new Date() },
    },
    msg_5: {
      id: 'msg_5',
      senderId: DEMO_USER.uid,
      senderName: 'Alex Chen',
      encryptedContent: {
        [DEMO_USER.uid]: demoEncode("Done. I've also uploaded the Last Will & Testament — everything is organized in the Finance folder."),
        'demo_contact_001': demoEncode("Done. I've also uploaded the Last Will & Testament — everything is organized in the Finance folder."),
      },
      timestamp: new Date(now.getTime() - 2.1 * 3600000).toISOString(),
      type: 'text',
      readBy: { [DEMO_USER.uid]: new Date() },
    },
    msg_6: {
      id: 'msg_6',
      senderId: 'demo_contact_001',
      senderName: 'Sarah Johnson',
      encryptedContent: {
        [DEMO_USER.uid]: demoEncode('Sounds good, I already uploaded it.'),
        'demo_contact_001': demoEncode('Sounds good, I already uploaded it.'),
      },
      timestamp: new Date(now.getTime() - 2 * 3600000).toISOString(),
      type: 'text',
      readBy: { [DEMO_USER.uid]: new Date(), 'demo_contact_001': new Date() },
    },
  },
};

// Form templates
const templatesStore: { [id: string]: any } = {
  tmpl_custom_1: {
    id: 'tmpl_custom_1',
    templateId: 'tmpl_custom_1',
    name: 'Emergency Contacts',
    description: 'Quick reference for emergency contacts and medical info',
    category: 'Identity',
    icon: 'identity',
    color: '#e53e3e',
    author: DEMO_USER.uid,
    isPublic: false,
    isOfficial: false,
    isEncrypted: false,
    usageCount: 3,
    createdAt: ts(14),
    updatedAt: ts(2),
    schema: {
      fields: [
        { id: 'primary_name', label: 'Primary Contact Name', type: 'text', required: true },
        { id: 'primary_phone', label: 'Primary Contact Phone', type: 'phone', required: true },
        { id: 'secondary_name', label: 'Secondary Contact Name', type: 'text' },
        { id: 'secondary_phone', label: 'Secondary Contact Phone', type: 'phone' },
        { id: 'blood_type', label: 'Blood Type', type: 'text' },
        { id: 'allergies', label: 'Allergies', type: 'textarea' },
        { id: 'medications', label: 'Current Medications', type: 'textarea', sensitive: true },
        { id: 'doctor_name', label: 'Primary Doctor', type: 'text' },
        { id: 'doctor_phone', label: 'Doctor Phone', type: 'phone' },
      ],
    },
    defaultData: {},
    tags: ['emergency', 'medical', 'identity'],
  },
  tmpl_custom_2: {
    id: 'tmpl_custom_2',
    templateId: 'tmpl_custom_2',
    name: 'Subscription Tracker',
    description: 'Track recurring subscriptions, renewal dates, and costs',
    category: 'Finance',
    icon: 'credit_card',
    color: '#3182ce',
    author: DEMO_USER.uid,
    isPublic: false,
    isOfficial: false,
    isEncrypted: false,
    usageCount: 5,
    createdAt: ts(20),
    updatedAt: ts(4),
    schema: {
      fields: [
        { id: 'service_name', label: 'Service Name', type: 'text', required: true },
        { id: 'monthly_cost', label: 'Monthly Cost ($)', type: 'number', required: true },
        { id: 'billing_date', label: 'Billing Date', type: 'date' },
        { id: 'payment_method', label: 'Payment Method', type: 'text' },
        { id: 'account_email', label: 'Account Email', type: 'email' },
        { id: 'username', label: 'Username', type: 'text' },
        { id: 'password', label: 'Password', type: 'password', sensitive: true },
        { id: 'notes', label: 'Notes', type: 'textarea' },
        { id: 'auto_renew', label: 'Auto-Renews', type: 'checkbox' },
      ],
    },
    defaultData: { auto_renew: true },
    tags: ['subscription', 'finance', 'recurring'],
  },
};

// ============================================================================
// SUBSCRIPTION HELPERS
// ============================================================================

type Unsubscribe = () => void;
const activeListeners: Set<() => void> = new Set();

function makeSub<T>(getData: () => T, callback: (data: T) => void): Unsubscribe {
  // Call immediately after a short tick to mimic async Firestore
  const timer = setTimeout(() => callback(getData()), 50);
  const cleanup = () => clearTimeout(timer);
  activeListeners.add(cleanup);
  return () => {
    cleanup();
    activeListeners.delete(cleanup);
  };
}

function applyConstraints<T extends Record<string, any>>(items: T[], constraints: QueryConstraint[]): T[] {
  let result = [...items];
  for (const c of constraints) {
    if (c.type === 'where' && c.field && c.operator) {
      result = result.filter(item => {
        const val = item[c.field!];
        switch (c.operator) {
          case '==': return val === c.value;
          case '!=': return val !== c.value;
          case '<': return val < c.value;
          case '<=': return val <= c.value;
          case '>': return val > c.value;
          case '>=': return val >= c.value;
          case 'array-contains': return Array.isArray(val) && val.includes(c.value);
          case 'in': return Array.isArray(c.value) && c.value.includes(val);
          default: return true;
        }
      });
    }
    if (c.type === 'limit' && c.limitValue) {
      result = result.slice(0, c.limitValue);
    }
  }
  return result;
}

// Collection map for generic query/subscribe
function getCollection(name: string): Record<string, any>[] {
  switch (name) {
    case 'files': return Object.values(filesStore);
    case 'folders': return Object.values(foldersStore);
    case 'contacts': return Object.values(contactsStore);
    case 'contactRequests': return Object.values(contactRequestsStore);
    case 'formTemplates': return Object.values(templatesStore);
    default: return [];
  }
}

// ============================================================================
// MOCK BACKEND IMPLEMENTATION
// ============================================================================

let authCallback: ((user: User | null) => void) | null = null;

export const mockBackend: BackendInterface = {
  // AUTH
  getAuthInstance: () => null,
  getCurrentUser: () => DEMO_USER,
  onAuthStateChanged: (cb) => {
    authCallback = cb;
    setTimeout(() => cb(DEMO_USER), 10);
    return () => { authCallback = null; };
  },
  signInWithEmailAndPassword: async () => DEMO_USER,
  createUserWithEmailAndPassword: async () => DEMO_USER,
  signInWithGoogle: async () => DEMO_USER,
  linkWithGoogle: async () => DEMO_USER,
  signInWithOAuth: async () => DEMO_USER,
  linkWithOAuth: async () => DEMO_USER,
  createRecaptchaVerifier: () => null,
  signInWithPhoneNumber: async () => ({}),
  linkWithPhoneNumber: async () => ({}),
  verifyPhoneCode: async () => DEMO_USER,
  sendPasswordResetEmail: async () => {},
  sendEmailVerification: async () => {},
  updatePassword: async () => {},
  updateEmail: async () => {},
  linkEmailPassword: async () => {},
  unlinkProvider: async () => {},
  getLinkedProviders: () => ['google.com'],
  refreshAuthToken: async () => {},
  reloadUser: async () => {},
  signOut: async () => {},
  deleteCurrentAccount: async () => {},

  // USER PROFILES
  getUserProfile: async () => ({ ...DEMO_PROFILE }),
  updateUserProfile: async () => {},
  createUserProfile: async () => {},

  // FILES
  createFile: async (file) => {
    const id = `file_new_${Date.now()}`;
    filesStore[id] = { ...file, id, createdAt: new Date().toISOString(), lastModified: new Date().toISOString() } as any;
    return id;
  },
  getFile: async (fileId) => filesStore[fileId] ? { ...filesStore[fileId] } : null,
  updateFile: async (fileId, data) => {
    if (filesStore[fileId]) filesStore[fileId] = { ...filesStore[fileId], ...data };
  },
  deleteFile: async (fileId) => { delete filesStore[fileId]; },
  getUserFiles: async () => Object.values(filesStore).filter(f => f.owner === DEMO_USER.uid || f.sharedWith.includes(DEMO_USER.uid)),
  getSharedFiles: async () => Object.values(filesStore).filter(f => f.owner !== DEMO_USER.uid && f.sharedWith.includes(DEMO_USER.uid)),
  getFilesInFolder: async (_, folderId) => Object.values(filesStore).filter(f => (f.parent ?? null) === folderId && (f.owner === DEMO_USER.uid || f.sharedWith.includes(DEMO_USER.uid))),
  subscribeToUserFiles: (_, folderId, cb) => makeSub(
    () => Object.values(filesStore).filter(f => (f.parent ?? null) === folderId && (f.owner === DEMO_USER.uid || f.sharedWith.includes(DEMO_USER.uid))),
    cb
  ),
  subscribeToAllUserFiles: (_, cb) => makeSub(
    () => Object.values(filesStore).filter(f => f.owner === DEMO_USER.uid || f.sharedWith.includes(DEMO_USER.uid)),
    cb
  ),

  // FOLDERS
  createFolder: async (folder) => {
    const id = `folder_new_${Date.now()}`;
    foldersStore[id] = { ...folder, id, createdAt: new Date().toISOString(), lastModified: new Date().toISOString() } as any;
    return id;
  },
  getFolder: async (folderId) => foldersStore[folderId] ? { ...foldersStore[folderId] } : null,
  updateFolder: async (folderId, data) => {
    if (foldersStore[folderId]) foldersStore[folderId] = { ...foldersStore[folderId], ...data };
  },
  deleteFolder: async (folderId) => { delete foldersStore[folderId]; },
  getUserFolders: async () => Object.values(foldersStore).filter(f => f.owner === DEMO_USER.uid),
  subscribeToUserFolders: (_, cb) => makeSub(
    () => Object.values(foldersStore).filter(f => f.owner === DEMO_USER.uid),
    cb
  ),

  // STORAGE (no-ops — demo files don't have real blobs, except the pre-encrypted form)
  uploadFile: async () => {},
  downloadFile: async (storagePath) => {
    // Return pre-encrypted demo form data for the Emergency Contacts form file.
    // Encrypted with all-zeros AES-GCM key (matches DEMO_FILE_KEY) + all-zeros IV.
    if (storagePath?.includes('file_emergency_contacts')) {
      return new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,181,133,45,88,57,1,15,15,115,47,231,233,193,209,243,121,31,5,33,240,21,227,71,17,163,197,144,224,22,127,21,205,178,36,197,73,46,62,146,89,109,202,58,69,51,105,81,152,53,56,233,219,163,210,27,85,15,8,116,151,210,46,22,61,166,161,253,0,72,199,67,21,90,183,157,206,113,179,75,130,223,221,44,209,180,171,194,15,220,158,46,86,102,106,48,157,152,215,70,248,58,181,227,30,108,128,135,245,213,2,204,25,138,80,195,135,10,90,143,151,10,225,222,107,247,53,90,48,113,82,240,143,75,232,204,156,5,204,188,5,24,166,225,180,155,36,114,184,210,66,88,242,199,112,217,21,219,102,189,28,214,64,201,135,136,117,139,93,218,52,209,240,83,106,134,177,209,11,70,124,88,40,16,2,197,51,148,91,130,13,74,7,27,238,90,236,105,56,132,124,144,150,37,223,36,243,45,175,221,214,98,93,188,197,73,143,221,11,182,12,8,153,223,67,113,178,140,120,8,151,51,216,203,177,116,151,108,164,117,4,98,244,173,11,243,180,214,181,79,61,143,105,221,178,145,81,0,64,41,90,57,29,98,157,252,134,200,250,133,215,221,103,25,35,26,25,15,126,229,74,183,48,57,31,85,119,138,125,142,153,175,206,231,34,252,85,42,42,186,122,0,45,17,167,111,98,3,244,16,150,96,170,232,122,129,215,143,194,84,156,18,249,43,6,48,108,15,185,58,155,156,244,4,162,144,133,80,201,197,233,104,135,140,67,130,139,76,14,73,44,167,238,229,242,194,75,119,252,182,97,200,113,139,122,142,125,14,226,244,153,233,106,252,88,158,37,12,54,62,91,238,186,244,53,226,43,150,122,192,251,208,222,0,163,156,223,180,80,85,163,67,205,195,189,255,235,87,86,142,84,203,198,161,107,180,189,217,158,62,247,1,173,190,53,252,191,145,107,150,148,129,151,96,79,222,146,228,204,81,100,255,79,120,145,181,138,78,97,192,99,89,182,76,44,205,77,72,106,65,142,194,79,171,8,168,44,217,132,24,209,69,12,50,53,73,171,148,180,89,165,60,72,188,75,1,245,195,94,240,40,32,195,126,159,225,34,43,225,25,252,203,223,154,156,158,246,3,48,219,50,105,159,155,102,150,112,189,250,125,251,227,192,38,247,180,164,0,134,162,147,255,148,2,42,22,168,40,74,251,215,128,95,210,43,11,80,241,67,198,174,211,240,83,132,63,243,239,95,203,166,125,136,184,19,102,208,55,255,230,67,113,95,243,179,244,66,82,35,20,56,56,190,143,237,90,33,141,91,189,131,98,119,61,47,251,145,190,4,185,126,188,0,117,171,227,142,194,123,109,108,26,20,143,194,38,113,37,149,45,76,167,238,74,151,250,139,152,39,55,44,186,200,113,128,15,236,227,217,98,27,169,208,159,238,144,130,217,47,83,243,236,210,90,32,26,56,159,42,117,183,157,135,14,53,90,36,92,34,113,79,140,57,73,227,25,179,37,43,32,103,190,38,174,245,253,245,44,247,20,7,44,150,6,71,47,181,112,53,167,43,215,189,36,143,80,221,183,245,186,34,47,153,140,108,165,241,242,57,52,41,182,111,68,163,217,73,118,231,164,123,24,198,35,125,10,14,251,120,51,11,48,15,9,171,242,123,195,100,37,192,57,87,206,178,92,237,237,138,91,151,31,247,241,251,67,216,134,156,209,94,62,18,27,233,202,76,197,67,124,10,211,2,148,29,76,182,41,28,161,216,233,127,223,159,139,136,226,169,133,167,46,12,224,83,51,76,230,17,170,79,169,191,22,163,100,118,138,43,125,145,223,32,192,18,151,204,207,8,55,174,211,155,51,126,162,155,224,15,11,117,153,151,101,217,34,91,63,159,26,21,67,117,70,33,209,89,53,159,93,39,118,188,176,96,250,227,42,117,182,207,233,149,46,70,54,252,41,159,186,99,244,193,58,153,238,21,70,5,14,131,149,179,115,133,181,162,109,250,141,71,13,220,85,61,23,101,65,26,180,232,193,174,46,71,138,122,25,35,160,113,251,22,211,29,57,72,51,92,69,65,241,47,65,187,181,183,204,11,102,38,87,26,66,84,8,169,4,4,3,16,149,125,98,186,14,43,129,187,145,122,14,233,62,207,250,106,190,89,235,143,102,217,88,111,63,74,8,189,5,206,70,37,106,40,47,234,232,194,157,23,176,12]);
    }
    return new Uint8Array(0);
  },
  getFileDownloadURL: async (path) => `data:text/plain;base64,${btoa('demo:' + path)}`,
  deleteStorageFile: async () => {},
  listStorageFiles: async () => ({ items: [], prefixes: [] }),

  // CONTACTS
  getContact: async (id) => contactsStore[id] ? { ...contactsStore[id] } : null,
  createContact: async (contact) => {
    const id = `contact_${Date.now()}`;
    contactsStore[id] = { ...contact, id, createdAt: new Date().toISOString(), lastInteractionAt: new Date().toISOString() } as any;
    return id;
  },
  updateContact: async (id, data) => {
    if (contactsStore[id]) contactsStore[id] = { ...contactsStore[id], ...data };
  },
  deleteContact: async (id) => { delete contactsStore[id]; },
  getUserContacts: async () => Object.values(contactsStore).filter(
    c => c.userId1 === DEMO_USER.uid || c.userId2 === DEMO_USER.uid
  ),
  createContactRequest: async (req) => {
    const id = `req_${Date.now()}`;
    contactRequestsStore[id] = { ...req, id, createdAt: new Date().toISOString() } as any;
    return id;
  },
  getContactRequest: async (id) => contactRequestsStore[id] ? { ...contactRequestsStore[id] } : null,
  updateContactRequest: async (id, data) => {
    if (contactRequestsStore[id]) contactRequestsStore[id] = { ...contactRequestsStore[id], ...data };
  },
  deleteContactRequest: async (id) => { delete contactRequestsStore[id]; },
  getUserContactRequests: async () => Object.values(contactRequestsStore).filter(
    r => r.toUserId === DEMO_USER.uid || r.fromUserId === DEMO_USER.uid
  ),

  // GENERIC QUERY
  query: async (collectionName, constraints) => {
    const items = getCollection(collectionName);
    return applyConstraints(items, constraints);
  },
  subscribeToQuery: (collectionName, constraints, cb) => makeSub(
    () => applyConstraints(getCollection(collectionName), constraints),
    cb
  ),
  queryPath: async (path, constraints) => {
    // Handle subcollection paths: "files/{docId}/messages"
    const parts = path.split('/');
    if (parts.length === 3 && parts[0] === 'files' && parts[2] === 'messages') {
      const conversationId = parts[1];
      const msgs = Object.values(chatMessagesStore[conversationId] ?? {});
      return applyConstraints(msgs, constraints);
    }
    const top = parts[0];
    return applyConstraints(getCollection(top), constraints);
  },
  subscribeToQueryPath: (path, constraints, cb) => {
    const parts = path.split('/');
    if (parts.length === 3 && parts[0] === 'files' && parts[2] === 'messages') {
      const conversationId = parts[1];
      return makeSub(
        () => applyConstraints(Object.values(chatMessagesStore[conversationId] ?? {}), constraints),
        cb
      );
    }
    const top = parts[0];
    return makeSub(() => applyConstraints(getCollection(top), constraints), cb);
  },

  // BATCH OPERATIONS
  batchUpdate: async (ops) => {
    for (const op of ops) {
      const store: any = { files: filesStore, folders: foldersStore, formTemplates: templatesStore }[op.collection];
      if (store && store[op.id]) store[op.id] = { ...store[op.id], ...op.data };
    }
  },
  batchSet: async (ops) => {
    for (const op of ops) {
      const store: any = { files: filesStore, folders: foldersStore, formTemplates: templatesStore }[op.collection];
      if (store) store[op.id] = { ...op.data, id: op.id };
    }
  },
  batchDelete: async (ops) => {
    for (const op of ops) {
      const store: any = { files: filesStore, folders: foldersStore, formTemplates: templatesStore }[op.collection];
      if (store) delete store[op.id];
    }
  },

  // CLOUD FUNCTIONS (no-ops)
  callFunction: async () => ({} as any),

  // MESSAGING (no-ops)
  getMessagingToken: async () => null,
  onMessageReceived: () => () => {},
  requestNotificationPermission: async () => 'denied',
  deleteMessagingToken: async () => {},

  // DOCUMENT SUBSCRIPTIONS
  subscribeToDocument: (_, __, cb) => { setTimeout(() => cb(null), 50); return () => {}; },
  subscribeToDocumentPath: (_, cb) => { setTimeout(() => cb(null), 50); return () => {}; },

  // DOCUMENT OPERATIONS
  getDocument: async (collectionName, id) => {
    const store: any = { users: { [DEMO_USER.uid]: DEMO_PROFILE }, formTemplates: templatesStore, files: filesStore }[collectionName];
    return store?.[id] ?? null;
  },
  setDocument: async (collectionName, id, data) => {
    const store: any = { formTemplates: templatesStore }[collectionName];
    if (store) store[id] = { ...data, id };
  },
  addDocument: async (collectionName, data) => {
    const id = `${collectionName}_${Date.now()}`;
    const store: any = { formTemplates: templatesStore }[collectionName];
    if (store) store[id] = { ...data, id };
    return id;
  },
  addDocumentPath: async (path, data) => {
    const id = `${path.replace(/\//g, '_')}_${Date.now()}`;
    return id;
  },
  updateDocument: async (collectionName, id, data) => {
    const store: any = { formTemplates: templatesStore }[collectionName];
    if (store?.[id]) store[id] = { ...store[id], ...data };
  },
  deleteDocument: async (collectionName, id) => {
    const store: any = { formTemplates: templatesStore }[collectionName];
    if (store) delete store[id];
  },

  // SERVER TIMESTAMP & FIELD VALUES
  getServerTimestamp: () => new Date().toISOString(),
  arrayUnion: (...elements: any[]) => elements,
  arrayRemove: (...elements: any[]) => elements,
  increment: (n: number) => n,
  deleteField: () => undefined,
};

export const backend = mockBackend;
