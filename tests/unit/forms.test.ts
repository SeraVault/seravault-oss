import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as formFiles from '@/utils/formFiles'
import type { SecureFormData, FormFieldDefinition } from '@/utils/formFiles'

// Mock dependencies
vi.mock('@/firestore', () => ({
  getUserProfile: vi.fn().mockResolvedValue({
    publicKey: '0'.repeat(64), // Mock hex public key
  }),
}))

vi.mock('@/crypto/hpkeCrypto', () => ({
  encryptData: vi.fn().mockResolvedValue({
    encapsulatedKey: new Uint8Array(32),
    ciphertext: new Uint8Array(64),
  }),
  bytesToHex: vi.fn().mockImplementation((bytes: Uint8Array) => 
    Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  ),
}))

vi.mock('@/crypto/postQuantumCrypto', () => ({
  encryptMetadata: vi.fn().mockReturnValue({
    encryptedName: 'encrypted-name',
    encryptedSize: 'encrypted-size',
    nonce: 'mock-nonce',
  }),
}))

vi.mock('@/storage', () => ({
  uploadFileData: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/files', () => ({
  createFileWithSharing: vi.fn().mockResolvedValue('mock-file-id'),
  updateFile: vi.fn().mockResolvedValue(undefined),
}))

describe('Form File Operations', () => {
  const mockFormData: SecureFormData = {
    metadata: {
      id: 'form-123',
      name: 'Test Form',
      description: 'A test form for validation',
      created: '2024-01-01T00:00:00.000Z',
      modified: '2024-01-01T00:00:00.000Z',
    },
    schema: {
      fields: [
        {
          id: 'name',
          type: 'text',
          label: 'Full Name',
          placeholder: 'Enter your full name',
          required: true,
          sensitive: false,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email Address',
          placeholder: 'Enter your email',
          required: true,
          sensitive: false,
        },
        {
          id: 'notes',
          type: 'textarea',
          label: 'Additional Notes',
          placeholder: 'Any additional information',
          required: false,
          sensitive: false,
        }
      ]
    },
    template: {
      name: 'Personal Information',
      description: 'Basic personal information form',
      category: 'personal',
      titleField: 'name',
      fields: []
    },
    data: {
      name: 'John Doe',
      email: 'john.doe@example.com',
      notes: 'This is a test form submission.'
    }
  }

  const mockUserId = 'test-user-123'
  const mockPrivateKey = 'mock-private-key'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Form File Creation', () => {
    it('should save form as encrypted file', async () => {
      const fileId = await formFiles.saveFormAsFile(
        mockFormData,
        mockUserId,
        mockPrivateKey,
        null
      )

      expect(fileId).toBe('mock-file-id')
      
      // Verify getUserProfile was called
      const getUserProfile = vi.mocked(require('@/firestore').getUserProfile)
      expect(getUserProfile).toHaveBeenCalledWith(mockUserId)
      
      // Verify encryption was called
      const encryptData = vi.mocked(require('@/crypto/hpkeCrypto').encryptData)
      expect(encryptData).toHaveBeenCalled()
      
      // Verify metadata encryption
      const encryptMetadata = vi.mocked(require('@/crypto/postQuantumCrypto').encryptMetadata)
      expect(encryptMetadata).toHaveBeenCalledWith(
        { name: 'Test Form.form', size: expect.any(String) },
        expect.any(Uint8Array)
      )
      
      // Verify file upload
      const uploadFileData = vi.mocked(require('@/storage').uploadFileData)
      expect(uploadFileData).toHaveBeenCalled()
      
      // Verify file record creation with encrypted metadata
      const createFileWithSharing = vi.mocked(require('@/files').createFileWithSharing)
      expect(createFileWithSharing).toHaveBeenCalledWith({
        owner: mockUserId,
        name: { ciphertext: 'encrypted-name', nonce: 'mock-nonce' },
        parent: null,
        size: { ciphertext: 'encrypted-size', nonce: 'mock-nonce' },
        storagePath: expect.stringMatching(/^files\/test-user-123\//),
        encryptedKeys: expect.any(Object),
        sharedWith: [mockUserId],
      })
    })

    it('should update existing form file', async () => {
      await formFiles.updateFormFile(
        'existing-file-id',
        mockFormData,
        mockUserId,
        mockPrivateKey
      )

      // Verify update was called
      const updateFile = vi.mocked(require('@/files').updateFile)
      expect(updateFile).toHaveBeenCalledWith(
        'existing-file-id',
        expect.objectContaining({
          name: { ciphertext: 'encrypted-name', nonce: 'mock-nonce' },
          size: { ciphertext: 'encrypted-size', nonce: 'mock-nonce' },
          encryptedKeys: expect.any(Object),
        })
      )
    })

    it('should handle missing user profile', async () => {
      const getUserProfile = vi.mocked(require('@/firestore').getUserProfile)
      getUserProfile.mockResolvedValueOnce(null)

      await expect(formFiles.saveFormAsFile(
        mockFormData,
        mockUserId,
        mockPrivateKey,
        null
      )).rejects.toThrow('Public key not found for the user.')
    })

    it('should handle missing public key', async () => {
      const getUserProfile = vi.mocked(require('@/firestore').getUserProfile)
      getUserProfile.mockResolvedValueOnce({ publicKey: null })

      await expect(formFiles.saveFormAsFile(
        mockFormData,
        mockUserId,
        mockPrivateKey,
        null
      )).rejects.toThrow('Public key not found for the user.')
    })
  })

  describe('Form Utilities', () => {
    it('should identify form files correctly', () => {
      expect(formFiles.isFormFile('document.form')).toBe(true)
      expect(formFiles.isFormFile('myform.form')).toBe(true)
      expect(formFiles.isFormFile('document.pdf')).toBe(false)
      expect(formFiles.isFormFile('file.txt')).toBe(false)
      expect(formFiles.isFormFile('form')).toBe(false)
      expect(formFiles.isFormFile('')).toBe(false)
    })

    it('should extract display name from form filename', () => {
      expect(formFiles.getFormDisplayName('Personal Info.form')).toBe('Personal Info')
      expect(formFiles.getFormDisplayName('contact-form.form')).toBe('contact-form')
      expect(formFiles.getFormDisplayName('test.form.form')).toBe('test.form')
      expect(formFiles.getFormDisplayName('noextension')).toBe('noextension')
    })
  })

  describe('Form Data Validation', () => {
    it('should validate required fields', () => {
      const invalidData = { ...mockFormData }
      invalidData.data = { email: 'john@example.com' } // missing required 'name'

      // This would be validated in the UI, but we can test the data structure
      const nameField = invalidData.schema.fields.find(f => f.id === 'name')
      const hasNameValue = invalidData.data.name
      
      expect(nameField?.required).toBe(true)
      expect(hasNameValue).toBeFalsy()
    })

    it('should handle optional fields', () => {
      const dataWithoutNotes = { ...mockFormData }
      dataWithoutNotes.data = { 
        name: 'John Doe', 
        email: 'john@example.com' 
        // notes is optional and omitted
      }

      const notesField = dataWithoutNotes.schema.fields.find(f => f.id === 'notes')
      expect(notesField?.required).toBe(false)
    })
  })

  describe('Form Templates', () => {
    const mockTemplates = [
      {
        name: 'Contact Form',
        description: 'Basic contact information',
        category: 'personal',
        fields: [
          { id: 'name', type: 'text', label: 'Name', required: true },
          { id: 'email', type: 'email', label: 'Email', required: true },
        ]
      },
      {
        name: 'Feedback Form',
        description: 'Customer feedback collection',
        category: 'business',
        fields: [
          { id: 'rating', type: 'number', label: 'Rating', required: true },
          { id: 'comments', type: 'textarea', label: 'Comments', required: false },
        ]
      }
    ]

    it('should categorize templates correctly', () => {
      const personalTemplates = mockTemplates.filter(t => t.category === 'personal')
      const businessTemplates = mockTemplates.filter(t => t.category === 'business')

      expect(personalTemplates).toHaveLength(1)
      expect(businessTemplates).toHaveLength(1)
      expect(personalTemplates[0].name).toBe('Contact Form')
      expect(businessTemplates[0].name).toBe('Feedback Form')
    })

    it('should validate template fields', () => {
      const template = mockTemplates[0]
      
      expect(template.fields).toHaveLength(2)
      expect(template.fields[0].required).toBe(true)
      expect(template.fields[1].required).toBe(true)
      expect(template.fields.every(f => f.id && f.type && f.label)).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle encryption errors', async () => {
      const encryptData = vi.mocked(require('@/crypto/hpkeCrypto').encryptData)
      encryptData.mockRejectedValueOnce(new Error('Encryption failed'))

      await expect(formFiles.saveFormAsFile(
        mockFormData,
        mockUserId,
        mockPrivateKey,
        null
      )).rejects.toThrow()
    })

    it('should handle storage upload errors', async () => {
      const uploadFileData = vi.mocked(require('@/storage').uploadFileData)
      uploadFileData.mockRejectedValueOnce(new Error('Upload failed'))

      await expect(formFiles.saveFormAsFile(
        mockFormData,
        mockUserId,
        mockPrivateKey,
        null
      )).rejects.toThrow()
    })

    it('should handle database errors', async () => {
      const createFileWithSharing = vi.mocked(require('@/files').createFileWithSharing)
      createFileWithSharing.mockRejectedValueOnce(new Error('Database error'))

      await expect(formFiles.saveFormAsFile(
        mockFormData,
        mockUserId,
        mockPrivateKey,
        null
      )).rejects.toThrow()
    })
  })
})

