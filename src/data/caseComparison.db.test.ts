// @vitest-environment node
//
// The stored comparison of a member's feedback with a casebook case: private to its owner, written only by the Edge Function (service
// role), gone with the case. And the part that makes it safe: our analysis reaches the function only for a case the member logged.
// Run against the real migrations in an in-process Postgres.
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
  await as(db, 'postgres');
  await db.exec('truncate public.library_cases cascade');
});

const libraryCase = async () => {
  const { rows } = await db.query<{ id: string }>("insert into public.library_cases (book, school, year, name, case_type, industry) values ('Booth MCG 2026-2027', 'Booth', 2026, 'Army Hotel', 'Profitability', 'Other') returning id");
  await db.query(
    `insert into public.library_case_notes (case_id, difficulty, skills, concepts, summary, strong_answer, pitfalls, confidence)
     values ($1, 3, array['quant','framework'], array['x'], 'S', 'SECRET STRONG ANSWER', array['p'], 'high')`,
    [rows[0].id],
  );
  return rows[0].id;
};
const logCase = async (uid: string, libraryId: string | null) =>
  (await db.query<{ id: string }>("insert into public.cases (user_id, case_date, title, case_type, library_id) values ($1, '2026-10-10', 'Mine', 'Profitability', $2) returning id", [uid, libraryId])).rows[0].id;
const put = (caseId: string, uid: string) =>
  db.query("insert into public.case_comparisons (case_id, user_id, input_hash, result, model) values ($1, $2, 'abcdef1234567890', '{\"summary\":\"s\"}', 'm')", [caseId, uid]);
const visible = async () => (await db.query<{ case_id: string }>('select case_id from public.case_comparisons')).rows.map((r) => r.case_id);

describe('the stored comparison', () => {
  it('can be read by its owner and by nobody else', async () => {
    const id = await logCase(ALICE, null);
    await put(id, ALICE);
    await as(db, 'authenticated', ALICE);
    expect(await visible()).toEqual([id]);
    await as(db, 'authenticated', BOB);
    expect(await visible()).toEqual([]);
    await as(db, 'anon');
    expect(await fails('select * from public.case_comparisons')).toMatch(/permission denied/);
  });

  it('cannot be written, changed or removed by a member', async () => {
    const id = await logCase(ALICE, null);
    await put(id, ALICE);
    await as(db, 'authenticated', ALICE);
    expect(await fails(`insert into public.case_comparisons (case_id, user_id, input_hash, result, model) values ('${id}', '${ALICE}', 'abcdef1234567890', '{}', 'm')`)).toMatch(/permission denied/);
    expect(await fails("update public.case_comparisons set updated_at = '2000-01-01'")).toMatch(/permission denied/);
    expect(await fails('delete from public.case_comparisons')).toMatch(/permission denied/);
  });

  it('holds one row per case, and goes when the case does', async () => {
    const id = await logCase(ALICE, null);
    await put(id, ALICE);
    expect(await fails(`insert into public.case_comparisons (case_id, user_id, input_hash, result, model) values ('${id}', '${ALICE}', 'abcdef1234567890', '{}', 'm')`)).toMatch(/duplicate key/);
    await db.query('delete from public.cases where id = $1', [id]);
    expect(await visible()).toEqual([]);
  });
});

describe('what the comparison is allowed to read about the library case', () => {
  it('is our analysis only for a member who logged that case, which is how the function gets it (with the member\'s own token)', async () => {
    const lib = await libraryCase();
    await logCase(ALICE, lib);
    const notes = async () => (await db.query<{ strong_answer: string }>('select * from public.library_notes_for($1)', [lib])).rows;
    await as(db, 'authenticated', ALICE);
    expect((await notes())[0].strong_answer).toBe('SECRET STRONG ANSWER');
    await as(db, 'authenticated', BOB); // has not done it
    expect(await notes()).toEqual([]);
  });
});
