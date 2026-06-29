#!/usr/bin/env node

/**
 * SeraVault Test Runner
 * 
 * This script provides a convenient way to run different types of tests
 * with proper environment setup and reporting.
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

console.log(`🧪 SeraVault Test Runner v${pkg.version}`);
console.log('=' .repeat(50));

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Running: ${cmd} ${args.join(' ')}`);
    
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  try {
    switch (command) {
      case 'unit':
        console.log('📋 Running unit tests...');
        await runCommand('npm', ['run', 'test:run']);
        break;

      case 'e2e':
        console.log('🎭 Running end-to-end tests...');
        console.log('⚠️  Make sure dev server is running on localhost:5178');
        await runCommand('npm', ['run', 'test:e2e']);
        break;

      case 'all':
        console.log('🔄 Running all tests...');
        await runCommand('npm', ['run', 'test:all']);
        break;

      case 'coverage':
        console.log('📊 Running tests with coverage...');
        await runCommand('npm', ['run', 'test:coverage']);
        break;

      case 'ui':
        console.log('🖥️  Opening test UI...');
        await runCommand('npm', ['run', 'test:ui']);
        break;

      case 'e2e-ui':
        console.log('🎨 Opening Playwright UI...');
        await runCommand('npm', ['run', 'test:e2e:ui']);
        break;

      case 'dev':
        console.log('🔧 Starting development server and running tests...');
        console.log('This will start the dev server and run tests against it...');
        
        // Start dev server in background
        const devServer = spawn('npm', ['run', 'dev'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true
        });

        // Wait for server to start
        console.log('⏳ Waiting for dev server to start...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
          // Run E2E tests
          await runCommand('npm', ['run', 'test:e2e']);
        } finally {
          // Kill dev server
          process.kill(-devServer.pid);
        }
        break;

      case 'check':
        console.log('🔍 Checking test setup...');
        
        // Check if test files exist
        const fs = await import('fs');
        const path = await import('path');
        
        const testFiles = [
          'tests/e2e/user-journey.spec.ts',
          'tests/unit/crypto.test.ts',
          'tests/unit/components.test.tsx',
          'tests/unit/forms.test.ts',
          'tests/setup.ts',
          'playwright.config.ts',
          'vitest.config.ts'
        ];

        let allExist = true;
        for (const file of testFiles) {
          if (fs.existsSync(file)) {
            console.log(`✅ ${file}`);
          } else {
            console.log(`❌ ${file} - MISSING`);
            allExist = false;
          }
        }

        if (allExist) {
          console.log('\n🎉 All test files are present!');
          console.log('\nAvailable commands:');
          console.log('  node run-tests.js unit      - Run unit tests');
          console.log('  node run-tests.js e2e       - Run E2E tests');
          console.log('  node run-tests.js all       - Run all tests');
          console.log('  node run-tests.js coverage  - Run with coverage');
          console.log('  node run-tests.js ui        - Open test UI');
          console.log('  node run-tests.js e2e-ui    - Open Playwright UI');
          console.log('  node run-tests.js dev       - Start dev server + run E2E');
        } else {
          console.log('\n❌ Some test files are missing. Please check your setup.');
          process.exit(1);
        }
        break;

      case 'help':
      default:
        console.log('📖 SeraVault Test Commands:');
        console.log('');
        console.log('  check     - Verify test setup');
        console.log('  unit      - Run unit tests only');
        console.log('  e2e       - Run end-to-end tests only');
        console.log('  all       - Run all tests');
        console.log('  coverage  - Run tests with coverage report');
        console.log('  ui        - Open interactive test UI');
        console.log('  e2e-ui    - Open Playwright UI');
        console.log('  dev       - Start dev server and run E2E tests');
        console.log('  help      - Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  node run-tests.js check     # Verify setup');
        console.log('  node run-tests.js unit      # Quick unit tests');
        console.log('  node run-tests.js e2e       # Full user journey');
        console.log('  node run-tests.js all       # Complete test suite');
        break;
    }

    console.log('\n✅ Test execution completed successfully!');
  } catch (error) {
    console.error('\n❌ Test execution failed:');
    console.error(error.message);
    process.exit(1);
  }
}

main().catch(console.error);