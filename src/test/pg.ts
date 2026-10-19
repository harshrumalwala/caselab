// In-process Postgres (PGlite) with Supabase's `auth` pieces stubbed and every real migration applied,
// so database tests exercise the exact SQL that ships. `auth.uid()` reads the "signed-in user" from a
// session setting, as it does in production.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const ALICE = '11111111-1111-4111-8111-111111111111';
export const BOB = '22222222-2222-4222-8222-222222222222';
export const CAROL = '33333333-3333-4333-8333-333333333333';
/** Signed up but has not verified their email. */
export const DAVE = '44444444-4444-4444-8444-444444444444';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    -- Supabase grants new public tables and functions to the API roles by default; migrations must
    -- take back whatever should not be public.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  return db;
}

export type Role = 'anon' | 'authenticated' | 'postgres';

/** Act as a database role, optionally as a particular signed-in user (like a request's JWT). */
export async function as(db: PGlite, role: Role, userId?: string): Promise<void> {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
}

/** Empty everything and create Alice, Bob and Carol (verified) and Dave (unverified). */
export async function resetData(db: PGlite): Promise<void> {
  await as(db, 'postgres');
  await db.exec('truncate public.shared_cases, public.profiles, public.cases, public.opportunities, auth.users cascade');
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at) values
       ($1, 'alice@example.com', now()), ($2, 'bob@example.com', now()),
       ($3, 'carol@example.com', now()), ($4, 'dave@example.com', null)`,
    [ALICE, BOB, CAROL, DAVE],
  );
}

/** The error message a statement fails with, or '' if it succeeds. */
export async function fails(db: PGlite, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}
