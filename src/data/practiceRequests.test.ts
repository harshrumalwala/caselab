import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { DataError, describeError } from './errors';
import { createMemoryPractice, rowToRequest, SupabasePractice } from './practiceRequests';

type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** Just the rpc call SupabasePractice makes, recording what was sent. */
function fakeClient(answers: Record<string, Answer> = {}) {
  const sent: { fn: string; args?: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      sent.push({ fn, args });
      return answers[fn] ?? { data: null, error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, sent };
}

const ROW = {
  id: 'r1',
  direction: 'received' as const,
  other_id: 'bob',
  other_name: 'Bob Brown',
  case_title: 'Airline profit',
  case_book: null,
  when_text: 'tonight',
  message: null,
  status: 'pending' as const,
  reply: null,
  created_at: '2026-11-04T10:00:00Z',
  responded_at: null,
  from_seen_at: null,
};

describe('SupabasePractice', () => {
  it('reads your requests through the function, with blanks for what was not given', async () => {
    const f = fakeClient({ my_practice_requests: { data: [ROW, { ...ROW, id: 'r2', other_name: null, from_seen_at: '2026-11-04T11:00:00Z' }], error: null } });
    const list = await new SupabasePractice(f.client).list();
    expect(f.sent).toEqual([{ fn: 'my_practice_requests', args: undefined }]);
    expect(list[0]).toMatchObject({ id: 'r1', direction: 'received', otherId: 'bob', otherName: 'Bob Brown', caseTitle: 'Airline profit', caseBook: '', when: 'tonight', message: '', reply: '', answerSeen: false });
    expect(list[1]).toMatchObject({ otherName: 'A former member', answerSeen: true });
    expect(rowToRequest(ROW).respondedAt).toBeNull();
  });

  it('sends trimmed, cut-to-length text', async () => {
    const f = fakeClient();
    await new SupabasePractice(f.client).send('bob', { caseTitle: '  Airline profit ', caseBook: '', when: '', message: 'x'.repeat(400) });
    expect(f.sent[0]).toEqual({
      fn: 'send_practice_request',
      args: { p_to: 'bob', p_case_title: 'Airline profit', p_case_book: '', p_when: '', p_message: 'x'.repeat(280) },
    });
  });

  it('only asks to block when declining', async () => {
    const f = fakeClient();
    const p = new SupabasePractice(f.client);
    await p.respond('r1', false, ' no thanks ', true);
    await p.respond('r2', true, '', true);
    expect(f.sent[0].args).toEqual({ p_id: 'r1', p_accept: false, p_reply: 'no thanks', p_block: true });
    expect(f.sent[1].args).toEqual({ p_id: 'r2', p_accept: true, p_reply: '', p_block: false });
  });

  it('calls the other functions by name', async () => {
    const f = fakeClient({ my_practice_blocks: { data: [{ user_id: 'bob', display_name: null, created_at: 'x' }], error: null } });
    const p = new SupabasePractice(f.client);
    await p.cancel('r1');
    await p.markAnswersSeen();
    await p.unblock('bob');
    expect(await p.blocked()).toEqual([{ userId: 'bob', name: 'A former member' }]);
    expect(f.sent.map((s) => s.fn)).toEqual(['cancel_practice_request', 'mark_practice_answers_seen', 'unblock_practice_asker', 'my_practice_blocks']);
    expect(f.sent[0].args).toEqual({ p_id: 'r1' });
    expect(f.sent[2].args).toEqual({ p_user: 'bob' });
  });

  it("shows the database's own sentences for refusals, and the usual translation for anything else", async () => {
    const refused = { data: null, error: { message: "This member can't be asked right now.", code: 'P0001' } };
    const err = await new SupabasePractice(fakeClient({ send_practice_request: refused }).client).send('bob', { caseTitle: '', caseBook: '', when: '', message: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(describeError(err)).toBe("This member can't be asked right now.");

    const denied = { data: null, error: { message: 'permission denied for function', code: '42501' } };
    const err2 = await new SupabasePractice(fakeClient({ respond_practice_request: denied }).client).respond('r1', true, '').catch((e) => e);
    expect(describeError(err2)).toMatch(/permission denied/);
    await expect(new SupabasePractice(fakeClient({ my_practice_requests: { data: null, error: { message: 'boom' } } }).client).list()).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('the in-memory stand-in follows the same rules', () => {
  const members = [
    { userId: 'me', name: 'Me Myself', open: true },
    { userId: 'bob', name: 'Bob Brown', open: true },
    { userId: 'carol', name: 'Carol Chen', open: false },
  ];
  const ask = { caseTitle: 'Airline profit', caseBook: '', when: '', message: '' };

  it('delivers a request to both people, one waiting request per person, only to those taking them', async () => {
    const db = createMemoryPractice(() => members);
    const me = db.as('me');
    const bob = db.as('bob');
    await me.send('bob', ask);
    expect((await me.list())[0]).toMatchObject({ direction: 'sent', otherName: 'Bob Brown', status: 'pending' });
    expect((await bob.list())[0]).toMatchObject({ direction: 'received', otherName: 'Me Myself', status: 'pending' });
    await expect(me.send('bob', ask)).rejects.toThrow(/already have a request waiting/);
    await expect(me.send('carol', ask)).rejects.toThrow(/can't be asked right now/);
    await expect(me.send('me', ask)).rejects.toThrow(/can't be asked right now/);
  });

  it('lets only the recipient answer and only the sender cancel, and blocks without giving it away', async () => {
    const db = createMemoryPractice(() => members);
    const me = db.as('me');
    const bob = db.as('bob');
    await me.send('bob', ask);
    const [r] = await bob.list();
    await expect(me.respond(r.id, true, '')).rejects.toThrow(/no longer waiting/);
    await expect(bob.cancel(r.id)).rejects.toThrow(/no longer waiting/);
    await bob.respond(r.id, false, '', true);
    expect(await bob.blocked()).toEqual([{ userId: 'me', name: 'Me Myself' }]);
    await expect(me.send('bob', ask)).rejects.toThrow(/can't be asked right now/);
    await bob.unblock('me');
    await me.send('bob', ask);
  });

  it('stops at five waiting requests', async () => {
    const many = [{ userId: 'me', name: 'Me', open: true }, ...[1, 2, 3, 4, 5, 6].map((i) => ({ userId: `m${i}`, name: `M${i}`, open: true }))];
    const me = createMemoryPractice(() => many).as('me');
    for (let i = 1; i <= 5; i++) await me.send(`m${i}`, ask);
    await expect(me.send('m6', ask)).rejects.toThrow(/5 requests waiting/);
  });

  it('marks answers seen for the sender', async () => {
    const db = createMemoryPractice(() => members);
    await db.as('me').send('bob', ask);
    await db.as('bob').respond((await db.as('bob').list())[0].id, true, 'Zoom');
    expect((await db.as('me').list())[0]).toMatchObject({ status: 'accepted', reply: 'Zoom', answerSeen: false });
    await db.as('me').markAnswersSeen();
    expect((await db.as('me').list())[0].answerSeen).toBe(true);
  });
});
