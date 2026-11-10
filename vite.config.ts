import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` keeps asset URLs relative, so the built site works from any
// sub-path (GitHub Pages project sites, Netlify, Vercel, a plain file server).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 650, // the Supabase client is the bulk of the main bundle
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    testTimeout: 40_000, // the end-to-end UI tests click through whole flows (and 70-odd files run at once)
    hookTimeout: 60_000, // starting the in-process Postgres and applying every migration can be slow when many files run at once
  },
});
