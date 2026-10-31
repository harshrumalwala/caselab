import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { DataError, describeError } from './errors';
import { createMemoryMessages, rowToConversation, rowToMessage, SupabaseMessages } from './messages';
import { createMemoryPractice } from './practiceRequests';

type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** Just the rpc call SupabaseMessages makes, recording what was sent. */
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

const CONV_ROW = {
  id: 'c1',
  other_id: 'bob',
  other_name: 'Bob Brown',
  last_body: 'See you at 8',
  last_deleted: false,
  last_mine: true,
  last_at: '2026-11-06T20:00:00Z',
  unread: 2,
  muted: false,
  archived: true,
  blocked: false,
};

describe('SupabaseMessages', () => {
  it('reads your conversations and messages through the functions', async () => {
    const f = fakeClient({
      my_conversations: { data: [CONV_ROW, { ...CONV_ROW, id: 'c2', other_name: null, last_body: null }], error: null },
      conversation_messages: { data: [{ id: 'm1', mine: false, body: 'hi', created_at: '2026-11-06T20:00:00Z', deleted: false }], error: null },
    });
    const m = new SupabaseMessages(f.client);
    const list = await m.conversations();
    expect(list[0]).toMatchObject({ id: 'c1', otherId: 'bob', otherName: 'Bob Brown', lastBody: 'See you at 8', lastMine: true, unread: 2, archived: true });
    expect(list[1]).toMatchObject({ otherName: 'A former member', lastBody: '' });
    expect(await m.messages('c1')).toEqual([{ id: 'm1', mine: false, body: 'hi', createdAt: '2026-11-06T20:00:00Z', deleted: false }]);
    expect(f.sent.map((s) => s.fn)).toEqual(['my_conversations', 'conversation_messages']);
    expect(f.sent[1].args).toEqual({ p_conversation: 'c1' });
    expect(rowToConversation(CONV_ROW).lastAt).toBe('2026-11-06T20:00:00Z');
    expect(rowToMessage({ id: 'x', mine: true, body: '', created_at: 't', deleted: true }).deleted).toBe(true);
  });

  it('sends trimmed, cut-to-length text', async () => {
    const f = fakeClient();
    await new SupabaseMessages(f.client).send('c1', `  ${'x'.repeat(1500)} `);
    expect(f.sent[0]).toEqual({ fn: 'send_message', args: { p_conversation: 'c1', p_body: 'x'.repeat(1000) } });
  });

  it('calls the other functions by name, with the right arguments', async () => {
    const f = fakeClient();
    const m = new SupabaseMessages(f.client);
    await m.markRead('c1');
    await m.setMuted('c1', true);
    await m.setArchived('c1', false);
    await m.deleteMessage('m1');
    await m.block('bob');
    await m.report('c1', `  ${'r'.repeat(700)} `, true);
    expect(f.sent).toEqual([
      { fn: 'mark_conversation_read', args: { p_conversation: 'c1' } },
      { fn: 'set_conversation_muted', args: { p_conversation: 'c1', p_muted: true } },
      { fn: 'set_conversation_archived', args: { p_conversation: 'c1', p_archived: false } },
      { fn: 'delete_message', args: { p_id: 'm1' } },
      { fn: 'block_member', args: { p_user: 'bob' } },
      { fn: 'report_conversation', args: { p_conversation: 'c1', p_reason: 'r'.repeat(500), p_block: true } },
    ]);
  });

  it("shows the database's own sentences, and the usual translation for anything else", async () => {
    const refused = { data: null, error: { message: "You can't message this member right now.", code: 'P0001' } };
    const err = await new SupabaseMessages(fakeClient({ send_message: refused }).client).send('c1', 'hi').catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(describeError(err)).toBe("You can't message this member right now.");

    const denied = { data: null, error: { message: 'permission denied for function', code: '42501' } };
    expect(describeError(await new SupabaseMessages(fakeClient({ my_conversations: denied }).client).conversations().catch((e) => e))).toMatch(/permission denied/);
  });
});

