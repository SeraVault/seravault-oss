import { vi } from 'vitest'
import type { User } from 'firebase/auth'
import type { FileData } from '../../src/files'

// Mock user data
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  emailVerified: true,
  displayName: 'Test User',
  isAnonymous: false,
  metadata: {
    creationTime: '2024-01-01T00:00:00.000Z',
    lastSignInTime: '2024-01-01T00:00:00.000Z',
  },
  providerData: [],
  refreshToken: 'mock-refresh-token',
  tenantId: null,
  delete: vi.fn(),
  getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
  getIdTokenResult: vi.fn(),
  reload: vi.fn(),
  toJSON: vi.fn(),
  ...overrides,
})

// Mock file data
export const createMockFileData = (overrides: Partial<FileData> = {}): FileData => ({
  id: 'file-123',
  owner: 'test-user-123',
  name: 'test-document.txt',
  parent: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  size: '1024',
  storagePath: 'files/test-user-123/file-123',
  encryptedKeys: {
    'test-user-123': 'mock-encrypted-key'
  },
  sharedWith: ['test-user-123'],
  isFavorite: false,
  ...overrides,
})

// Mock folder data
export const createMockFolderData = (overrides: any = {}) => ({
  id: 'folder-123',
  owner: 'test-user-123',
  name: 'Test Folder',
  parent: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  encryptedKeys: {
    'test-user-123': 'mock-encrypted-folder-key'
  },
  ...overrides,
})

// Mock form data
export const createMockFormData = (overrides: any = {}) => ({
  metadata: {
    id: 'form-123',
    name: 'Test Form',
    description: 'A test form',
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
  },
  schema: {
    fields: [
      {
        id: 'name',
        type: 'text',
        label: 'Full Name',
        required: true,
        sensitive: false,
      },
      {
        id: 'email',
        type: 'email',
        label: 'Email Address',
        required: true,
        sensitive: false,
      }
    ]
  },
  template: {
    name: 'Basic Form',
    description: 'Basic form template',
    category: 'personal',
    titleField: 'name',
    fields: []
  },
  data: {
    name: 'John Doe',
    email: 'john@example.com'
  },
  ...overrides,
})

// Crypto test utilities
export const createMockKeyPair = () => ({
  publicKey: new Uint8Array(32).fill(1),
  privateKey: new Uint8Array(32).fill(2),
})

export const createMockEncryptedData = () => ({
  encapsulatedKey: new Uint8Array(32).fill(3),
  ciphertext: new Uint8Array(64).fill(4),
})

// Test data generators
export const generateTestFiles = (count: number): FileData[] => {
  return Array.from({ length: count }, (_, i) => createMockFileData({
    id: `file-${i}`,
    name: `test-file-${i}.txt`,
    size: `${(i + 1) * 1024}`,
  }))
}

export const generateTestFolders = (count: number) => {
  return Array.from({ length: count }, (_, i) => createMockFolderData({
    id: `folder-${i}`,
    name: `Test Folder ${i}`,
  }))
}

// Wait utilities for async tests
export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0))

export const waitForCondition = async (
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> => {
  const start = Date.now()
  
  while (!condition() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  
  if (!condition()) {
    throw new Error(`Condition not met within ${timeout}ms`)
  }
}

// Mock implementations for common functions
export const mockCryptoFunctions = {
  generateKeyPair: vi.fn().mockResolvedValue(createMockKeyPair()),
  encryptData: vi.fn().mockResolvedValue(createMockEncryptedData()),
  decryptData: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  encryptForMultipleRecipients: vi.fn().mockResolvedValue({
    encryptedContent: new Uint8Array([5, 6, 7, 8]),
    encryptedKeys: { 'user1': 'encrypted-key-1', 'user2': 'encrypted-key-2' }
  }),
  hexToBytes: vi.fn().mockImplementation((hex: string) => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes
  }),
  bytesToHex: vi.fn().mockImplementation((bytes: Uint8Array) => {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }),
}

export const mockFirebaseFunctions = {
  getUserProfile: vi.fn().mockResolvedValue({
    publicKey: 'mock-public-key',
    email: 'test@example.com',
  }),
  createFileWithSharing: vi.fn().mockResolvedValue('mock-file-id'),
  updateFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  uploadFileData: vi.fn().mockResolvedValue(undefined),
  getFile: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
}

// Custom matchers for testing encrypted data
export const expectToBeEncrypted = (data: any) => {
  expect(data).toBeDefined()
  expect(data).not.toEqual('')
  // Add more specific encryption validation as needed
}

export const expectToBeValidFileData = (file: any) => {
  expect(file).toHaveProperty('id')
  expect(file).toHaveProperty('name')
  expect(file).toHaveProperty('owner')
  expect(file).toHaveProperty('createdAt')
  expect(file).toHaveProperty('storagePath')
  expect(file).toHaveProperty('encryptedKeys')
  expect(file).toHaveProperty('sharedWith')
}

// Performance testing helpers
export const measureExecutionTime = async <T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> => {
  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start
  return { result, duration }
}

// Memory leak detection helper
export const detectMemoryLeaks = (beforeCount: number, afterCount: number) => {
  const difference = afterCount - beforeCount
  if (difference > 100) { // arbitrary threshold
    console.warn(`Potential memory leak detected: ${difference} objects created`)
  }
  return difference
}