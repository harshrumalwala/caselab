// @vitest-environment node
//
// A member deleting their own account: only themselves, only with the confirmation word, and everything they own goes with them,
// run against the real migrations in an in-process Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, as, createDb, fails as failsOn, resetData } from '../test/pg';

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
  await db.query(
    `insert into public.profiles (user_id, display_name, listed, public_profile, share_cases) values
       ($1, 'Alice Adams', true, true, true), ($2, 'Bob Brown', true, false, true), ($3, 'Carol Chen', true, false, false)`,
    [ALICE, BOB, CAROL],
  );
});

const del = (confirm: string | null = 'DELETE') => db.query('select public.delete_my_account($1)', [confirm]);
const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: string }>(`select count(*) as n from ${sql}`, params)).rows[0].n);

/** Alice has something in every place a member can have something, and so does Bob. */
async function fillIn() {
  await as(db, 'authenticated', ALICE);
  await db.query(`insert into public.cases (title, case_type, share_mode) values ('Alice case', 'Profitability', 'full')`);
  await db.query(`insert into public.opportunities (kind, text) values ('skill', 'Quant')`);
  await db.query('insert into public.weekly_goal (goal) values (3)');
  await db.query('select * from public.record_warmup_best(120, 7)');
  const asked = (await db.query<{ send_practice_request: string }>('select public.send_practice_request($1, null, null, null, $2)', [BOB, 'Up for it?'])).rows[0].send_practice_request;
  await db.query('select public.block_member($1)', [CAROL]);
  await as(db, 'authenticated', BOB);
  await db.query(`insert into public.cases (title, case_type) values ('Bob case', 'Revenue')`);
  await db.query('insert into public.weekly_goal (goal) values (5)');
  await db.query('select public.respond_practice_request($1, true, $2, false)', [asked, 'Yes']); // opens a conversation
  const conversation = (await db.query<{ id: string }>('select id from public.my_conversations()')).rows[0].id;
  await db.query('select public.send_message($1, $2)', [conversation, 'See you at 8']);
  await db.query('select public.report_conversation($1, $2, false)', [conversation, 'Pushy']); // Bob reports the conversation with Alice
}

const aliceRows = async () => {
  await as(db, 'postgres');
  return {
    login: await count('auth.users where id = $1', [ALICE]),
    profile: await count('public.profiles where user_id = $1', [ALICE]),
    publicProfile: await count('public.public_profiles where user_id = $1', [ALICE]),
    cases: await count('public.cases where user_id = $1', [ALICE]),
    shared: await count('public.shared_cases where owner_id = $1', [ALICE]),
    publicShared: await count('public.public_shared_cases where owner_id = $1', [ALICE]),
    lists: await count('public.opportunities where user_id = $1', [ALICE]),
    goal: await count('public.weekly_goal where user_id = $1', [ALICE]),
    warmup: await count('public.warmup_best where user_id = $1', [ALICE]),
    requests: await count('public.practice_requests where from_user = $1 or to_user = $1', [ALICE]),
    blocks: await count('public.practice_blocks where blocker = $1 or blocked = $1', [ALICE]),
    conversations: await count('public.conversations where user_lo = $1 or user_hi = $1', [ALICE]),
    members: await count('public.conversation_members where user_id = $1', [ALICE]),
    messages: await count('public.messages where sender = $1', [ALICE]),
  };
};

