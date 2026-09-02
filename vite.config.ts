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
// 8010, not 8000. Port 8000 on this machine is published by an unrelated
// Docker stack (the AI Coding Assistant), and proxying to it means the login
// form authenticates against a different product's user table — a 401 for an
// account that exists and is correct. Override with UWV_API_URL if needed.
const api = process.env.UWV_API_URL ?? 'http://127.0.0.1:8010';

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
    // Headroom above `asyncUtilTimeout` in `tests/setup.ts`. A test that waits
    // eight seconds for an assertion must not be killed by the runner
    // before the wait it was given can expire.
    testTimeout: 25_000,
    /**
     * One file at a time.
     *
     * Left parallel, vitest sizes the pool to the core count and every worker
     * transforms the DevTools lazy chunk independently. On this machine that
     * saturates the CPU, and a run's failures were not a set — they moved
     * between files from one run to the next while every one of them passed
     * when its own file was run alone. That is the classic shape of a flaky
     * suite that is not testing anything flaky, and no timeout fixes it:
     * raising the bound just moves which waits lose the race.
     *
     * Sequential files cost wall-clock and buy a result that is the same twice,
     * which is the only property a test suite is actually for.
     */
    fileParallelism: false,
  },
});
