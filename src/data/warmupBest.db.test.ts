// @vitest-environment node
//
// The Warm-up record: private to its owner, raised only through record_warmup_best(), never lowered,
// run against the real migrations in an in-process Postgres.
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

const record = async (score: number | null, streak: number | null) =>
  (await db.query<{ score: number; streak: number }>('select * from public.record_warmup_best($1, $2)', [score, streak])).rows[0];
const rows = async () =>
  (await db.query<{ user_id: string; best_score: number; best_streak: number }>('select * from public.warmup_best')).rows;
const recordFor = async (score: number, streak: number, seconds: number | null) =>
  (await db.query<{ score: number; streak: number }>('select * from public.record_warmup_best($1, $2, $3)', [score, streak, seconds])).rows[0];
const byLength = async () =>
  Object.fromEntries(
    (await db.query<{ seconds: number; best_score: number; best_streak: number }>('select seconds, best_score, best_streak from public.warmup_best order by seconds')).rows.map((r) => [r.seconds, [r.best_score, r.best_streak]]),
  );

describe('recording a Warm-up best', () => {
  it('creates your row on the first record, owned by you', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await rows()).toEqual([]);
    expect(await record(120, 7)).toEqual({ score: 120, streak: 7 });
    const [row] = await rows();
    expect(row).toMatchObject({ user_id: ALICE, best_score: 120, best_streak: 7 });
  });

  it('only ever raises the record: score and streak are kept apart', async () => {
    await as(db, 'authenticated', ALICE);
    await record(120, 7);
    expect(await record(90, 9)).toEqual({ score: 120, streak: 9 });
    expect(await record(200, 3)).toEqual({ score: 200, streak: 9 });
    expect(await record(0, 0)).toEqual({ score: 200, streak: 9 });
    expect((await rows())[0]).toMatchObject({ best_score: 200, best_streak: 9 });
  });

  it('clamps nonsense instead of storing it', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await record(-5, -1)).toEqual({ score: 0, streak: 0 });
    expect(await record(99999999, 99999)).toEqual({ score: 100000, streak: 1000 });
    expect(await record(null, null)).toEqual({ score: 100000, streak: 1000 });
  });

  it('keeps each member to their own row', async () => {
    await as(db, 'authenticated', ALICE);
    await record(150, 10);
    await as(db, 'authenticated', BOB);
    expect(await record(40, 2)).toEqual({ score: 40, streak: 2 });
    expect(await rows()).toHaveLength(1);
    await as(db, 'authenticated', ALICE);
    expect((await rows())[0]).toMatchObject({ user_id: ALICE, best_score: 150, best_streak: 10 });
  });
});

describe('a record for each round length', () => {
  it('keeps 30, 60 and 120 seconds apart, so a long round never sets a record a short one cannot reach', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await recordFor(40, 3, 30)).toEqual({ score: 40, streak: 3 });
    expect(await recordFor(100, 6, 60)).toEqual({ score: 100, streak: 6 });
    expect(await recordFor(260, 12, 120)).toEqual({ score: 260, streak: 12 });
    expect(await byLength()).toEqual({ 30: [40, 3], 60: [100, 6], 120: [260, 12] });
    expect(await rows()).toHaveLength(3);
  });

  it('still only ever raises each one, length by length', async () => {
    await as(db, 'authenticated', ALICE);
    await recordFor(40, 3, 30);
    await recordFor(260, 12, 120);
    expect(await recordFor(20, 5, 30)).toEqual({ score: 40, streak: 5 });
    expect(await recordFor(10, 1, 120)).toEqual({ score: 260, streak: 12 });
    expect(await byLength()).toEqual({ 30: [40, 5], 120: [260, 12] });
  });

  it('counts a call without a length as a 60-second round, so a browser from before this change keeps working', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await record(70, 4)).toEqual({ score: 70, streak: 4 }); // the old two-argument call
    expect(await byLength()).toEqual({ 60: [70, 4] });
    expect(await recordFor(90, 5, null).catch(() => 'refused')).toBe('refused'); // but an explicit null length is not a round
  });

  it('refuses a length that is not 30, 60 or 120, and writes nothing', async () => {
    await as(db, 'authenticated', ALICE);
    for (const bad of [0, 15, 45, 90, 121, -60]) {
      expect(await fails('select * from public.record_warmup_best(10, 1, $1)', [bad]), String(bad)).toMatch(/30, 60 or 120/);
    }
    expect(await rows()).toEqual([]);
  });

  it('refuses a direct write that names a bad length, and keeps one row per member and length', async () => {
    await as(db, 'postgres');
    expect(await fails('insert into public.warmup_best (user_id, seconds, best_score, best_streak) values ($1, 45, 1, 1)', [ALICE])).toMatch(/violates check constraint/);
    await db.query('insert into public.warmup_best (user_id, seconds, best_score, best_streak) values ($1, 30, 1, 1)', [ALICE]);
    expect(await fails('insert into public.warmup_best (user_id, seconds, best_score, best_streak) values ($1, 30, 2, 2)', [ALICE])).toMatch(/duplicate key/);
  });

  it('keeps every length private to its owner and out of reach of visitors', async () => {
    await as(db, 'authenticated', ALICE);
    await recordFor(40, 3, 30);
    await recordFor(260, 12, 120);
    await as(db, 'authenticated', BOB);
    expect(await rows()).toEqual([]);
    await as(db, 'anon');
    expect(await fails('select * from public.record_warmup_best(1, 1, 30)')).toMatch(/permission denied/);
  });
});

describe('privacy and access', () => {
  it("lets nobody read someone else's record", async () => {
    await as(db, 'authenticated', ALICE);
    await record(150, 10);
    await as(db, 'authenticated', BOB);
    expect(await rows()).toEqual([]);
    expect((await db.query('select * from public.warmup_best where user_id = $1', [ALICE])).rows).toEqual([]);
  });

  it('refuses direct writes: no insert, update or delete, even on your own row', async () => {
    await as(db, 'authenticated', ALICE);
    await record(150, 10);
    expect(await fails('insert into public.warmup_best (best_score, best_streak) values (1, 1)')).toMatch(/permission denied/);
    expect(await fails('update public.warmup_best set best_score = 100000')).toMatch(/permission denied/);
    expect(await fails('delete from public.warmup_best')).toMatch(/permission denied/);
    expect((await rows())[0]).toMatchObject({ best_score: 150 });
  });

  it('gives visitors without an account nothing: no reads, no function call', async () => {
    await as(db, 'authenticated', ALICE);
    await record(150, 10);
    await as(db, 'anon');
    expect(await fails('select * from public.warmup_best')).toMatch(/permission denied/);
    expect(await fails('select * from public.record_warmup_best(1, 1)')).toMatch(/permission denied/);
  });

  it('refuses the function when nobody is signed in', async () => {
    await as(db, 'authenticated'); // a role, but no user id
    expect(await fails('select * from public.record_warmup_best(1, 1)')).toMatch(/Not signed in/);
  });

  it('is deleted with the account', async () => {
    await as(db, 'authenticated', ALICE);
    await record(150, 10);
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    expect((await db.query('select * from public.warmup_best')).rows).toEqual([]);
  });

  it('is not copied into anything other members or visitors can read', async () => {
    await as(db, 'postgres');
    for (const t of ['profiles', 'public_profiles', 'shared_cases', 'public_shared_cases']) {
      const { rows: cols } = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [t],
      );
      expect(cols.length, t).toBeGreaterThan(0);
      expect(cols.map((c) => c.column_name).filter((c) => /warmup|best_score|best_streak/.test(c)), t).toEqual([]);
    }
  });
});
