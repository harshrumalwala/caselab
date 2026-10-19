import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Live checks against your real Supabase project. Run with `npm run test:e2e`.
// Credentials come from the git-ignored `.env.e2e.local` (see README), never from the repo.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom', // the repository test opts out with a docblock
      include: ['e2e/**/*.e2e.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      testTimeout: 60_000,
      hookTimeout: 60_000,
      fileParallelism: false, // both files share one real account
      env: {
        CASELAB_E2E_EMAIL: env.CASELAB_E2E_EMAIL ?? '',
        CASELAB_E2E_PASSWORD: env.CASELAB_E2E_PASSWORD ?? '',
      },
    },
  };
});
