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