describe('deleting your own account', () => {
  it('removes the login and everything the member owns, in every table', async () => {
    await fillIn();
    const before = await aliceRows();
    // Sanity: Alice really did have something everywhere, so the test would notice if a table were missed.
    for (const [place, n] of Object.entries(before)) expect(n, place).toBeGreaterThan(0);

    await as(db, 'authenticated', ALICE);
    await del();

    const after = await aliceRows();
    for (const [place, n] of Object.entries(after)) expect(n, place).toBe(0);
  });

  it('takes the conversations with it, for the other person too, and the requests between them', async () => {
    await fillIn();
    await as(db, 'authenticated', ALICE);
    await del();
    await as(db, 'authenticated', BOB);
    expect((await db.query('select * from public.my_conversations()')).rows).toEqual([]);
    expect((await db.query('select * from public.my_practice_requests()')).rows).toEqual([]);
    await as(db, 'postgres'); // the tables themselves are closed to members
    expect(await count('public.messages')).toBe(0);
  });

  it('leaves everyone else exactly as they were', async () => {
    await fillIn();
    await as(db, 'authenticated', ALICE);
    await del();
    await as(db, 'postgres');
    expect(await count('auth.users')).toBe(3); // Bob, Carol, Dave
    expect(await count('public.profiles where user_id = $1', [BOB])).toBe(1);
    expect(await count('public.profiles where user_id = $1', [CAROL])).toBe(1);
    expect(await count('public.cases where user_id = $1', [BOB])).toBe(1);
    expect(await count('public.weekly_goal where user_id = $1', [BOB])).toBe(1);
    expect(await count('public.shared_cases where owner_id = $1', [BOB])).toBe(1);
  });

  it('keeps a report, without the link to the person who deleted their account', async () => {
    await fillIn();
    await as(db, 'authenticated', ALICE);
    await del();
    await as(db, 'postgres');
    const { rows } = await db.query<{ reporter: string | null; reported: string | null; reason: string; snapshot: { body: string }[] }>('select * from public.message_reports');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reporter: BOB, reported: null, reason: 'Pushy' }); // Alice was the one reported
    expect(rows[0].snapshot.map((m) => m.body)).toContain('See you at 8'); // the evidence stays
  });

  it('also keeps the report when the reporter is the one who leaves', async () => {
    await fillIn();
    await as(db, 'authenticated', BOB);
    await del();
    await as(db, 'postgres');
    const { rows } = await db.query<{ reporter: string | null; reported: string | null }>('select reporter, reported from public.message_reports');
    expect(rows).toEqual([{ reporter: null, reported: ALICE }]);
  });
});

describe('who can do it, and how', () => {
  it('needs the confirmation word exactly, and deletes nothing otherwise', async () => {
    await as(db, 'authenticated', ALICE);
    for (const wrong of [null, '', 'delete', 'Delete', 'DELETE ', 'yes']) {
      expect(await fails('select public.delete_my_account($1)', [wrong]), String(wrong)).toMatch(/Type DELETE to confirm/);
    }
    await as(db, 'postgres');
    expect(await count('auth.users where id = $1', [ALICE])).toBe(1);
    expect(await count('public.profiles where user_id = $1', [ALICE])).toBe(1);
  });

  it('acts only on the caller: it takes no user id, so nobody can delete anyone else', async () => {
    await as(db, 'authenticated', CAROL);
    await del();
    await as(db, 'postgres');
    expect(await count('auth.users where id = $1', [CAROL])).toBe(0);
    expect(await count('auth.users where id = any($1::uuid[])', [[ALICE, BOB]])).toBe(2);
    const { rows } = await db.query<{ args: string }>(`select pg_get_function_arguments(p.oid) as args from pg_proc p where p.proname = 'delete_my_account'`);
    expect(rows[0].args).toBe('p_confirm text');
  });

  it('refuses when nobody is signed in, and visitors cannot call it at all', async () => {
    await as(db, 'authenticated'); // a role, but no user
    expect(await fails(`select public.delete_my_account('DELETE')`)).toMatch(/Not signed in/);
    await as(db, 'anon');
    expect(await fails(`select public.delete_my_account('DELETE')`)).toMatch(/permission denied/);
    await as(db, 'postgres');
    expect(await count('auth.users')).toBe(4);
  });

  it('cannot be undone, and a second call has nothing to delete', async () => {
    await as(db, 'authenticated', ALICE);
    await del();
    await del(); // the login is already gone: nothing happens, and nothing breaks
    await as(db, 'postgres');
    expect(await count('auth.users where id = $1', [ALICE])).toBe(0);
  });
});
