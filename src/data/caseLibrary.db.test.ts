// @vitest-environment node
//
// The case library: searchable by verified members, with the part that would spoil a case locked away until you have logged it.
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

const addCase = async (name: string, over: { book?: string; year?: number; type?: string; industry?: string; cochair?: boolean; alsoIn?: string[] } = {}) => {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.library_cases (book, school, year, name, case_type, industry, cochair_pick, also_in)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [over.book ?? 'Booth MCG 2026-2027', 'Booth', over.year ?? 2026, name, over.type ?? 'Profitability', over.industry ?? 'Travel / Hospitality', over.cochair ?? false, over.alsoIn ?? []],
  );
  await db.query(
    `insert into public.library_case_notes (case_id, difficulty, skills, concepts, summary, strong_answer, pitfalls, confidence)
     values ($1, 3, array['quant','framework'], array['Break-even'], 'SECRET SUMMARY', 'SECRET STRONG ANSWER', array['SECRET PITFALL'], 'high')`,
    [rows[0].id],
  );
  return rows[0].id;
};
const search = async (q: string, limit?: number) =>
  (await db.query<{ name: string }>('select name from public.search_library($1, $2)', [q, limit ?? 8])).rows.map((r) => r.name);
const logCase = (uid: string, title: string, libraryId: string | null) =>
  db.query("insert into public.cases (user_id, case_date, title, case_type, library_id) values ($1, '2026-10-10', $2, 'Profitability', $3)", [uid, title, libraryId]);

describe('searching the library', () => {
  it('finds cases by name, book, school or year, and every word you type has to match', async () => {
    await addCase('Army Hotel');
    await addCase('Hawaiian Smoothies');
    await addCase('Duck Island Beer Company', { book: 'Fuqua Case Book 2017', year: 2017 });
    await as(db, 'authenticated', ALICE);
    expect(await search('army')).toEqual(['Army Hotel']);
    expect(await search('HOTEL army')).toEqual(['Army Hotel']);
    expect(await search('smoothies booth')).toEqual(['Hawaiian Smoothies']);
    expect(await search('fuqua 2017')).toEqual(['Duck Island Beer Company']);
    expect(await search('army smoothies')).toEqual([]);
    expect(await search('')).toEqual([]);
    expect(await search('a')).toEqual([]); // one letter is not a search
  });

  it('finds a case by another book it is also in, and says which books those are', async () => {
    await addCase('Hawaiian Smoothies', { alsoIn: ['Kellogg Case Book 2020', 'Ross Case Book 2016'] });
    await as(db, 'authenticated', ALICE);
    expect(await search('kellogg 2020')).toEqual(['Hawaiian Smoothies']);
    const { rows } = await db.query<{ also_in: string[] }>("select also_in from public.search_library('smoothies')");
    expect(rows[0].also_in).toEqual(['Kellogg Case Book 2020', 'Ross Case Book 2016']);
  });

  it('puts exact and starting matches first, then the co-chairs\' picks, then newer books', async () => {
    await addCase('Hotel Chain', { year: 2020, book: 'Old Book 2020' });
    await addCase('Army Hotel', { year: 2026 });
    await addCase('Grand Hotel', { year: 2026, cochair: true });
    await addCase('Hotel', { year: 2010, book: 'Older Book 2010' });
    await as(db, 'authenticated', ALICE);
    expect(await search('hotel')).toEqual(['Hotel', 'Hotel Chain', 'Grand Hotel', 'Army Hotel']);
  });

  it('caps the number of results', async () => {
    for (let i = 0; i < 30; i += 1) await addCase(`Coffee case ${i}`);
    await as(db, 'authenticated', ALICE);
    expect(await search('coffee')).toHaveLength(8);
    expect(await search('coffee', 100)).toHaveLength(20);
    expect(await search('coffee', 0)).toHaveLength(1);
  });

  it('is for verified members only: visitors and unverified accounts get nothing', async () => {
    await addCase('Army Hotel');
    await as(db, 'anon');
    expect(await fails("select * from public.search_library('army')")).toMatch(/permission denied/);
    await as(db, 'authenticated', DAVE);
    expect(await search('army')).toEqual([]);
  });
});

