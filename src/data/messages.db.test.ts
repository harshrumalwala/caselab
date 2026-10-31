// @vitest-environment node
//
// Messages: only between two people who agreed to case, private to them, closed to direct access, rate limited,
// blockable and reportable, run against the real migrations in an in-process Postgres.
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

/** Alice, Bob and Carol are listed and open to requests. */
beforeEach(async () => {
  await resetData(db);
  await as(db, 'postgres');
  await db.query(
    `insert into public.profiles (user_id, display_name, listed, open_to_requests) values
       ($1, 'Alice Adams', true, true), ($2, 'Bob Brown', true, true), ($3, 'Carol Chen', true, true)`,
    [ALICE, BOB, CAROL],
  );
});

type Conv = {
  id: string;
  other_id: string;
  other_name: string | null;
  last_body: string | null;
  last_deleted: boolean;
  last_mine: boolean;
  unread: number;
  muted: boolean;
  archived: boolean;
  blocked: boolean;
};
type Msg = { id: string; mine: boolean; body: string; created_at: Date; deleted: boolean };

const conversations = async () => (await db.query<Conv>('select * from public.my_conversations()')).rows;
const messages = async (id: string) => (await db.query<Msg>('select * from public.conversation_messages($1)', [id])).rows;
const say = async (id: string, body: string | null) => (await db.query<{ send_message: string }>('select public.send_message($1, $2)', [id, body])).rows[0].send_message;

/** Alice asks Bob, Bob accepts: that opens the conversation. Returns its id (as seen by whoever is signed in next). */
async function agree(from = ALICE, to = BOB, ask: [string | null, string | null, string | null, string | null] = ['Airline profit', 'Cosentino', 'tonight', 'Up for it?'], reply: string | null = 'Zoom: example.com') {
  await as(db, 'authenticated', from);
  const sent = await db.query<{ send_practice_request: string }>('select public.send_practice_request($1, $2, $3, $4, $5)', [to, ...ask]);
  await as(db, 'authenticated', to);
  await db.query('select public.respond_practice_request($1, true, $2, false)', [sent.rows[0].send_practice_request, reply]);
  return (await conversations())[0]?.id as string;
}

describe('starting a conversation', () => {
  it('opens only when a request is accepted, seeded with the proposal and note, then the reply', async () => {
    const id = await agree();
    expect(id).toBeTruthy();
    const list = await messages(id);
    expect(list.map((m) => [m.mine, m.body])).toEqual([
      [false, 'Airline profit (Cosentino) · tonight\nUp for it?'], // from Alice, seen by Bob
      [true, 'Zoom: example.com'],
    ]);
    expect(list.every((m) => !m.deleted)).toBe(true);
  });

  it("shows the person who asked one unread message (the reply) and the one who accepted none", async () => {
    await agree();
    expect((await conversations())[0]).toMatchObject({ other_id: ALICE, other_name: 'Alice Adams', unread: 0, last_mine: true, muted: false, archived: false, blocked: false });
    await as(db, 'authenticated', ALICE);
    expect((await conversations())[0]).toMatchObject({ other_id: BOB, other_name: 'Bob Brown', unread: 1, last_body: 'Zoom: example.com', last_mine: false });
  });

  it('is not opened by declining, and a request with no note or reply opens an empty conversation', async () => {
    await as(db, 'authenticated', ALICE);
    const r = (await db.query<{ send_practice_request: string }>('select public.send_practice_request($1, null, null, null, null)', [BOB])).rows[0].send_practice_request;
    await as(db, 'authenticated', BOB);
    await db.query('select public.respond_practice_request($1, false, null, false)', [r]);
    expect(await conversations()).toEqual([]);

    await as(db, 'authenticated', ALICE);
    const r2 = (await db.query<{ send_practice_request: string }>('select public.send_practice_request($1, null, null, null, null)', [BOB])).rows[0].send_practice_request;
    await as(db, 'authenticated', BOB);
    await db.query('select public.respond_practice_request($1, true, null, false)', [r2]);
    const [c] = await conversations();
    expect(c.last_body).toBeNull();
    expect(await messages(c.id)).toEqual([]);
  });

  it('reuses the same conversation for the same pair', async () => {
    const first = await agree();
    const again = await agree(BOB, ALICE, [null, null, null, 'Round two?'], null);
    expect(again).toBe(first);
    expect(await conversations()).toHaveLength(1);
    expect((await messages(first)).at(-1)!.body).toBe('Round two?');
  });

  it('cannot be started by hand: no function creates a conversation except accepting a request', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails(`select public._start_conversation($1, $2)`, [ALICE, CAROL])).toMatch(/permission denied/);
    expect(await fails(`insert into public.conversations (user_lo, user_hi) values ($1, $2)`, [ALICE, CAROL])).toMatch(/permission denied/);
    expect(await conversations()).toEqual([]);
  });
});

