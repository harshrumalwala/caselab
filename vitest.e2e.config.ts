import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Live checks against your real Supabase project. Run with `npm run test:e2e`.
// Credentials come from the git-ignored `.env.e2e.local` (see README), never from the repo.
const VARS = [
  'CASELAB_E2E_EMAIL',
  'CASELAB_E2E_PASSWORD',
  'CASELAB_E2E_EMAIL_A',
  'CASELAB_E2E_PASSWORD_A',
  'CASELAB_E2E_EMAIL_B',
  'CASELAB_E2E_PASSWORD_B',
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom', // the API-level tests opt out with a docblock
      include: ['e2e/**/*.e2e.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      testTimeout: 90_000,
      hookTimeout: 90_000,
      fileParallelism: false, // the files share real accounts
      env: Object.fromEntries(VARS.map((v) => [v, env[v] ?? ''])),
    },
  };
});
