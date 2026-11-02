// @vitest-environment node
//
// Showing your level to other members: on by default, null whenever the switch is off (a database rule, not just app
// behaviour), a sane range, members only, and never in what visitors without an account can read. Run against the real
// migrations in an in-process Postgres.
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, as, createDb, fails as failsOn, resetData } from '../test/pg';

let db: PGlite;
const fails = (sql: string, params: unknown[] = []) => failsOn(db, sql, params);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetData(db);
});

const profile = (uid: string, name: string, extra = '') =>
  db.query(`insert into public.profiles (user_id, display_name, listed${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, true${extra ? ', ' + extra.split('=')[1] : ''})`, [uid, name]);
const levelOf = async (uid: string) => (await db.query<{ level: number | null; share_level: boolean }>('select level, share_level from public.profiles where user_id = $1', [uid])).rows[0];

describe('sharing your level', () => {
  it('is on by default, with no level until the member\'s own app writes one', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice');
    expect(await levelOf(ALICE)).toEqual({ level: null, share_level: true });
  });

  it('can be chosen off when a profile is created, and then shows nothing', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice', 'share_level=false');
    expect(await levelOf(ALICE)).toEqual({ level: null, share_level: false });
  });

  it('switches existing profiles on in the one-off backfill, and leaves their level empty', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice', 'share_level=false');
    await profile(BOB, 'Bob', 'share_level=false');
    const migration = readFileSync(new URL('../../supabase/migrations/20261114120000_share_level_default_on.sql', import.meta.url), 'utf8');
    await db.exec(migration.split('\n').filter((line) => !line.startsWith('--')).join('\n').split(';').filter((s) => /^\s*update/i.test(s)).join(';'));
    expect(await levelOf(ALICE)).toEqual({ level: null, share_level: true });
    expect(await levelOf(BOB)).toEqual({ level: null, share_level: true });
  });

  it('lets you switch it on and set a level, which another verified member can then read', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice');
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set share_level = true, level = 8 where user_id = $1', [ALICE]);
    await as(db, 'authenticated', BOB);
    expect(await levelOf(ALICE)).toEqual({ level: 8, share_level: true });
  });

  it('refuses a level while sharing is off, so switching off can never leave one behind', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice', 'share_level=false');
    await as(db, 'authenticated', ALICE);
    expect(await fails('update public.profiles set level = 8 where user_id = $1', [ALICE])).toMatch(/profiles_level_needs_sharing/);
    await db.query('update public.profiles set share_level = true, level = 8 where user_id = $1', [ALICE]);
    // Turning the switch off without clearing the level is refused; clearing both together works.
    expect(await fails('update public.profiles set share_level = false where user_id = $1', [ALICE])).toMatch(/profiles_level_needs_sharing/);
    await db.query('update public.profiles set share_level = false, level = null where user_id = $1', [ALICE]);
    await as(db, 'authenticated', BOB);
    expect(await levelOf(ALICE)).toEqual({ level: null, share_level: false });
  });

  it('only accepts a real level, 1 to 30', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice', 'share_level=true');
    await as(db, 'authenticated', ALICE);
    for (const bad of [0, 31, -3]) expect(await fails('update public.profiles set level = $2 where user_id = $1', [ALICE, bad])).toMatch(/profiles_level_range/);
    for (const ok of [1, 30]) expect(await fails('update public.profiles set level = $2 where user_id = $1', [ALICE, ok])).toBe('');
  });

  it('lets only you change your own level', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice', 'share_level=true');
    await as(db, 'authenticated', BOB);
    await db.query('update public.profiles set level = 30 where user_id = $1', [ALICE]);
    expect(await levelOf(ALICE)).toEqual({ level: null, share_level: true }); // Bob's update touched no row
  });

  it('never reaches visitors without an account: the public tables have no level at all', async () => {
    await as(db, 'postgres');
    await profile(ALICE, 'Alice', 'share_level=true');
    await db.query('update public.profiles set level = 12, public_profile = true where user_id = $1', [ALICE]);
    await as(db, 'anon');
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'public_profiles'")).rows.map((r) => r.column_name);
    expect(cols).not.toContain('level');
    expect(cols).not.toContain('share_level');
    expect(await fails('select level from public.profiles')).toMatch(/permission denied/);
  });
});