describe('sending and reading', () => {
  it('lets both people write, trims, and refuses empty and over-long messages', async () => {
    const id = await agree();
    await say(id, '  See you at 8  ');
    await as(db, 'authenticated', ALICE);
    await say(id, 'Great');
    expect((await messages(id)).slice(-2).map((m) => [m.mine, m.body])).toEqual([[false, 'See you at 8'], [true, 'Great']]);
    expect(await fails('select public.send_message($1, $2)', [id, '   '])).toMatch(/Write a message first/);
    expect(await fails('select public.send_message($1, null)', [id])).toMatch(/Write a message first/);
    expect(await fails('select public.send_message($1, $2)', [id, 'x'.repeat(1001)])).toMatch(/check constraint/);
    await say(id, 'x'.repeat(1000));
  });

  it('counts unread, marks read, and counts only the other person’s messages', async () => {
    const id = await agree();
    await as(db, 'authenticated', ALICE);
    await db.query('select public.mark_conversation_read($1)', [id]);
    expect((await conversations())[0].unread).toBe(0);
    await as(db, 'authenticated', BOB);
    await say(id, 'one');
    await say(id, 'two');
    expect((await conversations())[0].unread).toBe(0); // your own messages never count
    await as(db, 'authenticated', ALICE);
    expect((await conversations())[0].unread).toBe(2);
    await db.query('select public.mark_conversation_read($1)', [id]);
    expect((await conversations())[0].unread).toBe(0);
  });

  it('returns the latest 200 messages, oldest first', async () => {
    const id = await agree();
    await as(db, 'postgres');
    await db.query(
      `insert into public.messages (conversation_id, sender, body, created_at)
       select $1, $2, 'm' || g, now() - interval '1 hour' + g * interval '1 second' from generate_series(1, 205) g`,
      [id, BOB],
    );
    await as(db, 'authenticated', BOB);
    const list = await messages(id);
    expect(list).toHaveLength(200);
    expect(list.at(-1)!.body).toBe('Zoom: example.com'); // the newest is still the seeded reply
    expect(list[0].body).not.toBe('m1');
    expect(list.map((m) => m.created_at.getTime())).toEqual([...list.map((m) => m.created_at.getTime())].sort((a, b) => a - b));
  });

  it('orders the list by the newest message', async () => {
    const withBob = await agree();
    const withCarol = await agree(CAROL, ALICE, [null, null, null, 'Hi'], null).then(async () => (await conversations()).find((c) => c.other_id === CAROL)!.id);
    await say(withBob, 'later');
    const list = await conversations();
    expect(list.map((c) => c.id)).toEqual([withBob, withCarol]);
  });
});

