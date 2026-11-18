/**
 * Scheduling a practice time with another member: one of you proposes up to three times with a length, the other
 * picks one, counters, or says no, and either of you can call it off or ask to move a time that is already standing.
 *
 * The rules here are the same rules the database enforces
 * (`supabase/migrations/20261127120000_practice_meetings.sql`), down to the sentences, so the screen can refuse
 * before it asks and nobody sees two different answers. `src/data/practiceMeetings.db.test.ts` runs the same inputs
 * through both and fails if they ever disagree.
 */

/** The lengths a case runs to. Nothing else is accepted. */
export const MEETING_DURATIONS = [30, 45, 60, 90] as const;
export type MeetingDuration = (typeof MEETING_DURATIONS)[number];

/** Three times is enough to choose from and few enough to read. */
export const MAX_MEETING_SLOTS = 3;
/** A time has to be far enough away to still be gettable to. */
export const MEETING_SLOT_MARGIN_MINUTES = 10;
/** And near enough that it is a plan rather than an idea. */
export const MEETING_WINDOW_DAYS = 60;

/** Waiting for an answer, settled, said no to, called off, or every proposed time has passed. */
export type MeetingState = 'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'lapsed';

/** The status the database stores. `lapsed` is not stored: it is arithmetic on the times proposed. */
export type MeetingStatus = 'proposed' | 'confirmed' | 'declined' | 'cancelled';

/** The times one of you put to the other, and who is waiting on whom. */
export interface MeetingProposal {
  id: string;
  /** Who proposed them. The other person is the one who answers. */
  by: string;
  /** One to three UTC instants, as ISO strings. */
  slots: string[];
  durationMinutes: number;
  /** True when this asks to move a time that is already standing. */
  isChange: boolean;
  at: string;
}

