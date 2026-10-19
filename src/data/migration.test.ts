// @vitest-environment node
//
// The personal-data schema: constraints and row level security on `cases` and `opportunities`,
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

const insertCase = (title = 'Airline profitability') =>
  db.query(`insert into public.cases (title, case_type) values ($1, 'Profitability') returning *`, [title]);

describe('cases table', () => {
  it('stores a case with only the required fields; everything optional stays null', async () => {
    await as(db, 'authenticated', ALICE);
    const { rows } = await insertCase();
    const row = rows[0] as Record<string, unknown>;
    expect(row.user_id).toBe(ALICE); // defaulted from auth.uid(), never sent by the client
    expect(row.overall).toBeNull();
    for (const col of ['source', 'industry', 'partner', 'overall_feedback', 'went_well', 'struggled', 'concepts', 'next_focus', 'improvement_area', 'other_notes']) {
      expect(row[col], col).toBeNull();
    }
    expect(row.skills).toEqual({});
    expect(row.share_mode).toBe('profile'); // sharing is opt-in
    expect(row.case_date).toBeInstanceOf(Date);
  });

  it('round-trips skills jsonb exactly, including unrated skills', async () => {
    await as(db, 'authenticated', ALICE);
    const skills = { framework: { rating: 4, feedback: 'MECE' }, quant: { rating: null, feedback: '' } };
    await db.query(`insert into public.cases (title, case_type, skills) values ('x', 'Revenue', $1::jsonb)`, [JSON.stringify(skills)]);
    const { rows } = await db.query<{ skills: unknown }>('select skills from public.cases');
    expect(rows[0].skills).toEqual(skills);
  });

  it('enforces the data rules the app relies on', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails(`insert into public.cases (title, case_type, overall) values ('x', 'Revenue', 6)`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type, overall) values ('x', 'Revenue', 0)`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type) values ('x', 'Not a type')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type) values ('   ', 'Revenue')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type, improvement_area) values ('x', 'Revenue', 'nope')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type, skills) values ('x', 'Revenue', '[]')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type, share_mode) values ('x', 'Revenue', 'everyone')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (case_type) values ('Revenue')`)).toMatch(/null value/);
    for (const overall of [1, 5]) {
      expect(await fails(`insert into public.cases (title, case_type, overall) values ('ok', 'Revenue', ${overall})`)).toBe('');
    }
  });
});

describe('row level security on personal data', () => {
  it('lets a user read, edit and delete their own cases', async () => {
    await as(db, 'authenticated', ALICE);
    const { rows } = await insertCase('Mine');
    const id = (rows[0] as { id: string }).id;
    expect((await db.query('select * from public.cases')).rows).toHaveLength(1);
    const upd = await db.query(`update public.cases set title = 'Renamed' where id = $1 returning title`, [id]);
    expect(upd.rows).toEqual([{ title: 'Renamed' }]);
    const del = await db.query('delete from public.cases where id = $1 returning id', [id]);
    expect(del.rows).toHaveLength(1);
  });

  it("hides one user's cases from another and blocks edits and deletes", async () => {
    await as(db, 'authenticated', ALICE);
    const { rows } = await insertCase("Alice's case");
    const id = (rows[0] as { id: string }).id;

    await as(db, 'authenticated', BOB);
    expect((await db.query('select * from public.cases')).rows).toEqual([]);
    expect((await db.query(`update public.cases set title = 'hacked' where id = $1 returning id`, [id])).rows).toEqual([]);
    expect((await db.query('delete from public.cases where id = $1 returning id', [id])).rows).toEqual([]);

    await as(db, 'postgres');
    const { rows: still } = await db.query<{ title: string }>('select title from public.cases');
    expect(still).toEqual([{ title: "Alice's case" }]); // untouched
  });

  it('refuses to insert a row for someone else, or to hand a row to someone else', async () => {
    await as(db, 'authenticated', BOB);
    expect(await fails(`insert into public.cases (user_id, title, case_type) values ($1, 'forged', 'Revenue')`, [ALICE])).toMatch(/row-level security/);

    const { rows } = await insertCase("Bob's case");
    const id = (rows[0] as { id: string }).id;
    expect(await fails('update public.cases set user_id = $1 where id = $2', [ALICE, id])).toMatch(/row-level security/);
  });

  it('gives the anonymous role no access at all', async () => {
    await as(db, 'authenticated', ALICE);
    await insertCase();
    await db.query(`insert into public.opportunities (kind, text) values ('skill', 'Mental math')`);

    await as(db, 'anon');
    expect(await fails('select * from public.cases')).toMatch(/permission denied/);
    expect(await fails(`insert into public.cases (title, case_type) values ('x', 'Revenue')`)).toMatch(/permission denied/);
    expect(await fails('select * from public.opportunities')).toMatch(/permission denied/);
  });

  it('rejects writes from a session with no signed-in user', async () => {
    await as(db, 'authenticated'); // role without a user id in the token
    expect(await fails(`insert into public.cases (title, case_type) values ('x', 'Revenue')`)).toMatch(/null value|row-level security/);
    expect((await db.query('select * from public.cases')).rows).toEqual([]);
  });
});

describe('opportunities table', () => {
  it('stores and isolates the hand-edited lists', async () => {
    await as(db, 'authenticated', ALICE);
    await db.query(`insert into public.opportunities (kind, text) values ('exposure', 'Pricing cases'), ('skill', 'Mental math')`);
    expect((await db.query('select * from public.opportunities')).rows).toHaveLength(2);

    await as(db, 'authenticated', BOB);
    expect((await db.query('select * from public.opportunities')).rows).toEqual([]);
    expect(await fails(`insert into public.opportunities (user_id, kind, text) values ($1, 'skill', 'forged')`, [ALICE])).toMatch(/row-level security/);
  });

  it('validates kind and text', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails(`insert into public.opportunities (kind, text) values ('other', 'x')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.opportunities (kind, text) values ('skill', '  ')`)).toMatch(/check constraint/);
  });
});

describe('account deletion', () => {
  it("removes a user's data when the user is deleted", async () => {
    await as(db, 'authenticated', ALICE);
    await insertCase();
    await db.query(`insert into public.opportunities (kind, text) values ('skill', 'x')`);
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    expect((await db.query('select * from public.cases')).rows).toEqual([]);
    expect((await db.query('select * from public.opportunities')).rows).toEqual([]);
  });
});
