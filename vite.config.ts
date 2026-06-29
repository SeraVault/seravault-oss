import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Generate a build timestamp to force cache invalidation
const buildTimestamp = new Date().getTime();

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const isDemo = env.VITE_DEMO_MODE === 'true';
  const backendType = env.VITE_BACKEND_TYPE || 'firebase';
  const backendFile = isDemo
    ? 'src/backend/MockBackend.ts'
    : backendType === 'supabase'
      ? 'src/backend/SupabaseBackend.ts'
      : 'src/backend/FirebaseBackend.ts';

  return {
    // Add build timestamp as global variable
    define: {
      __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    },
    resolve: {
      alias: {
        '@backend-provider': resolve(__dirname, backendFile),
      },
    },
    build: {
    // Enable code splitting and optimization
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'mui-core': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
          'crypto': ['@noble/ciphers', '@noble/hashes', '@noble/post-quantum'],
        },
      },
    },
    // Increase chunk size warning limit since we're splitting chunks
    chunkSizeWarningLimit: 1000,
    // Enable minification with terser
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_debugger: true, // Remove debugger statements
        passes: 2, // Multiple passes for better compression
        pure_funcs: ['console.log', 'console.debug', 'console.info'], // Strip logs, keep error/warn
      },
      mangle: {
        safari10: true, // Fix Safari 10 bugs
      },
      format: {
        comments: false, // Remove all comments
      },
    },
    // Source maps for production debugging (optional, can be disabled)
    sourcemap: false,
  },
  plugins: [
    react(),
  ],
  }
})