describe('who can see and change a conversation', () => {
  it('keeps everyone else out of it: reading, writing, marking, muting, archiving, reporting', async () => {
    const id = await agree();
    await as(db, 'authenticated', CAROL);
    expect(await conversations()).toEqual([]);
    for (const call of [
      `select * from public.conversation_messages('${id}')`,
      `select public.send_message('${id}', 'hi')`,
      `select public.mark_conversation_read('${id}')`,
      `select public.set_conversation_muted('${id}', true)`,
      `select public.set_conversation_archived('${id}', true)`,
      `select public.report_conversation('${id}', 'x', false)`,
    ]) {
      expect(await fails(call), call).toMatch(/isn't available/);
    }
  });

  it('lets each person mute and archive for themselves only, and a new message brings an archived one back', async () => {
    const id = await agree();
    await db.query('select public.set_conversation_muted($1, true)', [id]);
    await db.query('select public.set_conversation_archived($1, true)', [id]);
    expect((await conversations())[0]).toMatchObject({ muted: true, archived: true });
    await as(db, 'authenticated', ALICE);
    expect((await conversations())[0]).toMatchObject({ muted: false, archived: false });
    await say(id, 'ping');
    await as(db, 'authenticated', BOB);
    expect((await conversations())[0]).toMatchObject({ muted: true, archived: false }); // back in view, still muted
  });

  it('lets you delete only your own messages, once; the text is gone for both people', async () => {
    const id = await agree();
    const mineId = await say(id, 'oops wrong chat');
    await as(db, 'authenticated', ALICE);
    expect(await fails('select public.delete_message($1)', [mineId])).toMatch(/can't be deleted/);
    await as(db, 'authenticated', BOB);
    await db.query('select public.delete_message($1)', [mineId]);
    expect(await fails('select public.delete_message($1)', [mineId])).toMatch(/can't be deleted/);
    for (const who of [BOB, ALICE]) {
      await as(db, 'authenticated', who);
      expect((await messages(id)).find((m) => m.id === mineId)).toMatchObject({ body: '', deleted: true });
    }
    expect((await conversations())[0]).toMatchObject({ last_deleted: true, unread: 1 });
    await as(db, 'authenticated', ALICE);
    expect((await conversations())[0].unread).toBe(1); // the deleted message doesn't count: only the seeded note from Alice's side is hers, so just the reply
  });
});

describe('blocking', () => {
  it('stops messages both ways without saying why, and stops requests too, until undone', async () => {
    const id = await agree();
    await db.query('select public.block_member($1)', [ALICE]);
    expect((await conversations())[0].blocked).toBe(true);
    expect(await fails('select public.send_message($1, $2)', [id, 'hi'])).toMatch(/can't message this member right now/);
    await as(db, 'authenticated', ALICE);
    expect((await conversations())[0].blocked).toBe(true);
    expect(await fails('select public.send_message($1, $2)', [id, 'hi'])).toMatch(/can't message this member right now/); // same words either way
    expect(await fails('select public.send_practice_request($1, null, null, null, null)', [BOB])).toMatch(/can't be asked right now/);

    await as(db, 'authenticated', BOB);
    await db.query('select public.unblock_practice_asker($1)', [ALICE]);
    await say(id, 'welcome back');
    expect((await conversations())[0].blocked).toBe(false);
  });

  it('cannot block yourself or nobody', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails('select public.block_member($1)', [ALICE])).toMatch(/can't be blocked/);
    expect(await fails('select public.block_member(null)')).toMatch(/can't be blocked/);
  });

  it('does not open a conversation when you accept a request from someone you have blocked', async () => {
    await as(db, 'authenticated', ALICE);
    const r = (await db.query<{ send_practice_request: string }>('select public.send_practice_request($1, null, null, null, $2)', [BOB, 'hi'])).rows[0].send_practice_request;
    await as(db, 'authenticated', BOB);
    await db.query('select public.block_member($1)', [ALICE]);
    await db.query('select public.respond_practice_request($1, true, null, false)', [r]);
    expect(await conversations()).toEqual([]);
  });

  it('refuses messages from someone who is no longer a verified member', async () => {
    const id = await agree();
    await as(db, 'postgres');
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [ALICE]);
    await as(db, 'authenticated', BOB);
    expect(await fails('select public.send_message($1, $2)', [id, 'hi'])).toMatch(/can't message this member right now/);
  });
});

describe('limits', () => {
  it('allows 30 messages in 10 minutes, then asks you to slow down; older ones age out', async () => {
    const id = await agree();
    await as(db, 'postgres');
    await db.query(`insert into public.messages (conversation_id, sender, body) select $1, $2, 'x' from generate_series(1, 28)`, [id, BOB]); // plus the seeded reply = 29
    await as(db, 'authenticated', BOB);
    await say(id, 'thirtieth');
    expect(await fails('select public.send_message($1, $2)', [id, 'one too many'])).toMatch(/very quickly/);
    await as(db, 'authenticated', ALICE);
    await say(id, 'but Alice is fine');

    await as(db, 'postgres');
    await db.query(`update public.messages set created_at = now() - interval '11 minutes' where sender = $1`, [BOB]);
    await as(db, 'authenticated', BOB);
    await say(id, 'ok again');
  });

  it('stops at 500 in a day', async () => {
    const id = await agree();
    await as(db, 'postgres');
    await db.query(`insert into public.messages (conversation_id, sender, body, created_at) select $1, $2, 'x', now() - interval '2 hours' from generate_series(1, 500)`, [id, BOB]);
    await as(db, 'authenticated', BOB);
    expect(await fails('select public.send_message($1, $2)', [id, 'hi'])).toMatch(/lot of messages for one day/);
  });
});

describe('reporting', () => {
  const reports = async () => {
    await as(db, 'postgres');
    return (await db.query<{ reporter: string | null; reported: string | null; reason: string; snapshot: { from: string; body: string; deleted: boolean }[] }>('select * from public.message_reports')).rows;
  };

  it('keeps the reason and a snapshot of the conversation, even if messages are deleted afterwards', async () => {
    const id = await agree();
    await as(db, 'authenticated', ALICE);
    const rude = await say(id, 'something rude');
    await as(db, 'authenticated', BOB);
    await db.query('select public.report_conversation($1, $2, false)', [id, '  Rude messages  ']);
    await as(db, 'authenticated', ALICE);
    await db.query('select public.delete_message($1)', [rude]);

    const [r] = await reports();
    expect(r).toMatchObject({ reporter: BOB, reported: ALICE, reason: 'Rude messages' });
    expect(r.snapshot.map((m) => [m.from, m.body])).toEqual([
      ['reported', 'Airline profit (Cosentino) · tonight\nUp for it?'],
      ['reporter', 'Zoom: example.com'],
      ['reported', 'something rude'], // as it was when reported
    ]);
  });

  it('can block in the same step, needs a reason, and is limited to five a day', async () => {
    const id = await agree();
    expect(await fails('select public.report_conversation($1, $2, false)', [id, '  '])).toMatch(/Tell us briefly/);
    await db.query('select public.report_conversation($1, $2, true)', [id, 'Spam']);
    expect((await conversations())[0].blocked).toBe(true);
    await as(db, 'authenticated', BOB);
    for (let i = 0; i < 4; i++) await db.query('select public.report_conversation($1, $2, false)', [id, `again ${i}`]);
    expect(await fails('select public.report_conversation($1, $2, false)', [id, 'sixth'])).toMatch(/several reports today/);
  });

  it('cannot be read by members or visitors, and survives the people involved leaving', async () => {
    const id = await agree();
    await db.query('select public.report_conversation($1, $2, false)', [id, 'Spam']);
    for (const role of ['authenticated', 'anon'] as const) {
      await as(db, role, role === 'anon' ? undefined : ALICE);
      expect(await fails('select * from public.message_reports'), role).toMatch(/permission denied/);
    }
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    const left = await db.query<{ reporter: string | null; reported: string | null }>('select reporter, reported from public.message_reports');
    expect(left.rows).toEqual([{ reporter: BOB, reported: null }]);
  });
});

describe('privacy and access', () => {
  it('has no direct table access for anyone', async () => {
    await agree();
    for (const role of ['authenticated', 'anon'] as const) {
      await as(db, role, role === 'anon' ? undefined : BOB);
      for (const table of ['conversations', 'conversation_members', 'messages', 'message_reports']) {
        expect(await fails(`select * from public.${table}`), `${role} select ${table}`).toMatch(/permission denied/);
        expect(await fails(`delete from public.${table}`), `${role} delete ${table}`).toMatch(/permission denied/);
      }
      expect(await fails(`insert into public.messages (conversation_id, sender, body) values (gen_random_uuid(), $1, 'x')`, [BOB])).toMatch(/permission denied/);
      expect(await fails(`update public.messages set body = 'x'`)).toMatch(/permission denied/);
    }
  });

  it('gives visitors no way to call anything, and keeps the helpers internal', async () => {
    const calls = [
      `select * from public.my_conversations()`,
      `select * from public.conversation_messages(gen_random_uuid())`,
      `select public.mark_conversation_read(gen_random_uuid())`,
      `select public.send_message(gen_random_uuid(), 'x')`,
      `select public.delete_message(gen_random_uuid())`,
      `select public.set_conversation_muted(gen_random_uuid(), true)`,
      `select public.set_conversation_archived(gen_random_uuid(), true)`,
      `select public.block_member(gen_random_uuid())`,
      `select public.report_conversation(gen_random_uuid(), 'x', false)`,
    ];
    await as(db, 'anon');
    for (const call of calls) expect(await fails(call), call).toMatch(/permission denied/);
    await as(db, 'authenticated', ALICE);
    expect(await fails(`select public._blocked_between('${ALICE}', '${BOB}')`)).toMatch(/permission denied/);
    await as(db, 'authenticated');
    for (const call of calls) expect(await fails(call), call).toMatch(/Not signed in/);
  });

  it('is deleted with the accounts', async () => {
    await agree();
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    const left = await db.query(
      'select (select count(*) from public.conversations) as c, (select count(*) from public.messages) as m, (select count(*) from public.conversation_members) as p',
    );
    expect(left.rows[0]).toEqual({ c: 0, m: 0, p: 0 });
  });

  it('holds no email address anywhere', async () => {
    await as(db, 'postgres');
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name in ('conversations', 'conversation_members', 'messages', 'message_reports')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.column_name).filter((c) => /mail/.test(c))).toEqual([]);
  });

  it('gives an unverified member no conversations to read or write', async () => {
    const id = await agree();
    await as(db, 'authenticated', DAVE);
    expect(await conversations()).toEqual([]);
    expect(await fails('select public.send_message($1, $2)', [id, 'hi'])).toMatch(/isn't available/);
  });
});
