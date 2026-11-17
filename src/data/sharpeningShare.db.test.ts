// @vitest-environment node
//
// The "what I'm sharpening" switch (issue #121): off for everybody until a member asks for it, readable by someone
// holding their link only through public_person(id), and nothing but a flag — no summary is stored anywhere, and
// turning it on releases no score that was not already released by Skill scores. Attacked here as another member,
// as a visitor holding a link, and as a caller with no account at all, against the real migrations in an in-process
// Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, as, createDb, fails as failsOn, resetData } from '../test/pg';

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

type Row = Record<string, unknown>;

const SKILLS = { framework: { rating: 4, feedback: 'Clear tree' }, quant: { rating: 2, feedback: 'Slow on math' } };

/** A member who shares their case history and skill scores with everyone holding their link. */
async function member(uid: string, name: string, opts: { isPublic?: boolean; sharpening?: boolean } = {}) {
  await as(db, 'authenticated', uid);
  await db.query(
    `insert into public.profiles (user_id, display_name, listed, public_profile, share_cases, share_skills, share_sharpening)
     values ($1, $2, true, $3, true, true, $4)`,
    [uid, name, opts.isPublic ?? true, opts.sharpening ?? false],
  );
}

async function addCase(uid: string, title: string) {
  await as(db, 'authenticated', uid);
  await db.query(
    `insert into public.cases (title, case_type, industry, overall, skills)
     values ($1, 'Profitability', 'Technology / SaaS', 4, $2::jsonb)`,
    [title, JSON.stringify(SKILLS)],
  );
}

/** What someone holding this member's link reads about them. */
const byLink = async (id: string): Promise<Row[]> => {
  await as(db, 'anon');
  return (await db.query<Row>('select * from public.public_person($1)', [id])).rows;
};

const casesByLink = async (id: string): Promise<Row[]> => {
  await as(db, 'anon');
  return (await db.query<Row>('select * from public.public_person_cases($1)', [id])).rows;
};

const flagOf = async (id: string) =>
  (await db.query<{ share_sharpening: boolean }>('select share_sharpening from public.profiles where user_id = $1', [id])).rows;

