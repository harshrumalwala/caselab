// @vitest-environment node
//
// The email notification settings: private to the member, on by default, and the "already emailed" markers the sending function uses,
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
  await as(db, 'postgres');
  await db.query(`insert into public.profiles (user_id, display_name, listed) values ($1, 'Alice Adams', true), ($2, 'Bob Brown', true)`, [ALICE, BOB]);
});

const mine = async () => (await db.query<{ user_id: string; email_requests: boolean }>('select user_id, email_requests from public.notification_settings')).rows;

describe('the email setting', () => {
  it('has no row until a member chooses, and a new row means on', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await mine()).toEqual([]); // no row: the app treats that as on
    await db.query('insert into public.notification_settings default values');
    expect(await mine()).toEqual([{ user_id: ALICE, email_requests: true }]); // owned by you, on by default
  });

  it('lets a member turn it off and on again, and keeps one row each', async () => {
    await as(db, 'authenticated', ALICE);
    const save = (on: boolean) =>
      db.query('insert into public.notification_settings (email_requests) values ($1) on conflict (user_id) do update set email_requests = excluded.email_requests, updated_at = now()', [on]);
    await save(false);
    expect((await mine())[0].email_requests).toBe(false);
    await save(true);
    expect(await mine()).toEqual([{ user_id: ALICE, email_requests: true }]);
  });

  it('is private: nobody reads or changes anyone else\'s choice', async () => {
    await as(db, 'authenticated', ALICE);
    await db.query('insert into public.notification_settings (email_requests) values (false)');
    await as(db, 'authenticated', BOB);
    expect(await mine()).toEqual([]); // Bob can't see Alice's
    expect(await fails('insert into public.notification_settings (user_id, email_requests) values ($1, true)', [ALICE])).toMatch(/row-level security/);
    await db.query('update public.notification_settings set email_requests = true'); // matches no row of his
    await as(db, 'postgres');
    expect((await db.query<{ email_requests: boolean }>('select email_requests from public.notification_settings where user_id = $1', [ALICE])).rows[0].email_requests).toBe(false);
  });

  it('can\'t be deleted by the member, can\'t be read by visitors, and goes with the account', async () => {
    await as(db, 'authenticated', ALICE);
    await db.query('insert into public.notification_settings (email_requests) values (false)');
    expect(await fails('delete from public.notification_settings')).toMatch(/permission denied/);
    await as(db, 'anon');
    expect(await fails('select * from public.notification_settings')).toMatch(/permission denied/);
    expect(await fails('insert into public.notification_settings (user_id) values (gen_random_uuid())')).toMatch(/permission denied/);
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    expect((await db.query('select * from public.notification_settings')).rows).toEqual([]);
  });

  it('is not part of the profile, so other members who can read profiles can\'t learn it', async () => {
    await as(db, 'postgres');
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name in ('profiles', 'public_profiles', 'shared_cases')`,
    );
    expect(rows.map((r) => r.column_name).filter((c) => /email|notif/.test(c))).toEqual([]);
  });
});

describe('the "already emailed" markers on requests', () => {
  async function aRequest() {
    await as(db, 'authenticated', ALICE);
    const id = (await db.query<{ send_practice_request: string }>('select public.send_practice_request($1, null, null, null, $2)', [BOB, 'Up for it?'])).rows[0].send_practice_request;
    return id;
  }

  it('start empty, and can be claimed once, so a request is emailed about once however often the function runs', async () => {
    const id = await aRequest();
    await as(db, 'postgres'); // the function runs with the service role, which bypasses the member-facing limits
    const claim = () => db.query<{ id: string }>('update public.practice_requests set emailed_at = now() where id = $1 and emailed_at is null returning id', [id]);
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
    expect((await db.query<{ answer_emailed_at: Date | null }>('select answer_emailed_at from public.practice_requests where id = $1', [id])).rows[0].answer_emailed_at).toBeNull();
  });

  it('are invisible to members: the table is closed, and the list of your requests doesn\'t carry them', async () => {
    await aRequest();
    expect(await fails('select emailed_at from public.practice_requests')).toMatch(/permission denied/);
    const { rows } = await db.query<Record<string, unknown>>('select * from public.my_practice_requests()');
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).filter((k) => /email/.test(k))).toEqual([]);
  });
});