describe('what a member can read about a case', () => {
  it('is its name, book, school, year, type and industry, and nothing of our analysis', async () => {
    const id = await addCase('Army Hotel', { cochair: true });
    await as(db, 'authenticated', ALICE);
    const { rows } = await db.query<Record<string, unknown>>('select id, book, school, year, name, case_type, industry, cochair_pick from public.library_cases where id = $1', [id]);
    expect(rows[0]).toMatchObject({ name: 'Army Hotel', book: 'Booth MCG 2026-2027', cochair_pick: true });
    // The analysis table gives nothing to any API role, and the main table only lends out its public columns.
    expect(await fails('select * from public.library_case_notes')).toMatch(/permission denied/);
    expect(await fails('select summary from public.library_case_notes')).toMatch(/permission denied/);
    await as(db, 'anon');
    expect(await fails('select * from public.library_case_notes')).toMatch(/permission denied/);
    expect(await fails('select * from public.library_cases')).toMatch(/permission denied/);
  });

  it('cannot be written by a member or a visitor', async () => {
    const id = await addCase('Army Hotel');
    await as(db, 'authenticated', ALICE);
    expect(await fails("insert into public.library_cases (book, school, year, name, case_type, industry) values ('b', 's', 2026, 'n', 'Other', 'x')")).toMatch(/permission denied/);
    expect(await fails("update public.library_cases set name = 'Hacked'")).toMatch(/permission denied/);
    expect(await fails('delete from public.library_cases')).toMatch(/permission denied/);
    expect(await fails("insert into public.library_case_notes (case_id, difficulty, skills, concepts, summary, strong_answer, pitfalls, confidence) values ('" + id + "', 1, '{}', '{}', 's', 's', '{}', 'high')")).toMatch(/permission denied/);
  });

  it('keeps the table\'s rules: one entry per book and name, real case types, a sane year', async () => {
    await addCase('Army Hotel');
    expect(await fails("insert into public.library_cases (book, school, year, name, case_type, industry) values ('Booth MCG 2026-2027', 'Booth', 2026, 'Army Hotel', 'Other', 'x')")).toMatch(/duplicate key/);
    expect(await fails("insert into public.library_cases (book, school, year, name, case_type, industry) values ('b', 's', 2026, 'n', 'Made up', 'x')")).toMatch(/check constraint/);
    expect(await fails("insert into public.library_cases (book, school, year, name, case_type, industry) values ('b', 's', 1800, 'n', 'Other', 'x')")).toMatch(/check constraint/);
  });
});

describe('our analysis of a case', () => {
  it('is released only to a member who has logged that case', async () => {
    const hotel = await addCase('Army Hotel');
    const smoothies = await addCase('Hawaiian Smoothies');
    await as(db, 'authenticated', ALICE);
    const notes = async (id: string) => (await db.query<Record<string, unknown>>('select * from public.library_notes_for($1)', [id])).rows;

    // Nothing for a case you have not done, however you ask.
    expect(await notes(hotel)).toEqual([]);

    await logCase(ALICE, 'My army hotel case', hotel);
    const done = await notes(hotel);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ summary: 'SECRET SUMMARY', strong_answer: 'SECRET STRONG ANSWER', difficulty: 3, confidence: 'high' });
    expect(done[0].skills).toEqual(['quant', 'framework']);

    // Doing one case does not unlock another.
    expect(await notes(smoothies)).toEqual([]);
  });

  it('is not released to another member because someone else logged the case', async () => {
    const hotel = await addCase('Army Hotel');
    await as(db, 'authenticated', ALICE);
    await logCase(ALICE, 'Alice did it', hotel);
    await as(db, 'authenticated', BOB);
    expect((await db.query('select * from public.library_notes_for($1)', [hotel])).rows).toEqual([]);
    // Nor can Bob unlock it by claiming a case of his own against someone else's... he would have to log it himself.
    await logCase(BOB, 'Bob did it too', hotel);
    expect((await db.query('select * from public.library_notes_for($1)', [hotel])).rows).toHaveLength(1);
  });

  it('is not released to visitors or unverified accounts, and not after the case is deleted', async () => {
    const hotel = await addCase('Army Hotel');
    await as(db, 'authenticated', ALICE);
    await logCase(ALICE, 'Alice did it', hotel);
    await as(db, 'anon');
    expect(await fails('select * from public.library_notes_for($1)', [hotel])).toMatch(/permission denied/);
    await as(db, 'authenticated', DAVE);
    await logCase(DAVE, 'Unverified did it', hotel).catch(() => undefined);
    expect((await db.query('select * from public.library_notes_for($1)', [hotel])).rows).toEqual([]);
    await as(db, 'authenticated', ALICE);
    await db.query("delete from public.cases where user_id = $1", [ALICE]);
    expect((await db.query('select * from public.library_notes_for($1)', [hotel])).rows).toEqual([]);
  });

  it('cannot be reached by writing a library_id onto a case you did not do, without the case being yours', async () => {
    const hotel = await addCase('Army Hotel');
    await as(db, 'authenticated', BOB);
    // A member can link their own case to any library case (that is what "I did this one" means), but can never link someone else's row.
    await logCase(BOB, 'Bob claims it', hotel);
    await as(db, 'authenticated', ALICE);
    expect((await db.query('select * from public.library_notes_for($1)', [hotel])).rows).toEqual([]);
  });
});

describe('linking a logged case to the library', () => {
  it('is optional, kept with the case, and cleared if the library case is removed', async () => {
    const hotel = await addCase('Army Hotel');
    await as(db, 'authenticated', ALICE);
    await logCase(ALICE, 'Linked', hotel);
    await logCase(ALICE, 'Not linked', null);
    const links = async () => (await db.query<{ title: string; library_id: string | null }>('select title, library_id from public.cases order by title')).rows;
    expect(await links()).toEqual([
      { title: 'Linked', library_id: hotel },
      { title: 'Not linked', library_id: null },
    ]);
    await as(db, 'postgres');
    await db.query('delete from public.library_cases where id = $1', [hotel]);
    await as(db, 'authenticated', ALICE);
    expect((await links()).map((l) => l.library_id)).toEqual([null, null]);
  });

  it('refuses a link to a library case that does not exist', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails("insert into public.cases (user_id, case_date, title, case_type, library_id) values ('" + ALICE + "', '2026-10-10', 'x', 'Profitability', '99999999-9999-4999-8999-999999999999')")).toMatch(/foreign key/);
  });
});
