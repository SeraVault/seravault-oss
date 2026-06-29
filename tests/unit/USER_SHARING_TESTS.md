# User Creation, Key Setup, and File Sharing Tests

Comprehensive test suite for validating user creation, quantum-safe key management (ML-KEM-768), and secure file sharing between users.

## Test Coverage

### 1. User Creation and Key Setup (7 tests)
- ✅ Create user with email and password
- ✅ Generate valid ML-KEM-768 key pair (1184-byte public, 2400-byte private)
- ✅ Store public key in user profile
- ✅ Encrypt and store private key
- ✅ User sign-in authentication
- ✅ Multiple users with unique keys
- ✅ Firebase Auth and Firestore integration

### 2. Quantum-Safe Encryption (3 tests)
- ✅ Encrypt and decrypt data with ML-KEM-768
- ✅ Fail to decrypt with wrong private key
- ✅ Nonce randomization (same data encrypts differently)

### 3. File Creation and Encryption (4 tests)
- ✅ Create encrypted file for single user
- ✅ Encrypt file metadata (name and size)
- ✅ Encrypt file content in storage
- ✅ Decrypt file with owner's private key

### 4. File Sharing Between Users (6 tests)
- ✅ Share file between two users
- ✅ Recipient can decrypt shared file
- ✅ Share file with multiple users (3+)
- ✅ All recipients can decrypt shared file
- ✅ Add user to existing shared file
- ✅ Per-recipient key encapsulation

### 5. Sharing Permissions and Security (6 tests)
- ✅ User without key cannot decrypt
- ✅ sharedWith array matches encrypted keys
- ✅ Remove user from shared file
- ✅ Require public key for sharing
- ✅ Validate ML-KEM-768 key sizes
- ✅ Access control enforcement

### 6. Edge Cases and Error Handling (7 tests)
- ✅ Empty file content
- ✅ Large file content (100 KB)
- ✅ Special characters and Unicode
- ✅ User profile without public key
- ✅ File with no recipients (should fail)
- ✅ Concurrent sharing operations
- ✅ Graceful error handling

### 7. File Metadata Encryption (3 tests)
- ✅ Encrypt file name
- ✅ Decrypt file metadata
- ✅ Encrypt file size

### 8. Query Shared Files (2 tests)
- ✅ Query files shared with user
- ✅ Query files owned by user

**Total: 38 tests**

## Prerequisites

### 1. Firebase Emulators
Start Firebase emulators before running tests:
```bash
firebase emulators:start
```

Required emulators:
- **Authentication**: Port 9099
- **Firestore**: Port 8080
- **Storage**: Port 9199

### 2. Environment Variables
Ensure `.env` file has Firebase configuration:
```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### 3. Dependencies
All dependencies should be installed:
```bash
npm install
```

Key dependencies:
- `vitest` - Test runner
- `@noble/post-quantum` - ML-KEM-768 implementation
- `@noble/hashes` - Argon2id for key derivation
- `firebase` - Firebase SDK

## Running the Tests

### Run All Sharing Tests
```bash
npm test -- --run user-sharing
```

### Run in Watch Mode
```bash
npm test user-sharing
```

### Run with Coverage
```bash
npm run test:coverage -- user-sharing
```

### Run with UI
```bash
npm run test:ui
# Then navigate to user-sharing.test.ts
```

### Run Specific Test Suite
```bash
# User creation only
npm test -- --run user-sharing -t "User Creation and Key Setup"

# File sharing only
npm test -- --run user-sharing -t "File Sharing Between Users"

# Edge cases only
npm test -- --run user-sharing -t "Edge Cases"
```

## Test Architecture

### Test Flow
1. **Setup**: Create test users with quantum-safe key pairs
2. **Encrypt**: Create and encrypt files for one or more users
3. **Share**: Add additional users to shared files
4. **Decrypt**: Verify all recipients can decrypt content
5. **Cleanup**: Remove test data from Firebase

### Key Helper Functions

#### `createTestUser(displayName: string): Promise<TestUser>`
Creates a complete test user:
- Firebase Auth account
- ML-KEM-768 key pair (1184-byte public, 2400-byte private)
- Firestore user profile with keys
- Returns user credentials and keys

#### `createTestFile(owner, fileName, content, sharedWith): Promise<FileData>`
Creates an encrypted file:
- Encrypts content with AES-256-GCM
- Encrypts file key with ML-KEM-768 for each user
- Uploads encrypted content to Storage
- Creates Firestore document with metadata
- Returns file data with IDs

#### `uploadFileToStorage(storagePath, content): Promise<void>`
Uploads encrypted content to Firebase Storage

### Cleanup Strategy
After each test:
1. Delete all created files from Firestore
2. Delete all uploaded files from Storage
3. Delete all created user profiles
4. Sign out from Firebase Auth
5. Reset tracking arrays

This ensures test isolation and prevents data leakage.

## Understanding the Tests

### User Creation Flow
```typescript
// 1. Create Firebase Auth user
const userCredential = await createUserWithEmailAndPassword(auth, email, password);

