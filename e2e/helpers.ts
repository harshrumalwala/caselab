import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Creds {
  email: string;
  password: string;
}

const env = (name: string) => process.env[name] ?? '';

/** Your real account: used only for read-safe checks and rows titled "ZZ CaseLab e2e ...". */
export const MAIN: Creds = { email: env('CASELAB_E2E_EMAIL'), password: env('CASELAB_E2E_PASSWORD') };
/** Two throwaway accounts for multi-user checks. Create them (Auto Confirm) in the Supabase dashboard. */
export const USER_A: Creds = { email: env('CASELAB_E2E_EMAIL_A'), password: env('CASELAB_E2E_PASSWORD_A') };
export const USER_B: Creds = { email: env('CASELAB_E2E_EMAIL_B'), password: env('CASELAB_E2E_PASSWORD_B') };

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const have = (c: Creds) => Boolean(c.email && c.password && SUPABASE_URL && SUPABASE_KEY);
/** Without credentials the live checks are skipped, so `npm run test:e2e` never fails on a fresh clone. */
export const HAVE_CREDENTIALS = have(MAIN);
export const HAVE_USER_A = have(USER_A);
export const HAVE_TWO_USERS = have(USER_A) && have(USER_B);

// Kept for the original single-account tests.
export const E2E_EMAIL = MAIN.email;
export const E2E_PASSWORD = MAIN.password;

/** Every row these tests create has a title/text starting with this, so cleanup can find them. */
export const TEST_PREFIX = 'ZZ CaseLab e2e';

/** A client with its own in-memory session, like a separate device or a fresh page load. */
export function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signedInClient(creds: Creds = MAIN): Promise<{ client: SupabaseClient; userId: string }> {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email: creds.email, password: creds.password });
  if (error || !data.user) throw new Error(`E2E sign-in failed for ${creds.email}: ${error?.message ?? 'no user'}`);
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
