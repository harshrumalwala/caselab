import { describe, expect, it } from 'vitest';
import {
  checkMeetingTimes,
  hasLapsed,
  meetingState,
  nextConfirmed,
  schedulingBadge,
  type ScheduledMeeting,
} from './scheduling';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('the times you may propose', () => {
  it('takes one, two or three times, in the order they were given, as instants', () => {
    const ok = checkMeetingTimes({ slots: [inHours(24), inHours(2)], durationMinutes: 45 }, NOW);
    expect(ok).toEqual({ ok: true, times: { slots: [inHours(24), inHours(2)], durationMinutes: 45 } });
    expect(checkMeetingTimes({ slots: [inHours(1)], durationMinutes: 30 }, NOW).ok).toBe(true);
    expect(checkMeetingTimes({ slots: [inHours(1), inHours(2), inHours(3)], durationMinutes: 90 }, NOW).ok).toBe(true);
  });

  it('refuses none, four, and anything that is not a time', () => {
    for (const slots of [[], [inHours(1), inHours(2), inHours(3), inHours(4)], ['tomorrow evening'], ['']]) {
      const result = checkMeetingTimes({ slots, durationMinutes: 60 }, NOW);
      expect(result, JSON.stringify(slots)).toEqual({ ok: false, message: 'Propose one, two or three times.' });
    }
  });

  it('refuses the same time twice, a time that has all but arrived, and one too far ahead', () => {
    expect(checkMeetingTimes({ slots: [inHours(24), inHours(24)], durationMinutes: 60 }, NOW)).toEqual({
      ok: false,
      message: 'Those times are the same. Propose different ones.',
    });
    expect(checkMeetingTimes({ slots: [inHours(-1)], durationMinutes: 60 }, NOW).ok).toBe(false);
    expect(checkMeetingTimes({ slots: [new Date(NOW.getTime() + 9 * 60_000).toISOString()], durationMinutes: 60 }, NOW)).toEqual({
      ok: false,
      message: 'Propose times at least ten minutes from now.',
    });
    // Eleven minutes away is fine; sixty-one days is not.
    expect(checkMeetingTimes({ slots: [new Date(NOW.getTime() + 11 * 60_000).toISOString()], durationMinutes: 60 }, NOW).ok).toBe(true);
    expect(checkMeetingTimes({ slots: [inHours(24 * 61)], durationMinutes: 60 }, NOW)).toEqual({
      ok: false,
      message: 'Propose times within the next 60 days.',
    });
  });

  it('takes only a length from the short list', () => {
    for (const minutes of [30, 45, 60, 90]) expect(checkMeetingTimes({ slots: [inHours(24)], durationMinutes: minutes }, NOW).ok, String(minutes)).toBe(true);
    for (const minutes of [0, 15, 61, 120, -30]) {
      expect(checkMeetingTimes({ slots: [inHours(24)], durationMinutes: minutes }, NOW), String(minutes)).toEqual({
        ok: false,
        message: 'Pick a length of 30, 45, 60 or 90 minutes.',
      });
    }
  });
});

describe('a proposal lapses when every time in it has passed', () => {
  it('is arithmetic, not a state anything has to write', () => {
    expect(hasLapsed({ slots: [inHours(-2), inHours(-1)] }, NOW)).toBe(true);
    expect(hasLapsed({ slots: [inHours(-2), inHours(1)] }, NOW)).toBe(false);
    expect(hasLapsed(null, NOW)).toBe(false);
  });

  it('decides the state of a record that is still waiting, and leaves a settled one alone', () => {
    expect(meetingState('proposed', { slots: [inHours(24)] }, NOW)).toBe('proposed');
    expect(meetingState('proposed', { slots: [inHours(-1)] }, NOW)).toBe('lapsed');
    expect(meetingState('proposed', null, NOW)).toBe('lapsed');
    expect(meetingState('confirmed', { slots: [inHours(-1)] }, NOW)).toBe('confirmed');
    expect(meetingState('cancelled', null, NOW)).toBe('cancelled');
    expect(meetingState('declined', null, NOW)).toBe('declined');
  });
});

const meeting = (over: Partial<ScheduledMeeting>): ScheduledMeeting => ({
  id: 'm1',
  otherId: 'u2',
  otherName: 'Bob',
  otherTimeZone: '',
  hostId: 'u1',
  iHost: true,
  state: 'proposed',
  startsAt: null,
  durationMinutes: 60,
  revision: 0,
  meetingLink: '',
  meetingLinkFrom: '',
  requestId: null,
  conversationId: null,
  proposal: null,
  myTurn: false,
  blocked: false,
  createdAt: inHours(-48),
  updatedAt: inHours(-48),
  ...over,
});

describe('what needs you, and what is next', () => {
  it('counts only the records waiting on your answer, and never a blocked one', () => {
    const list = [
      meeting({ id: 'a', myTurn: true }),
      meeting({ id: 'b', myTurn: false }),
      meeting({ id: 'c', myTurn: true, blocked: true }),
    ];
    expect(schedulingBadge(list)).toBe(1);
    expect(schedulingBadge([])).toBe(0);
  });

  it('finds the next settled time that has not happened yet', () => {
    const list = [
      meeting({ id: 'past', state: 'confirmed', startsAt: inHours(-2) }),
      meeting({ id: 'later', state: 'confirmed', startsAt: inHours(50) }),
      meeting({ id: 'soon', state: 'confirmed', startsAt: inHours(5) }),
      meeting({ id: 'off', state: 'cancelled', startsAt: inHours(1) }),
    ];
    expect(nextConfirmed(list, NOW)?.id).toBe('soon');
    expect(nextConfirmed([meeting({ state: 'proposed' })], NOW)).toBeNull();
  });
});
