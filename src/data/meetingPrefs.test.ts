import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import { createMemoryMeeting, NO_MEETING_PREFS, SupabaseMeeting } from './meetingPrefs';

type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** Just the two rpc calls SupabaseMeeting makes, recording what was sent. */
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

describe('SupabaseMeeting', () => {
  it('reads your own row through the function, and reads an empty one as nothing set', async () => {
    const f = fakeClient({
      my_meeting_prefs: { data: [{ meeting_link: 'https://zoom.us/my/alice', time_zone: 'America/Chicago' }], error: null },
    });
    expect(await new SupabaseMeeting(f.client).load()).toEqual({ link: 'https://zoom.us/my/alice', timeZone: 'America/Chicago' });
    expect(f.sent).toEqual([{ fn: 'my_meeting_prefs', args: undefined }]);

    const empty = fakeClient({ my_meeting_prefs: { data: [], error: null } });
    expect(await new SupabaseMeeting(empty.client).load()).toEqual(NO_MEETING_PREFS);
    const nulls = fakeClient({ my_meeting_prefs: { data: [{ meeting_link: null, time_zone: null }], error: null } });
    expect(await new SupabaseMeeting(nulls.client).load()).toEqual(NO_MEETING_PREFS);
  });

  it('sends both fields trimmed, and gives back what the database stored rather than what was asked for', async () => {
    const f = fakeClient({
      save_my_meeting_prefs: { data: [{ meeting_link: 'https://zoom.us/my/alice', time_zone: null }], error: null },
    });
    const saved = await new SupabaseMeeting(f.client).save({ link: '  https://zoom.us/my/alice ', timeZone: ' ' });
    expect(f.sent).toEqual([{ fn: 'save_my_meeting_prefs', args: { p_link: 'https://zoom.us/my/alice', p_zone: '' } }]);
    expect(saved).toEqual({ link: 'https://zoom.us/my/alice', timeZone: '' });
  });

  it("shows the database's own refusal, and passes anything else straight through", async () => {
    const refused = fakeClient({
      save_my_meeting_prefs: { data: null, error: { code: 'P0001', message: 'That is a lot of changes for one day. Try again tomorrow.' } },
    });
    await expect(new SupabaseMeeting(refused.client).save({ link: '', timeZone: '' })).rejects.toThrow(
      'That is a lot of changes for one day. Try again tomorrow.',
    );
    await expect(new SupabaseMeeting(refused.client).save({ link: '', timeZone: '' })).rejects.toBeInstanceOf(DataError);

    const broken = fakeClient({ save_my_meeting_prefs: { data: null, error: { code: '42501', message: 'permission denied' } } });
    await expect(new SupabaseMeeting(broken.client).save({ link: '', timeZone: '' })).rejects.not.toBeInstanceOf(DataError);
    const offline = fakeClient({ my_meeting_prefs: { data: null, error: { message: 'Failed to fetch' } } });
    await expect(new SupabaseMeeting(offline.client).load()).rejects.toBeTruthy();
  });
});

describe('the in-memory twin', () => {
  it('keeps what was saved and refuses what the database would refuse', async () => {
    const store = createMemoryMeeting();
    expect(await store.load()).toEqual(NO_MEETING_PREFS);
    expect(await store.save({ link: ' https://meet.google.com/abc-defg-hij ', timeZone: 'Europe/London' })).toEqual({
      link: 'https://meet.google.com/abc-defg-hij',
      timeZone: 'Europe/London',
    });
    expect(store.saved).toEqual({ link: 'https://meet.google.com/abc-defg-hij', timeZone: 'Europe/London' });

    await expect(store.save({ link: 'javascript:alert(1)', timeZone: '' })).rejects.toBeInstanceOf(DataError);
    await expect(store.save({ link: '', timeZone: 'Chicago' })).rejects.toBeInstanceOf(DataError);
    expect(store.saved.link).toBe('https://meet.google.com/abc-defg-hij'); // a refused save changed nothing

    store.failing = true;
    await expect(store.load()).rejects.toThrow(/Failed to fetch/);
    await expect(store.save({ link: '', timeZone: '' })).rejects.toThrow(/Failed to fetch/);
  });
});
