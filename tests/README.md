# SeraVault Test Suite

This comprehensive test suite provides user-perspective testing for SeraVault, covering everything from basic file operations to complex form creation and encryption workflows.

## 🧪 Test Structure

```
tests/
├── e2e/                    # End-to-end tests (Playwright)
│   └── user-journey.spec.ts    # Complete user workflow tests
├── unit/                   # Unit tests (Vitest)
│   ├── components.test.tsx     # React component tests
│   ├── crypto.test.ts          # Encryption function tests
│   └── forms.test.ts           # Form functionality tests
├── utils/                  # Test utilities and helpers
│   └── test-helpers.ts         # Mock data and test utilities
├── setup.ts               # Global test setup
└── README.md              # This file
```

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm run test:all
```

### Run Specific Test Types
```bash
# Unit tests only
npm run test

# Unit tests with UI
npm run test:ui

# E2E tests only
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui

# Run with coverage
npm run test:coverage
```

## 📋 What Gets Tested

### 🎭 End-to-End User Journeys

**Complete Workflow Test** (`user-journey.spec.ts`):
1. **User Registration** - Sign up for new account
2. **Encryption Setup** - Configure passphrase and key generation
3. **File Upload** - Upload and encrypt files with metadata
4. **File Access** - View decrypted file content
5. **Folder Management** - Create, organize, and navigate folders
6. **Form Creation** - Build custom forms with various field types
7. **Form Usage** - Fill out and save form data
8. **File Sharing** - Share files with other users
9. **Search Functionality** - Find files and folders
10. **Settings Management** - Update profile, theme, language
11. **File Management** - Delete files with React dialog confirmation
12. **Secure Logout** - Clean session termination

**Error Handling Tests**:
- Network connectivity issues
- Invalid encryption passphrases
- File upload failures
- Permission errors

**Mobile Responsiveness**:
- Mobile navigation and menu functionality
- Touch interactions
- Responsive file operations

**Performance Tests**:
- Load time with many files
- File upload progress indicators
- Memory usage validation

### 🔧 Unit Tests

**Crypto Functions** (`crypto.test.ts`):
- HPKE key generation and encryption/decryption
- Post-quantum cryptography operations
- Multi-recipient file encryption
- Metadata encryption/decryption
- Utility functions (hex/bytes conversion)

**React Components** (`components.test.tsx`):
- FileTable rendering and interactions
- FormBuilder template selection
- LanguageSwitcher functionality
- ThemeSwitcher operations
- Component integration testing

**Form Operations** (`forms.test.ts`):
- Form file creation and encryption
- Form data validation
- Template management
- Field type validation
- Error handling scenarios

## 🔍 Test Data and Scenarios

### Test User Data
```javascript
{
  email: 'test@seravault.com',
  password: 'testpassword123',
  passphrase: 'test-passphrase-for-encryption'
}
```

### Test File Types
- Text documents (.txt)
- PDFs (.pdf) 
- Images (.jpg, .png)
- Form files (.form)
- Large files (for performance testing)

### Test Forms
- Personal Information Form
- Contact Forms
- Survey Forms
- Custom field validation

## 🛠 Configuration

### Playwright Configuration (`playwright.config.ts`)
- Runs tests against `http://localhost:5178`
- Tests on Chrome, Firefox, Safari
- Mobile device testing (Pixel 5, iPhone 12)
- Automatic screenshots on failure
- Video recording for failed tests

### Vitest Configuration (`vitest.config.ts`)
- JSDOM environment for React testing
- Global test utilities
- Mock Firebase services
- CSS support enabled

## 📊 Coverage Goals

The test suite aims for:
- **90%+ code coverage** for critical encryption functions
- **85%+ coverage** for React components
- **100% coverage** for form operations
- **Complete user workflow coverage** in E2E tests

## 🔒 Security Testing

Special focus on:
- **Encryption/Decryption** - All data properly encrypted
- **Key Management** - Secure key generation and storage
- **Authentication** - Proper user session management
- **File Permissions** - Access control validation
- **Metadata Protection** - File names/sizes encrypted

## 🚨 Error Scenarios Tested

### Network Issues
- Offline mode handling
- Connection timeouts
- Server errors (500, 503)
- Firebase service unavailability

### Encryption Errors
- Invalid passphrases
- Corrupted encryption keys
- Key mismatch scenarios
- Decryption failures

### User Input Validation
- Invalid file types
- Empty form submissions
- Malformed email addresses
- File size limitations

### Browser Compatibility
- Different browsers (Chrome, Firefox, Safari)
- Mobile browsers
- Different screen sizes
- Touch vs mouse interactions

## 📝 Writing New Tests

### Adding E2E Tests
```typescript
test('new user feature', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="new-feature"]');
  await expect(page.locator('[data-testid="result"]')).toBeVisible();
});
```

### Adding Unit Tests
```typescript
describe('new functionality', () => {
  it('should work correctly', () => {
    const result = newFunction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### Using Test Helpers
```typescript
import { createMockFileData, expectToBeValidFileData } from '../utils/test-helpers';

const mockFile = createMockFileData({ name: 'test.txt' });
expectToBeValidFileData(mockFile);
```

## 🐛 Debugging Tests

### E2E Test Debugging
```bash
# Run with browser UI visible
npm run test:e2e:debug

# Run specific test file
npx playwright test user-journey.spec.ts --debug

# View test results in HTML report
npx playwright show-report
```

### Unit Test Debugging
```bash
# Run tests with UI
npm run test:ui

# Run specific test file
npm run test components.test.tsx

# Run with verbose output
npm run test -- --reporter=verbose
```

## 🎯 Test Data Attributes

All testable elements should include `data-testid` attributes:

```html
<!-- File operations -->
<div data-testid="file-item" data-filename="document.pdf">
<button data-testid="upload-button">Upload</button>
<input data-testid="file-upload-input" type="file">

<!-- Form elements -->
<form data-testid="login-form">
<input data-testid="email-input" type="email">
<button data-testid="submit-button">Submit</button>

<!-- Navigation -->
<nav data-testid="main-navigation">
<button data-testid="profile-menu">Profile</button>
```

## ⚡ Continuous Integration

Tests are designed to run in CI environments:
- Headless browser support
- Parallel test execution
- Automatic retry on flaky tests
- Comprehensive error reporting
- Coverage threshold enforcement

## 🔄 Test Maintenance

### Regular Updates Needed
- Update test data when UI changes
- Maintain data-testid attributes
- Review and update mock data
- Performance baseline adjustments
- Browser compatibility updates

### Performance Monitoring
- Track test execution time
- Monitor memory usage during tests
- File upload/download speed tests
- Database query performance

This test suite ensures SeraVault works reliably from the user's perspective, covering all critical functionality with both unit and integration testing approaches.