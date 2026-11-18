import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import { createMemoryScheduling, SupabaseScheduling, type SchedulingRepository } from './scheduling';

type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** Just the rpc calls SupabaseScheduling makes, recording what was sent. */
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

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const ROW = {
  id: 'meeting-1',
  other_id: 'bob',
  other_name: 'Bob Brown',
  other_time_zone: 'Europe/London',
  host_id: 'alice',
  i_host: false,
  state: 'confirmed' as const,
  starts_at: inHours(24),
  duration_minutes: 60,
  revision: 1,
  meeting_link: 'https://zoom.us/my/alice',
  meeting_link_from: 'host' as const,
  request_id: 'req-1',
  conversation_id: 'conv-1',
  proposal_id: null,
  proposed_by: null,
  proposed_slots: null,
  proposed_duration: null,
  proposed_is_change: null,
  proposed_at: null,
  my_turn: false,
  blocked: false,
  created_at: inHours(-48),
  updated_at: inHours(-1),
};

describe('SupabaseScheduling', () => {
  it('reads your own records through the function and reads an empty answer as none', async () => {
    const f = fakeClient({ my_practice_meetings: { data: [ROW], error: null } });
    const [meeting] = await new SupabaseScheduling(f.client).list();
    expect(meeting).toMatchObject({
      id: 'meeting-1',
      otherName: 'Bob Brown',
      otherTimeZone: 'Europe/London',
      state: 'confirmed',
      meetingLink: 'https://zoom.us/my/alice',
      meetingLinkFrom: 'host',
      proposal: null,
    });
    expect(f.sent).toEqual([{ fn: 'my_practice_meetings', args: undefined }]);
    expect(await new SupabaseScheduling(fakeClient({ my_practice_meetings: { data: [], error: null } }).client).list()).toEqual([]);
  });

  it('reads a member who has left as a former member, and no link as no link', async () => {
    const f = fakeClient({
      my_practice_meetings: { data: [{ ...ROW, other_name: null, other_time_zone: null, meeting_link: null, meeting_link_from: null }], error: null },
    });
    const [meeting] = await new SupabaseScheduling(f.client).list();
    expect(meeting).toMatchObject({ otherName: 'A former member', otherTimeZone: '', meetingLink: '', meetingLinkFrom: '' });
  });

  it('reads the times waiting for an answer as a proposal', async () => {
    const slots = [inHours(24), inHours(48)];
    const f = fakeClient({
      my_practice_meetings: {
        data: [{ ...ROW, state: 'proposed', starts_at: null, revision: 0, meeting_link: null, meeting_link_from: null, proposal_id: 'p1', proposed_by: 'bob', proposed_slots: slots, proposed_duration: 45, proposed_is_change: true, proposed_at: inHours(-2), my_turn: true }],
        error: null,
      },
    });
    const [meeting] = await new SupabaseScheduling(f.client).list();
    expect(meeting.proposal).toEqual({ id: 'p1', by: 'bob', slots, durationMinutes: 45, isChange: true, at: inHours(-2) });
    expect(meeting.myTurn).toBe(true);
  });

  it('sends what each function takes, and hands back the new record’s id', async () => {
    const slots = [inHours(24), inHours(48)];
    const f = fakeClient({ propose_practice_meeting: { data: 'meeting-9', error: null } });
    const repo = new SupabaseScheduling(f.client);
    expect(await repo.propose('bob', { slots, durationMinutes: 60 }, { requestId: 'req-1' })).toBe('meeting-9');
    await repo.confirm('meeting-9', slots[0]);
    await repo.counter('meeting-9', { slots: [slots[1]], durationMinutes: 45 });
    await repo.change('meeting-9', { slots: [slots[1]], durationMinutes: 90 });
    await repo.decline('meeting-9');
    await repo.cancel('meeting-9');
    expect(f.sent).toEqual([
      { fn: 'propose_practice_meeting', args: { p_other: 'bob', p_slots: slots, p_duration: 60, p_request: 'req-1', p_conversation: null } },
      { fn: 'confirm_practice_meeting', args: { p_meeting: 'meeting-9', p_slot: slots[0] } },
      { fn: 'counter_practice_meeting', args: { p_meeting: 'meeting-9', p_slots: [slots[1]], p_duration: 45 } },
      { fn: 'change_practice_meeting', args: { p_meeting: 'meeting-9', p_slots: [slots[1]], p_duration: 90 } },
      { fn: 'decline_practice_meeting', args: { p_meeting: 'meeting-9' } },
      { fn: 'cancel_practice_meeting', args: { p_meeting: 'meeting-9' } },
    ]);
  });

  it('refuses times the database would refuse without asking it', async () => {
    const f = fakeClient();
    const repo = new SupabaseScheduling(f.client);
    await expect(repo.propose('bob', { slots: [inHours(-1)], durationMinutes: 60 })).rejects.toThrow('Propose times at least ten minutes from now.');
    await expect(repo.counter('m', { slots: [inHours(24)], durationMinutes: 15 })).rejects.toThrow('Pick a length of 30, 45, 60 or 90 minutes.');
    expect(f.sent).toEqual([]);
  });

  it('shows the database’s own refusal and passes anything else straight through', async () => {
    const refused = fakeClient({ confirm_practice_meeting: { data: null, error: { code: 'P0001', message: 'That time has just been settled. Open it again to see it.' } } });
    await expect(new SupabaseScheduling(refused.client).confirm('m', inHours(24))).rejects.toBeInstanceOf(DataError);
    const broken = fakeClient({ cancel_practice_meeting: { data: null, error: { code: '42501', message: 'permission denied' } } });
    await expect(new SupabaseScheduling(broken.client).cancel('m')).rejects.not.toBeInstanceOf(DataError);
    const offline = fakeClient({ my_practice_meetings: { data: null, error: { message: 'Failed to fetch' } } });
    await expect(new SupabaseScheduling(offline.client).list()).rejects.toBeTruthy();
  });
});

