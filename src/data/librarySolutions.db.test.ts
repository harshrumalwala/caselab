// @vitest-environment node
//
// The book's own solution to a case: locked away like our analysis, released only to a verified member who has logged that case.
// Run against the real migrations in an in-process Postgres.
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
});

const libraryCase = async (name: string, withSolution = true) => {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.library_cases (book, school, year, name, case_type, industry) values ('Booth MCG 2026-2027', 'Booth', 2026, $1, 'Profitability', 'Other') returning id",
    [name],
  );
  if (withSolution) {
    await db.query('insert into public.library_case_solutions (case_id, solution) values ($1, $2)', [
      rows[0].id,
      JSON.stringify({ prompt: 'SECRET PROMPT', steps: [{ title: 'SECRET STEP' }], recommendation: 'SECRET RECOMMENDATION' }),
    ]);
  }
  return rows[0].id;
};
const logCase = (uid: string, libraryId: string | null) =>
  db.query("insert into public.cases (user_id, case_date, title, case_type, library_id) values ($1, '2026-10-10', 'Mine', 'Profitability', $2)", [uid, libraryId]);
const released = async (id: string) => (await db.query<{ solution: { prompt: string } }>('select * from public.library_solution_for($1)', [id])).rows;

describe("the book's solution to a case", () => {
  it('is released only to a member who has logged that case', async () => {
    const hotel = await libraryCase('Army Hotel');
    const smoothies = await libraryCase('Hawaiian Smoothies');
    await as(db, 'authenticated', ALICE);
    expect(await released(hotel)).toEqual([]);
    await logCase(ALICE, hotel);
    expect((await released(hotel))[0].solution.prompt).toBe('SECRET PROMPT');
    // Doing one case does not unlock another, and someone else doing it does not unlock it for you.
    expect(await released(smoothies)).toEqual([]);
    await as(db, 'authenticated', BOB);
    expect(await released(hotel)).toEqual([]);
  });

  it('is not released to visitors or unverified accounts, and not after the case is deleted', async () => {
    const hotel = await libraryCase('Army Hotel');
    await as(db, 'postgres');
    await logCase(ALICE, hotel);
    await logCase(DAVE, hotel);
    await as(db, 'anon');
    expect(await fails('select * from public.library_solution_for($1)', [hotel])).toMatch(/permission denied/);
    await as(db, 'authenticated', DAVE);
    expect(await released(hotel)).toEqual([]);
    await as(db, 'postgres');
    await db.exec('delete from public.cases');
    await as(db, 'authenticated', ALICE);
    expect(await released(hotel)).toEqual([]);
  });

  it('cannot be read from the table by any role, whoever you are and whatever you have logged', async () => {
    const hotel = await libraryCase('Army Hotel');
    await as(db, 'postgres');
    await logCase(ALICE, hotel);
    await as(db, 'authenticated', ALICE);
    expect(await fails('select * from public.library_case_solutions')).toMatch(/permission denied/);
    expect(await fails('select solution from public.library_case_solutions')).toMatch(/permission denied/);
    await as(db, 'anon');
    expect(await fails('select * from public.library_case_solutions')).toMatch(/permission denied/);
  });

  it('cannot be written, changed or removed by a member or a visitor', async () => {
    const hotel = await libraryCase('Army Hotel', false);
    await as(db, 'authenticated', ALICE);
    expect(await fails("insert into public.library_case_solutions (case_id, solution) values ($1, '{}')", [hotel])).toMatch(/permission denied/);
    await as(db, 'anon');
    expect(await fails("insert into public.library_case_solutions (case_id, solution) values ($1, '{}')", [hotel])).toMatch(/permission denied/);
  });

  it('must be a JSON object, one per case', async () => {
    const hotel = await libraryCase('Army Hotel', false);
    await as(db, 'postgres');
    expect(await fails("insert into public.library_case_solutions (case_id, solution) values ($1, '[1]')", [hotel])).toMatch(/check constraint/);
    await db.query("insert into public.library_case_solutions (case_id, solution) values ($1, '{}')", [hotel]);
    expect(await fails("insert into public.library_case_solutions (case_id, solution) values ($1, '{}')", [hotel])).toMatch(/duplicate key/);
  });
});
