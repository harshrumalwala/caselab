// @vitest-environment node
//
// "Cases to fill a gap": library cases of the case types or industries a member has done little of, that they have not done, found
// without ever returning our analysis. Run against the real migrations in an in-process Postgres.
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

const addCase = async (name: string, over: { type?: string; industry?: string; analysed?: boolean; cochair?: boolean; year?: number; known?: boolean } = {}) => {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.library_cases (book, school, year, name, case_type, industry, cochair_pick, details_known)
     values ('Booth MCG 2026-2027', 'Booth', $1, $2, $3, $4, $5, $6) returning id`,
    [over.year ?? 2026, name, over.type ?? 'Profitability', over.industry ?? 'Travel / Hospitality', over.cochair ?? false, over.known ?? true],
  );
  if (over.analysed) {
    await db.query(
      `insert into public.library_case_notes (case_id, difficulty, skills, concepts, summary, strong_answer, pitfalls, confidence)
       values ($1, 3, array['quant'], array['x'], 'SECRET SUMMARY', 'SECRET STRONG ANSWER', array['p'], 'high')`,
      [rows[0].id],
    );
  }
  return rows[0].id;
};
const gap = async (types: string[], industries: string[], limit?: number) =>
  (await db.query<Record<string, unknown>>('select * from public.library_gap_cases($1, $2, $3)', [types, industries, limit ?? 12])).rows;
const names = async (types: string[], industries: string[], limit?: number) => (await gap(types, industries, limit)).map((r) => r.name);
const logCase = (uid: string, title: string, libraryId: string | null) =>
  db.query("insert into public.cases (user_id, case_date, title, case_type, library_id) values ($1, '2026-10-10', $2, 'Profitability', $3)", [uid, title, libraryId]);

describe('cases that fill a gap', () => {
  it('finds unseen cases of the named types or industries, analysed ones first, then co-chair picks, then newer, with only public columns', async () => {
    await addCase('Plain Revenue', { type: 'Revenue' });
    await addCase('Analysed Revenue', { type: 'Revenue', analysed: true, year: 2015 });
    await addCase('Picked Revenue', { type: 'Revenue', cochair: true });
    await addCase('Insurance Case', { type: 'Other', industry: 'Insurance' });
    await addCase('Not A Gap', { type: 'Market Entry', industry: 'Energy / Utilities' });
    await as(db, 'authenticated', ALICE);
    expect(await names(['Revenue'], ['Insurance'])).toEqual(['Analysed Revenue', 'Picked Revenue', 'Insurance Case', 'Plain Revenue']);
    const row = (await gap(['Revenue'], []))[0];
    expect(Object.keys(row).sort()).toEqual(['also_in', 'book', 'case_type', 'cochair_pick', 'details_known', 'id', 'industry', 'name', 'school', 'year']);
    expect(JSON.stringify(await gap(['Revenue'], ['Insurance']))).not.toMatch(/SECRET|skills|strong_answer/);
  });

  it('leaves out cases you have done (linked or by the same name), and cases whose type and industry are not known', async () => {
    const hotel = await addCase('Army Hotel', { type: 'Revenue' });
    await addCase('Smoothies', { type: 'Revenue' });
    await addCase('Duck Island', { type: 'Revenue' });
    await addCase('Listed Only', { type: 'Revenue', known: false });
    await as(db, 'authenticated', ALICE);
    await logCase(ALICE, 'My own title', hotel);
    await logCase(ALICE, 'smoothies', null);
    expect(await names(['Revenue'], [])).toEqual(['Duck Island']);
    await as(db, 'authenticated', BOB);
    expect(await names(['Revenue'], [])).toEqual(['Army Hotel', 'Duck Island', 'Smoothies']);
  });

  it('returns nothing for no gaps, caps the number returned, and treats a silly input as just a name that matches nothing', async () => {
    for (let i = 0; i < 40; i++) await addCase(`Case ${String(i).padStart(2, '0')}`, { type: 'Revenue' });
    await as(db, 'authenticated', ALICE);
    expect(await names([], [])).toEqual([]);
    expect(await names(['Revenue'], [])).toHaveLength(12);
    expect(await names(['Revenue'], [], 100)).toHaveLength(30);
    expect(await names(['Revenue'], [], 0)).toHaveLength(1);
    expect(await names(["Revenue' or true --"], [])).toEqual([]);
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.library_gap_cases(null, null, 5)');
    expect(rows[0].n).toBe(0);
  });

  it('is for verified members only: visitors and unverified accounts get nothing', async () => {
    await addCase('Army Hotel', { type: 'Revenue' });
    await as(db, 'anon');
    expect(await failsOn(db, "select * from public.library_gap_cases(array['Revenue'], array[]::text[])", [])).toMatch(/permission denied/);
    await as(db, 'authenticated', DAVE);
    expect(await names(['Revenue'], [])).toEqual([]);
  });
});
