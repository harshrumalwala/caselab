// @vitest-environment node
//
// "Cases to try next": library cases that exercise a skill and that the caller has not done, found without ever returning our analysis.
// Run against the real migrations in an in-process Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, DAVE, as, createDb, fails as failsOn, resetData } from '../test/pg';

let db: PGlite;
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

const addCase = async (name: string, skills: string[], over: { book?: string; year?: number; cochair?: boolean } = {}) => {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.library_cases (book, school, year, name, case_type, industry, cochair_pick)
     values ($1, 'Booth', $2, $3, 'Profitability', 'Travel / Hospitality', $4) returning id`,
    [over.book ?? 'Booth MCG 2026-2027', over.year ?? 2026, name, over.cochair ?? false],
  );
  await db.query(
    `insert into public.library_case_notes (case_id, difficulty, skills, concepts, summary, strong_answer, pitfalls, confidence)
     values ($1, 3, $2, array['x'], 'SECRET SUMMARY', 'SECRET STRONG ANSWER', array['SECRET PITFALL'], 'high')`,
    [rows[0].id, skills],
  );
  return rows[0].id;
};
const next = async (skill: string, limit?: number) =>
  (await db.query<Record<string, unknown>>('select * from public.library_next_cases($1, $2)', [skill, limit ?? 3])).rows;
const names = async (skill: string, limit?: number) => (await next(skill, limit)).map((r) => r.name);
const logCase = (uid: string, title: string, libraryId: string | null) =>
  db.query("insert into public.cases (user_id, case_date, title, case_type, library_id) values ($1, '2026-10-10', $2, 'Profitability', $3)", [uid, title, libraryId]);

describe('cases to try next for a skill', () => {
  it('returns the cases that exercise it, the co-chair picks first, then newer books, and only what any member may know', async () => {
    await addCase('Old Quant', ['quant'], { year: 2012, book: 'Kellogg Case Book 2012' });
    await addCase('New Quant', ['quant']);
    await addCase('Picked Quant', ['quant', 'framework'], { cochair: true, year: 2020, book: 'Fuqua Case Book 2020' });
    await addCase('Only Framework', ['framework']);
    await as(db, 'authenticated', ALICE);
    expect(await names('quant')).toEqual(['Picked Quant', 'New Quant', 'Old Quant']);
    expect(await names('framework')).toEqual(['Picked Quant', 'Only Framework']);
    const row = (await next('quant'))[0];
    expect(Object.keys(row).sort()).toEqual(['also_in', 'book', 'case_type', 'cochair_pick', 'details_known', 'id', 'industry', 'name', 'school', 'year']);
    expect(JSON.stringify(await next('quant'))).not.toMatch(/SECRET|skills|strong_answer/);
  });

  it('leaves out cases you have done, linked or by the same name, and not ones someone else did', async () => {
    const hotel = await addCase('Army Hotel', ['quant']);
    await addCase('Hawaiian Smoothies', ['quant']);
    await addCase('Duck Island', ['quant']);
    await as(db, 'authenticated', ALICE);
    await logCase(ALICE, 'My own title for the hotel', hotel); // linked
    await logCase(ALICE, 'hawaiian smoothies', null); // same name, not linked
    expect(await names('quant')).toEqual(['Duck Island']);
    await as(db, 'authenticated', BOB);
    expect(await names('quant')).toEqual(['Army Hotel', 'Duck Island', 'Hawaiian Smoothies']);
  });

  it('caps the number returned, and ignores a skill we do not tag', async () => {
    for (let i = 0; i < 15; i++) await addCase(`Case ${String(i).padStart(2, '0')}`, ['quant']);
    await as(db, 'authenticated', ALICE);
    expect(await names('quant')).toHaveLength(3);
    expect(await names('quant', 100)).toHaveLength(10);
    expect(await names('quant', 0)).toHaveLength(1);
    expect(await names('behavioral1')).toEqual([]);
    expect(await names("quant' or true --")).toEqual([]);
  });

  it('is for verified members only: visitors and unverified accounts get nothing', async () => {
    await addCase('Army Hotel', ['quant']);
    await as(db, 'anon');
    expect(await failsOn(db, "select * from public.library_next_cases('quant')", [])).toMatch(/permission denied/);
    await as(db, 'authenticated', DAVE);
    expect(await names('quant')).toEqual([]);
  });
});
