// @vitest-environment node
//
// Practice requests: private to the two people, opt-in, rate limited, blockable, and reachable only through the functions,
// run against the real migrations in an in-process Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, DAVE, as, createDb, fails as failsOn, resetData } from '../test/pg';

let db: PGlite;
const fails = (sql: string, params: unknown[] = []) => failsOn(db, sql, params);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

/** Alice, Bob and Carol are listed members; Dave never verified his email. */
beforeEach(async () => {
  await resetData(db);
  await as(db, 'postgres');
  await db.query(
    `insert into public.profiles (user_id, display_name, listed) values
       ($1, 'Alice Adams', true), ($2, 'Bob Brown', true), ($3, 'Carol Chen', true)`,
    [ALICE, BOB, CAROL],
  );
});

type Req = {
  id: string;
  direction: string;
  other_id: string;
  other_name: string | null;
  case_title: string | null;
  case_book: string | null;
  when_text: string | null;
  message: string | null;
  status: string;
  reply: string | null;
  from_seen_at: Date | null;
};

const send = async (to: string, title: string | null = 'Airline profit', book: string | null = 'Cosentino', when: string | null = 'tonight 8pm', msg: string | null = 'Up for it?') =>
  (await db.query<{ send_practice_request: string }>('select public.send_practice_request($1, $2, $3, $4, $5)', [to, title, book, when, msg])).rows[0].send_practice_request;
const mine = async () => (await db.query<Req>('select * from public.my_practice_requests()')).rows;
const respond = (id: string, accept: boolean, reply: string | null = null, block = false) =>
  db.query('select public.respond_practice_request($1, $2, $3, $4)', [id, accept, reply, block]);
const sendFails = (to: string, ...rest: (string | null)[]) =>
  fails('select public.send_practice_request($1, $2, $3, $4, $5)', [to, rest[0] ?? 'x', rest[1] ?? null, rest[2] ?? null, rest[3] ?? null]);

