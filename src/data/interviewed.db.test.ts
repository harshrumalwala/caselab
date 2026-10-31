// @vitest-environment node
//
// Cases you ran as the interviewer: private to their owner and shaped like cases, run against the real migrations in an
// in-process Postgres.
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

const add = (title: string, type = 'Profitability') =>
  db.query<{ id: string }>("insert into public.interviewed_cases (title, case_type) values ($1, $2) returning id", [title, type]);
const titles = async () => (await db.query<{ title: string }>('select title from public.interviewed_cases order by title')).rows.map((r) => r.title);

describe('interviewed cases', () => {
  it('belong to you from the moment you add them, and can be changed and removed', async () => {
    await as(db, 'authenticated', ALICE);
    const { rows } = await add('Airline profit');
    expect((await db.query<{ user_id: string }>('select user_id from public.interviewed_cases')).rows[0].user_id).toBe(ALICE);
    await db.query("update public.interviewed_cases set learned = 'Let them finish the structure' where id = $1", [rows[0].id]);
    expect((await db.query<{ learned: string }>('select learned from public.interviewed_cases')).rows[0].learned).toBe('Let them finish the structure');
    await db.query('delete from public.interviewed_cases where id = $1', [rows[0].id]);
    expect(await titles()).toEqual([]);
  });

  it('uses the same case types as cases, and refuses a blank or oversized title', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails("insert into public.interviewed_cases (title, case_type) values ('X', 'Made up')")).toBeTruthy();
    expect(await fails("insert into public.interviewed_cases (title, case_type) values ('   ', 'Other')")).toBeTruthy();
    expect(await fails('insert into public.interviewed_cases (title, case_type) values ($1, $2)', ['x'.repeat(201), 'Other'])).toBeTruthy();
    expect(await fails('insert into public.interviewed_cases (title, case_type, feedback) values ($1, $2, $3)', ['Ok', 'Other', 'x'.repeat(4001)])).toBeTruthy();
    expect(await titles()).toEqual([]);
  });

  it('are invisible to everyone else: no reading, changing, removing or planting', async () => {
    await as(db, 'authenticated', ALICE);
    const { rows } = await add('Alice only');

    await as(db, 'authenticated', BOB);
    expect(await titles()).toEqual([]);
    await db.query("update public.interviewed_cases set title = 'Hijacked' where id = $1", [rows[0].id]);
    await db.query('delete from public.interviewed_cases where id = $1', [rows[0].id]);
    expect(await fails("insert into public.interviewed_cases (user_id, title, case_type) values ($1, 'Planted', 'Other')", [ALICE])).toBeTruthy();

    await as(db, 'authenticated', ALICE);
    expect(await titles()).toEqual(['Alice only']);
  });

  it('are never mixed into the cases you solved, and give visitors nothing at all', async () => {
    await as(db, 'authenticated', ALICE);
    await add('Interviewed one');
    expect((await db.query('select * from public.cases')).rows).toEqual([]);

    await as(db, 'anon');
    expect(await fails('select * from public.interviewed_cases')).toBeTruthy();
    expect(await fails("insert into public.interviewed_cases (title, case_type) values ('X', 'Other')")).toBeTruthy();
  });
});
