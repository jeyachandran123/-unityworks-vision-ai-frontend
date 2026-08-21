/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The application is a static bundle. It holds no secrets and no server state.
 *
 * `/api` and `/ws` are proxied in development so the browser sees ONE origin.
 * That is not a convenience: the refresh cookie is `SameSite=Strict`, so a
 * cross-origin frontend would never have it attached and every session would
 * silently fail to restore. Production sits behind a single origin for the same
 * reason.
 */
const api = process.env.UWV_API_URL ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@devtools': fileURLToPath(new URL('./src/devtools', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/ws': { target: api, ws: true, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // React and the router change rarely; splitting them keeps the app
        // chunk small and cacheable. DevTools is NOT listed here — it is split
        // by `React.lazy` at the route, so a manager never downloads it.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    css: false,
  },
});