describe('the switch itself', () => {
  it('is off on a new profile that never mentions it, so nobody is summarised until they ask', async () => {
    await as(db, 'authenticated', ALICE);
    await db.query('insert into public.profiles (user_id, display_name, listed) values ($1, $2, true)', [ALICE, 'Alice']);
    expect(await flagOf(ALICE)).toEqual([{ share_sharpening: false }]);
  });

  it('leaves every profile that existed before the migration off', async () => {
    // The column has no backfill: a profile created the old way (no such column in the insert) reads false.
    await as(db, 'postgres');
    await db.query('insert into public.profiles (user_id, display_name, listed, public_profile, share_skills) values ($1, $2, true, true, true)', [BOB, 'Bob']);
    expect(await flagOf(BOB)).toEqual([{ share_sharpening: false }]);
    expect((await byLink(BOB))[0]).toMatchObject({ share_sharpening: false });
  });

  it('is the member\'s own to set, and does not need any other switch to stay set', async () => {
    await member(ALICE, 'Alice');
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set share_sharpening = true where user_id = $1', [ALICE]);
    expect(await flagOf(ALICE)).toEqual([{ share_sharpening: true }]);
    // Skill scores can be switched off afterwards without the save being refused: with no scores the summary has
    // nothing to say, which is a question for the screen and not for the database.
    expect(await fails('update public.profiles set share_skills = false where user_id = $1', [ALICE])).toBe('');
    expect(await flagOf(ALICE)).toEqual([{ share_sharpening: true }]);
  });

  it('stores a flag and nothing else: no summary, no averages, no skill names anywhere', async () => {
    await member(ALICE, 'Alice', { sharpening: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'postgres');
    const columns = (
      await db.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('profiles', 'public_profiles')`,
      )
    ).rows;
    expect(columns.filter((c) => /sharpen/.test(c.column_name)).map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual([
      'profiles.share_sharpening',
      'public_profiles.share_sharpening',
    ]);
    expect(columns.filter((c) => /summar|strength|weak/.test(c.column_name))).toEqual([]);
  });
});

describe('another member', () => {
  it('reads the flag on a listed profile, as they read every other sharing switch, and nothing is added to what they see of the cases', async () => {
    await member(ALICE, 'Alice', { sharpening: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'authenticated', BOB);
    expect(await flagOf(ALICE)).toEqual([{ share_sharpening: true }]);
    const { rows } = await db.query<Row>('select title, skill_scores from public.shared_cases where owner_id = $1', [ALICE]);
    expect(rows).toEqual([{ title: 'Airline profitability', skill_scores: { framework: 4, quant: 2 } }]);
  });

  it('cannot switch it on for somebody else, and cannot switch it off either', async () => {
    await member(ALICE, 'Alice', { sharpening: true });
    await member(CAROL, 'Carol');
    await as(db, 'authenticated', BOB);
    expect((await db.query('update public.profiles set share_sharpening = false where user_id = $1 returning user_id', [ALICE])).rows).toEqual([]);
    expect((await db.query('update public.profiles set share_sharpening = true where user_id = $1 returning user_id', [CAROL])).rows).toEqual([]);
    await as(db, 'postgres');
    expect(await flagOf(ALICE)).toEqual([{ share_sharpening: true }]);
    expect(await flagOf(CAROL)).toEqual([{ share_sharpening: false }]);
  });

  it('cannot read it off a member who is not listed, however the read is shaped', async () => {
    await member(ALICE, 'Alice', { sharpening: true });
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set public_profile = false, listed = false where user_id = $1', [ALICE]);
    await as(db, 'authenticated', BOB);
    expect(await flagOf(ALICE)).toEqual([]);
    expect((await db.query('select count(*)::int as n from public.profiles where share_sharpening')).rows).toEqual([{ n: 0 }]);
  });
});

describe('someone holding the link, and anyone with no account at all', () => {
  it('reads the flag only through the function: both tables refuse them, with any filter', async () => {
    await member(ALICE, 'Alice', { sharpening: true });
    await as(db, 'anon');
    expect(await fails('select share_sharpening from public.profiles')).toMatch(/permission denied/);
    expect(await fails('select share_sharpening from public.public_profiles')).toMatch(/permission denied/);
    expect(await fails('select count(*)::int from public.public_profiles where share_sharpening')).toMatch(/permission denied/);
    expect(await fails('select user_id from public.public_profiles where share_sharpening is true')).toMatch(/permission denied/);
    expect((await byLink(ALICE))[0]).toMatchObject({ share_sharpening: true });
  });

  it('is told false for a member who has not asked for the summary, and still gets their scores', async () => {
    await member(ALICE, 'Alice'); // shares skill scores, has not asked to be summarised
    await addCase(ALICE, 'Airline profitability');
    expect((await byLink(ALICE))[0]).toMatchObject({ share_sharpening: false, share_skills: true });
    expect((await casesByLink(ALICE)).map((r) => r.skill_scores)).toEqual([{ framework: 4, quant: 2 }]);
  });

  it('sees the flag follow the switch, with no other change to what the link hands out', async () => {
    await member(ALICE, 'Alice');
    await addCase(ALICE, 'Airline profitability');
    const before = await casesByLink(ALICE);
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set share_sharpening = true where user_id = $1', [ALICE]);
    expect((await byLink(ALICE))[0]).toMatchObject({ share_sharpening: true });
    expect(await casesByLink(ALICE)).toEqual(before); // the summary is worked out in the browser; no row changed
  });

  it('gets nothing at all once the member closes their link, switch on or not', async () => {
    await member(ALICE, 'Alice', { sharpening: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set public_profile = false where user_id = $1', [ALICE]);
    expect(await byLink(ALICE)).toEqual([]);
    expect(await casesByLink(ALICE)).toEqual([]);
  });

  it('cannot call the function as a signed-in session, and cannot reach the projection that feeds it', async () => {
    await as(db, 'postgres');
    const can = async (role: string, fn: string) =>
      (await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])).rows[0].ok;
    expect(await can('anon', 'public.public_person(uuid)')).toBe(true);
    expect(await can('authenticated', 'public.public_person(uuid)')).toBe(false);
    expect(await can('anon', 'public.sync_public_profile(uuid)')).toBe(false);
    expect(await can('authenticated', 'public.sync_public_profile(uuid)')).toBe(false);
    await as(db, 'authenticated'); // signed out: the role with no user behind it
    expect(await fails('select share_sharpening from public.public_profiles')).toMatch(/permission denied/);
    expect((await db.query('select share_sharpening from public.profiles')).rows).toEqual([]);
  });
});