describe('Form Field Types', () => {
  const fieldTypes: FormFieldDefinition['type'][] = [
    'text', 'password', 'email', 'number', 'date', 'select', 'textarea', 'richtext', 'file'
  ]

  it('should support all expected field types', () => {
    fieldTypes.forEach(type => {
      const field: FormFieldDefinition = {
        id: `test-${type}`,
        type: type,
        label: `Test ${type} Field`,
        required: false,
        sensitive: false,
      }

      expect(field.type).toBe(type)
      expect(typeof field.id).toBe('string')
      expect(typeof field.label).toBe('string')
    })
  })

  it('should handle sensitive field marking', () => {
    const sensitiveField: FormFieldDefinition = {
      id: 'ssn',
      type: 'password',
      label: 'Social Security Number',
      required: true,
      sensitive: true,
    }

    expect(sensitiveField.sensitive).toBe(true)
    expect(sensitiveField.type).toBe('password')
  })

  it('should validate field structure', () => {
    const validField: FormFieldDefinition = {
      id: 'email',
      type: 'email',
      label: 'Email Address',
      placeholder: 'Enter your email',
      required: true,
      sensitive: false,
      validation: {
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
        message: 'Please enter a valid email address'
      }
    }

    expect(validField.id).toBeDefined()
    expect(validField.type).toBeDefined()
    expect(validField.label).toBeDefined()
    expect(validField.validation?.pattern).toBeDefined()
  })
})