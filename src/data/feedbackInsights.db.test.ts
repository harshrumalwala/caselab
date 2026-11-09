// @vitest-environment node
//
// The stored Coach's read: private to its owner, and written only by the Edge Function (service role), never by a member. Run
// against the real migrations in an in-process Postgres.
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

const put = (uid: string, extra = '') =>
  db.query(
    `insert into public.feedback_insights (user_id, scope, case_count, input_hash, result, model ${extra ? ', ' + extra.split('=')[0] : ''})
     values ($1, 'recent', 5, 'abcdef1234567890', '{"summary":"s","strengths":[],"focus":[]}', 'claude-opus-5-5' ${extra ? ', ' + extra.split('=')[1] : ''})`,
    [uid],
  );
const rows = async () => (await db.query<{ user_id: string }>('select user_id from public.feedback_insights')).rows.map((r) => r.user_id);

describe("the stored Coach's read", () => {
  it('can be read by its owner and by nobody else', async () => {
    await as(db, 'postgres');
    await put(ALICE);
    await as(db, 'authenticated', ALICE);
    expect(await rows()).toEqual([ALICE]);
    await as(db, 'authenticated', BOB);
    expect(await rows()).toEqual([]);
    await as(db, 'anon');
    expect(await fails('select * from public.feedback_insights')).toMatch(/permission denied/);
  });

  it('cannot be written, changed or removed by a member, so nobody can plant an answer or reset their own limit', async () => {
    await as(db, 'postgres');
    await put(ALICE);
    await as(db, 'authenticated', ALICE);
    expect(await fails(`insert into public.feedback_insights (user_id, scope, case_count, input_hash, result, model) values ('${BOB}', 'recent', 1, 'abcdef1234567890', '{}', 'm')`)).toMatch(/permission denied/);
    expect(await fails("update public.feedback_insights set updated_at = '2000-01-01'")).toMatch(/permission denied/);
    expect(await fails('delete from public.feedback_insights')).toMatch(/permission denied/);
    await as(db, 'anon');
    expect(await fails(`insert into public.feedback_insights (user_id, scope, case_count, input_hash, result, model) values ('${ALICE}', 'recent', 1, 'abcdef1234567890', '{}', 'm')`)).toMatch(/permission denied/);
  });

  it('holds one row per member and refuses an odd scope, an empty fingerprint or a silly case count', async () => {
    await as(db, 'postgres');
    await put(ALICE);
    expect(await fails(`insert into public.feedback_insights (user_id, scope, case_count, input_hash, result, model) values ('${ALICE}', 'recent', 1, 'abcdef1234567890', '{}', 'm')`)).toMatch(/duplicate key/);
    expect(await fails(`insert into public.feedback_insights (user_id, scope, case_count, input_hash, result, model) values ('${BOB}', 'weekly', 1, 'abcdef1234567890', '{}', 'm')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.feedback_insights (user_id, scope, case_count, input_hash, result, model) values ('${BOB}', 'all', 1, 'x', '{}', 'm')`)).toMatch(/check constraint/);
    expect(await fails(`insert into public.feedback_insights (user_id, scope, case_count, input_hash, result, model) values ('${BOB}', 'all', 500, 'abcdef1234567890', '{}', 'm')`)).toMatch(/check constraint/);
  });

  it('goes with the account', async () => {
    await as(db, 'postgres');
    await put(ALICE);
    await db.query('delete from auth.users where id = $1', [ALICE]);
    expect(await rows()).toEqual([]);
  });
});