// 2. Generate ML-KEM-768 key pair
const keyPair = await generateKeyPair();
// publicKey: 1184 bytes
// privateKey: 2400 bytes

// 3. Create Firestore profile
const userProfile = {
  displayName: 'Alice',
  email: 'alice@test.com',
  publicKey: bytesToHex(keyPair.publicKey), // Hex string (2368 chars)
  encryptedPrivateKey: {
    ciphertext: bytesToHex(keyPair.privateKey), // In real app, encrypted with passphrase
    salt: 'salt',
    nonce: 'nonce'
  }
};
await setDoc(doc(db, 'users', uid), userProfile);
```

### File Encryption Flow
```typescript
// 1. Generate random 256-bit file key
const fileKey = crypto.getRandomValues(new Uint8Array(32));

// 2. Encrypt content with AES-256-GCM
const iv = crypto.getRandomValues(new Uint8Array(12));
const encryptedContent = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  aesKey,
  content
);

// 3. Encrypt file key for each recipient with ML-KEM-768
for (const userId of userIds) {
  const publicKey = await getUserPublicKey(userId);
  const encryptedKeyResult = await encryptData(fileKey, publicKey);
  // Store: IV + encapsulated_key + ciphertext
  encryptedKeys[userId] = bytesToHex(combinedKeyData);
}

// 4. Upload to Storage and create Firestore doc
await uploadBytes(storageRef, encryptedContent);
await addDoc(collection(db, 'files'), fileData);
```

### File Sharing Flow
```typescript
// 1. Owner decrypts file key with their private key
const ownerEncryptedKey = file.encryptedKeys[ownerId];
const fileKey = await decryptFileKey(ownerEncryptedKey, ownerPrivateKey);

// 2. Re-encrypt file key for new recipient
const recipientPublicKey = await getUserPublicKey(recipientId);
const recipientEncryptedKey = await encryptData(fileKey, recipientPublicKey);

// 3. Update Firestore document
await updateDoc(doc(db, 'files', fileId), {
  [`encryptedKeys.${recipientId}`]: recipientEncryptedKey,
  sharedWith: arrayUnion(recipientId)
});
```

### File Decryption Flow
```typescript
// 1. Get user's encrypted key from file
const userEncryptedKey = file.encryptedKeys[userId];

// 2. Parse encrypted key (IV + encapsulated_key + ciphertext)
const keyData = hexToBytes(userEncryptedKey);
const iv = keyData.slice(0, 12);
const encapsulatedKey = keyData.slice(12, 12 + 1088); // ML-KEM-768 size
const ciphertext = keyData.slice(12 + 1088);

// 3. Decrypt file key with ML-KEM-768
const privateKeyBytes = hexToBytes(userPrivateKey);
const fileKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);

// 4. Download encrypted content from Storage
const encryptedContent = await getBytes(storageRef);

// 5. Decrypt content with AES-256-GCM
const contentIv = encryptedContent.slice(0, 12);
const contentCiphertext = encryptedContent.slice(12);
const decrypted = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv: contentIv },
  aesKey,
  contentCiphertext
);
```

## Expected Results

### Successful Test Run
```bash
✓ tests/unit/user-sharing.test.ts (38 tests)
  ✓ User Creation and Key Setup (7)
  ✓ Quantum-Safe Encryption (3)
  ✓ File Creation and Encryption (4)
  ✓ File Sharing Between Users (6)
  ✓ Sharing Permissions and Security (6)
  ✓ Edge Cases and Error Handling (7)
  ✓ File Metadata Encryption (3)
  ✓ Query Shared Files (2)

Test Files  1 passed (1)
     Tests  38 passed (38)
  Duration  ~5-10s (depends on emulator speed)
