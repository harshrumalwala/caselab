import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const E2E_EMAIL = process.env.CASELAB_E2E_EMAIL ?? '';
export const E2E_PASSWORD = process.env.CASELAB_E2E_PASSWORD ?? '';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Without credentials the live checks are skipped, so `npm run test:e2e` never fails on a fresh clone. */
export const HAVE_CREDENTIALS = Boolean(E2E_EMAIL && E2E_PASSWORD && SUPABASE_URL && SUPABASE_KEY);

/** Every row these tests create has a title/text starting with this, so cleanup can find them. */
export const TEST_PREFIX = 'ZZ CaseLab e2e';

/** A client with its own in-memory session, like a separate device or a fresh page load. */
export function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signedInClient(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD });
  if (error || !data.user) throw new Error(`E2E sign-in failed: ${error?.message ?? 'no user'}`);
  return { client, userId: data.user.id };
}

/** Remove anything a previous (possibly interrupted) run left behind. Only touches test rows. */
export async function cleanup(client: SupabaseClient): Promise<void> {
  const a = await client.from('cases').delete().like('title', `${TEST_PREFIX}%`);
  if (a.error) throw a.error;
  const b = await client.from('opportunities').delete().like('text', `${TEST_PREFIX}%`);
  if (b.error) throw b.error;
}

export async function counts(client: SupabaseClient): Promise<{ cases: number; opportunities: number }> {
  const c = await client.from('cases').select('id', { count: 'exact', head: true });
  const o = await client.from('opportunities').select('id', { count: 'exact', head: true });
  if (c.error) throw c.error;
  if (o.error) throw o.error;
  return { cases: c.count ?? 0, opportunities: o.count ?? 0 };
}
