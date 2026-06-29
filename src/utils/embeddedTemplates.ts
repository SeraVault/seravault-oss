/**
 * Embedded form templates - these are stored directly in form files
 * This replaces the database-stored templates for better sharing and portability
 */

import type { FormTemplate } from './formFiles';
import { backendService } from '../backend/BackendService';
import type { QueryConstraint } from '../backend/BackendInterface';

// Type for translation function - compatible with react-i18next TFunction
type TranslateFn = (key: string, fallback?: string) => string;

/**
 * Get built-in form templates that can be embedded in forms
 * @param t Optional translation function for internationalizing field labels
 */
export function getBuiltInFormTemplates(t?: TranslateFn): { [key: string]: FormTemplate } {
  // Use provided translation function or fallback to returning the fallback value
  const translate: TranslateFn = t || ((key: string, fallback?: string) => fallback || key);
  return {
    credit_card: {
      templateId: 'credit_card',
      name: 'Credit Card',
      description: 'Store credit card information securely',
      category: 'Finance',
      icon: 'CreditCard',
      color: '#1976d2',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'card_name',
      schema: {
        fields: [
          { id: 'card_name', type: 'text', label: translate('forms.templateFields.creditCard.cardName', 'Card Name'), required: true, placeholder: 'e.g., Personal Visa' },
          { id: 'cardholder_name', type: 'text', label: translate('forms.templateFields.creditCard.cardholderName', 'Cardholder Name') },
          { id: 'card_number', type: 'text', label: translate('forms.templateFields.creditCard.cardNumber', 'Card Number'), sensitive: true, placeholder: '1234 5678 9012 3456' },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.creditCard.expiryDate', 'Expiry Date') },
          { id: 'cvv', type: 'password', label: translate('forms.templateFields.creditCard.cvv', 'CVV'), sensitive: true },
          { id: 'pin', type: 'password', label: translate('forms.templateFields.creditCard.pin', 'PIN'), sensitive: true, placeholder: '4 digits' },
          { id: 'bank_name', type: 'text', label: translate('forms.templateFields.creditCard.bankName', 'Bank Name') },
          { id: 'billing_address', type: 'textarea', label: translate('forms.templateFields.creditCard.billingAddress', 'Billing Address') },
          { id: 'card_documents', type: 'file', label: translate('forms.templateFields.creditCard.cardDocuments', 'Card Documents'),
            placeholder: 'Attach statements, agreements, or related documents' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.creditCard.notes', 'Notes'), placeholder: 'Additional notes with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    password: {
      templateId: 'password',
      name: 'Password',
      description: 'Store login credentials securely',
      category: 'Credentials',
      icon: 'Lock',
      color: '#d32f2f',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'site_service',
      schema: {
        fields: [
          { id: 'site_service', type: 'text', label: translate('forms.templateFields.password.siteName', 'Site/Service'), required: true, placeholder: 'e.g., Gmail, Facebook' },
          { id: 'website_url', type: 'text', label: translate('forms.templateFields.password.url', 'Website URL'), placeholder: 'https://example.com' },
          { id: 'username', type: 'text', label: translate('forms.templateFields.password.username', 'Username') },
          { id: 'email', type: 'email', label: translate('forms.templateFields.password.email', 'Email') },
          { id: 'password', type: 'password', label: translate('forms.templateFields.password.password', 'Password'), sensitive: true },
          { id: 'backup_password', type: 'password', label: translate('forms.templateFields.password.backupPassword', 'Backup/Old Password'), sensitive: true },
          { id: 'totp_secret', type: 'password', label: translate('forms.templateFields.password.totpSecret', '2FA/TOTP Secret'), sensitive: true, placeholder: 'TOTP secret key' },
          { id: 'backup_codes', type: 'textarea', label: translate('forms.templateFields.password.backupCodes', '2FA Backup Codes'), sensitive: true, placeholder: 'One code per line' },
          { id: 'recovery_email', type: 'email', label: translate('forms.templateFields.password.recoveryEmail', 'Recovery Email') },
          { id: 'recovery_phone', type: 'text', label: translate('forms.templateFields.password.recoveryPhone', 'Recovery Phone') },
          { id: 'api_key', type: 'password', label: translate('forms.templateFields.password.apiKey', 'API Key'), sensitive: true },
          { id: 'security_q1', type: 'text', label: translate('forms.templateFields.password.securityQuestion1', 'Security Question 1') },
          { id: 'security_a1', type: 'password', label: translate('forms.templateFields.password.securityAnswer1', 'Security Answer 1'), sensitive: true },
          { id: 'security_q2', type: 'text', label: translate('forms.templateFields.password.securityQuestion2', 'Security Question 2') },
          { id: 'security_a2', type: 'password', label: translate('forms.templateFields.password.securityAnswer2', 'Security Answer 2'), sensitive: true },
          { id: 'security_q3', type: 'text', label: translate('forms.templateFields.password.securityQuestion3', 'Security Question 3') },
          { id: 'security_a3', type: 'password', label: translate('forms.templateFields.password.securityAnswer3', 'Security Answer 3'), sensitive: true },
          { id: 'password_documents', type: 'file', label: translate('forms.templateFields.password.passwordDocuments', 'Related Documents'),
            placeholder: 'Attach screenshots, setup guides, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.password.notes', 'Notes'), placeholder: 'Additional notes with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    secure_note: {
      templateId: 'secure_note',
      name: 'Secure Note',
      description: 'Store rich text notes securely',
      category: 'Notes',
      icon: 'StickyNote2',
      color: '#7b1fa2',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'title',
      schema: {
        fields: [
          { id: 'title', type: 'text', label: translate('forms.templateFields.secureNote.title', 'Title'), required: true },
          { id: 'content', type: 'richtext', label: translate('forms.templateFields.secureNote.content', 'Content'), placeholder: 'Your secure note content with rich formatting...' },
          { id: 'note_attachments', type: 'file', label: translate('forms.templateFields.secureNote.noteAttachments', 'Attachments'),
            placeholder: 'Attach related files or documents' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    bank_account: {
      templateId: 'bank_account',
      name: 'Bank Account',
      description: 'Store banking information securely',
      category: 'Finance',
      icon: 'AccountBalance',
      color: '#388e3c',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'account_name',
      schema: {
        fields: [
          { id: 'account_name', type: 'text', label: translate('forms.templateFields.bankAccount.accountName', 'Account Name'), required: true, placeholder: 'e.g., Personal Checking' },
          { id: 'bank_name', type: 'text', label: translate('forms.templateFields.bankAccount.bankName', 'Bank Name') },
          { id: 'account_number', type: 'text', label: translate('forms.templateFields.bankAccount.accountNumber', 'Account Number'), sensitive: true },
          { id: 'routing_number', type: 'text', label: translate('forms.templateFields.bankAccount.routingNumber', 'Routing Number') },
          { id: 'account_type', type: 'text', label: translate('forms.templateFields.bankAccount.accountType', 'Account Type'), placeholder: 'e.g., Checking, Savings' },
          { id: 'swift_bic', type: 'text', label: translate('forms.templateFields.bankAccount.swiftBic', 'SWIFT/BIC Code'), placeholder: 'For international transfers' },
          { id: 'iban', type: 'text', label: translate('forms.templateFields.bankAccount.iban', 'IBAN'), placeholder: 'International Bank Account Number' },
          { id: 'online_banking_url', type: 'text', label: translate('forms.templateFields.bankAccount.onlineBankingUrl', 'Online Banking URL') },
          { id: 'bank_documents', type: 'file', label: translate('forms.templateFields.bankAccount.bankDocuments', 'Bank Documents'),
            placeholder: 'Attach statements, agreements, or related documents' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.bankAccount.notes', 'Notes'), placeholder: 'Additional banking information with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    identity: {
      templateId: 'identity',
      name: 'Identity Document',
      description: 'Store personal identification documents',
      category: 'Personal',
      icon: 'Person',
      color: '#f57c00',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'full_name',
      schema: {
        fields: [
          { id: 'full_name', type: 'text', label: translate('forms.templateFields.identity.fullName', 'Full Name'), required: true },
          { id: 'ssn', type: 'password', label: translate('forms.templateFields.identity.ssn', 'Social Security Number'), sensitive: true },
          { id: 'passport_number', type: 'password', label: translate('forms.templateFields.identity.passportNumber', 'Passport Number'), sensitive: true },
          { id: 'passport_expiry', type: 'date', label: translate('forms.templateFields.identity.passportExpiry', 'Passport Expiry') },
          { id: 'passport_country', type: 'text', label: translate('forms.templateFields.identity.passportCountry', 'Passport Country of Issue') },
          { id: 'driver_license', type: 'password', label: translate('forms.templateFields.identity.driverLicense', 'Driver License Number'), sensitive: true },
          { id: 'license_expiry', type: 'date', label: translate('forms.templateFields.identity.licenseExpiry', 'License Expiry') },
          { id: 'license_state', type: 'text', label: translate('forms.templateFields.identity.licenseState', 'License State/Province') },
          { id: 'national_id', type: 'password', label: translate('forms.templateFields.identity.nationalId', 'National ID'), sensitive: true },
          { id: 'date_of_birth', type: 'date', label: translate('forms.templateFields.identity.dateOfBirth', 'Date of Birth') },
          { id: 'address', type: 'textarea', label: translate('forms.templateFields.identity.address', 'Address') },
          { id: 'identity_documents', type: 'file', label: translate('forms.templateFields.identity.identityDocuments', 'Identity Documents'),
            placeholder: 'Attach scans of ID cards, passports, or other documents' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.identity.notes', 'Notes'), placeholder: 'Additional identification details with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    wifi_network: {
      templateId: 'wifi_network',
      name: 'WiFi Network',
      description: 'Store WiFi network credentials and settings',
      category: 'Network',
      icon: 'Wifi',
      color: '#0288d1',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'network_name',
      schema: {
        fields: [
          { id: 'network_name', type: 'text', label: translate('forms.templateFields.wifiNetwork.networkName', 'Network Name (SSID)'), required: true },
          { id: 'password', type: 'password', label: translate('forms.templateFields.wifiNetwork.password', 'WiFi Password'), sensitive: true },
          { id: 'security_type', type: 'text', label: translate('forms.templateFields.wifiNetwork.securityType', 'Security Type'), placeholder: 'e.g., WPA2, WPA3' },
          { id: 'router_ip', type: 'text', label: translate('forms.templateFields.wifiNetwork.routerIp', 'Router IP Address'), placeholder: 'e.g., 192.168.1.1' },
          { id: 'admin_username', type: 'text', label: translate('forms.templateFields.wifiNetwork.adminUsername', 'Admin Username') },
          { id: 'admin_password', type: 'password', label: translate('forms.templateFields.wifiNetwork.adminPassword', 'Admin Password'), sensitive: true },
          { id: 'wps_pin', type: 'password', label: translate('forms.templateFields.wifiNetwork.wpsPin', 'WPS PIN'), sensitive: true },
          { id: 'dns_servers', type: 'text', label: translate('forms.templateFields.wifiNetwork.dnsServers', 'DNS Servers'), placeholder: 'e.g., 8.8.8.8, 1.1.1.1' },
          { id: 'network_documents', type: 'file', label: translate('forms.templateFields.wifiNetwork.networkDocuments', 'Network Documents'),
            placeholder: 'Attach router configs, network diagrams, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.wifiNetwork.notes', 'Notes'), placeholder: 'Network configuration details with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    crypto_wallet: {
      templateId: 'crypto_wallet',
      name: 'Crypto Wallet',
      description: 'Store cryptocurrency wallet information',
      category: 'Crypto',
      icon: 'AccountBalanceWallet',
      color: '#ff9800',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'wallet_name',
      schema: {
        fields: [
          { id: 'wallet_name', type: 'text', label: translate('forms.templateFields.cryptoWallet.walletName', 'Wallet Name'), required: true, placeholder: 'e.g., Bitcoin Main Wallet' },
          { id: 'wallet_type', type: 'text', label: translate('forms.templateFields.cryptoWallet.walletType', 'Wallet Type'), placeholder: 'e.g., Hardware, Software, Paper' },
          { id: 'cryptocurrency', type: 'text', label: translate('forms.templateFields.cryptoWallet.cryptocurrency', 'Cryptocurrency'), placeholder: 'e.g., Bitcoin, Ethereum' },
          { id: 'seed_phrase', type: 'textarea', label: translate('forms.templateFields.cryptoWallet.seedPhrase', 'Seed Phrase/Recovery Phrase'), sensitive: true, placeholder: '12 or 24 word recovery phrase' },
          { id: 'private_key', type: 'password', label: translate('forms.templateFields.cryptoWallet.privateKey', 'Private Key'), sensitive: true },
          { id: 'public_address', type: 'text', label: translate('forms.templateFields.cryptoWallet.publicAddress', 'Public Address') },
          { id: 'passphrase', type: 'password', label: translate('forms.templateFields.cryptoWallet.passphrase', 'Passphrase'), sensitive: true },
          { id: 'pin_code', type: 'password', label: translate('forms.templateFields.cryptoWallet.pinCode', 'PIN Code'), sensitive: true },
          { id: 'derivation_path', type: 'text', label: translate('forms.templateFields.cryptoWallet.derivationPath', 'Derivation Path'), placeholder: "e.g., m/44'/0'/0'/0" },
          { id: 'wallet_documents', type: 'file', label: translate('forms.templateFields.cryptoWallet.walletDocuments', 'Wallet Documents'),
            placeholder: 'Attach backup files, QR codes, or related documents' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.cryptoWallet.notes', 'Notes'), placeholder: 'Wallet configuration and backup information with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    medical_record: {
      templateId: 'medical_record',
      name: 'Medical Record',
      description: 'Store medical and health information with documents',
      category: 'Health',
      icon: 'LocalHospital',
      color: '#e53935',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'patient_name',
      schema: {
        fields: [
          { id: 'patient_name', type: 'text', label: translate('forms.templateFields.medicalRecord.patientName', 'Patient Name'), required: true },
          { id: 'patient_id', type: 'text', label: translate('forms.templateFields.medicalRecord.patientId', 'Patient ID'), sensitive: true },
          { id: 'provider_name', type: 'text', label: translate('forms.templateFields.medicalRecord.providerName', 'Healthcare Provider') },
          { id: 'allergies', type: 'richtext', label: translate('forms.templateFields.medicalRecord.allergies', 'Allergies'), placeholder: 'Known allergies and reactions with detailed formatting...' },
          { id: 'medications', type: 'richtext', label: translate('forms.templateFields.medicalRecord.medications', 'Current Medications') },
          { id: 'conditions', type: 'richtext', label: translate('forms.templateFields.medicalRecord.conditions', 'Medical Conditions'), placeholder: 'Chronic conditions, diagnoses with rich formatting...' },
          { id: 'emergency_contact', type: 'text', label: translate('forms.templateFields.medicalRecord.emergencyContact', 'Emergency Contact') },
          { id: 'insurance_info', type: 'richtext', label: translate('forms.templateFields.medicalRecord.insuranceInfo', 'Insurance Information') },
          { id: 'medical_documents', type: 'file', label: translate('forms.templateFields.medicalRecord.medicalDocuments', 'Medical Documents'), 
            fileConfig: { 
              maxFiles: 10, 
              maxFileSize: 50 * 1024 * 1024, // 50MB 
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'text/plain'],
              description: 'Upload medical documents, test results, X-rays, etc. (PDF, images, text files)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.medicalRecord.notes', 'Notes'), placeholder: 'Detailed medical history, procedures, test results...' },
        ],
      },
      defaultData: {
        medical_documents: [] // Initialize file field as empty array
      },
      tags: [],
    },

    legal_document: {
      templateId: 'legal_document',
      name: 'Legal Document',
      description: 'Store legal documents and contracts',
      category: 'Legal',
      icon: 'Gavel',
      color: '#6a1b9a',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'document_title',
      schema: {
        fields: [
          { id: 'document_title', type: 'text', label: translate('forms.templateFields.legalDocument.documentTitle', 'Document Title'), required: true },
          { id: 'document_type', type: 'text', label: translate('forms.templateFields.legalDocument.documentType', 'Document Type'), placeholder: 'e.g., Contract, Agreement, Will, Trust' },
          { id: 'party_names', type: 'richtext', label: translate('forms.templateFields.legalDocument.partyNames', 'Party Names') },
          { id: 'date_created', type: 'date', label: translate('forms.templateFields.legalDocument.dateCreated', 'Date Created') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.legalDocument.expiryDate', 'Expiry Date') },
          { id: 'legal_firm', type: 'text', label: translate('forms.templateFields.legalDocument.legalFirm', 'Legal Firm/Lawyer') },
          { id: 'lawyer_contact', type: 'phone', label: translate('forms.templateFields.legalDocument.lawyerContact', 'Lawyer Contact Phone') },
          { id: 'reference_number', type: 'text', label: translate('forms.templateFields.legalDocument.referenceNumber', 'Reference Number') },
          { id: 'court_case_number', type: 'text', label: translate('forms.templateFields.legalDocument.courtCaseNumber', 'Court/Case Number') },
          { id: 'jurisdiction', type: 'text', label: translate('forms.templateFields.legalDocument.jurisdiction', 'Jurisdiction') },
          { id: 'document_files', type: 'file', label: translate('forms.templateFields.legalDocument.documentFiles', 'Legal Document Files'),
            fileConfig: {
              maxFiles: 10,
              maxFileSize: 50 * 1024 * 1024, // 50MB
              allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
              description: 'Upload legal documents (PDF, Word, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.legalDocument.notes', 'Notes'), placeholder: 'Legal document details with rich formatting...' },
        ],
      },
      defaultData: {
        document_files: []
      },
      tags: [],
    },

    will_testament: {
      templateId: 'will_testament',
      name: 'Will & Testament',
      description: 'Store will, testament, and estate planning documents',
      category: 'Legal',
      icon: 'Description',
      color: '#4a148c',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'document_title',
      schema: {
        fields: [
          { id: 'document_title', type: 'text', label: translate('forms.templateFields.willTestament.documentTitle', 'Document Title'), required: true, placeholder: 'e.g., Last Will and Testament' },
          { id: 'testator_name', type: 'text', label: translate('forms.templateFields.willTestament.testatorName', 'Testator Name (Person Making the Will)'), required: true },
          { id: 'date_created', type: 'date', label: translate('forms.templateFields.willTestament.dateCreated', 'Date Created') },
          { id: 'last_updated', type: 'date', label: translate('forms.templateFields.willTestament.lastUpdated', 'Last Updated') },
          { id: 'executor_name', type: 'text', label: translate('forms.templateFields.willTestament.executorName', 'Executor Name') },
          { id: 'executor_contact', type: 'phone', label: translate('forms.templateFields.willTestament.executorContact', 'Executor Contact') },
          { id: 'backup_executor', type: 'text', label: translate('forms.templateFields.willTestament.backupExecutor', 'Backup Executor') },
          { id: 'attorney_name', type: 'text', label: translate('forms.templateFields.willTestament.attorneyName', 'Attorney Name') },
          { id: 'attorney_contact', type: 'phone', label: translate('forms.templateFields.willTestament.attorneyContact', 'Attorney Contact') },
          { id: 'law_firm', type: 'text', label: translate('forms.templateFields.willTestament.lawFirm', 'Law Firm') },
          { id: 'witnesses', type: 'richtext', label: translate('forms.templateFields.willTestament.witnesses', 'Witness Names & Contact Info') },
          { id: 'beneficiaries', type: 'richtext', label: translate('forms.templateFields.willTestament.beneficiaries', 'Beneficiaries & Bequests') },
          { id: 'document_location', type: 'text', label: translate('forms.templateFields.willTestament.documentLocation', 'Physical Document Location'), placeholder: 'e.g., Safe deposit box, Attorney\'s office' },
          { id: 'will_documents', type: 'file', label: translate('forms.templateFields.willTestament.willDocuments', 'Will Documents'),
            fileConfig: {
              maxFiles: 10,
              maxFileSize: 50 * 1024 * 1024, // 50MB
              allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
              description: 'Upload will and testament documents (PDF, Word, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.willTestament.notes', 'Notes'), placeholder: 'Additional estate planning details with rich formatting...' },
        ],
      },
      defaultData: {
        will_documents: []
      },
      tags: [],
    },

    power_of_attorney: {
      templateId: 'power_of_attorney',
      name: 'Power of Attorney',
      description: 'Store power of attorney and legal authorization documents',
      category: 'Legal',
      icon: 'Policy',
      color: '#311b92',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'document_title',
      schema: {
        fields: [
          { id: 'document_title', type: 'text', label: translate('forms.templateFields.powerOfAttorney.documentTitle', 'Document Title'), required: true, placeholder: 'e.g., Durable Power of Attorney' },
          { id: 'poa_type', type: 'text', label: translate('forms.templateFields.powerOfAttorney.poaType', 'POA Type'), placeholder: 'e.g., General, Limited, Healthcare, Financial' },
          { id: 'principal_name', type: 'text', label: translate('forms.templateFields.powerOfAttorney.principalName', 'Principal Name (Grantor)'), required: true },
          { id: 'agent_name', type: 'text', label: translate('forms.templateFields.powerOfAttorney.agentName', 'Agent Name (Attorney-in-Fact)'), required: true },
          { id: 'agent_contact', type: 'phone', label: translate('forms.templateFields.powerOfAttorney.agentContact', 'Agent Contact') },
          { id: 'successor_agent', type: 'text', label: translate('forms.templateFields.powerOfAttorney.successorAgent', 'Successor Agent') },
          { id: 'effective_date', type: 'date', label: translate('forms.templateFields.powerOfAttorney.effectiveDate', 'Effective Date') },
          { id: 'expiration_date', type: 'date', label: translate('forms.templateFields.powerOfAttorney.expirationDate', 'Expiration Date') },
          { id: 'powers_granted', type: 'richtext', label: translate('forms.templateFields.powerOfAttorney.powersGranted', 'Powers Granted'), placeholder: 'List specific powers and limitations...' },
          { id: 'attorney_name', type: 'text', label: translate('forms.templateFields.powerOfAttorney.attorneyName', 'Attorney Name') },
          { id: 'attorney_contact', type: 'phone', label: translate('forms.templateFields.powerOfAttorney.attorneyContact', 'Attorney Contact') },
          { id: 'notary_info', type: 'text', label: translate('forms.templateFields.powerOfAttorney.notaryInfo', 'Notary Information') },
          { id: 'document_location', type: 'text', label: translate('forms.templateFields.powerOfAttorney.documentLocation', 'Document Location') },
          { id: 'poa_documents', type: 'file', label: translate('forms.templateFields.powerOfAttorney.poaDocuments', 'POA Documents'),
            fileConfig: {
              maxFiles: 10,
              maxFileSize: 50 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
              description: 'Upload power of attorney documents (PDF, Word, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.powerOfAttorney.notes', 'Notes'), placeholder: 'Additional details with rich formatting...' },
        ],
      },
      defaultData: {
        poa_documents: []
      },
      tags: [],
    },

    intellectual_property: {
      templateId: 'intellectual_property',
      name: 'Intellectual Property',
      description: 'Store patents, trademarks, copyrights, and IP registrations',
      category: 'Legal',
      icon: 'Copyright',
      color: '#1a237e',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'ip_name',
      schema: {
        fields: [
          { id: 'ip_name', type: 'text', label: translate('forms.templateFields.intellectualProperty.ipName', 'IP Name/Title'), required: true },
          { id: 'ip_type', type: 'text', label: translate('forms.templateFields.intellectualProperty.ipType', 'IP Type'), placeholder: 'e.g., Patent, Trademark, Copyright, Trade Secret' },
          { id: 'registration_number', type: 'text', label: translate('forms.templateFields.intellectualProperty.registrationNumber', 'Registration Number') },
          { id: 'application_number', type: 'text', label: translate('forms.templateFields.intellectualProperty.applicationNumber', 'Application Number') },
          { id: 'filing_date', type: 'date', label: translate('forms.templateFields.intellectualProperty.filingDate', 'Filing Date') },
          { id: 'registration_date', type: 'date', label: translate('forms.templateFields.intellectualProperty.registrationDate', 'Registration Date') },
          { id: 'expiration_date', type: 'date', label: translate('forms.templateFields.intellectualProperty.expirationDate', 'Expiration Date') },
          { id: 'jurisdiction', type: 'text', label: translate('forms.templateFields.intellectualProperty.jurisdiction', 'Jurisdiction/Country') },
          { id: 'owner_entity', type: 'text', label: translate('forms.templateFields.intellectualProperty.ownerEntity', 'Owner Name/Entity') },
          { id: 'inventors_authors', type: 'richtext', label: translate('forms.templateFields.intellectualProperty.inventorsAuthors', 'Inventors/Authors') },
          { id: 'ip_attorney', type: 'text', label: translate('forms.templateFields.intellectualProperty.ipAttorney', 'IP Attorney/Agent') },
          { id: 'attorney_contact', type: 'phone', label: translate('forms.templateFields.intellectualProperty.attorneyContact', 'Attorney Contact') },
          { id: 'renewal_date', type: 'date', label: translate('forms.templateFields.intellectualProperty.renewalDate', 'Next Renewal Date') },
          { id: 'maintenance_fees', type: 'text', label: translate('forms.templateFields.intellectualProperty.maintenanceFees', 'Maintenance Fees Info') },
          { id: 'ip_documents', type: 'file', label: translate('forms.templateFields.intellectualProperty.ipDocuments', 'IP Documents'),
            fileConfig: {
              maxFiles: 15,
              maxFileSize: 50 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
              description: 'Upload patent, trademark, or copyright documents (PDF, Word, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.intellectualProperty.notes', 'Notes'), placeholder: 'Description, claims, licensing info with rich formatting...' },
        ],
      },
      defaultData: {
        ip_documents: []
      },
      tags: [],
    },

    software_license: {
      templateId: 'software_license',
      name: 'Software License',
      description: 'Store software licenses and activation keys',
      category: 'Software',
      icon: 'License',
      color: '#00695c',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'software_name',
      schema: {
        fields: [
          { id: 'software_name', type: 'text', label: translate('forms.templateFields.softwareLicense.softwareName', 'Software Name'), required: true },
          { id: 'license_key', type: 'password', label: translate('forms.templateFields.softwareLicense.licenseKey', 'License Key'), sensitive: true },
          { id: 'activation_code', type: 'password', label: translate('forms.templateFields.softwareLicense.activationCode', 'Activation Code'), sensitive: true },
          { id: 'serial_number', type: 'password', label: translate('forms.templateFields.softwareLicense.serialNumber', 'Serial Number'), sensitive: true },
          { id: 'version', type: 'text', label: translate('forms.templateFields.softwareLicense.version', 'Version') },
          { id: 'purchase_date', type: 'date', label: translate('forms.templateFields.softwareLicense.purchaseDate', 'Purchase Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.softwareLicense.expiryDate', 'Expiry Date') },
          { id: 'seats_purchased', type: 'number', label: translate('forms.templateFields.softwareLicense.seatsPurchased', 'Number of Seats/Licenses') },
          { id: 'vendor', type: 'text', label: translate('forms.templateFields.softwareLicense.vendor', 'Vendor/Publisher') },
          { id: 'download_url', type: 'text', label: translate('forms.templateFields.softwareLicense.downloadUrl', 'Download URL') },
          { id: 'license_documents', type: 'file', label: translate('forms.templateFields.softwareLicense.licenseDocuments', 'License Documents'),
            placeholder: 'Attach license certificates, purchase receipts, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.softwareLicense.notes', 'Notes'), placeholder: 'Installation instructions, special requirements with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    insurance_policy: {
      templateId: 'insurance_policy',
      name: 'Insurance Policy',
      description: 'Store insurance policy information',
      category: 'Finance',
      icon: 'Security',
      color: '#1565c0',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'policy_number',
      schema: {
        fields: [
          { id: 'policy_number', type: 'password', label: translate('forms.templateFields.insurancePolicy.policyNumber', 'Policy Number'), sensitive: true, required: true },
          { id: 'policy_type', type: 'text', label: translate('forms.templateFields.insurancePolicy.policyType', 'Policy Type'), placeholder: 'e.g., Auto, Home, Life, Health' },
          { id: 'insurer', type: 'text', label: translate('forms.templateFields.insurancePolicy.insurer', 'Insurance Company') },
          { id: 'policy_holder', type: 'text', label: translate('forms.templateFields.insurancePolicy.policyHolder', 'Policy Holder') },
          { id: 'coverage_amount', type: 'text', label: translate('forms.templateFields.insurancePolicy.coverageAmount', 'Coverage Amount') },
          { id: 'premium', type: 'text', label: translate('forms.templateFields.insurancePolicy.premium', 'Premium') },
          { id: 'deductible', type: 'text', label: translate('forms.templateFields.insurancePolicy.deductible', 'Deductible') },
          { id: 'start_date', type: 'date', label: translate('forms.templateFields.insurancePolicy.startDate', 'Start Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.insurancePolicy.expiryDate', 'Expiry Date') },
          { id: 'agent_info', type: 'richtext', label: translate('forms.templateFields.insurancePolicy.agentInfo', 'Agent Information') },
          { id: 'policy_documents', type: 'file', label: translate('forms.templateFields.insurancePolicy.policyDocuments', 'Policy Documents'),
            fileConfig: {
              maxFiles: 10,
              maxFileSize: 50 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
              description: 'Upload insurance policy documents (PDF, Word, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.insurancePolicy.notes', 'Notes'), placeholder: 'Coverage details, exclusions, claims history with rich formatting...' },
        ],
      },
      defaultData: {
        policy_documents: []
      },
      tags: [],
    },

    vehicle_info: {
      templateId: 'vehicle_info',
      name: 'Vehicle Info',
      description: 'Store vehicle registration and insurance details',
      category: 'Personal',
      icon: 'DriveEta',
      color: '#424242',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'make',
      schema: {
        fields: [
          { id: 'make', type: 'text', label: translate('forms.templateFields.vehicleInfo.vehicleMake', 'Make'), required: true },
          { id: 'model', type: 'text', label: translate('forms.templateFields.vehicleInfo.vehicleModel', 'Model') },
          { id: 'year', type: 'text', label: translate('forms.templateFields.vehicleInfo.year', 'Year') },
          { id: 'color', type: 'text', label: translate('forms.templateFields.vehicleInfo.color', 'Color') },
          { id: 'vin', type: 'password', label: translate('forms.templateFields.vehicleInfo.vin', 'VIN'), sensitive: true, placeholder: 'Vehicle Identification Number' },
          { id: 'license_plate', type: 'text', label: translate('forms.templateFields.vehicleInfo.licensePlate', 'License Plate') },
          { id: 'registration_number', type: 'password', label: translate('forms.templateFields.vehicleInfo.registrationNumber', 'Registration Number'), sensitive: true },
          { id: 'registration_expiry', type: 'date', label: translate('forms.templateFields.vehicleInfo.registrationExpiry', 'Registration Expiry') },
          { id: 'insurance_policy', type: 'text', label: translate('forms.templateFields.vehicleInfo.insurancePolicy', 'Insurance Policy Number'), sensitive: true },
          { id: 'insurance_company', type: 'text', label: translate('forms.templateFields.vehicleInfo.insuranceCompany', 'Insurance Company') },
          { id: 'purchase_date', type: 'date', label: translate('forms.templateFields.vehicleInfo.purchaseDate', 'Purchase Date') },
          { id: 'purchase_price', type: 'text', label: translate('forms.templateFields.vehicleInfo.purchasePrice', 'Purchase Price') },
          { id: 'vehicle_documents', type: 'file', label: translate('forms.templateFields.vehicleInfo.vehicleDocuments', 'Vehicle Documents'),
            fileConfig: {
              maxFiles: 10,
              maxFileSize: 50 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
              description: 'Upload title, registration, insurance, maintenance records (PDF, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.vehicleInfo.notes', 'Notes'), placeholder: 'Maintenance records, modifications, accidents with rich formatting...' },
        ],
      },
      defaultData: {
        vehicle_documents: []
      },
      tags: [],
    },

    api_credentials: {
      templateId: 'api_credentials',
      name: 'API Credentials',
      description: 'Store API keys, tokens, and webhook secrets',
      category: 'Developer',
      icon: 'Key',
      color: '#00897b',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'service_name',
      schema: {
        fields: [
          { id: 'service_name', type: 'text', label: translate('forms.templateFields.apiCredentials.serviceName', 'Service/API Name'), required: true, placeholder: 'e.g., Stripe, GitHub, AWS' },
          { id: 'api_url', type: 'text', label: translate('forms.templateFields.apiCredentials.apiUrl', 'API URL'), placeholder: 'https://api.example.com' },
          { id: 'api_key', type: 'password', label: translate('forms.templateFields.apiCredentials.apiKey', 'API Key'), sensitive: true },
          { id: 'api_secret', type: 'password', label: translate('forms.templateFields.apiCredentials.apiSecret', 'API Secret'), sensitive: true },
          { id: 'access_token', type: 'password', label: translate('forms.templateFields.apiCredentials.accessToken', 'Access Token'), sensitive: true },
          { id: 'refresh_token', type: 'password', label: translate('forms.templateFields.apiCredentials.refreshToken', 'Refresh Token'), sensitive: true },
          { id: 'webhook_secret', type: 'password', label: translate('forms.templateFields.apiCredentials.webhookSecret', 'Webhook Secret'), sensitive: true },
          { id: 'client_id', type: 'text', label: translate('forms.templateFields.apiCredentials.clientId', 'Client ID') },
          { id: 'client_secret', type: 'password', label: translate('forms.templateFields.apiCredentials.clientSecret', 'Client Secret'), sensitive: true },
          { id: 'environment', type: 'text', label: translate('forms.templateFields.apiCredentials.environment', 'Environment'), placeholder: 'e.g., Production, Staging, Development' },
          { id: 'rate_limit', type: 'text', label: translate('forms.templateFields.apiCredentials.rateLimit', 'Rate Limit Info') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.apiCredentials.expiryDate', 'Expiry Date') },
          { id: 'api_documents', type: 'file', label: translate('forms.templateFields.apiCredentials.apiDocuments', 'API Documents'),
            placeholder: 'Attach API documentation, setup guides, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.apiCredentials.notes', 'Notes'), placeholder: 'API documentation, usage notes with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    ssh_key: {
      templateId: 'ssh_key',
      name: 'SSH Key',
      description: 'Store SSH keys and server access credentials',
      category: 'Developer',
      icon: 'Terminal',
      color: '#5e35b1',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'key_name',
      schema: {
        fields: [
          { id: 'key_name', type: 'text', label: translate('forms.templateFields.sshKey.keyName', 'Key Name'), required: true, placeholder: 'e.g., Production Server, GitHub Deploy' },
          { id: 'hostname', type: 'text', label: translate('forms.templateFields.sshKey.hostname', 'Hostname/IP'), placeholder: 'server.example.com or 192.168.1.1' },
          { id: 'port', type: 'number', label: translate('forms.templateFields.sshKey.port', 'Port'), placeholder: '22' },
          { id: 'username', type: 'text', label: translate('forms.templateFields.sshKey.username', 'Username') },
          { id: 'private_key', type: 'textarea', label: translate('forms.templateFields.sshKey.privateKey', 'Private Key'), sensitive: true, placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----' },
          { id: 'public_key', type: 'textarea', label: translate('forms.templateFields.sshKey.publicKey', 'Public Key'), placeholder: 'ssh-rsa AAAAB3...' },
          { id: 'passphrase', type: 'password', label: translate('forms.templateFields.sshKey.passphrase', 'Key Passphrase'), sensitive: true },
          { id: 'key_type', type: 'text', label: translate('forms.templateFields.sshKey.keyType', 'Key Type'), placeholder: 'e.g., RSA, Ed25519, ECDSA' },
          { id: 'fingerprint', type: 'text', label: translate('forms.templateFields.sshKey.fingerprint', 'Fingerprint') },
          { id: 'ssh_documents', type: 'file', label: translate('forms.templateFields.sshKey.sshDocuments', 'SSH Documents'),
            placeholder: 'Attach key files, server configs, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.sshKey.notes', 'Notes'), placeholder: 'Server info, access instructions with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    database_credentials: {
      templateId: 'database_credentials',
      name: 'Database Credentials',
      description: 'Store database connection strings and credentials',
      category: 'Developer',
      icon: 'Storage',
      color: '#c62828',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'database_name',
      schema: {
        fields: [
          { id: 'database_name', type: 'text', label: translate('forms.templateFields.databaseCredentials.databaseName', 'Database Name'), required: true },
          { id: 'db_type', type: 'text', label: translate('forms.templateFields.databaseCredentials.dbType', 'Database Type'), placeholder: 'e.g., PostgreSQL, MySQL, MongoDB' },
          { id: 'hostname', type: 'text', label: translate('forms.templateFields.databaseCredentials.hostname', 'Hostname') },
          { id: 'port', type: 'number', label: translate('forms.templateFields.databaseCredentials.port', 'Port') },
          { id: 'database', type: 'text', label: translate('forms.templateFields.databaseCredentials.database', 'Database Name/Schema') },
          { id: 'username', type: 'text', label: translate('forms.templateFields.databaseCredentials.username', 'Username') },
          { id: 'password', type: 'password', label: translate('forms.templateFields.databaseCredentials.password', 'Password'), sensitive: true },
          { id: 'connection_string', type: 'password', label: translate('forms.templateFields.databaseCredentials.connectionString', 'Connection String'), sensitive: true, placeholder: 'Full connection string URI' },
          { id: 'ssl_certificate', type: 'textarea', label: translate('forms.templateFields.databaseCredentials.sslCertificate', 'SSL Certificate'), sensitive: true },
          { id: 'environment', type: 'text', label: translate('forms.templateFields.databaseCredentials.environment', 'Environment'), placeholder: 'Production, Staging, Development' },
          { id: 'admin_url', type: 'text', label: translate('forms.templateFields.databaseCredentials.adminUrl', 'Admin Panel URL') },
          { id: 'db_documents', type: 'file', label: translate('forms.templateFields.databaseCredentials.dbDocuments', 'Database Documents'),
            placeholder: 'Attach configs, schemas, backup info, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.databaseCredentials.notes', 'Notes'), placeholder: 'Backup info, access instructions with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    server_credentials: {
      templateId: 'server_credentials',
      name: 'Server Credentials',
      description: 'Store server login credentials and access details',
      category: 'Infrastructure',
      icon: 'Dns',
      color: '#6d4c41',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'server_name',
      schema: {
        fields: [
          { id: 'server_name', type: 'text', label: translate('forms.templateFields.serverCredentials.serverName', 'Server Name'), required: true },
          { id: 'hostname', type: 'text', label: translate('forms.templateFields.serverCredentials.hostname', 'Hostname/IP Address') },
          { id: 'os', type: 'text', label: translate('forms.templateFields.serverCredentials.os', 'Operating System'), placeholder: 'e.g., Ubuntu 22.04, Windows Server 2022' },
          { id: 'provider', type: 'text', label: translate('forms.templateFields.serverCredentials.provider', 'Hosting Provider'), placeholder: 'e.g., AWS, DigitalOcean, Azure' },
          { id: 'root_password', type: 'password', label: translate('forms.templateFields.serverCredentials.rootPassword', 'Root/Admin Password'), sensitive: true },
          { id: 'sudo_password', type: 'password', label: translate('forms.templateFields.serverCredentials.sudoPassword', 'Sudo Password'), sensitive: true },
          { id: 'ssh_port', type: 'number', label: translate('forms.templateFields.serverCredentials.sshPort', 'SSH Port'), placeholder: '22' },
          { id: 'control_panel_url', type: 'text', label: translate('forms.templateFields.serverCredentials.controlPanelUrl', 'Control Panel URL') },
          { id: 'control_panel_username', type: 'text', label: translate('forms.templateFields.serverCredentials.controlPanelUsername', 'Control Panel Username') },
          { id: 'control_panel_password', type: 'password', label: translate('forms.templateFields.serverCredentials.controlPanelPassword', 'Control Panel Password'), sensitive: true },
          { id: 'server_documents', type: 'file', label: translate('forms.templateFields.serverCredentials.serverDocuments', 'Server Documents'),
            placeholder: 'Attach configs, provisioning scripts, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.serverCredentials.notes', 'Notes'), placeholder: 'Server configuration, firewall rules with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    vpn_credentials: {
      templateId: 'vpn_credentials',
      name: 'VPN Credentials',
      description: 'Store VPN configuration and access credentials',
      category: 'Network',
      icon: 'VpnKey',
      color: '#283593',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'vpn_name',
      schema: {
        fields: [
          { id: 'vpn_name', type: 'text', label: translate('forms.templateFields.vpnCredentials.vpnName', 'VPN Name'), required: true },
          { id: 'vpn_provider', type: 'text', label: translate('forms.templateFields.vpnCredentials.vpnProvider', 'VPN Provider'), placeholder: 'e.g., NordVPN, ExpressVPN, Corporate VPN' },
          { id: 'server_address', type: 'text', label: translate('forms.templateFields.vpnCredentials.serverAddress', 'Server Address') },
          { id: 'protocol', type: 'text', label: translate('forms.templateFields.vpnCredentials.protocol', 'Protocol'), placeholder: 'e.g., OpenVPN, WireGuard, IKEv2' },
          { id: 'username', type: 'text', label: translate('forms.templateFields.vpnCredentials.username', 'Username') },
          { id: 'password', type: 'password', label: translate('forms.templateFields.vpnCredentials.password', 'Password'), sensitive: true },
          { id: 'preshared_key', type: 'password', label: translate('forms.templateFields.vpnCredentials.presharedKey', 'Pre-shared Key'), sensitive: true },
          { id: 'certificate', type: 'textarea', label: translate('forms.templateFields.vpnCredentials.certificate', 'Certificate'), sensitive: true },
          { id: 'config_file', type: 'textarea', label: translate('forms.templateFields.vpnCredentials.configFile', 'Configuration File'), placeholder: 'VPN config file contents' },
          { id: 'vpn_documents', type: 'file', label: translate('forms.templateFields.vpnCredentials.vpnDocuments', 'VPN Documents'),
            placeholder: 'Attach config files, certificates, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.vpnCredentials.notes', 'Notes'), placeholder: 'Connection instructions with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    encryption_keys: {
      templateId: 'encryption_keys',
      name: 'Encryption Keys',
      description: 'Store PGP, GPG keys and encryption passphrases',
      category: 'Security',
      icon: 'EnhancedEncryption',
      color: '#c2185b',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'key_name',
      schema: {
        fields: [
          { id: 'key_name', type: 'text', label: translate('forms.templateFields.encryptionKeys.keyName', 'Key Name'), required: true, placeholder: 'e.g., Personal GPG Key, Work PGP' },
          { id: 'key_type', type: 'text', label: translate('forms.templateFields.encryptionKeys.keyType', 'Key Type'), placeholder: 'e.g., PGP, GPG, RSA, AES' },
          { id: 'key_id', type: 'text', label: translate('forms.templateFields.encryptionKeys.keyId', 'Key ID/Fingerprint') },
          { id: 'email', type: 'email', label: translate('forms.templateFields.encryptionKeys.email', 'Associated Email') },
          { id: 'public_key', type: 'textarea', label: translate('forms.templateFields.encryptionKeys.publicKey', 'Public Key'), placeholder: '-----BEGIN PGP PUBLIC KEY BLOCK-----' },
          { id: 'private_key', type: 'textarea', label: translate('forms.templateFields.encryptionKeys.privateKey', 'Private Key'), sensitive: true, placeholder: '-----BEGIN PGP PRIVATE KEY BLOCK-----' },
          { id: 'passphrase', type: 'password', label: translate('forms.templateFields.encryptionKeys.passphrase', 'Passphrase'), sensitive: true },
          { id: 'revocation_certificate', type: 'textarea', label: translate('forms.templateFields.encryptionKeys.revocationCertificate', 'Revocation Certificate'), sensitive: true },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.encryptionKeys.expiryDate', 'Expiry Date') },
          { id: 'key_strength', type: 'text', label: translate('forms.templateFields.encryptionKeys.keyStrength', 'Key Strength'), placeholder: 'e.g., 4096 bits' },
          { id: 'key_documents', type: 'file', label: translate('forms.templateFields.encryptionKeys.keyDocuments', 'Key Documents'),
            placeholder: 'Attach key files, certificates, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.encryptionKeys.notes', 'Notes'), placeholder: 'Usage instructions, trusted parties with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    emergency_contacts: {
      templateId: 'emergency_contacts',
      name: 'Emergency Contacts',
      description: 'Store critical emergency contact information',
      category: 'Personal',
      icon: 'ContactEmergency',
      color: '#d84315',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'contact_name',
      schema: {
        fields: [
          { id: 'contact_name', type: 'text', label: translate('forms.templateFields.emergencyContacts.contactName', 'Contact Name'), required: true },
          { id: 'relationship', type: 'text', label: translate('forms.templateFields.emergencyContacts.relationship', 'Relationship'), placeholder: 'e.g., Spouse, Parent, Sibling, Friend' },
          { id: 'primary_phone', type: 'phone', label: translate('forms.templateFields.emergencyContacts.primaryPhone', 'Primary Phone'), placeholder: '+1 (555) 123-4567' },
          { id: 'secondary_phone', type: 'phone', label: translate('forms.templateFields.emergencyContacts.secondaryPhone', 'Secondary Phone') },
          { id: 'email', type: 'email', label: translate('forms.templateFields.emergencyContacts.email', 'Email Address') },
          { id: 'home_address', type: 'textarea', label: translate('forms.templateFields.emergencyContacts.homeAddress', 'Home Address') },
          { id: 'work_phone', type: 'phone', label: translate('forms.templateFields.emergencyContacts.workPhone', 'Work Phone') },
          { id: 'work_address', type: 'textarea', label: translate('forms.templateFields.emergencyContacts.workAddress', 'Work Address') },
          { id: 'medical_info', type: 'richtext', label: translate('forms.templateFields.emergencyContacts.medicalInfo', 'Medical Information'), placeholder: 'Blood type, allergies, medical conditions...' },
          { id: 'special_instructions', type: 'richtext', label: translate('forms.templateFields.emergencyContacts.specialInstructions', 'Special Instructions'), placeholder: 'Languages spoken, accessibility needs, etc...' },
          { id: 'contact_documents', type: 'file', label: translate('forms.templateFields.emergencyContacts.contactDocuments', 'Contact Documents'),
            placeholder: 'Attach medical records, legal documents, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.emergencyContacts.notes', 'Notes'), placeholder: 'Additional contact information with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    domain_registration: {
      templateId: 'domain_registration',
      name: 'Domain Registration',
      description: 'Store domain names and registration details',
      category: 'Web',
      icon: 'Language',
      color: '#0277bd',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'domain_name',
      schema: {
        fields: [
          { id: 'domain_name', type: 'text', label: translate('forms.templateFields.domainRegistration.domainName', 'Domain Name'), required: true, placeholder: 'example.com' },
          { id: 'registrar', type: 'text', label: translate('forms.templateFields.domainRegistration.registrar', 'Registrar'), placeholder: 'e.g., GoDaddy, Namecheap, Google Domains' },
          { id: 'registrar_url', type: 'url', label: translate('forms.templateFields.domainRegistration.registrarUrl', 'Registrar Login URL'), placeholder: 'https://registrar.example.com' },
          { id: 'username', type: 'text', label: translate('forms.templateFields.domainRegistration.username', 'Registrar Username') },
          { id: 'password', type: 'password', label: translate('forms.templateFields.domainRegistration.password', 'Registrar Password'), sensitive: true },
          { id: 'registration_date', type: 'date', label: translate('forms.templateFields.domainRegistration.registrationDate', 'Registration Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.domainRegistration.expiryDate', 'Expiry Date') },
          { id: 'auto_renew', type: 'text', label: translate('forms.templateFields.domainRegistration.autoRenew', 'Auto-Renew Status'), placeholder: 'Enabled/Disabled' },
          { id: 'nameservers', type: 'textarea', label: translate('forms.templateFields.domainRegistration.nameservers', 'Nameservers'), placeholder: 'One nameserver per line' },
          { id: 'dns_provider', type: 'text', label: translate('forms.templateFields.domainRegistration.dnsProvider', 'DNS Provider'), placeholder: 'e.g., Cloudflare, Route53, Custom' },
          { id: 'epp_code', type: 'password', label: translate('forms.templateFields.domainRegistration.eppCode', 'EPP/Auth Code'), sensitive: true, placeholder: 'For domain transfers' },
          { id: 'ssl_certificate', type: 'text', label: translate('forms.templateFields.domainRegistration.sslCertificate', 'SSL Certificate Provider') },
          { id: 'domain_documents', type: 'file', label: translate('forms.templateFields.domainRegistration.domainDocuments', 'Domain Documents'),
            placeholder: 'Attach DNS configs, SSL certificates, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.domainRegistration.notes', 'Notes'), placeholder: 'DNS records, configuration details with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    two_factor_backup: {
      templateId: 'two_factor_backup',
      name: '2FA Backup Codes',
      description: 'Store two-factor authentication backup codes',
      category: 'Security',
      icon: 'SecurityUpdate',
      color: '#6a1b9a',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'service_name',
      schema: {
        fields: [
          { id: 'service_name', type: 'text', label: translate('forms.templateFields.twoFactorBackup.serviceName', 'Service/Account Name'), required: true, placeholder: 'e.g., Google, GitHub, AWS' },
          { id: 'account_email', type: 'email', label: translate('forms.templateFields.twoFactorBackup.accountEmail', 'Account Email') },
          { id: 'totp_secret', type: 'otp', label: translate('forms.templateFields.twoFactorBackup.totpSecret', 'TOTP Secret Key'), sensitive: true, placeholder: 'Base32 encoded secret' },
          { id: 'backup_codes', type: 'textarea', label: translate('forms.templateFields.twoFactorBackup.backupCodes', 'Backup Codes'), sensitive: true, placeholder: 'One code per line' },
          { id: 'recovery_email', type: 'email', label: translate('forms.templateFields.twoFactorBackup.recoveryEmail', 'Recovery Email') },
          { id: 'recovery_phone', type: 'phone', label: translate('forms.templateFields.twoFactorBackup.recoveryPhone', 'Recovery Phone') },
          { id: 'setup_date', type: 'date', label: translate('forms.templateFields.twoFactorBackup.setupDate', 'Setup Date') },
          { id: 'device_name', type: 'text', label: translate('forms.templateFields.twoFactorBackup.deviceName', 'Authenticator Device/App'), placeholder: 'e.g., Google Authenticator, Authy' },
          { id: 'twofa_documents', type: 'file', label: translate('forms.templateFields.twoFactorBackup.twofaDocuments', '2FA Documents'),
            placeholder: 'Attach QR codes, setup screenshots, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.twoFactorBackup.notes', 'Notes'), placeholder: 'Setup instructions, used codes with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    business_license: {
      templateId: 'business_license',
      name: 'Business License',
      description: 'Store business licenses and registration documents',
      category: 'Business',
      icon: 'Business',
      color: '#01579b',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'business_name',
      schema: {
        fields: [
          { id: 'business_name', type: 'text', label: translate('forms.templateFields.businessLicense.businessName', 'Business Name'), required: true },
          { id: 'license_type', type: 'text', label: translate('forms.templateFields.businessLicense.licenseType', 'License Type'), placeholder: 'e.g., LLC, Corporation, Sole Proprietorship' },
          { id: 'license_number', type: 'text', label: translate('forms.templateFields.businessLicense.licenseNumber', 'License Number'), sensitive: true },
          { id: 'ein_tax_id', type: 'password', label: translate('forms.templateFields.businessLicense.einTaxId', 'EIN/Tax ID'), sensitive: true },
          { id: 'registration_date', type: 'date', label: translate('forms.templateFields.businessLicense.registrationDate', 'Registration Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.businessLicense.expiryDate', 'Expiry Date') },
          { id: 'issuing_authority', type: 'text', label: translate('forms.templateFields.businessLicense.issuingAuthority', 'Issuing Authority') },
          { id: 'business_address', type: 'textarea', label: translate('forms.templateFields.businessLicense.businessAddress', 'Business Address') },
          { id: 'business_phone', type: 'phone', label: translate('forms.templateFields.businessLicense.businessPhone', 'Business Phone') },
          { id: 'business_email', type: 'email', label: translate('forms.templateFields.businessLicense.businessEmail', 'Business Email') },
          { id: 'registered_agent', type: 'text', label: translate('forms.templateFields.businessLicense.registeredAgent', 'Registered Agent') },
          { id: 'annual_filing_date', type: 'date', label: translate('forms.templateFields.businessLicense.annualFilingDate', 'Annual Filing Date') },
          { id: 'license_documents', type: 'file', label: translate('forms.templateFields.businessLicense.licenseDocuments', 'License Documents'),
            fileConfig: {
              maxFiles: 10,
              maxFileSize: 20 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
              description: 'Upload business license and registration documents (PDF, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.businessLicense.notes', 'Notes'), placeholder: 'License details, filing requirements with rich formatting...' },
        ],
      },
      defaultData: {
        license_documents: []
      },
      tags: [],
    },

    membership_subscription: {
      templateId: 'membership_subscription',
      name: 'Membership/Subscription',
      description: 'Store memberships, subscriptions, and recurring services',
      category: 'Business',
      icon: 'CardMembership',
      color: '#004d40',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'service_name',
      schema: {
        fields: [
          { id: 'service_name', type: 'text', label: translate('forms.templateFields.membershipSubscription.serviceName', 'Service/Membership Name'), required: true },
          { id: 'membership_number', type: 'password', label: translate('forms.templateFields.membershipSubscription.membershipNumber', 'Membership Number'), sensitive: true },
          { id: 'account_email', type: 'email', label: translate('forms.templateFields.membershipSubscription.accountEmail', 'Account Email') },
          { id: 'username', type: 'text', label: translate('forms.templateFields.membershipSubscription.username', 'Username') },
          { id: 'password', type: 'password', label: translate('forms.templateFields.membershipSubscription.password', 'Password'), sensitive: true },
          { id: 'subscription_type', type: 'text', label: translate('forms.templateFields.membershipSubscription.subscriptionType', 'Subscription Type'), placeholder: 'e.g., Monthly, Annual, Lifetime' },
          { id: 'start_date', type: 'date', label: translate('forms.templateFields.membershipSubscription.startDate', 'Start Date') },
          { id: 'renewal_date', type: 'date', label: translate('forms.templateFields.membershipSubscription.renewalDate', 'Renewal Date') },
          { id: 'cost', type: 'text', label: translate('forms.templateFields.membershipSubscription.cost', 'Cost/Fee') },
          { id: 'payment_method', type: 'text', label: translate('forms.templateFields.membershipSubscription.paymentMethod', 'Payment Method') },
          { id: 'auto_renewal', type: 'text', label: translate('forms.templateFields.membershipSubscription.autoRenewal', 'Auto Renewal Status'), placeholder: 'Enabled/Disabled' },
          { id: 'benefits', type: 'richtext', label: translate('forms.templateFields.membershipSubscription.benefits', 'Benefits/Features') },
          { id: 'cancellation_url', type: 'url', label: translate('forms.templateFields.membershipSubscription.cancellationUrl', 'Cancellation URL') },
          { id: 'subscription_documents', type: 'file', label: translate('forms.templateFields.membershipSubscription.subscriptionDocuments', 'Subscription Documents'),
            placeholder: 'Attach membership cards, agreements, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.membershipSubscription.notes', 'Notes'), placeholder: 'Service details with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    loyalty_program: {
      templateId: 'loyalty_program',
      name: 'Loyalty Program',
      description: 'Store loyalty cards, reward programs, and points',
      category: 'Business',
      icon: 'Stars',
      color: '#f57f17',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'program_name',
      schema: {
        fields: [
          { id: 'program_name', type: 'text', label: translate('forms.templateFields.loyaltyProgram.programName', 'Program Name'), required: true, placeholder: 'e.g., Airline Miles, Store Rewards' },
          { id: 'member_number', type: 'password', label: translate('forms.templateFields.loyaltyProgram.memberNumber', 'Member Number'), sensitive: true },
          { id: 'member_name', type: 'text', label: translate('forms.templateFields.loyaltyProgram.memberName', 'Member Name') },
          { id: 'account_email', type: 'email', label: translate('forms.templateFields.loyaltyProgram.accountEmail', 'Account Email') },
          { id: 'password', type: 'password', label: translate('forms.templateFields.loyaltyProgram.password', 'Account Password'), sensitive: true },
          { id: 'current_points', type: 'text', label: translate('forms.templateFields.loyaltyProgram.currentPoints', 'Current Points/Miles') },
          { id: 'tier_status', type: 'text', label: translate('forms.templateFields.loyaltyProgram.tierStatus', 'Tier/Status Level'), placeholder: 'e.g., Silver, Gold, Platinum' },
          { id: 'join_date', type: 'date', label: translate('forms.templateFields.loyaltyProgram.joinDate', 'Join Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.loyaltyProgram.expiryDate', 'Points Expiry Date') },
          { id: 'program_url', type: 'url', label: translate('forms.templateFields.loyaltyProgram.programUrl', 'Program Website') },
          { id: 'customer_service', type: 'phone', label: translate('forms.templateFields.loyaltyProgram.customerService', 'Customer Service Phone') },
          { id: 'loyalty_documents', type: 'file', label: translate('forms.templateFields.loyaltyProgram.loyaltyDocuments', 'Loyalty Documents'),
            placeholder: 'Attach loyalty cards, terms, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.loyaltyProgram.notes', 'Notes'), placeholder: 'Reward details, redemption info with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    passport: {
      templateId: 'passport',
      name: 'Passport',
      description: 'Store passport information and travel documents',
      category: 'Travel',
      icon: 'Flight',
      color: '#1565c0',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'passport_holder',
      schema: {
        fields: [
          { id: 'passport_holder', type: 'text', label: translate('forms.templateFields.passport.passportHolder', 'Passport Holder Name'), required: true },
          { id: 'passport_number', type: 'password', label: translate('forms.templateFields.passport.passportNumber', 'Passport Number'), sensitive: true },
          { id: 'nationality', type: 'text', label: translate('forms.templateFields.passport.nationality', 'Nationality') },
          { id: 'country_of_issue', type: 'text', label: translate('forms.templateFields.passport.countryOfIssue', 'Country of Issue') },
          { id: 'date_of_birth', type: 'date', label: translate('forms.templateFields.passport.dateOfBirth', 'Date of Birth') },
          { id: 'place_of_birth', type: 'text', label: translate('forms.templateFields.passport.placeOfBirth', 'Place of Birth') },
          { id: 'issue_date', type: 'date', label: translate('forms.templateFields.passport.issueDate', 'Issue Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.passport.expiryDate', 'Expiry Date') },
          { id: 'issuing_authority', type: 'text', label: translate('forms.templateFields.passport.issuingAuthority', 'Issuing Authority') },
          { id: 'emergency_contact', type: 'text', label: translate('forms.templateFields.passport.emergencyContact', 'Emergency Contact') },
          { id: 'emergency_phone', type: 'phone', label: translate('forms.templateFields.passport.emergencyPhone', 'Emergency Contact Phone') },
          { id: 'passport_scans', type: 'file', label: translate('forms.templateFields.passport.passportScans', 'Passport Scans'),
            fileConfig: {
              maxFiles: 5,
              maxFileSize: 20 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
              description: 'Upload scanned copies of passport pages (PDF, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.passport.notes', 'Notes'), placeholder: 'Visa stamps, travel history with rich formatting...' },
        ],
      },
      defaultData: {
        passport_scans: []
      },
      tags: [],
    },

    travel_visa: {
      templateId: 'travel_visa',
      name: 'Travel Visa',
      description: 'Store visa information and travel permits',
      category: 'Travel',
      icon: 'FlightTakeoff',
      color: '#0277bd',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'visa_country',
      schema: {
        fields: [
          { id: 'visa_country', type: 'text', label: translate('forms.templateFields.travelVisa.visaCountry', 'Visa Country'), required: true },
          { id: 'visa_type', type: 'text', label: translate('forms.templateFields.travelVisa.visaType', 'Visa Type'), placeholder: 'e.g., Tourist, Business, Student, Work' },
          { id: 'visa_number', type: 'password', label: translate('forms.templateFields.travelVisa.visaNumber', 'Visa Number'), sensitive: true },
          { id: 'passport_number', type: 'password', label: translate('forms.templateFields.travelVisa.passportNumber', 'Associated Passport Number'), sensitive: true },
          { id: 'holder_name', type: 'text', label: translate('forms.templateFields.travelVisa.holderName', 'Holder Name') },
          { id: 'issue_date', type: 'date', label: translate('forms.templateFields.travelVisa.issueDate', 'Issue Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.travelVisa.expiryDate', 'Expiry Date') },
          { id: 'duration', type: 'text', label: translate('forms.templateFields.travelVisa.duration', 'Duration/Stay Limit') },
          { id: 'entries', type: 'text', label: translate('forms.templateFields.travelVisa.entries', 'Number of Entries'), placeholder: 'e.g., Single, Multiple' },
          { id: 'issuing_embassy', type: 'text', label: translate('forms.templateFields.travelVisa.issuingEmbassy', 'Issuing Embassy/Consulate') },
          { id: 'application_number', type: 'text', label: translate('forms.templateFields.travelVisa.applicationNumber', 'Application Number') },
          { id: 'fee_paid', type: 'text', label: translate('forms.templateFields.travelVisa.feePaid', 'Fee Paid') },
          { id: 'visa_scans', type: 'file', label: translate('forms.templateFields.travelVisa.visaScans', 'Visa Scans'),
            fileConfig: {
              maxFiles: 5,
              maxFileSize: 20 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
              description: 'Upload scanned copies of visa documents (PDF, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.travelVisa.notes', 'Notes'), placeholder: 'Entry requirements, restrictions with rich formatting...' },
        ],
      },
      defaultData: {
        visa_scans: []
      },
      tags: [],
    },

    frequent_flyer: {
      templateId: 'frequent_flyer',
      name: 'Frequent Flyer',
      description: 'Store airline frequent flyer programs and miles',
      category: 'Travel',
      icon: 'AirplanemodeActive',
      color: '#01579b',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'airline_name',
      schema: {
        fields: [
          { id: 'airline_name', type: 'text', label: translate('forms.templateFields.frequentFlyer.airlineName', 'Airline Name'), required: true },
          { id: 'program_name', type: 'text', label: translate('forms.templateFields.frequentFlyer.programName', 'Program Name') },
          { id: 'member_number', type: 'password', label: translate('forms.templateFields.frequentFlyer.memberNumber', 'Member Number'), sensitive: true },
          { id: 'member_name', type: 'text', label: translate('forms.templateFields.frequentFlyer.memberName', 'Member Name') },
          { id: 'account_password', type: 'password', label: translate('forms.templateFields.frequentFlyer.accountPassword', 'Account Password'), sensitive: true },
          { id: 'tier_status', type: 'text', label: translate('forms.templateFields.frequentFlyer.tierStatus', 'Tier Status'), placeholder: 'e.g., Silver, Gold, Platinum' },
          { id: 'current_miles', type: 'text', label: translate('forms.templateFields.frequentFlyer.currentMiles', 'Current Miles/Points') },
          { id: 'join_date', type: 'date', label: translate('forms.templateFields.frequentFlyer.joinDate', 'Join Date') },
          { id: 'miles_expiry', type: 'date', label: translate('forms.templateFields.frequentFlyer.milesExpiry', 'Miles Expiry Date') },
          { id: 'program_url', type: 'url', label: translate('forms.templateFields.frequentFlyer.programUrl', 'Program Website') },
          { id: 'partner_airlines', type: 'richtext', label: translate('forms.templateFields.frequentFlyer.partnerAirlines', 'Partner Airlines/Alliances') },
          { id: 'flyer_documents', type: 'file', label: translate('forms.templateFields.frequentFlyer.flyerDocuments', 'Frequent Flyer Documents'),
            placeholder: 'Attach membership cards, tier info, or related files' },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.frequentFlyer.notes', 'Notes'), placeholder: 'Benefits, redemption info with rich formatting...' },
        ],
      },
      defaultData: {},
      tags: [],
    },

    professional_license: {
      templateId: 'professional_license',
      name: 'Professional License',
      description: 'Store professional licenses and certifications',
      category: 'Education',
      icon: 'WorkspacePremium',
      color: '#6a1b9a',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'license_name',
      schema: {
        fields: [
          { id: 'license_name', type: 'text', label: translate('forms.templateFields.professionalLicense.licenseName', 'License/Certification Name'), required: true },
          { id: 'license_type', type: 'text', label: translate('forms.templateFields.professionalLicense.licenseType', 'License Type'), placeholder: 'e.g., Medical, Legal, Accounting, Engineering' },
          { id: 'license_number', type: 'password', label: translate('forms.templateFields.professionalLicense.licenseNumber', 'License Number'), sensitive: true },
          { id: 'holder_name', type: 'text', label: translate('forms.templateFields.professionalLicense.holderName', 'License Holder Name') },
          { id: 'issuing_organization', type: 'text', label: translate('forms.templateFields.professionalLicense.issuingOrganization', 'Issuing Organization') },
          { id: 'issue_date', type: 'date', label: translate('forms.templateFields.professionalLicense.issueDate', 'Issue Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.professionalLicense.expiryDate', 'Expiry Date') },
          { id: 'renewal_requirements', type: 'richtext', label: translate('forms.templateFields.professionalLicense.renewalRequirements', 'Renewal Requirements'), placeholder: 'Continuing education, fees, etc...' },
          { id: 'jurisdiction', type: 'text', label: translate('forms.templateFields.professionalLicense.jurisdiction', 'Jurisdiction/State') },
          { id: 'verification_url', type: 'url', label: translate('forms.templateFields.professionalLicense.verificationUrl', 'Verification URL') },
          { id: 'contact_phone', type: 'phone', label: translate('forms.templateFields.professionalLicense.contactPhone', 'Organization Contact') },
          { id: 'license_documents', type: 'file', label: translate('forms.templateFields.professionalLicense.licenseDocuments', 'License Documents'),
            fileConfig: {
              maxFiles: 5,
              maxFileSize: 20 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
              description: 'Upload license certificates and credentials (PDF, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.professionalLicense.notes', 'Notes'), placeholder: 'Specializations, restrictions with rich formatting...' },
        ],
      },
      defaultData: {
        license_documents: []
      },
      tags: [],
    },

    education_record: {
      templateId: 'education_record',
      name: 'Education Record',
      description: 'Store diplomas, degrees, and academic transcripts',
      category: 'Education',
      icon: 'School',
      color: '#4a148c',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'degree_name',
      schema: {
        fields: [
          { id: 'degree_name', type: 'text', label: translate('forms.templateFields.educationRecord.degreeName', 'Degree/Certificate Name'), required: true },
          { id: 'institution_name', type: 'text', label: translate('forms.templateFields.educationRecord.institutionName', 'Institution Name'), required: true },
          { id: 'student_id', type: 'password', label: translate('forms.templateFields.educationRecord.studentId', 'Student ID'), sensitive: true },
          { id: 'student_name', type: 'text', label: translate('forms.templateFields.educationRecord.studentName', 'Student Name') },
          { id: 'degree_type', type: 'text', label: translate('forms.templateFields.educationRecord.degreeType', 'Degree Type'), placeholder: 'e.g., Bachelor, Master, PhD, Certificate' },
          { id: 'major_field', type: 'text', label: translate('forms.templateFields.educationRecord.majorField', 'Major/Field of Study') },
          { id: 'graduation_date', type: 'date', label: translate('forms.templateFields.educationRecord.graduationDate', 'Graduation Date') },
          { id: 'gpa', type: 'text', label: translate('forms.templateFields.educationRecord.gpa', 'GPA/Grade') },
          { id: 'honors', type: 'text', label: translate('forms.templateFields.educationRecord.honors', 'Honors/Awards'), placeholder: 'e.g., Cum Laude, Honors' },
          { id: 'diploma_number', type: 'text', label: translate('forms.templateFields.educationRecord.diplomaNumber', 'Diploma/Certificate Number') },
          { id: 'verification_url', type: 'url', label: translate('forms.templateFields.educationRecord.verificationUrl', 'Verification URL') },
          { id: 'registrar_contact', type: 'phone', label: translate('forms.templateFields.educationRecord.registrarContact', 'Registrar Contact') },
          { id: 'education_documents', type: 'file', label: translate('forms.templateFields.educationRecord.educationDocuments', 'Education Documents'),
            fileConfig: {
              maxFiles: 10,
              maxFileSize: 20 * 1024 * 1024,
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
              description: 'Upload diplomas, transcripts, certificates (PDF, images)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.educationRecord.notes', 'Notes'), placeholder: 'Transcript details, achievements with rich formatting...' },
        ],
      },
      defaultData: {
        education_documents: []
      },
      tags: [],
    },
  };
}

/**
 * Get all available template categories
 */
export function getTemplateCategories(): string[] {
  const templates = getBuiltInFormTemplates();
  const categories = new Set<string>();
  
  Object.values(templates).forEach(template => {
    if (template.category) {
      categories.add(template.category);
    }
  });
  
  return Array.from(categories).sort();
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): FormTemplate[] {
  const templates = getBuiltInFormTemplates();
  return Object.values(templates).filter(template => template.category === category);
}

/**
 * Get all templates (built-in + user's custom templates from Firestore)
 * @param userId Optional user ID to fetch custom templates
 * @param t Optional translation function for internationalizing field labels
 * @param privateKey Optional private key for decrypting encrypted templates
 */
export async function getAllTemplates(userId?: string, t?: TranslateFn, privateKey?: string): Promise<{ [key: string]: FormTemplate }> {
  const builtInTemplates = getBuiltInFormTemplates(t);
  
  // If no userId provided, return only built-in templates
  if (!userId) {
    return { ...builtInTemplates };
  }
  
  // Fetch custom templates from Firestore
  try {
    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'author', operator: '==', value: userId }
    ];
    
    const customTemplatesData = await backendService.query.get('formTemplates', constraints);
    
    const customTemplates: { [key: string]: FormTemplate } = {};

    await Promise.all(customTemplatesData.map(async (data) => {
      try {
        let template: FormTemplate;
        if (data.isEncrypted && privateKey) {
          const { decryptTemplateDoc } = await import('../services/templateEncryption');
          template = await decryptTemplateDoc(
            data as Parameters<typeof decryptTemplateDoc>[0],
            userId,
            privateKey
          );
        } else if (data.isEncrypted && !privateKey) {
          // Skip encrypted templates when no private key is available
          return;
        } else {
          template = data as FormTemplate;
        }
        const key = template.templateId || data.id;
        customTemplates[key] = { ...template, templateId: data.id };
      } catch (err) {
        console.error('Failed to decrypt custom template', data.id, err);
      }
    }));
    
    // Merge built-in and custom templates
    return { ...builtInTemplates, ...customTemplates };
  } catch (error: unknown) {
    // Silently ignore permission-denied errors - user may not have templates collection
    if ((error as { code?: string })?.code !== 'permission-denied') {
      console.error('Error loading custom templates:', error);
    }
    // Return built-in templates if there's an error
    return { ...builtInTemplates };
  }
}

/**
 * Create a form from any template (built-in or custom)
 * @param templateKey The template key/ID
 * @param formName The name for the new form
 * @param userId Optional user ID
 * @param t Optional translation function for internationalizing field labels
 */
export async function createFormFromTemplate(
  templateKey: string, 
  formName: string, 
  userId?: string,
  t?: TranslateFn
): Promise<import('./formFiles').SecureFormData> {
  const allTemplates = await getAllTemplates(userId, t);
  const template = allTemplates[templateKey];
  
  if (!template) {
    throw new Error(`Template ${templateKey} not found`);
  }
  
  const now = new Date().toISOString();
  
  return {
    metadata: {
      name: formName,
      description: `Created from template: ${template.name}`,
      category: template.category,
      icon: template.icon,
      color: template.color,
      version: '1.0.0',
      author: userId,
      created: now,
      modified: now,
    },
    template: JSON.parse(JSON.stringify(template)), // Embed the complete template
    schema: JSON.parse(JSON.stringify(template.schema)), // Deep clone
    data: JSON.parse(JSON.stringify(template.defaultData || {})), // Deep clone default data
    attachments: {},
    tags: [...(template.tags || [])],
  };
}

/**
 * Create a form from a built-in template (legacy function for backwards compatibility)
 * @param templateKey The template key
 * @param formName The name for the new form
 * @param userId Optional user ID
 * @param t Optional translation function for internationalizing field labels
 */
export function createFormFromBuiltInTemplate(
  templateKey: string, 
  formName: string, 
  userId?: string,
  t?: TranslateFn
): import('./formFiles').SecureFormData {
  const templates = getBuiltInFormTemplates(t);
  const template = templates[templateKey];
  
  if (!template) {
    throw new Error(`Template ${templateKey} not found`);
  }
  
  const now = new Date().toISOString();
  
  return {
    metadata: {
      name: formName,
      description: `Created from template: ${template.name}`,
      category: template.category,
      icon: template.icon,
      color: template.color,
      version: '1.0.0',
      author: userId,
      created: now,
      modified: now,
    },
    template: JSON.parse(JSON.stringify(template)), // Embed the complete template
    schema: JSON.parse(JSON.stringify(template.schema)), // Deep clone
    data: JSON.parse(JSON.stringify(template.defaultData || {})), // Deep clone default data
    attachments: {},
    tags: [...(template.tags || [])],
  };
}