describe('the in-memory stand-in follows the same rules', () => {
  const people = [
    { userId: 'me', name: 'Me Myself', open: true },
    { userId: 'bob', name: 'Bob Brown', open: true },
    { userId: 'carol', name: 'Carol Chen', open: true },
  ];
  function world() {
    const practice = createMemoryPractice(() => people);
    const chat = createMemoryMessages(practice, () => people);
    return { practice, chat, me: chat.as('me'), bob: chat.as('bob'), carol: chat.as('carol') };
  }
  /** Bob asks me, I accept: that opens the conversation. */
  async function agree(w: ReturnType<typeof world>) {
    await w.practice.as('bob').send('me', { caseTitle: 'Airline profit', caseBook: 'Cosentino', when: 'tonight', message: 'Up for it?' });
    await w.practice.as('me').respond(w.practice.rows[0].id, true, 'Zoom');
    return (await w.me.conversations())[0];
  }

  it('opens a conversation only when a request is accepted, seeded with the proposal, note and reply', async () => {
    const w = world();
    expect(await w.me.conversations()).toEqual([]);
    await w.practice.as('bob').send('me', { caseTitle: 'Airline profit', caseBook: 'Cosentino', when: 'tonight', message: 'Up for it?' });
    expect(await w.me.conversations()).toEqual([]); // asking is not enough
    await w.practice.as('me').respond(w.practice.rows[0].id, true, 'Zoom');
    const [c] = await w.me.conversations();
    expect(c).toMatchObject({ otherId: 'bob', otherName: 'Bob Brown', lastBody: 'Zoom', lastMine: true, unread: 0 });
    expect((await w.me.messages(c.id)).map((m) => [m.mine, m.body])).toEqual([
      [false, 'Airline profit (Cosentino) · tonight\nUp for it?'],
      [true, 'Zoom'],
    ]);
    expect((await w.bob.conversations())[0]).toMatchObject({ otherName: 'Me Myself', unread: 1 }); // the person who asked has the reply to read
  });

  it('does not open one on a decline, or when the pair has blocked each other', async () => {
    const w = world();
    await w.practice.as('bob').send('me', { caseTitle: '', caseBook: '', when: '', message: 'hi' });
    await w.practice.as('me').respond(w.practice.rows[0].id, false, '');
    expect(await w.me.conversations()).toEqual([]);

    await w.practice.as('carol').send('me', { caseTitle: '', caseBook: '', when: '', message: 'hi' });
    await w.me.block('carol');
    await w.practice.as('me').respond(w.practice.rows[1].id, true, '');
    expect(await w.me.conversations()).toEqual([]);
  });

  it('keeps others out, and lets you write, read, mute, archive and delete your own', async () => {
    const w = world();
    const c = await agree(w);
    await expect(w.carol.messages(c.id)).rejects.toThrow(/isn't available/);
    await expect(w.carol.send(c.id, 'hi')).rejects.toThrow(/isn't available/);

    await w.me.send(c.id, '  later  ');
    expect((await w.bob.conversations())[0]).toMatchObject({ lastBody: 'later', unread: 2 });
    await w.bob.markRead(c.id);
    expect((await w.bob.conversations())[0].unread).toBe(0);
    await expect(w.me.send(c.id, '   ')).rejects.toThrow(/Write a message first/);

    await w.bob.setMuted(c.id, true);
    await w.bob.setArchived(c.id, true);
    expect((await w.bob.conversations())[0]).toMatchObject({ muted: true, archived: true });
    expect((await w.me.conversations())[0]).toMatchObject({ muted: false, archived: false });
    await w.me.send(c.id, 'ping');
    expect((await w.bob.conversations())[0].archived).toBe(false); // a new message brings it back

    const mine = (await w.me.messages(c.id)).find((m) => m.body === 'ping')!;
    await expect(w.bob.deleteMessage(mine.id)).rejects.toThrow(/can't be deleted/);
    await w.me.deleteMessage(mine.id);
    expect((await w.bob.messages(c.id)).find((m) => m.id === mine.id)).toMatchObject({ body: '', deleted: true });
  });

  it('blocks both ways without saying why, and reports keep a snapshot', async () => {
    const w = world();
    const c = await agree(w);
    await w.me.block('bob');
    await expect(w.me.send(c.id, 'hi')).rejects.toThrow(/can't message this member right now/);
    await expect(w.bob.send(c.id, 'hi')).rejects.toThrow(/can't message this member right now/);
    expect((await w.bob.conversations())[0].blocked).toBe(true);
    await expect(w.me.block('me')).rejects.toThrow(/can't be blocked/);

    await expect(w.me.report(c.id, '  ', false)).rejects.toThrow(/Tell us briefly/);
    await w.bob.report(c.id, 'Spam', true);
    expect(w.chat.reports[0]).toMatchObject({ reporter: 'bob', reported: 'me', reason: 'Spam' });
    expect(w.chat.reports[0].snapshot.map((s) => s.from)).toEqual(['reporter', 'reported']); // Bob reported: his own note first, then the reply he got
  });
});
