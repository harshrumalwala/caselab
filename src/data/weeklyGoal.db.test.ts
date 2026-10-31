// @vitest-environment node
//
// The weekly goal: private to its owner, limited to 1 to 14, run against the real migrations in an in-process Postgres.
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

const goals = async () => (await db.query<{ user_id: string; goal: number }>('select user_id, goal from public.weekly_goal')).rows;
const setGoal = (n: number) =>
  db.query('insert into public.weekly_goal (goal) values ($1) on conflict (user_id) do update set goal = excluded.goal', [n]);

describe('the weekly goal', () => {
  it('is created for you, owned by you, and can be changed and removed', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await goals()).toEqual([]);
    await setGoal(3);
    expect(await goals()).toEqual([{ user_id: ALICE, goal: 3 }]);
    await setGoal(5);
    expect(await goals()).toEqual([{ user_id: ALICE, goal: 5 }]);
    await db.query('delete from public.weekly_goal');
    expect(await goals()).toEqual([]);
  });

  it('refuses anything outside 1 to 14', async () => {
    await as(db, 'authenticated', ALICE);
    for (const bad of [0, -2, 15, 500]) expect(await fails('insert into public.weekly_goal (goal) values ($1)', [bad])).toBeTruthy();
    expect(await goals()).toEqual([]);
  });

  it('keeps every goal private: nobody else can read, change, remove or plant one', async () => {
    await as(db, 'authenticated', ALICE);
    await setGoal(4);

    await as(db, 'authenticated', BOB);
    expect(await goals()).toEqual([]);
    await db.query("update public.weekly_goal set goal = 9 where user_id = '" + ALICE + "'");
    await db.query("delete from public.weekly_goal where user_id = '" + ALICE + "'");
    expect(await fails('insert into public.weekly_goal (user_id, goal) values ($1, 2)', [ALICE])).toBeTruthy();

    await as(db, 'authenticated', ALICE);
    expect(await goals()).toEqual([{ user_id: ALICE, goal: 4 }]);
  });

  it('gives visitors without an account nothing at all', async () => {
    await as(db, 'authenticated', ALICE);
    await setGoal(2);
    await as(db, 'anon');
    expect(await fails('select * from public.weekly_goal')).toBeTruthy();
    expect(await fails('insert into public.weekly_goal (goal) values (3)')).toBeTruthy();
  });
});
