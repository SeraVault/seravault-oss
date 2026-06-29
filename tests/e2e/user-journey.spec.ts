import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'test@seravault.com',
  password: 'testpassword123',
  passphrase: 'test-passphrase-for-encryption'
};

const testFile = {
  name: 'test-document.txt',
  content: 'This is a test document for SeraVault.'
};

const testForm = {
  name: 'Personal Information Form',
  description: 'A test form for collecting personal data',
  fields: [
    { label: 'Full Name', type: 'text', required: true },
    { label: 'Email Address', type: 'email', required: true },
    { label: 'Notes', type: 'textarea', required: false }
  ]
};

test.describe('SeraVault Complete User Journey', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    // Start fresh for each test
    await page.goto('/');
  });

  test('Complete user workflow: signup → file upload → form creation → sharing', async () => {
    // === STEP 1: User Registration ===
    test.step('User can sign up for new account', async () => {
      await page.click('[data-testid="signup-link"], text="Sign Up"');
      await page.waitForSelector('[data-testid="signup-form"]', { timeout: 10000 });
      
      await page.fill('[data-testid="email-input"]', testUser.email);
      await page.fill('[data-testid="password-input"]', testUser.password);
      await page.click('[data-testid="signup-button"]');
      
      // Should redirect to passphrase setup
      await page.waitForSelector('[data-testid="passphrase-setup"]', { timeout: 10000 });
    });

    // === STEP 2: Encryption Setup ===
    test.step('User can set up encryption passphrase', async () => {
      await page.fill('[data-testid="passphrase-input"]', testUser.passphrase);
      await page.fill('[data-testid="passphrase-confirm"]', testUser.passphrase);
      await page.click('[data-testid="setup-encryption"]');
      
      // Should enter main application
      await page.waitForSelector('[data-testid="main-content"]', { timeout: 15000 });
      await expect(page.locator('[data-testid="file-explorer"]')).toBeVisible();
    });

    // === STEP 3: File Upload ===
    test.step('User can upload and encrypt files', async () => {
      // Create a test file
      const fileContent = Buffer.from(testFile.content, 'utf8');
      
      await page.setInputFiles('[data-testid="file-upload-input"]', {
        name: testFile.name,
        mimeType: 'text/plain',
        buffer: fileContent,
      });
      
      // Wait for upload to complete
      await page.waitForSelector(`[data-testid="file-item"][data-filename*="${testFile.name}"]`, { timeout: 10000 });
      
      // Verify file appears in list with proper name and size
      const fileItem = page.locator(`[data-testid="file-item"][data-filename*="${testFile.name}"]`);
      await expect(fileItem).toBeVisible();
      await expect(fileItem.locator('[data-testid="file-name"]')).toContainText(testFile.name);
      await expect(fileItem.locator('[data-testid="file-size"]')).not.toBeEmpty();
    });

    // === STEP 4: File Access ===
    test.step('User can view uploaded file content', async () => {
      await page.click(`[data-testid="file-item"][data-filename*="${testFile.name}"]`);
      
      // Should open file viewer
      await page.waitForSelector('[data-testid="file-viewer"]', { timeout: 10000 });
      await expect(page.locator('[data-testid="file-content"]')).toContainText(testFile.content);
      
      // Close viewer
      await page.click('[data-testid="close-viewer"]');
    });

    // === STEP 5: Folder Management ===
    test.step('User can create and organize folders', async () => {
      await page.click('[data-testid="create-folder-button"]');
      await page.fill('[data-testid="folder-name-input"]', 'Test Documents');
      await page.click('[data-testid="create-folder-confirm"]');
      
      // Verify folder appears
      await expect(page.locator('[data-testid="folder-item"][data-foldername="Test Documents"]')).toBeVisible();
      
      // Move file to folder (drag and drop or context menu)
      await page.click(`[data-testid="file-item"][data-filename*="${testFile.name}"]`, { button: 'right' });
      await page.click('[data-testid="move-to-folder"]');
      await page.click('[data-testid="folder-option"][data-foldername="Test Documents"]');
      
      // Navigate into folder and verify file is there
      await page.click('[data-testid="folder-item"][data-foldername="Test Documents"]');
      await expect(page.locator(`[data-testid="file-item"][data-filename*="${testFile.name}"]`)).toBeVisible();
    });

    // === STEP 6: Form Creation ===
    test.step('User can create custom forms', async () => {
      await page.click('[data-testid="create-form-button"]');
      
      // Fill form metadata
      await page.fill('[data-testid="form-name-input"]', testForm.name);
      await page.fill('[data-testid="form-description-input"]', testForm.description);
      
      // Add form fields
      for (const field of testForm.fields) {
        await page.click('[data-testid="add-field-button"]');
        await page.fill('[data-testid="field-label-input"]:last-child', field.label);
        await page.selectOption('[data-testid="field-type-select"]:last-child', field.type);
        if (field.required) {
          await page.check('[data-testid="field-required-checkbox"]:last-child');
        }
      }
      
      // Save form
      await page.click('[data-testid="save-form-button"]');
      
      // Verify form appears in file list with .form extension
      await page.waitForSelector(`[data-testid="file-item"][data-filename*="${testForm.name}.form"]`, { timeout: 10000 });
      const formItem = page.locator(`[data-testid="file-item"][data-filename*="${testForm.name}.form"]`);
      await expect(formItem).toBeVisible();
      await expect(formItem.locator('[data-testid="file-name"]')).toContainText(testForm.name);
    });

    // === STEP 7: Form Usage ===
    test.step('User can fill out and save form data', async () => {
      await page.click(`[data-testid="file-item"][data-filename*="${testForm.name}.form"]`);
      
      // Should open form viewer/editor
      await page.waitForSelector('[data-testid="form-viewer"]', { timeout: 10000 });
      
      // Fill out form fields
      await page.fill('[data-testid="form-field-input"][data-field="Full Name"]', 'John Doe');
      await page.fill('[data-testid="form-field-input"][data-field="Email Address"]', 'john.doe@example.com');
      await page.fill('[data-testid="form-field-input"][data-field="Notes"]', 'This is a test form submission.');
      
      // Save form data
      await page.click('[data-testid="save-form-data"]');
      
      // Verify success message
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      
      // Close form
      await page.click('[data-testid="close-form"]');
    });

    // === STEP 8: File Sharing ===
    test.step('User can share files with others', async () => {
      // Right-click on a file
      await page.click(`[data-testid="file-item"][data-filename*="${testFile.name}"]`, { button: 'right' });
      await page.click('[data-testid="share-file"]');
      
      // Enter email to share with
      await page.fill('[data-testid="share-email-input"]', 'recipient@example.com');
      await page.click('[data-testid="share-confirm-button"]');
      
      // Verify share success
      await expect(page.locator('[data-testid="share-success-message"]')).toBeVisible();
    });

    // === STEP 9: Search Functionality ===
    test.step('User can search for files and folders', async () => {
      await page.fill('[data-testid="search-input"]', testFile.name);
      await page.press('[data-testid="search-input"]', 'Enter');
      
      // Verify search results
      await expect(page.locator(`[data-testid="search-result"][data-filename*="${testFile.name}"]`)).toBeVisible();
      
      // Clear search
      await page.click('[data-testid="clear-search"]');
    });

    // === STEP 10: Settings and Profile ===
    test.step('User can access settings and update profile', async () => {
      await page.click('[data-testid="profile-menu"]');
      await page.click('[data-testid="settings-link"]');
      
      // Verify settings page loads
      await expect(page.locator('[data-testid="settings-content"]')).toBeVisible();
      
      // Test theme switching
      await page.click('[data-testid="theme-toggle"]');
      await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
      
      // Test language switching
      await page.click('[data-testid="language-selector"]');
      await page.click('[data-testid="language-option"][data-lang="es"]');
      // Should see Spanish text
      await expect(page.locator('[data-testid="settings-title"]')).toContainText('Configuración');
    });

    // === STEP 11: File Management ===
    test.step('User can delete files and folders', async () => {
      // Navigate back to main folder
      await page.click('[data-testid="home-button"]');
      
      // Delete test file
      await page.click(`[data-testid="file-item"][data-filename*="${testFile.name}"]`, { button: 'right' });
      await page.click('[data-testid="delete-file"]');
      
      // Confirm deletion in React dialog (not native confirm)
      await page.waitForSelector('[data-testid="delete-confirmation-dialog"]', { timeout: 5000 });
      await page.click('[data-testid="confirm-delete-button"]');
      
      // Verify file is removed
      await expect(page.locator(`[data-testid="file-item"][data-filename*="${testFile.name}"]`)).not.toBeVisible();
    });

    // === STEP 12: Logout ===
    test.step('User can logout securely', async () => {
      await page.click('[data-testid="profile-menu"]');
      await page.click('[data-testid="logout-button"]');
      
      // Should redirect to login page
      await page.waitForSelector('[data-testid="login-form"]', { timeout: 10000 });
      await expect(page.url()).toContain('/login');
    });
  });

  test.describe('Error Handling', () => {
    test('handles network errors gracefully', async () => {
      // Simulate offline condition
      await page.context().setOffline(true);
      
      await page.goto('/');
      
      // Should show offline message or error
      await expect(page.locator('[data-testid="offline-message"], .error-message')).toBeVisible();
      
      // Restore connection
      await page.context().setOffline(false);
    });

    test('handles encryption errors properly', async () => {
      // Test with invalid passphrase
      await page.goto('/');
      await page.fill('[data-testid="email-input"]', testUser.email);
      await page.fill('[data-testid="password-input"]', testUser.password);
      await page.click('[data-testid="login-button"]');
      
      // Enter wrong passphrase
      await page.fill('[data-testid="passphrase-input"]', 'wrong-passphrase');
      await page.click('[data-testid="unlock-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="passphrase-error"]')).toBeVisible();
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('works on mobile devices', async () => {
      // Test mobile navigation
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      
      await page.goto('/');
      
      // Mobile menu should be visible
      await expect(page.locator('[data-testid="mobile-menu-button"]')).toBeVisible();
      
      // Desktop sidebar should be hidden
      await expect(page.locator('[data-testid="desktop-sidebar"]')).not.toBeVisible();
      
      // Test mobile file upload
      await page.click('[data-testid="mobile-menu-button"]');
      await page.click('[data-testid="mobile-upload-button"]');
      await expect(page.locator('[data-testid="upload-dialog"]')).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('loads quickly with many files', async () => {
      const startTime = Date.now();
      
      await page.goto('/');
      
      // Wait for main content to load
      await page.waitForSelector('[data-testid="file-explorer"]');
      
      const loadTime = Date.now() - startTime;
      
      // Should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('file upload shows progress', async () => {
      // Create a larger file for testing progress
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      
      await page.setInputFiles('[data-testid="file-upload-input"]', {
        name: 'large-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(largeContent, 'utf8'),
      });
      
      // Progress bar should appear
      await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
      
      // Progress should reach 100%
      await expect(page.locator('[data-testid="upload-progress"][aria-valuenow="100"]')).toBeVisible({ timeout: 30000 });
    });
  });
});