
import { test, expect, Page } from '@playwright/test';

const testUser = {
  email: 'test-offline@seravault.com',
  password: 'testpassword123',
  passphrase: 'test-passphrase-for-offline-cache'
};

const testFile = {
  name: `offline-test-file-${Date.now()}.txt`,
  content: 'This file should be available offline.'
};

test.describe('Offline Caching Functionality', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/');

    // --- Log In and Set Up --- //
    // This part is simplified. A real test suite would have a helper for this.
    try {
      // Check if we need to sign up first
      if (await page.isVisible('[data-testid="signup-link"]')) {
        await page.click('[data-testid="signup-link"]');
        await page.fill('input[type="email"]', testUser.email);
        await page.fill('input[type="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForSelector('#passphrase-setup-form', { timeout: 15000 });
        await page.fill('#passphrase', testUser.passphrase);
        await page.fill('#passphrase-confirm', testUser.passphrase);
        await page.click('button[type="submit"]');
      } else {
        // Otherwise, log in
        await page.fill('input[type="email"]', testUser.email);
        await page.fill('input[type="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForSelector('#passphrase-form', { timeout: 15000 });
        await page.fill('#passphrase', testUser.passphrase);
        await page.click('button[type="submit"]');
      }
    } catch (e) {
        // It's possible we are already logged in from a previous failed run
        console.log('Login/Signup failed, assuming already logged in.');
    }
    
    await page.waitForSelector('[data-testid="file-table"]', { timeout: 20000 });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('should cache a file and allow viewing it while offline', async () => {

    // === STEP 1: Upload and cache the file ===
    await test.step('Upload and view a file to cache it', async () => {
      // Use the file upload area to upload the file
      await page.setInputFiles('input[type="file"]', {
        name: testFile.name,
        mimeType: 'text/plain',
        buffer: Buffer.from(testFile.content)
      });

      // Wait for the file to appear in the file table
      const fileRow = page.locator(`[data-testid="file-row"]:has-text("${testFile.name}")`);
      await expect(fileRow).toBeVisible({ timeout: 15000 });

      // Click to open the file viewer and ensure content is loaded
      await fileRow.click();
      const fileViewer = page.locator('[data-testid="file-viewer"]');
      await expect(fileViewer).toBeVisible();
      // In a real app, you'd check the content here, but we assume it loads.
      
      // Close the viewer
      await page.locator('[data-testid="close-file-viewer"]').click();
      await expect(fileViewer).not.toBeVisible();
    });

    // === STEP 2: Go offline ===
    await test.step('Simulate offline connection', async () => {
      await page.context().setOffline(true);
      console.log('Browser is now offline.');
    });

    // === STEP 3: Verify cached access ===
    await test.step('Access the file while offline', async () => {
      // Reload the page to ensure we are not relying on in-memory state
      await page.reload();
      
      // Re-enter passphrase after reload
      await page.waitForSelector('#passphrase-form', { timeout: 15000 });
      await page.fill('#passphrase', testUser.passphrase);
      await page.click('button[type="submit"]');
      await page.waitForSelector('[data-testid="file-table"]', { timeout: 20000 });

      // Find the file again (it should be listed from metadata cache)
      const fileRow = page.locator(`[data-testid="file-row"]:has-text("${testFile.name}")`);
      await expect(fileRow).toBeVisible();

      // Click to open the file viewer
      await fileRow.click();
      const fileViewer = page.locator('[data-testid="file-viewer"]');
      await expect(fileViewer).toBeVisible();

      // Verify the content is loaded from the cache
      // This is the key assertion for offline functionality
      const fileContent = fileViewer.locator('pre'); // Assuming content is in a <pre> tag
      await expect(fileContent).toHaveText(testFile.content, { timeout: 10000 });
      console.log('File content successfully loaded from cache while offline.');

      // Close the viewer
      await page.locator('[data-testid="close-file-viewer"]').click();
    });

    // === STEP 4: Cleanup ===
    await test.step('Go back online and clean up the test file', async () => {
      await page.context().setOffline(false);
      console.log('Browser is back online.');

      // Reload to be safe
      await page.reload();
      await page.waitForSelector('#passphrase-form', { timeout: 15000 });
      await page.fill('#passphrase', testUser.passphrase);
      await page.click('button[type="submit"]');
      await page.waitForSelector('[data-testid="file-table"]', { timeout: 20000 });

      // Delete the file
      const fileRow = page.locator(`[data-testid="file-row"]:has-text("${testFile.name}")`);
      await fileRow.click({ button: 'right' });
      await page.locator('text=Delete').click();
      await page.locator('button:has-text("Delete")').click();

      // Verify it's gone
      await expect(fileRow).not.toBeVisible({ timeout: 10000 });
      console.log('Test file cleaned up successfully.');
    });
  });
});