describe('sending a request', () => {
  it('creates a waiting request that both people can see, with the other member’s name', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    const [sent] = await mine();
    expect(sent).toMatchObject({ id, direction: 'sent', other_id: BOB, other_name: 'Bob Brown', status: 'pending', case_title: 'Airline profit', case_book: 'Cosentino', when_text: 'tonight 8pm', message: 'Up for it?', reply: null });

    await as(db, 'authenticated', BOB);
    const [got] = await mine();
    expect(got).toMatchObject({ id, direction: 'received', other_id: ALICE, other_name: 'Alice Adams', status: 'pending' });
  });

  it('trims text and treats empty as not given; every part is optional', async () => {
    await as(db, 'authenticated', ALICE);
    await send(BOB, '  Airline profit  ', '   ', '', '  ');
    const [r] = await mine();
    expect(r).toMatchObject({ case_title: 'Airline profit', case_book: null, when_text: null, message: null });
    await as(db, 'authenticated', BOB);
    await send(ALICE, null, null, null, null);
    expect((await mine())[0]).toMatchObject({ case_title: null, message: null });
  });

  it('enforces the length limits', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await sendFails(BOB, 'x'.repeat(201))).toMatch(/check constraint/);
    expect(await sendFails(BOB, 'x', 'y'.repeat(101))).toMatch(/check constraint/);
    expect(await sendFails(BOB, 'x', null, 'w'.repeat(81))).toMatch(/check constraint/);
    expect(await sendFails(BOB, 'x', null, null, 'm'.repeat(281))).toMatch(/check constraint/);
    await send(BOB, 'x'.repeat(200), 'y'.repeat(100), 'w'.repeat(80), 'm'.repeat(280)); // exactly at the limits is fine
  });

  it('refuses for every reason with the same message, so nothing about the other member leaks', async () => {
    const reasons = async (to: string) => (await sendFails(to)).replace(/^.*?: /, '');
    await as(db, 'authenticated', ALICE);
    const msgs = new Set<string>();
    msgs.add(await reasons(DAVE)); // no profile at all (and unverified)
    msgs.add(await reasons('99999999-9999-4999-8999-999999999999')); // nobody
    msgs.add(await reasons(ALICE)); // yourself
    await as(db, 'postgres');
    await db.query(`update public.profiles set listed = false where user_id = $1`, [CAROL]);
    await as(db, 'authenticated', ALICE);
    msgs.add(await reasons(CAROL)); // unlisted: they chose to disappear
    expect([...msgs]).toEqual(["This member can't be asked right now."]);
  });

  it('does not let an unverified member be asked, or ask', async () => {
    await as(db, 'postgres');
    await db.query(`insert into public.profiles (user_id, display_name, listed) values ($1, 'Dave Diaz', true)`, [DAVE]);
    await as(db, 'authenticated', ALICE);
    expect(await sendFails(DAVE)).toMatch(/can't be asked right now/);
    await as(db, 'authenticated', DAVE);
    expect(await sendFails(ALICE)).toMatch(/Only verified members/);
  });

  it('needs a profile of your own, and a signed-in user', async () => {
    await as(db, 'postgres');
    await db.query('delete from public.profiles where user_id = $1', [ALICE]);
    await as(db, 'authenticated', ALICE);
    expect(await sendFails(BOB)).toMatch(/Set up your profile/);
    await as(db, 'authenticated');
    expect(await sendFails(BOB)).toMatch(/Not signed in/);
  });

  it('allows one waiting request per person, then again once it is answered', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    expect(await sendFails(BOB)).toMatch(/already have a request waiting/);
    await as(db, 'authenticated', BOB);
    await respond(id, false);
    await as(db, 'authenticated', ALICE);
    await send(BOB); // allowed again
    expect(await mine()).toHaveLength(2);
  });

  it('stops at 5 waiting requests and 20 in a day', async () => {
    await as(db, 'postgres');
    const others = ['a', 'b', 'c', 'd', 'e'].map((c) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`);
    for (const [i, id] of others.entries()) {
      await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `m${i}@example.com`]);
      await db.query(`insert into public.profiles (user_id, display_name, listed) values ($1, $2, true)`, [id, `Member ${i}`]);
    }
    await as(db, 'authenticated', ALICE);
    for (const id of others) await send(id);
    expect(await sendFails(BOB)).toMatch(/5 requests waiting/);

    // Answered requests don't count as waiting, but they still count towards the day.
    await as(db, 'postgres');
    await db.query(`update public.practice_requests set status = 'cancelled'`);
    for (let i = 0; i < 15; i++) {
      await db.query(
        `insert into public.practice_requests (from_user, to_user, status) values ($1, $2, 'declined')`,
        [ALICE, i % 2 ? BOB : CAROL],
      );
    }
    await as(db, 'authenticated', ALICE);
    expect(await sendFails(BOB)).toMatch(/lot of requests for one day/);

    // …but not forever: old ones age out of the window.
    await as(db, 'postgres');
    await db.query(`update public.practice_requests set created_at = now() - interval '25 hours'`);
    await as(db, 'authenticated', ALICE);
    await send(BOB);
  });
});

describe('answering and cancelling', () => {
  it('lets only the recipient answer, once, with an optional reply', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    expect(await fails('select public.respond_practice_request($1, true, null, false)', [id])).toMatch(/no longer waiting/); // the sender can't answer their own
    await as(db, 'authenticated', CAROL);
    expect(await fails('select public.respond_practice_request($1, true, null, false)', [id])).toMatch(/no longer waiting/); // a bystander can't either
    await as(db, 'authenticated', BOB);
    await respond(id, true, '  Zoom: example.com/room  ');
    expect((await mine())[0]).toMatchObject({ status: 'accepted', reply: 'Zoom: example.com/room' });
    expect(await fails('select public.respond_practice_request($1, false, null, false)', [id])).toMatch(/no longer waiting/);
  });

  it('keeps a reply to 280 characters', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    await as(db, 'authenticated', BOB);
    expect(await fails('select public.respond_practice_request($1, true, $2, false)', [id, 'r'.repeat(281)])).toMatch(/check constraint/);
    await respond(id, true, 'r'.repeat(280));
  });

  it('declining with "don’t let them ask again" blocks them, silently, until you unblock', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    await as(db, 'authenticated', BOB);
    await respond(id, false, null, true);
    expect((await db.query<{ user_id: string; display_name: string }>('select * from public.my_practice_blocks()')).rows).toMatchObject([{ user_id: ALICE, display_name: 'Alice Adams' }]);

    await as(db, 'authenticated', ALICE);
    expect(await sendFails(BOB)).toMatch(/can't be asked right now/); // same words as any other refusal
    expect((await mine())[0]).toMatchObject({ status: 'declined' });

    await as(db, 'authenticated', BOB);
    await db.query('select public.unblock_practice_asker($1)', [ALICE]);
    expect((await db.query('select * from public.my_practice_blocks()')).rows).toEqual([]);
    await as(db, 'authenticated', ALICE);
    await send(BOB);
  });

  it('ignores "block" when you accept, and a block only ever protects the person who made it', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    await as(db, 'authenticated', BOB);
    await respond(id, true, null, true);
    expect((await db.query('select * from public.my_practice_blocks()')).rows).toEqual([]);

    // Bob blocking Alice doesn't stop Bob asking Alice.
    const id2 = await (async () => {
      await as(db, 'authenticated', ALICE);
      return send(BOB);
    })();
    await as(db, 'authenticated', BOB);
    await respond(id2, false, null, true);
    await send(ALICE);
  });

  it('lets only the sender cancel, and only while it is waiting', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    await as(db, 'authenticated', BOB);
    expect(await fails('select public.cancel_practice_request($1)', [id])).toMatch(/no longer waiting/);
    await as(db, 'authenticated', ALICE);
    await db.query('select public.cancel_practice_request($1)', [id]);
    expect((await mine())[0].status).toBe('cancelled');
    expect(await fails('select public.cancel_practice_request($1)', [id])).toMatch(/no longer waiting/);
    await as(db, 'authenticated', BOB);
    expect(await fails('select public.respond_practice_request($1, true, null, false)', [id])).toMatch(/no longer waiting/);
  });

  it('marks answers as seen for the sender only', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    await as(db, 'authenticated', BOB);
    await respond(id, true);
    await db.query('select public.mark_practice_answers_seen()'); // the recipient has nothing of their own to mark
    await as(db, 'authenticated', ALICE);
    expect((await mine())[0].from_seen_at).toBeNull();
    await db.query('select public.mark_practice_answers_seen()');
    expect((await mine())[0].from_seen_at).toBeInstanceOf(Date);
  });
});

describe('privacy and access', () => {
  it('shows a request to nobody but the two people in it', async () => {
    await as(db, 'authenticated', ALICE);
    await send(BOB);
    await as(db, 'authenticated', CAROL);
    expect(await mine()).toEqual([]);
  });

  it('has no direct table access for anyone: not even the two people, not visitors', async () => {
    await as(db, 'authenticated', ALICE);
    await send(BOB);
    for (const role of ['authenticated', 'anon'] as const) {
      await as(db, role, role === 'anon' ? undefined : ALICE);
      for (const table of ['practice_requests', 'practice_blocks']) {
        expect(await fails(`select * from public.${table}`), `${role} select ${table}`).toMatch(/permission denied/);
        expect(await fails(`delete from public.${table}`), `${role} delete ${table}`).toMatch(/permission denied/);
      }
      expect(await fails(`insert into public.practice_requests (from_user, to_user) values ($1, $2)`, [ALICE, CAROL])).toMatch(/permission denied/);
      expect(await fails(`update public.practice_requests set status = 'accepted'`)).toMatch(/permission denied/);
    }
  });

  it('gives visitors no way to call anything', async () => {
    await as(db, 'anon');
    for (const call of [
      `select public.send_practice_request('${BOB}', 'x', null, null, null)`,
      `select * from public.my_practice_requests()`,
      `select * from public.my_practice_blocks()`,
      `select public.mark_practice_answers_seen()`,
      `select public.cancel_practice_request('${BOB}')`,
      `select public.respond_practice_request('${BOB}', true, null, false)`,
      `select public.unblock_practice_asker('${BOB}')`,
    ]) {
      expect(await fails(call), call).toMatch(/permission denied/);
    }
    await as(db, 'authenticated', ALICE);
    expect(await fails(`select public._clean('x')`)).toMatch(/permission denied/); // the helper is internal
  });

  it('is deleted with the accounts', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    await as(db, 'authenticated', BOB);
    await respond(id, false, null, true);
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    const left = await db.query('select (select count(*) from public.practice_requests) as r, (select count(*) from public.practice_blocks) as b');
    expect(left.rows[0]).toEqual({ r: 0, b: 0 });
  });

  it('holds no email address anywhere', async () => {
    await as(db, 'postgres');
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name in ('practice_requests', 'practice_blocks')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.column_name).filter((c) => /mail/.test(c))).toEqual([]);
  });

  it('is open to every listed, verified member with nothing to switch on, even a brand-new profile', async () => {
    await as(db, 'postgres');
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ('55555555-5555-4555-8555-555555555555', 'new@example.com', now())`);
    await db.query(`insert into public.profiles (user_id, display_name) values ('55555555-5555-4555-8555-555555555555', 'New Member')`);
    await as(db, 'authenticated', ALICE);
    await send('55555555-5555-4555-8555-555555555555');
    await send(CAROL);
    expect(await mine()).toHaveLength(2);
  });

  it('can still be answered after the recipient stops appearing in People, but no new ones can be sent to them', async () => {
    await as(db, 'authenticated', ALICE);
    const id = await send(BOB);
    await as(db, 'postgres');
    await db.query(`update public.profiles set listed = false where user_id = $1`, [BOB]);
    await as(db, 'authenticated', BOB);
    await respond(id, true); // still answerable
    await as(db, 'authenticated', ALICE);
    expect(await sendFails(BOB)).toMatch(/can't be asked right now/); // but no new ones
  });
});