/** One practice time being settled between two members. Its `id` never changes. */
export interface ScheduledMeeting {
  id: string;
  otherId: string;
  /** Their current name ("A former member" if they have left). */
  otherName: string;
  /** Their time zone, if they saved one. Known only inside a record you share with them. */
  otherTimeZone: string;
  /** The asker, whose meeting link goes on the invite. */
  hostId: string;
  iHost: boolean;
  state: MeetingState;
  /** The settled time, once there is one. */
  startsAt: string | null;
  durationMinutes: number;
  /** Up one every time a settled time is changed or called off, so an invite can update one calendar event. */
  revision: number;
  /** The host's link, or the other person's if the host saved none. Empty until the time is confirmed. */
  meetingLink: string;
  meetingLinkFrom: 'host' | 'guest' | '';
  requestId: string | null;
  conversationId: string | null;
  /** The times waiting for an answer, if any. */
  proposal: MeetingProposal | null;
  /** They proposed, you answer. */
  myTurn: boolean;
  /** One of you has blocked the other, so nothing can be done with it. */
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What you fill in when proposing: one to three times and how long the case runs. */
export interface NewMeetingTimes {
  slots: string[];
  durationMinutes: number;
}

export type TimesResult = { ok: true; times: NewMeetingTimes } | { ok: false; message: string };

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const isDuration = (minutes: number): minutes is MeetingDuration => (MEETING_DURATIONS as readonly number[]).includes(minutes);

/** An instant, or null if it is not one. */
function instant(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The times and the length, checked exactly as the database checks them, with the sentences it uses. The times come
 * back as ISO strings in the order they were given.
 */
export function checkMeetingTimes(times: NewMeetingTimes, now: Date = new Date()): TimesResult {
  if (!isDuration(times.durationMinutes)) return { ok: false, message: 'Pick a length of 30, 45, 60 or 90 minutes.' };

  const slots = times.slots.map((s) => s.trim()).filter((s) => s !== '');
  if (slots.length < 1 || slots.length > MAX_MEETING_SLOTS) return { ok: false, message: 'Propose one, two or three times.' };

  const ms = slots.map(instant);
  if (ms.some((m) => m === null)) return { ok: false, message: 'Propose one, two or three times.' };

  const instants = ms as number[];
  if (new Set(instants).size !== instants.length) return { ok: false, message: 'Those times are the same. Propose different ones.' };
  if (instants.some((m) => m < now.getTime() + MEETING_SLOT_MARGIN_MINUTES * MINUTE)) {
    return { ok: false, message: 'Propose times at least ten minutes from now.' };
  }
  if (instants.some((m) => m > now.getTime() + MEETING_WINDOW_DAYS * DAY)) {
    return { ok: false, message: 'Propose times within the next 60 days.' };
  }
  return { ok: true, times: { slots: instants.map((m) => new Date(m).toISOString()), durationMinutes: times.durationMinutes } };
}

/** A proposal nobody answered is dead once its last time has passed. Nothing has to run for that to be true. */
export function hasLapsed(proposal: Pick<MeetingProposal, 'slots'> | null, now: Date = new Date()): boolean {
  if (!proposal || proposal.slots.length === 0) return false;
  return proposal.slots.every((s) => (instant(s) ?? 0) <= now.getTime());
}

/** What a record is really in, which is the stored status unless the times it is waiting on have all passed. */
export function meetingState(status: MeetingStatus, proposal: Pick<MeetingProposal, 'slots'> | null, now: Date = new Date()): MeetingState {
  if (status !== 'proposed') return status;
  return proposal && !hasLapsed(proposal, now) ? 'proposed' : 'lapsed';
}

/** Records waiting for you to answer. */
export const needsYou = (m: ScheduledMeeting) => m.myTurn && !m.blocked;

/** For a link's spoken name: "1 time needs you", "3 times need you". */
export const timesNeedYou = (n: number) => `${n} time${n === 1 ? ' needs' : 's need'} you`;

/** How many records are waiting for you: the number a screen can show on a tab. */
export const schedulingBadge = (meetings: ScheduledMeeting[]) => meetings.filter(needsYou).length;

/** The next settled time that has not happened yet, if there is one. */
export function nextConfirmed(meetings: readonly ScheduledMeeting[], now: Date = new Date()): ScheduledMeeting | null {
  const upcoming = meetings
    .filter((m) => m.state === 'confirmed' && m.startsAt !== null && (instant(m.startsAt) ?? 0) > now.getTime())
    .sort((a, b) => (instant(a.startsAt!) ?? 0) - (instant(b.startsAt!) ?? 0));
  return upcoming[0] ?? null;
}

/** The times still waiting for an answer from one of you, if there are any. A set whose times have all passed is not. */
export function openProposal(m: ScheduledMeeting, now: Date = new Date()): MeetingProposal | null {
  if (!m.proposal || m.state === 'declined' || m.state === 'cancelled') return null;
  return hasLapsed(m.proposal, now) ? null : m.proposal;
}

/** What is going on with one member: the time you have settled, and the times waiting on one of you. */
export interface SchedulingWith {
  /** The settled time still to come, if there is one. */
  confirmed: ScheduledMeeting | null;
  /** The record whose times are waiting for an answer — theirs for you, or yours for them. */
  awaiting: ScheduledMeeting | null;
}

/** Everything a conversation or a request card needs to show about scheduling with one member. */
export function schedulingWith(meetings: readonly ScheduledMeeting[], otherId: string, now: Date = new Date()): SchedulingWith {
  const theirs = meetings.filter((m) => m.otherId === otherId);
  return {
    confirmed: nextConfirmed(theirs, now),
    awaiting: theirs.find((m) => openProposal(m, now) !== null) ?? null,
  };
}

/**
 * The zone a member reads times in, as far as you can know it: it comes back inside a record the two of you share,
 * so the first time you ever propose to someone there is nothing to read and their side is left unsaid.
 */
export function zoneOfMember(meetings: readonly ScheduledMeeting[], otherId: string): string {
  return meetings.find((m) => m.otherId === otherId && m.otherTimeZone !== '')?.otherTimeZone ?? '';
}

/**
 * The records waiting for your answer that the badge should count. Times that came with a practice request you have
 * not answered yet are left out: that request is already on the badge, and answering it is where those times are
 * picked, so counting both would count one thing twice.
 */
export function timesNeedingYou(meetings: readonly ScheduledMeeting[], requestsAwaitingYou: readonly string[] = []): ScheduledMeeting[] {
  const held = new Set(requestsAwaitingYou);
  return meetings.filter((m) => needsYou(m) && !(m.requestId !== null && held.has(m.requestId)));
}
