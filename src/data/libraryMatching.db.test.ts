// @vitest-environment node
//
// Matching the cases members already logged to the casebook library: the same name and book is linked in a one-off backfill that adds
// the link and nothing else, and each member can review the rest for themselves. Run against the real migrations.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nameKey } from '../../scripts/librarySeed.mjs';
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

const lib = async (name: string, over: { book?: string; school?: string; year?: number; type?: string; industry?: string; alsoIn?: string[] } = {}) =>
  (
    await db.query<{ id: string }>(
      `insert into public.library_cases (book, school, year, name, case_type, industry, also_in) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [over.book ?? 'Booth MCG 2026-2027', over.school ?? 'Booth', over.year ?? 2026, name, over.type ?? 'Market Entry', over.industry ?? 'Travel / Hospitality', over.alsoIn ?? []],
    )
  ).rows[0].id;
const mine = (uid: string, title: string, over: { source?: string | null; type?: string; industry?: string | null; libraryId?: string | null } = {}) =>
  db.query(
    "insert into public.cases (user_id, case_date, title, source, case_type, industry, library_id) values ($1, '2026-10-10', $2, $3, $4, $5, $6)",
    [uid, title, over.source ?? null, over.type ?? 'Profitability', over.industry ?? null, over.libraryId ?? null],
  );
const linkOf = async (title: string) => (await db.query<{ library_id: string | null }>('select library_id from public.cases where title = $1', [title])).rows[0].library_id;
const key = async (name: string) => (await db.query<{ k: string }>('select public.library_name_key($1) as k', [name])).rows[0].k;

describe('matching a title to a library case', () => {
  it('ignores case, punctuation, "&" and "Co.", exactly as the loader does', async () => {
    for (const name of ['Midwest Machinery Co.', 'midwest machinery', "Linda's Great Burgers", 'LINDA S GREAT BURGERS', 'Smith & Sons Inc.', 'Smith and Sons', 'Army  Hotel', '  Army Hotel!', 'Acme Corporation, Ltd.', '']) {
      expect(await key(name), name).toBe(nameKey(name));
    }
    expect(await key('Midwest Machinery Co.')).toBe(await key('midwest machinery'));
    expect(await key('Army Hotel')).not.toBe(await key('Army Base Housing'));
  });

  it('counts a source as matching when it names the book, or another book the case is also in', async () => {
    const sure = async (source: string | null, book = 'Booth MCG 2026-2027', alsoIn: string[] = []) =>
      (await db.query<{ s: boolean }>('select public.library_source_matches($1, $2, $3) as s', [source, book, alsoIn])).rows[0].s;
    expect(await sure('Booth casebook')).toBe(true);
    expect(await sure('MCG')).toBe(true);
    expect(await sure('mcg casebook 2025')).toBe(true);
    expect(await sure('Kellogg 2020', 'Booth MCG 2026-2027', ['Kellogg Case Book 2020'])).toBe(true);
    expect(await sure('Kellogg 2020')).toBe(false); // not in the Kellogg book as far as the library knows
    expect(await sure('Darden')).toBe(false);
    expect(await sure('')).toBe(false);
    expect(await sure(null)).toBe(false);
    expect(await sure('Across the pond')).toBe(false); // a word inside a word is not a match ("ross")
    expect(await sure('Ross casebook', 'Ross Case Book 2024')).toBe(true);
    expect(await sure('Across the pond', 'Ross Case Book 2024')).toBe(false);
  });
});

describe('the one-off backfill', () => {
  it('links a case that has the same name and names the book, and changes nothing else about it', async () => {
    const hotel = await lib('Army Hotel');
    await mine(ALICE, 'army hotel', { source: 'Booth casebook', type: 'Profitability', industry: 'Energy / Utilities' });
    const before = (await db.query('select title, source, case_type, industry from public.cases')).rows;
    expect((await db.query<{ n: number }>('select public.link_cases_to_library() as n')).rows[0].n).toBe(1);
    expect(await linkOf('army hotel')).toBe(hotel);
    expect((await db.query('select title, source, case_type, industry from public.cases')).rows).toEqual(before);
  });

  it('leaves a case with no source, or another book, as a maybe: it is not linked', async () => {
    await lib('Army Hotel');
    await mine(ALICE, 'Army Hotel', { source: null });
    await mine(BOB, 'Army Hotel', { source: 'Darden 2018' });
    expect((await db.query<{ n: number }>('select public.link_cases_to_library() as n')).rows[0].n).toBe(0);
    expect((await db.query('select 1 from public.cases where library_id is not null')).rows).toEqual([]);
  });

  it('never replaces a link that is already there, and can be run again', async () => {
    const hotel = await lib('Army Hotel');
    const other = await lib('Burger Palace');
    await mine(ALICE, 'Army Hotel', { source: 'Booth', libraryId: other }); // the member's own choice stands
    await mine(BOB, 'Army Hotel', { source: 'Booth' });
    expect((await db.query<{ n: number }>('select public.link_cases_to_library() as n')).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>('select public.link_cases_to_library() as n')).rows[0].n).toBe(0);
    expect((await db.query<{ u: string; l: string }>('select user_id as u, library_id as l from public.cases order by user_id')).rows).toEqual([
      { u: ALICE, l: other },
      { u: BOB, l: hotel },
    ]);
  });

  it('cannot be called by a member or a visitor', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails('select public.link_cases_to_library()')).toMatch(/permission denied/);
    await as(db, 'anon');
    expect(await fails('select public.link_cases_to_library()')).toMatch(/permission denied/);
  });
});

describe('a member reviewing their own cases', () => {
  const review = async () => (await db.query<Record<string, unknown>>('select * from public.match_my_cases()')).rows;

  it('lists their cases that match a library case but are not linked, and says how sure the match is', async () => {
    await lib('Army Hotel');
    await lib('Hawaiian Smoothies', { type: 'Market Entry', industry: 'Consumer Products / Retail' });
    await mine(ALICE, 'Army Hotel', { source: 'Booth' });
    await mine(ALICE, 'Hawaiian Smoothies', { source: null });
    await mine(ALICE, 'Something unrelated');
    await as(db, 'authenticated', ALICE);
    const rows = await review();
    expect(rows.map((r) => [r.title, r.sure, r.linked])).toEqual([
      ['Army Hotel', true, false],
      ['Hawaiian Smoothies', false, false],
    ]);
    expect(rows[0]).toMatchObject({ lib_name: 'Army Hotel', lib_book: 'Booth MCG 2026-2027', lib_case_type: 'Market Entry', lib_industry: 'Travel / Hospitality', case_type: 'Profitability' });
  });

  it('lists a linked case only while it differs from the library, and drops it once it matches', async () => {
    const hotel = await lib('Army Hotel');
    await mine(ALICE, 'Army Hotel', { source: 'Booth casebook', type: 'Profitability', industry: 'Energy / Utilities', libraryId: hotel });
    await as(db, 'authenticated', ALICE);
    expect((await review()).map((r) => [r.title, r.linked])).toEqual([['Army Hotel', true]]);
    await db.query("update public.cases set source = 'Booth MCG 2026-2027', case_type = 'Market Entry', industry = 'Travel / Hospitality'");
    expect(await review()).toEqual([]);
  });

  it("shows only the caller's own cases, and only to a verified member", async () => {
    await lib('Army Hotel');
    await mine(ALICE, 'Army Hotel', { source: 'Booth' });
    await mine(BOB, 'Army Hotel', { source: 'Booth' });
    await as(db, 'authenticated', BOB);
    expect(await review()).toHaveLength(1);
    expect(Number((await db.query<{ n: string | number }>('select count(*) as n from public.match_my_cases()')).rows[0].n)).toBe(1);
    await as(db, 'authenticated', DAVE);
    expect(await review()).toEqual([]);
    await as(db, 'anon');
    expect(await fails('select * from public.match_my_cases()')).toMatch(/permission denied/);
  });

  it('never returns our analysis, only what any member may know about the library case', async () => {
    const hotel = await lib('Army Hotel');
    await db.query("insert into public.library_case_notes (case_id, difficulty, skills, concepts, summary, strong_answer, pitfalls, confidence) values ($1, 3, '{}', '{}', 'SECRET', 'SECRET', '{}', 'high')", [hotel]);
    await mine(ALICE, 'Army Hotel', { source: 'Booth' });
    await as(db, 'authenticated', ALICE);
    expect(JSON.stringify(await review())).not.toMatch(/SECRET/);
  });
});
