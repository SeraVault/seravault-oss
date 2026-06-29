import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Custom plugin to copy static assets after build
function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const srcDir = resolve(__dirname);

      // Copy manifest
      copyFileSync(resolve(srcDir, 'manifest.json'), resolve(distDir, 'manifest.json'));

      // Copy popup.html and auth.html
      copyFileSync(resolve(srcDir, 'popup.html'), resolve(distDir, 'popup.html'));
      copyFileSync(resolve(srcDir, 'auth.html'), resolve(distDir, 'auth.html'));

      // Copy icons if they exist
      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      for (const size of [16, 48, 128]) {
        const src = resolve(srcDir, `public/icons/icon${size}.png`);
        if (existsSync(src)) {
          copyFileSync(src, resolve(iconsDir, `icon${size}.png`));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticAssets()],
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    minify: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/main.tsx'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        oauthPage: resolve(__dirname, 'src/auth/oauthPage.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Keep background and content as separate non-chunked files
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/@noble')) return 'noble-crypto';
          if (id.includes('node_modules/react')) return 'react-vendor';
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      '@noble/post-quantum/ml-kem',
      '@noble/hashes/argon2',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Extension pages don't use a dev server the normal way
  // Run `vite build --watch` for live rebuilds during development
});