/** Alice asked Bob to case and Bob said yes, so Alice hosts. Carol is nothing to do with either of them. */
function twin(opts: { aliceLink?: string; bobLink?: string; blocks?: { blocker: string; blocked: string }[] } = {}) {
  const blocks = opts.blocks ?? [];
  const store = createMemoryScheduling({
    members: () => [
      { userId: 'alice', name: 'Alice', link: opts.aliceLink, timeZone: 'America/Chicago' },
      { userId: 'bob', name: 'Bob', link: opts.bobLink, timeZone: 'Europe/London' },
      { userId: 'carol', name: 'Carol' },
    ],
    requests: () => [{ from: 'alice', to: 'bob', status: 'accepted', createdAt: new Date(0).toISOString() }],
    blocks: () => blocks,
  });
  return { store, alice: store.as('alice'), bob: store.as('bob'), carol: store.as('carol'), blocks };
}

const TIMES = { slots: [inHours(24), inHours(48)], durationMinutes: 60 };

describe('the in-memory twin keeps the rules the database keeps', () => {
  it('proposes, confirms, and makes the asker the host', async () => {
    const t = twin({ aliceLink: 'https://zoom.us/my/alice' });
    const id = await t.bob.propose('alice', TIMES);
    const [waiting] = await t.alice.list();
    expect(waiting).toMatchObject({ id, state: 'proposed', myTurn: true, hostId: 'alice', iHost: true, meetingLink: '' });
    expect((await t.bob.list())[0]).toMatchObject({ myTurn: false, hostId: 'alice', iHost: false, meetingLink: '' });

    await t.alice.confirm(id, waiting.proposal!.slots[0]);
    expect((await t.alice.list())[0]).toMatchObject({ state: 'confirmed', revision: 1, startsAt: waiting.proposal!.slots[0], meetingLink: 'https://zoom.us/my/alice', meetingLinkFrom: 'host' });
    expect((await t.bob.list())[0]).toMatchObject({ meetingLink: 'https://zoom.us/my/alice', otherTimeZone: 'America/Chicago' });
  });

  it('keeps the link from everyone until the time is settled, and from a third member always', async () => {
    const t = twin({ aliceLink: 'https://zoom.us/my/alice' });
    const id = await t.bob.propose('alice', TIMES);
    expect((await t.bob.list())[0].meetingLink).toBe('');
    expect(await t.carol.list()).toEqual([]);
    await t.alice.confirm(id, TIMES.slots[0]);
    expect(await t.carol.list()).toEqual([]);
    expect(JSON.stringify(await t.carol.list())).not.toMatch(/zoom/);
  });

  it('falls back to the other person’s link when the host saved none', async () => {
    const t = twin({ bobLink: 'https://meet.google.com/bob' });
    const id = await t.bob.propose('alice', TIMES);
    await t.alice.confirm(id, TIMES.slots[0]);
    expect((await t.alice.list())[0]).toMatchObject({ meetingLink: 'https://meet.google.com/bob', meetingLinkFrom: 'guest' });
  });

  it('holds the turn rule', async () => {
    const t = twin();
    const id = await t.bob.propose('alice', TIMES);
    await expect(t.bob.confirm(id, TIMES.slots[0])).rejects.toThrow("You proposed those times. It's their turn.");
    await expect(t.bob.counter(id, TIMES)).rejects.toThrow("You proposed those times. It's their turn.");
    await expect(t.bob.decline(id)).rejects.toThrow("You proposed those times. It's their turn.");
    const theirs = inHours(72);
    await t.alice.counter(id, { slots: [theirs], durationMinutes: 45 });
    expect((await t.bob.list())[0]).toMatchObject({ myTurn: true, proposal: { by: 'alice' } });
    await expect(t.alice.confirm(id, theirs)).rejects.toThrow("You proposed those times. It's their turn.");
  });

  it('lets nobody but the two of them near it', async () => {
    const t = twin();
    const id = await t.bob.propose('alice', TIMES);
    for (const call of [t.carol.confirm(id, TIMES.slots[0]), t.carol.counter(id, TIMES), t.carol.decline(id), t.carol.cancel(id), t.carol.change(id, TIMES)]) {
      await expect(call).rejects.toThrow("That time isn't available.");
    }
    await expect(t.carol.propose('alice', TIMES)).rejects.toThrow("You can't schedule with this member right now.");
  });

  it('refuses everything but cancelling once one of them has blocked the other', async () => {
    const t = twin({ aliceLink: 'https://zoom.us/my/alice', blocks: [] });
    const id = await t.bob.propose('alice', TIMES);
    await t.alice.confirm(id, TIMES.slots[0]);
    t.blocks.push({ blocker: 'bob', blocked: 'alice' });
    for (const call of [t.alice.change(id, { slots: [inHours(72)], durationMinutes: 60 }), t.bob.change(id, { slots: [inHours(72)], durationMinutes: 60 })]) {
      await expect(call).rejects.toThrow("You can't schedule with this member right now.");
    }
    // The record is still theirs to see, but it carries no link while a block stands.
    expect((await t.alice.list())[0]).toMatchObject({ blocked: true, meetingLink: '' });
    // And the blocked one can still clear the time: a block ends a commitment, it does not make it permanent.
    await t.alice.cancel(id);
    expect((await t.bob.list())[0]).toMatchObject({ state: 'cancelled', revision: 2, blocked: true });
  });

  it('keeps the old time standing until a change is confirmed, and counts revisions', async () => {
    const t = twin();
    const id = await t.bob.propose('alice', TIMES);
    await t.alice.confirm(id, TIMES.slots[0]);
    const moved = inHours(96);
    await t.alice.change(id, { slots: [moved], durationMinutes: 90 });
    expect((await t.bob.list())[0]).toMatchObject({ state: 'confirmed', startsAt: TIMES.slots[0], revision: 1, myTurn: true, proposal: { isChange: true } });
    await t.bob.confirm(id, moved);
    expect((await t.alice.list())[0]).toMatchObject({ state: 'confirmed', startsAt: moved, revision: 2, durationMinutes: 90 });
    await t.alice.cancel(id);
    expect((await t.alice.list())[0]).toMatchObject({ state: 'cancelled', revision: 3, meetingLink: '' });
  });

  it('settles one time only, however many answers arrive', async () => {
    const t = twin();
    const id = await t.bob.propose('alice', TIMES);
    await t.alice.confirm(id, TIMES.slots[0]);
    await expect(t.alice.confirm(id, TIMES.slots[1])).rejects.toThrow('There are no times waiting for your answer.');
    expect((await t.alice.list())[0].startsAt).toBe(TIMES.slots[0]);
  });

  it('allows one open proposal per pair and calls a proposal lapsed once its times have passed', async () => {
    const t = twin();
    await t.bob.propose('alice', TIMES);
    await expect(t.alice.propose('bob', { slots: [inHours(72)], durationMinutes: 60 })).rejects.toThrow('You already have times waiting with this member.');

    // Their times go by with nobody answering: nothing sweeps it, the arithmetic just changes.
    const gone = inHours(-2);
    t.store.rows[0].proposals[0].slots = [gone];
    expect((await t.alice.list())[0]).toMatchObject({ state: 'lapsed', myTurn: false });
    await expect(t.alice.confirm(t.store.rows[0].id, gone)).rejects.toThrow('Those times have all passed.');
    // And it no longer holds the pair's place.
    await expect(t.alice.propose('bob', { slots: [inHours(72)], durationMinutes: 60 })).resolves.toBeTruthy();
  });

  it('refuses times and lengths the database refuses', async () => {
    const t = twin();
    await expect(t.bob.propose('alice', { slots: [], durationMinutes: 60 })).rejects.toThrow('Propose one, two or three times.');
    await expect(t.bob.propose('alice', { slots: [inHours(24)], durationMinutes: 15 })).rejects.toThrow('Pick a length of 30, 45, 60 or 90 minutes.');
    await expect(t.bob.propose('alice', { slots: [inHours(24 * 61)], durationMinutes: 60 })).rejects.toThrow('Propose times within the next 60 days.');
    expect(t.store.rows).toEqual([]);
  });

  it('breaks like a dropped connection when a test asks it to', async () => {
    const t = twin();
    const bob = t.bob as SchedulingRepository & { control: { failing: boolean } };
    bob.control.failing = true;
    await expect(bob.list()).rejects.toThrow(/Failed to fetch/);
  });
});
