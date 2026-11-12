// @vitest-environment node
//
// The live case in the database: sessions that only the Edge Function can touch, and the list of cases that can be practised, run against the
// real migrations in an in-process Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, DAVE, as, createDb, fails as failsOn, resetData } from '../test/pg';

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
  await as(db, 'postgres');
  await db.exec('truncate public.library_cases cascade');
  await db.exec('truncate public.live_case_sessions');
});

const FULL = { confidence: 'high', prompt: 'SECRET PROMPT', recommendation: 'SECRET RECOMMENDATION', steps: [{ title: 'Step' }], exhibits: [] };

const libraryCase = async (name: string, withSolution: boolean | Record<string, unknown> = true) => {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.library_cases (book, school, year, name, case_type, industry) values ('Booth MCG 2026-2027', 'Booth', 2026, $1, 'Profitability', 'Other') returning id",
    [name],
  );
  if (withSolution) await db.query('insert into public.library_case_solutions (case_id, solution) values ($1, $2)', [rows[0].id, JSON.stringify(withSolution === true ? FULL : withSolution)]);
  return rows[0].id;
};
const logCase = (uid: string, libraryId: string | null) =>
  db.query("insert into public.cases (user_id, case_date, title, case_type, library_id) values ($1, '2026-10-10', 'Mine', 'Profitability', $2) returning id", [uid, libraryId]);
const session = (id: string, uid: string, libraryId: string, status = 'active') =>
  db.query("insert into public.live_case_sessions (id, user_id, library_id, status, state) values ($1, $2, $3, $4, '{}'::jsonb)", [id, uid, libraryId, status]);
const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const S3 = '00000000-0000-4000-8000-0000000000a3';

describe('the sessions table', () => {
  it('cannot be read or written by any API role, so the stage gating cannot be bypassed', async () => {
    const hotel = await libraryCase('Army Hotel');
    await session(S1, ALICE, hotel);
    for (const [role, uid] of [['authenticated', ALICE], ['anon', undefined]] as const) {
      await as(db, role, uid);
      expect(await fails('select * from public.live_case_sessions'), role).toMatch(/permission denied/);
      expect(await fails("insert into public.live_case_sessions (id, user_id, library_id, state) values (gen_random_uuid(), $1, $2, '{}'::jsonb)", [ALICE, hotel]), role).toMatch(/permission denied/);
      expect(await fails("update public.live_case_sessions set state = '{\"hacked\": true}'::jsonb"), role).toMatch(/permission denied/);
      expect(await fails('delete from public.live_case_sessions'), role).toMatch(/permission denied/);
    }
  });

  it('allows one running case per member at a time, but any number finished, and one each for different members', async () => {
    const hotel = await libraryCase('Army Hotel');
    await session(S1, ALICE, hotel, 'active');
    expect(await fails("insert into public.live_case_sessions (id, user_id, library_id, state) values ($1, $2, $3, '{}'::jsonb)", [S2, ALICE, hotel])).toMatch(/duplicate key|unique/);
    await session(S2, BOB, hotel, 'active');
    await db.query("update public.live_case_sessions set status = 'done' where id = $1", [S1]);
    await session(S3, ALICE, hotel, 'active'); // the first is over, so a new one can start
    expect((await db.query('select * from public.live_case_sessions')).rows).toHaveLength(3);
  });

  it('is deleted with the account, and keeps nothing of a case that is deleted', async () => {
    const hotel = await libraryCase('Army Hotel');
    await session(S1, ALICE, hotel, 'done');
    const logged = (await logCase(ALICE, hotel)).rows[0] as { id: string };
    await db.query('update public.live_case_sessions set logged_case_id = $1 where id = $2', [logged.id, S1]);
    await db.query('delete from public.cases where id = $1', [logged.id]);
    expect((await db.query<{ logged_case_id: string | null }>('select logged_case_id from public.live_case_sessions')).rows[0].logged_case_id).toBeNull();
    await db.query('delete from auth.users where id = $1', [ALICE]);
    expect((await db.query('select * from public.live_case_sessions')).rows).toEqual([]);
  });

  it('only holds a JSON object as its state', async () => {
    const hotel = await libraryCase('Army Hotel');
    expect(await fails("insert into public.live_case_sessions (id, user_id, library_id, state) values ($1, $2, $3, '[]'::jsonb)", [S1, ALICE, hotel])).toMatch(/check constraint|violates/);
    expect(await fails("insert into public.live_case_sessions (id, user_id, library_id, status, state) values ($1, $2, $3, 'paused', '{}'::jsonb)", [S1, ALICE, hotel])).toMatch(/check constraint|violates/);
  });
});

