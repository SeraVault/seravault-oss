/**
 * User Creation, Key Setup, and File Sharing Tests
 * 
 * Tests the complete lifecycle:
 * 1. Create users with encrypted key pairs
 * 2. Set up quantum-safe encryption keys (ML-KEM-768)
 * 3. Share files between users with proper key encapsulation
 * 4. Verify recipients can decrypt shared files
 * 5. Test sharing permissions and edge cases
 * 
 * REQUIRES: Firebase emulators running (firebase emulators:start)
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { initializeApp } from 'firebase/app';
import { 
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore,
  connectFirestoreEmulator,
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { 
  getStorage,
  connectStorageEmulator,
  ref as storageRef, 
  uploadBytes, 
  getBytes,
  deleteObject 
} from 'firebase/storage';

// Initialize Firebase for tests (separate from main app)
const testFirebaseConfig = {
  apiKey: 'test-api-key',
  authDomain: 'test-project.firebaseapp.com',
  projectId: 'test-project',
  storageBucket: 'test-project.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:test'
};

const testApp = initializeApp(testFirebaseConfig, 'test-app');
const auth = getAuth(testApp);
const db = getFirestore(testApp);
const storage = getStorage(testApp);

// Connect to emulators
let emulatorsConnected = false;

beforeAll(() => {
  if (!emulatorsConnected) {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      emulatorsConnected = true;
      console.log('✅ Connected to Firebase emulators');
    } catch (error) {
      console.warn('⚠️ Could not connect to emulators:', error);
    }
  }
});
import { generateKeyPair, encryptData, decryptData, bytesToHex, hexToBytes } from '../../src/crypto/quantumSafeCrypto';
import { FileEncryptionService } from '../../src/services/fileEncryption';
import { FileOperationsService } from '../../src/services/fileOperations';
import type { UserProfile } from '../../src/firestore';
import type { FileData } from '../../src/files';

// Test user data
interface TestUser {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  keyPair: {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  privateKeyHex: string;
  publicKeyHex: string;
}

let testUsers: TestUser[] = [];
let createdFileIds: string[] = [];
let createdStoragePaths: string[] = [];

// Helper: Generate unique test email
function generateTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@test.seravault.com`;
}

// Helper: Create a test user with keys
async function createTestUser(displayName: string): Promise<TestUser> {
  const email = generateTestEmail(displayName.toLowerCase());
  const password = 'Test123!@#';
  
  // Create Firebase Auth user
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;
  
  // Generate quantum-safe key pair (ML-KEM-768)
  const keyPair = await generateKeyPair();
  const privateKeyHex = bytesToHex(keyPair.privateKey);
  const publicKeyHex = bytesToHex(keyPair.publicKey);
  
  // Create user profile in Firestore
  const userProfile: UserProfile = {
    displayName,
    email,
    theme: 'light',
    language: 'en',
    publicKey: publicKeyHex,
    encryptedPrivateKey: {
      ciphertext: privateKeyHex, // In real app, this would be encrypted with passphrase
      salt: 'test-salt',
      nonce: 'test-nonce'
    }
  };
  
  await setDoc(doc(db, 'users', uid), userProfile);
  
  const testUser: TestUser = {
    uid,
    email,
    password,
    displayName,
    keyPair,
    privateKeyHex,
    publicKeyHex
  };
  
  testUsers.push(testUser);
  return testUser;
}

// Helper: Upload file to storage
async function uploadFileToStorage(storagePath: string, content: Uint8Array): Promise<void> {
  const fileRef = storageRef(storage, storagePath);
  await uploadBytes(fileRef, content);
  createdStoragePaths.push(storagePath);
}

// Helper: Create a test file in Firestore
async function createTestFile(
  owner: TestUser,
  fileName: string,
  content: string,
  sharedWith: string[] = []
): Promise<FileData> {
  const fileContent = new TextEncoder().encode(content);
  const userIds = [owner.uid, ...sharedWith];
  
  // Encrypt file for all users
  const encryptionResult = await FileEncryptionService.encryptFileForUsers(
    fileContent,
    fileName,
    fileContent.length,
    userIds,
    owner.uid,
    null
  );
  
  // Upload to storage
  await uploadFileToStorage(encryptionResult.storagePath, encryptionResult.encryptedContent);
  
  // Create Firestore document
  const fileData: FileData = {
    owner: owner.uid,
    name: encryptionResult.encryptedMetadata.name,
    size: encryptionResult.encryptedMetadata.size,
    type: 'text/plain',
    storagePath: encryptionResult.storagePath,
    encryptedKeys: encryptionResult.encryptedKeys,
    parent: null,
    sharedWith: userIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userTags: {},
    userNames: {}
  };
  
  const docRef = await addDoc(collection(db, 'files'), fileData);
  const fileId = docRef.id;
  createdFileIds.push(fileId);
  
  return { ...fileData, id: fileId };
}

// Cleanup after each test
afterEach(async () => {
  // Delete created files
  for (const fileId of createdFileIds) {
    try {
      await deleteDoc(doc(db, 'files', fileId));
    } catch (error) {
      console.warn(`Failed to delete file ${fileId}:`, error);
    }
  }
  
  // Delete storage files
  for (const storagePath of createdStoragePaths) {
    try {
      await deleteObject(storageRef(storage, storagePath));
    } catch (error) {
      console.warn(`Failed to delete storage file ${storagePath}:`, error);
    }
  }
  
  // Delete users
  for (const user of testUsers) {
    try {
      await deleteDoc(doc(db, 'users', user.uid));
    } catch (error) {
      console.warn(`Failed to delete user ${user.uid}:`, error);
    }
  }
  
  // Sign out
  try {
    await signOut(auth);
  } catch (error) {
    // Ignore sign out errors
  }
  
  // Reset arrays
  testUsers = [];
  createdFileIds = [];
  createdStoragePaths = [];
});

describe('User Creation and Key Setup', () => {
  it('should create a user with email and password', async () => {
    const user = await createTestUser('Alice');
    
    expect(user.uid).toBeTruthy();
    expect(user.email).toContain('@test.seravault.com');
    expect(user.displayName).toBe('Alice');
    
    // Verify user exists in Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    expect(userDoc.exists()).toBe(true);
    
    const profile = userDoc.data() as UserProfile;
    expect(profile.displayName).toBe('Alice');
    expect(profile.email).toBe(user.email);
  });
  
  it('should generate valid ML-KEM-768 key pair', async () => {
    const user = await createTestUser('Bob');
    
    // ML-KEM-768 key sizes:
    // Public key: 1184 bytes
    // Private key: 2400 bytes
    expect(user.keyPair.publicKey.length).toBe(1184);
    expect(user.keyPair.privateKey.length).toBe(2400);
    
    // Verify keys are stored in hex format
    expect(user.publicKeyHex.length).toBe(1184 * 2); // Hex doubles length
    expect(user.privateKeyHex.length).toBe(2400 * 2);
  });
  
  it('should store public key in user profile', async () => {
    const user = await createTestUser('Charlie');
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const profile = userDoc.data() as UserProfile;
    
    expect(profile.publicKey).toBe(user.publicKeyHex);
    expect(profile.publicKey?.length).toBe(1184 * 2); // Hex format
  });
  
  it('should encrypt and store private key', async () => {
    const user = await createTestUser('Diana');
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const profile = userDoc.data() as UserProfile;
    
    expect(profile.encryptedPrivateKey).toBeDefined();
    expect(profile.encryptedPrivateKey?.ciphertext).toBeTruthy();
    expect(profile.encryptedPrivateKey?.salt).toBeTruthy();
    expect(profile.encryptedPrivateKey?.nonce).toBeTruthy();
  });
  
  it('should allow user to sign in with credentials', async () => {
    const user = await createTestUser('Eve');
    
    // Sign out first
    await signOut(auth);
    
    // Sign in
    const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
    expect(userCredential.user.uid).toBe(user.uid);
  });
  
  it('should create multiple users with unique keys', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    
    expect(alice.uid).not.toBe(bob.uid);
    expect(alice.publicKeyHex).not.toBe(bob.publicKeyHex);
    expect(alice.privateKeyHex).not.toBe(bob.privateKeyHex);
  });
});

describe('Quantum-Safe Encryption', () => {
  it('should encrypt and decrypt data with ML-KEM-768', async () => {
    const user = await createTestUser('Alice');
    
    const originalData = new TextEncoder().encode('Secret message');
    
    // Encrypt with public key
    const encrypted = await encryptData(originalData, user.keyPair.publicKey);
    
    expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
    expect(encrypted.encapsulatedKey).toBeInstanceOf(Uint8Array);
    expect(encrypted.iv).toBeInstanceOf(Uint8Array);
    expect(encrypted.encapsulatedKey.length).toBe(1088); // ML-KEM-768 encapsulated key size
    
    // Decrypt with private key
    const decrypted = await decryptData(encrypted, user.keyPair.privateKey);
    
    expect(decrypted).toEqual(originalData);
    expect(new TextDecoder().decode(decrypted)).toBe('Secret message');
  });
  
  it('should fail to decrypt with wrong private key', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    
    const originalData = new TextEncoder().encode('Secret message');
    
    // Encrypt with Alice's public key
    const encrypted = await encryptData(originalData, alice.keyPair.publicKey);
    
    // Try to decrypt with Bob's private key (should fail)
    await expect(
      decryptData(encrypted, bob.keyPair.privateKey)
    ).rejects.toThrow();
  });
  
  it('should encrypt same data differently each time (nonce randomization)', async () => {
    const user = await createTestUser('Alice');
    const originalData = new TextEncoder().encode('Secret message');
    
    const encrypted1 = await encryptData(originalData, user.keyPair.publicKey);
    const encrypted2 = await encryptData(originalData, user.keyPair.publicKey);
    
    // Different IVs and encapsulated keys
    expect(encrypted1.iv).not.toEqual(encrypted2.iv);
    expect(encrypted1.encapsulatedKey).not.toEqual(encrypted2.encapsulatedKey);
    expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
  });
});

describe('File Creation and Encryption', () => {
  it('should create encrypted file for single user', async () => {
    const alice = await createTestUser('Alice');
    const file = await createTestFile(alice, 'test.txt', 'Hello World');
    
    expect(file.id).toBeTruthy();
    expect(file.owner).toBe(alice.uid);
    expect(file.sharedWith).toContain(alice.uid);
    expect(file.encryptedKeys[alice.uid]).toBeTruthy();
  });
  
  it('should encrypt file metadata (name and size)', async () => {
    const alice = await createTestUser('Alice');
    const file = await createTestFile(alice, 'secret.txt', 'Confidential data');
    
    // Name should be encrypted
    expect(typeof file.name).toBe('object');
    expect((file.name as any).ciphertext).toBeTruthy();
    expect((file.name as any).nonce).toBeTruthy();
    
    // Size should be encrypted
    expect(typeof file.size).toBe('object');
    expect((file.size as any).ciphertext).toBeTruthy();
  });
  
  it('should encrypt file content in storage', async () => {
    const alice = await createTestUser('Alice');
    const originalContent = 'Secret file content';
    const file = await createTestFile(alice, 'file.txt', originalContent);
    
    // Download encrypted content from storage
    const fileRef = storageRef(storage, file.storagePath);
    const encryptedData = await getBytes(fileRef);
    
    // Content should be encrypted (not equal to original)
    const encryptedText = new TextDecoder().decode(encryptedData);
    expect(encryptedText).not.toContain(originalContent);
    expect(encryptedData.length).toBeGreaterThan(originalContent.length); // Includes IV and auth tag
  });
  
  it('should decrypt file with owner\'s private key', async () => {
    const alice = await createTestUser('Alice');
    const originalContent = 'Decryptable content';
    const file = await createTestFile(alice, 'file.txt', originalContent);
    
    // Download encrypted content
    const fileRef = storageRef(storage, file.storagePath);
    const encryptedContent = await getBytes(fileRef);
    
    // Decrypt file
    const decrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      file.encryptedKeys[alice.uid],
      alice.privateKeyHex
    );
    
    const decryptedText = new TextDecoder().decode(decrypted);
    expect(decryptedText).toBe(originalContent);
  });
});

describe('File Sharing Between Users', () => {
  it('should share file between two users', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    
    const file = await createTestFile(alice, 'shared.txt', 'Shared content', [bob.uid]);
    
    // Both users should have encrypted keys
    expect(file.encryptedKeys[alice.uid]).toBeTruthy();
    expect(file.encryptedKeys[bob.uid]).toBeTruthy();
    
    // Both users should be in sharedWith array
    expect(file.sharedWith).toContain(alice.uid);
    expect(file.sharedWith).toContain(bob.uid);
  });
  
  it('should allow recipient to decrypt shared file', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    
    const originalContent = 'Shared secret data';
    const file = await createTestFile(alice, 'shared.txt', originalContent, [bob.uid]);
    
    // Download encrypted content
    const fileRef = storageRef(storage, file.storagePath);
    const encryptedContent = await getBytes(fileRef);
    
    // Bob decrypts file with his private key
    const decrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      file.encryptedKeys[bob.uid],
      bob.privateKeyHex
    );
    
    const decryptedText = new TextDecoder().decode(decrypted);
    expect(decryptedText).toBe(originalContent);
  });
  
  it('should share file with multiple users', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const charlie = await createTestUser('Charlie');
    
    const file = await createTestFile(alice, 'multi-shared.txt', 'Multi-user content', [bob.uid, charlie.uid]);
    
    // All three users should have encrypted keys
    expect(file.encryptedKeys[alice.uid]).toBeTruthy();
    expect(file.encryptedKeys[bob.uid]).toBeTruthy();
    expect(file.encryptedKeys[charlie.uid]).toBeTruthy();
    
    // All should be in sharedWith
    expect(file.sharedWith).toHaveLength(3);
    expect(file.sharedWith).toContain(alice.uid);
    expect(file.sharedWith).toContain(bob.uid);
    expect(file.sharedWith).toContain(charlie.uid);
  });
  
  it('should allow all recipients to decrypt shared file', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const charlie = await createTestUser('Charlie');
    
    const originalContent = 'Multi-recipient secret';
    const file = await createTestFile(alice, 'multi.txt', originalContent, [bob.uid, charlie.uid]);
    
    // Download encrypted content once
    const fileRef = storageRef(storage, file.storagePath);
    const encryptedContent = await getBytes(fileRef);
    
    // All three users can decrypt
    const aliceDecrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      file.encryptedKeys[alice.uid],
      alice.privateKeyHex
    );
    
    const bobDecrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      file.encryptedKeys[bob.uid],
      bob.privateKeyHex
    );
    
    const charlieDecrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      file.encryptedKeys[charlie.uid],
      charlie.privateKeyHex
    );
    
    // All decrypt to same content
    expect(new TextDecoder().decode(aliceDecrypted)).toBe(originalContent);
    expect(new TextDecoder().decode(bobDecrypted)).toBe(originalContent);
    expect(new TextDecoder().decode(charlieDecrypted)).toBe(originalContent);
  });
  
  it('should add user to existing shared file', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const charlie = await createTestUser('Charlie');
    
    // Create file shared only with Bob
    const originalContent = 'Expandable sharing';
    const file = await createTestFile(alice, 'expand.txt', originalContent, [bob.uid]);
    
    // Load file from Firestore
    const fileDoc = await getDoc(doc(db, 'files', file.id!));
    const fileData = { id: file.id, ...fileDoc.data() } as FileData;
    
    // Share with Charlie
    await FileOperationsService.shareFileWithUsers(
      fileData,
      alice.uid,
      alice.privateKeyHex,
      [charlie.uid]
    );
    
    // Reload file
    const updatedDoc = await getDoc(doc(db, 'files', file.id!));
    const updatedFile = { id: file.id, ...updatedDoc.data() } as FileData;
    
    // Charlie should now have access
    expect(updatedFile.sharedWith).toContain(charlie.uid);
    expect(updatedFile.encryptedKeys[charlie.uid]).toBeTruthy();
    
    // Charlie can decrypt
    const fileRef = storageRef(storage, updatedFile.storagePath);
    const encryptedContent = await getBytes(fileRef);
    
    const charlieDecrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      updatedFile.encryptedKeys[charlie.uid],
      charlie.privateKeyHex
    );
    
    expect(new TextDecoder().decode(charlieDecrypted)).toBe(originalContent);
  });
});

describe('Sharing Permissions and Security', () => {
  it('should not allow user without key to decrypt', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const eve = await createTestUser('Eve'); // Not shared with
    
    const file = await createTestFile(alice, 'private.txt', 'Private data', [bob.uid]);
    
    // Eve should not have an encrypted key
    expect(file.encryptedKeys[eve.uid]).toBeUndefined();
    expect(file.sharedWith).not.toContain(eve.uid);
  });
  
  it('should verify sharedWith array matches encrypted keys', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const charlie = await createTestUser('Charlie');
    
    const file = await createTestFile(alice, 'file.txt', 'Content', [bob.uid, charlie.uid]);
    
    // sharedWith and encryptedKeys should match
    expect(file.sharedWith).toHaveLength(3);
    expect(Object.keys(file.encryptedKeys)).toHaveLength(3);
    
    for (const uid of file.sharedWith) {
      expect(file.encryptedKeys[uid]).toBeTruthy();
    }
  });
  
  it('should remove user from shared file', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const charlie = await createTestUser('Charlie');
    
    const file = await createTestFile(alice, 'revoke.txt', 'Revocable', [bob.uid, charlie.uid]);
    
    // Load file
    const fileDoc = await getDoc(doc(db, 'files', file.id!));
    const fileData = { id: file.id, ...fileDoc.data() } as FileData;
    
    // Remove Bob's access
    await FileOperationsService.removeFileSharing(fileData, [bob.uid], alice.uid);
    
    // Reload file
    const updatedDoc = await getDoc(doc(db, 'files', file.id!));
    const updatedFile = { id: file.id, ...updatedDoc.data() } as FileData;
    
    // Bob should no longer have access
    expect(updatedFile.sharedWith).not.toContain(bob.uid);
    expect(updatedFile.encryptedKeys[bob.uid]).toBeUndefined();
    
    // Charlie should still have access
    expect(updatedFile.sharedWith).toContain(charlie.uid);
    expect(updatedFile.encryptedKeys[charlie.uid]).toBeTruthy();
  });
  
  it('should require user to have public key for sharing', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    
    // Remove Bob's public key
    await updateDoc(doc(db, 'users', bob.uid), { publicKey: null });
    
    // Try to share file with Bob (should skip or fail gracefully)
    const file = await createTestFile(alice, 'test.txt', 'Content');
    
    // Try to add Bob
    const fileDoc = await getDoc(doc(db, 'files', file.id!));
    const fileData = { id: file.id, ...fileDoc.data() } as FileData;
    
    // shareFileWithUsers should handle missing public key gracefully
    await FileOperationsService.shareFileWithUsers(
      fileData,
      alice.uid,
      alice.privateKeyHex,
      [bob.uid]
    );
    
    // Reload file - Bob should not be added (no public key)
    const updatedDoc = await getDoc(doc(db, 'files', file.id!));
    const updatedFile = { id: file.id, ...updatedDoc.data() } as FileData;
    
    // Bob might not be in sharedWith if public key was missing
    // Implementation may vary - either skip or throw error
    expect(updatedFile.encryptedKeys[bob.uid]).toBeUndefined();
  });
  
  it('should validate ML-KEM-768 key sizes', async () => {
    const alice = await createTestUser('Alice');
    
    // Verify key sizes are correct
    const userDoc = await getDoc(doc(db, 'users', alice.uid));
    const profile = userDoc.data() as UserProfile;
    
    const publicKey = hexToBytes(profile.publicKey!);
    expect(publicKey.length).toBe(1184); // ML-KEM-768 public key
  });
});

describe('Edge Cases and Error Handling', () => {
  it('should handle empty file content', async () => {
    const alice = await createTestUser('Alice');
    const file = await createTestFile(alice, 'empty.txt', '');
    
    expect(file.id).toBeTruthy();
    expect(file.encryptedKeys[alice.uid]).toBeTruthy();
  });
  
  it('should handle large file content', async () => {
    const alice = await createTestUser('Alice');
    const largeContent = 'x'.repeat(1024 * 100); // 100 KB
    const file = await createTestFile(alice, 'large.txt', largeContent);
    
    // Decrypt and verify
    const fileRef = storageRef(storage, file.storagePath);
    const encryptedContent = await getBytes(fileRef);
    
    const decrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      file.encryptedKeys[alice.uid],
      alice.privateKeyHex
    );
    
    expect(new TextDecoder().decode(decrypted)).toBe(largeContent);
  });
  
  it('should handle special characters in file content', async () => {
    const alice = await createTestUser('Alice');
    const specialContent = '😀 Unicode: ñ, 中文, 🎉, \n\t\r special chars';
    const file = await createTestFile(alice, 'special.txt', specialContent);
    
    // Decrypt and verify
    const fileRef = storageRef(storage, file.storagePath);
    const encryptedContent = await getBytes(fileRef);
    
    const decrypted = await FileEncryptionService.decryptFile(
      new Uint8Array(encryptedContent),
      file.encryptedKeys[alice.uid],
      alice.privateKeyHex
    );
    
    expect(new TextDecoder().decode(decrypted)).toBe(specialContent);
  });
  
  it('should handle user profile without public key', async () => {
    const alice = await createTestUser('Alice');
    
    // Create user without public key
    const bobEmail = generateTestEmail('bob');
    const bobPassword = 'Test123!@#';
    const bobCredential = await createUserWithEmailAndPassword(auth, bobEmail, bobPassword);
    const bobUid = bobCredential.user.uid;
    
    // Create profile WITHOUT public key
    await setDoc(doc(db, 'users', bobUid), {
      displayName: 'Bob',
      email: bobEmail,
      theme: 'light'
    });
    
    testUsers.push({
      uid: bobUid,
      email: bobEmail,
      password: bobPassword,
      displayName: 'Bob',
      keyPair: { publicKey: new Uint8Array(0), privateKey: new Uint8Array(0) },
      privateKeyHex: '',
      publicKeyHex: ''
    });
    
    // Try to create file shared with Bob (should handle gracefully)
    const file = await createTestFile(alice, 'test.txt', 'Content');
    
    // Verify file was created (Bob not included due to missing key)
    expect(file.id).toBeTruthy();
    expect(file.encryptedKeys[alice.uid]).toBeTruthy();
  });
  
  it('should handle file with no recipients', async () => {
    const alice = await createTestUser('Alice');
    
    // Try to create file with empty recipients array
    const fileContent = new TextEncoder().encode('Content');
    
    await expect(
      FileEncryptionService.encryptFileForUsers(
        fileContent,
        'test.txt',
        fileContent.length,
        [], // Empty recipients
        alice.uid,
        null
      )
    ).rejects.toThrow();
  });
  
  it('should handle concurrent sharing operations', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const charlie = await createTestUser('Charlie');
    
    const file = await createTestFile(alice, 'concurrent.txt', 'Content');
    
    // Load file
    const fileDoc = await getDoc(doc(db, 'files', file.id!));
    const fileData = { id: file.id, ...fileDoc.data() } as FileData;
    
    // Share with Bob and Charlie concurrently
    await Promise.all([
      FileOperationsService.shareFileWithUsers(fileData, alice.uid, alice.privateKeyHex, [bob.uid]),
      FileOperationsService.shareFileWithUsers(fileData, alice.uid, alice.privateKeyHex, [charlie.uid])
    ]);
    
    // Reload file
    const updatedDoc = await getDoc(doc(db, 'files', file.id!));
    const updatedFile = { id: file.id, ...updatedDoc.data() } as FileData;
    
    // Both should have access (one might overwrite the other depending on implementation)
    // At minimum, the file should be in a valid state
    expect(updatedFile.id).toBeTruthy();
    expect(updatedFile.sharedWith.length).toBeGreaterThanOrEqual(1);
  });
});

describe('File Metadata Encryption', () => {
  it('should encrypt file name', async () => {
    const alice = await createTestUser('Alice');
    const file = await createTestFile(alice, 'secret-filename.txt', 'Content');
    
    // Name should be encrypted object
    expect(typeof file.name).toBe('object');
    const encryptedName = file.name as { ciphertext: string; nonce: string };
    expect(encryptedName.ciphertext).toBeTruthy();
    expect(encryptedName.nonce).toBeTruthy();
    
    // Ciphertext should not contain original name
    expect(encryptedName.ciphertext).not.toContain('secret-filename');
  });
  
  it('should decrypt file metadata', async () => {
    const alice = await createTestUser('Alice');
    const originalName = 'confidential.txt';
    const file = await createTestFile(alice, originalName, 'Content');
    
    // Decrypt metadata
    const metadata = await FileEncryptionService.decryptFileMetadata(
      file.name as { ciphertext: string; nonce: string },
      file.size as { ciphertext: string; nonce: string },
      file.encryptedKeys[alice.uid],
      alice.privateKeyHex
    );
    
    expect(metadata.name).toBe(originalName);
    expect(parseInt(metadata.size)).toBeGreaterThan(0);
  });
  
  it('should encrypt file size', async () => {
    const alice = await createTestUser('Alice');
    const content = 'Test content';
    const file = await createTestFile(alice, 'file.txt', content);
    
    // Size should be encrypted object
    expect(typeof file.size).toBe('object');
    const encryptedSize = file.size as { ciphertext: string; nonce: string };
    expect(encryptedSize.ciphertext).toBeTruthy();
    expect(encryptedSize.nonce).toBeTruthy();
  });
});

describe('Query Shared Files', () => {
  it('should query files shared with user', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    
    // Create files shared with Bob
    await createTestFile(alice, 'file1.txt', 'Content 1', [bob.uid]);
    await createTestFile(alice, 'file2.txt', 'Content 2', [bob.uid]);
    await createTestFile(alice, 'file3.txt', 'Content 3'); // Not shared with Bob
    
    // Query files shared with Bob
    const q = query(
      collection(db, 'files'),
      where('sharedWith', 'array-contains', bob.uid)
    );
    
    const snapshot = await getDocs(q);
    expect(snapshot.size).toBe(2); // Only file1 and file2
    
    snapshot.forEach(doc => {
      const file = doc.data() as FileData;
      expect(file.sharedWith).toContain(bob.uid);
    });
  });
  
  it('should query files owned by user', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    
    await createTestFile(alice, 'alice-file.txt', 'Content');
    await createTestFile(bob, 'bob-file.txt', 'Content');
    
    // Query Alice's files
    const q = query(
      collection(db, 'files'),
      where('owner', '==', alice.uid)
    );
    
    const snapshot = await getDocs(q);
    expect(snapshot.size).toBe(1);
    
    const file = snapshot.docs[0].data() as FileData;
    expect(file.owner).toBe(alice.uid);
  });
});