```

### What Gets Validated
- ✅ Firebase Auth user creation
- ✅ ML-KEM-768 key generation (correct sizes)
- ✅ Public key storage in Firestore
- ✅ Private key encryption and storage
- ✅ File content encryption with AES-256-GCM
- ✅ File metadata encryption (name, size)
- ✅ Per-recipient key encapsulation
- ✅ Multi-user file sharing
- ✅ Decryption by all authorized users
- ✅ Access control enforcement
- ✅ Storage upload/download
- ✅ Firestore queries for shared files
- ✅ Concurrent operations
- ✅ Error handling for edge cases

## Troubleshooting

### Error: "Firebase emulators not running"
**Solution**: Start emulators first:
```bash
firebase emulators:start
```

### Error: "Cannot decrypt with ML-KEM-768"
**Cause**: Key size mismatch or incorrect key format
**Check**:
- Public key should be 1184 bytes (2368 hex chars)
- Private key should be 2400 bytes (4800 hex chars)
- Encapsulated key should be 1088 bytes

### Error: "User public key not found"
**Cause**: User profile doesn't have publicKey field
**Solution**: Ensure `createTestUser()` stores public key:
```typescript
const userProfile = {
  displayName: 'Alice',
  email: 'alice@test.com',
  publicKey: bytesToHex(keyPair.publicKey) // Required
};
```

### Tests Hanging
**Cause**: Emulators not running or network timeout
**Solutions**:
1. Verify emulators are running: `firebase emulators:start`
2. Check emulator ports (Auth: 9099, Firestore: 8080, Storage: 9199)
3. Use timeout command: `timeout 30 npm test -- --run user-sharing`

### Storage Upload Failures
**Cause**: Storage emulator not configured
**Solution**: Check `firebase.json` includes:
```json
{
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 }
  }
}
```

### Cleanup Errors
**Cause**: Documents already deleted or don't exist
**Solution**: Errors are caught and logged as warnings, tests continue

### Large File Test Timeout
**Cause**: 100 KB file encryption is slow
**Solution**: Tests have sufficient timeout (default 5s per test)

## Key Concepts

### ML-KEM-768 (Kyber)
- **Post-quantum** key encapsulation mechanism
- **Public key**: 1184 bytes
- **Private key**: 2400 bytes
- **Encapsulated key**: 1088 bytes (ciphertext)
- **Shared secret**: 32 bytes (for AES key derivation)

### AES-256-GCM
- Symmetric encryption for file content
- **Key size**: 256 bits (32 bytes)
- **IV size**: 96 bits (12 bytes)
- **Authentication**: Built-in auth tag (16 bytes)

### Hybrid Encryption
1. Generate random **file key** (32 bytes)
2. Encrypt **file content** with file key (AES-256-GCM)
3. Encrypt **file key** for each user (ML-KEM-768)
4. Store encrypted content + per-user encrypted keys

### Per-Recipient Key Encapsulation
- Each user gets their own encrypted copy of the file key
- File content is encrypted once (efficient)
- File key is re-encrypted for each recipient (secure)
- Users cannot see other users' encrypted keys
- Owner can revoke access by removing user's encrypted key

## CI/CD Integration

### GitHub Actions Example
```yaml
name: User Sharing Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Firebase Tools
        run: npm install -g firebase-tools
      
      - name: Start Firebase Emulators
        run: |
          firebase emulators:start --only auth,firestore,storage &
          sleep 10
      
      - name: Run User Sharing Tests
        run: npm test -- --run user-sharing
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
```

### Local Pre-commit Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Start emulators in background
firebase emulators:start --only auth,firestore,storage &
EMULATOR_PID=$!
sleep 5

# Run tests
npm test -- --run user-sharing

# Capture exit code
TEST_EXIT_CODE=$?

# Stop emulators
kill $EMULATOR_PID

# Exit with test result
exit $TEST_EXIT_CODE
```

## Performance Considerations

### Test Execution Time
- **User creation**: ~100-200ms per user (key generation)
- **File encryption**: ~50-100ms per file
- **File sharing**: ~100ms per additional user
- **File decryption**: ~50ms per user
- **Total suite**: ~5-10 seconds (38 tests)

### Optimization Tips
1. **Parallel user creation**: Create multiple users in parallel
2. **Reuse users**: Keep users between related tests (requires careful cleanup)
3. **Mock Storage**: Use in-memory storage for faster tests
4. **Batch operations**: Share with multiple users in one call

### Production vs Test
**Test differences**:
- Uses emulators (no real Firebase)
- Simplified key encryption (real app uses Argon2id with passphrase)
- Smaller file sizes
- No network latency
- Automatic cleanup

**Production equivalents**:
- Real Firebase services
- Passphrase-protected private keys
- Larger files (up to 5 GB)
- Network overhead
- Manual cleanup/retention policies

## Next Steps

1. **Run tests**: Verify all 38 tests pass
2. **Add to CI/CD**: Integrate into deployment pipeline
3. **Extend coverage**:
   - Folder sharing tests
   - Group sharing tests
   - Permission inheritance tests
   - Key rotation tests
4. **Performance tests**: Large files (multi-MB)
5. **Security audits**: Penetration testing

## Related Documentation
- [Subscription Tests](./SUBSCRIPTION_TESTS.md)
- [Crypto Tests](./crypto.test.ts)
- [Security Whitepaper](../../landing/security-whitepaper.html)
- [Firebase Setup](../../FIREBASE_SETUP.md)