describe('the list of cases to practise', () => {
  const catalog = async () => (await db.query<{ id: string; name: string; done: boolean }>('select * from public.live_case_catalog()')).rows;

  it('lists only the cases that have a write-up, with whether you have logged them', async () => {
    const hotel = await libraryCase('Army Hotel');
    await libraryCase('Hawaiian Smoothies');
    await libraryCase('Listed Only', false);
    await as(db, 'postgres');
    await logCase(ALICE, hotel);
    await as(db, 'authenticated', ALICE);
    expect((await catalog()).map((c) => `${c.name}:${c.done}`).sort()).toEqual(['Army Hotel:true', 'Hawaiian Smoothies:false']);
    await as(db, 'authenticated', BOB);
    expect((await catalog()).every((c) => c.done === false)).toBe(true); // someone else logging it does not count for you
  });

  it('says nothing about the cases themselves, only what any member can already see', async () => {
    await libraryCase('Army Hotel');
    await as(db, 'authenticated', ALICE);
    const { rows } = await db.query<Record<string, unknown>>('select * from public.live_case_catalog()');
    expect(Object.keys(rows[0]).sort()).toEqual(['book', 'case_type', 'cochair_pick', 'done', 'id', 'industry', 'name', 'school', 'year']);
    expect(JSON.stringify(rows)).not.toContain('SECRET');
  });

  it('is for verified members only', async () => {
    await libraryCase('Army Hotel');
    await as(db, 'authenticated', DAVE);
    expect(await catalog()).toEqual([]);
    await as(db, 'anon');
    expect(await fails('select * from public.live_case_catalog()')).toMatch(/permission denied/);
  });
});

describe('picking a case at random', () => {
  it('is for the Edge Function only, and skips what the member has already logged', async () => {
    const hotel = await libraryCase('Army Hotel');
    const smoothies = await libraryCase('Hawaiian Smoothies');
    await logCase(ALICE, hotel);
    const picked = async (uid: string) => (await db.query<{ live_case_pick_for: string | null }>('select public.live_case_pick_for($1)', [uid])).rows[0].live_case_pick_for;
    expect(await picked(ALICE)).toBe(smoothies);
    await logCase(ALICE, smoothies);
    expect(await picked(ALICE)).toBeNull(); // nothing left that she has not done
    expect([hotel, smoothies]).toContain(await picked(BOB));
    await as(db, 'authenticated', ALICE);
    expect(await fails('select public.live_case_pick_for($1)', [ALICE])).toMatch(/permission denied/);
    await as(db, 'anon');
    expect(await fails('select public.live_case_pick_for($1)', [ALICE])).toMatch(/permission denied/);
  });
});

describe('only full write-ups can be practised', () => {
  it('lists, and picks, only cases whose write-up is complete', async () => {
    const full = await libraryCase('Full Case');
    await libraryCase('Partial Case', { ...FULL, confidence: 'partial' });
    await libraryCase('No Recommendation', { ...FULL, recommendation: '' });
    await libraryCase('Nothing To Work Through', { ...FULL, steps: [], exhibits: [] });
    await libraryCase('Unmarked', { prompt: 'P', recommendation: 'R', steps: [{ title: 'S' }] });
    await libraryCase('Exhibits Only', { ...FULL, steps: [], exhibits: [{ title: 'E' }] });
    await libraryCase('Odd Shapes', { ...FULL, steps: 'not a list', exhibits: 7 });
    await as(db, 'authenticated', ALICE);
    const names = (await db.query<{ name: string }>('select name from public.live_case_catalog()')).rows.map((r) => r.name).sort();
    expect(names).toEqual(['Exhibits Only', 'Full Case']);
    await as(db, 'postgres');
    const picked = new Set<string>();
    for (let i = 0; i < 25; i++) picked.add((await db.query<{ live_case_pick_for: string }>('select public.live_case_pick_for($1)', [ALICE])).rows[0].live_case_pick_for);
    expect(picked.has(full)).toBe(true);
    expect(picked.size).toBeLessThanOrEqual(2); // never a partial one
  });

  it('keeps the rule itself out of reach of the API roles', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails('select public.library_solution_is_full($1)', [JSON.stringify(FULL)])).toMatch(/permission denied/);
  });
});
