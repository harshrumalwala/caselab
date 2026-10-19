import { createClient } from '@supabase/supabase-js';
import { createSupabaseAuth, type AuthApi } from './auth';
import type { CaseLabRepository } from './repository';
import { SupabaseRepository } from './supabaseRepository';

/** Everything the app needs from the outside world: who you are, and where your data lives. */
export interface Backend {
  auth: AuthApi;
  createRepository(): CaseLabRepository;
}

export type BackendResult = { backend: Backend } | { problem: string };

/**
 * Builds the Supabase backend from the two public settings in the environment. If they are
 * missing the app says so on screen; it never falls back to some other kind of storage.
 */
export function createSupabaseBackend(
  url: string | undefined = import.meta.env.VITE_SUPABASE_URL,
  key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
): BackendResult {
  const missing = [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean);
  if (missing.length > 0 || !url || !key) {
    return { problem: `Missing configuration: ${missing.join(' and ')}.` };
  }
  if (!/^https?:\/\//.test(url)) {
    return { problem: 'VITE_SUPABASE_URL must start with https:// (copy it from Supabase → Project Settings → API).' };
  }
  if (key.startsWith('sb_secret_') || /service_role/i.test(key)) {
    return {
      problem:
        'VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret key. Never put a secret or service_role key in the browser; use the publishable key.',
    };
  }

  const client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return { backend: { auth: createSupabaseAuth(client), createRepository: () => new SupabaseRepository(client) } };
}
