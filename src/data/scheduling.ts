import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkMeetingTimes,
  hasLapsed,
  meetingState,
  type MeetingStatus,
  type NewMeetingTimes,
  type ScheduledMeeting,
} from '../domain/scheduling';
import { DataError } from './errors';

/**
 * Scheduling a practice time with another member. Everything goes through database functions that act only on the
 * caller's own records: there is no way to read, answer or change anyone else's, and the host's meeting link comes
 * back only once a time is confirmed.
 */
export interface SchedulingRepository {
  /** Your records, both ways, most recently touched first (the latest 100). */
  list(): Promise<ScheduledMeeting[]>;
  /** Proposes one to three times to someone you have a request or a conversation with. Resolves with the record's id. */
  propose(other: string, times: NewMeetingTimes, from?: { requestId?: string | null; conversationId?: string | null }): Promise<string>;
  /** Picks one of the times they proposed. */
  confirm(id: string, slot: string): Promise<void>;
  /** Replaces their times with times of your own, which hands the turn back to them. */
  counter(id: string, times: NewMeetingTimes): Promise<void>;
  /** Says no to the times they proposed. */
  decline(id: string): Promise<void>;
  /** Calls the whole thing off, from either side. The one thing a block does not stop. */
  cancel(id: string): Promise<void>;
  /** Asks to move a time that is already settled. The old time stands until the new one is confirmed. */
  change(id: string, times: NewMeetingTimes): Promise<void>;
}

interface MeetingRow {
  id: string;
  other_id: string;
  other_name: string | null;
  other_time_zone: string | null;
  host_id: string;
  i_host: boolean;
  state: ScheduledMeeting['state'];
  starts_at: string | null;
  duration_minutes: number;
  revision: number;
  meeting_link: string | null;
  meeting_link_from: 'host' | 'guest' | null;
  request_id: string | null;
  conversation_id: string | null;
  proposal_id: string | null;
  proposed_by: string | null;
  proposed_slots: string[] | null;
  proposed_duration: number | null;
  proposed_is_change: boolean | null;
  proposed_at: string | null;
  my_turn: boolean;
  blocked: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToMeeting(r: MeetingRow): ScheduledMeeting {
  return {
    id: r.id,
    otherId: r.other_id,
    otherName: r.other_name ?? 'A former member',
    otherTimeZone: r.other_time_zone ?? '',
    hostId: r.host_id,
    iHost: r.i_host,
    state: r.state,
    startsAt: r.starts_at,
    durationMinutes: r.duration_minutes,
    revision: r.revision,
    meetingLink: r.meeting_link ?? '',
    meetingLinkFrom: r.meeting_link_from ?? '',
    requestId: r.request_id,
    conversationId: r.conversation_id,
    proposal:
      r.proposal_id && r.proposed_by && r.proposed_slots
        ? {
            id: r.proposal_id,
            by: r.proposed_by,
            slots: r.proposed_slots,
            durationMinutes: r.proposed_duration ?? r.duration_minutes,
            isChange: r.proposed_is_change ?? false,
            at: r.proposed_at ?? r.created_at,
          }
        : null,
    myTurn: r.my_turn,
    blocked: r.blocked,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The database's own sentences ("Propose times within the next 60 days.") are written to be shown; everything else gets the usual translation. */
function fail(error: { message?: string; code?: string }): never {
  if (error.code === 'P0001' && error.message) throw new DataError(error.message, error);
  throw error;
}

/** Refused here with the same sentence the database would use, so a bad proposal never leaves the browser. */
function clean(times: NewMeetingTimes): NewMeetingTimes {
  const checked = checkMeetingTimes(times);
  if (!checked.ok) throw new DataError(checked.message);
  return checked.times;
}

export class SupabaseScheduling implements SchedulingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<ScheduledMeeting[]> {
    const { data, error } = await this.client.rpc('my_practice_meetings');
    if (error) throw error;
    return ((data ?? []) as MeetingRow[]).map(rowToMeeting);
  }

  async propose(other: string, times: NewMeetingTimes, from: { requestId?: string | null; conversationId?: string | null } = {}): Promise<string> {
    const t = clean(times);
    const { data, error } = await this.client.rpc('propose_practice_meeting', {
      p_other: other,
      p_slots: t.slots,
      p_duration: t.durationMinutes,
      p_request: from.requestId ?? null,
      p_conversation: from.conversationId ?? null,
    });
    if (error) fail(error);
    return data as string;
  }

  async confirm(id: string, slot: string): Promise<void> {
    const { error } = await this.client.rpc('confirm_practice_meeting', { p_meeting: id, p_slot: slot });
    if (error) fail(error);
  }

  async counter(id: string, times: NewMeetingTimes): Promise<void> {
    const t = clean(times);
    const { error } = await this.client.rpc('counter_practice_meeting', { p_meeting: id, p_slots: t.slots, p_duration: t.durationMinutes });
    if (error) fail(error);
  }

  async decline(id: string): Promise<void> {
    const { error } = await this.client.rpc('decline_practice_meeting', { p_meeting: id });
    if (error) fail(error);
  }

  async cancel(id: string): Promise<void> {
    const { error } = await this.client.rpc('cancel_practice_meeting', { p_meeting: id });
    if (error) fail(error);
  }

  async change(id: string, times: NewMeetingTimes): Promise<void> {
    const t = clean(times);
    const { error } = await this.client.rpc('change_practice_meeting', { p_meeting: id, p_slots: t.slots, p_duration: t.durationMinutes });
    if (error) fail(error);
  }
}

/** A member the twin knows about, and how they like to meet. */
interface TwinMember {
  userId: string;
  name: string;
  link?: string;
  timeZone?: string;
}

interface TwinRequest {
  from: string;
  to: string;
  status: string;
  createdAt: string;
}

interface Stored {
  id: string;
  lo: string;
  hi: string;
  host: string;
  requestId: string | null;
  conversationId: string | null;
  status: MeetingStatus;
  durationMinutes: number;
  startsAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  proposals: {
    id: string;
    by: string;
    slots: string[];
    durationMinutes: number;
    isChange: boolean;
    at: string;
    answered: boolean;
    outcome: string | null;
  }[];
  /** One row per settled time, as the database keeps: a second confirmation of the same proposal is impossible. */
  confirmations: { proposalId: string; revision: number; startsAt: string }[];
}

/**
 * For tests and demo-free fakes: several members' scheduling in one in-memory "database", with the same rules as the
 * real one (the turn rule, the time rules, the limits, blocks, lapsing, the link only on a confirmed record).
 * `as(userId)` gives that member's view.
 */
export function createMemoryScheduling(opts: {
  members: () => TwinMember[];
  /** The practice requests between them, which is what lets two members schedule and says who hosts. */
  requests: () => TwinRequest[];
  blocks: () => { blocker: string; blocked: string }[];
}) {
  const rows: Stored[] = [];
  let next = 1;
  const now = () => new Date();
  const member = (id: string) => opts.members().find((m) => m.userId === id);
  const blockedBetween = (a: string, b: string) =>
    opts.blocks().some((x) => (x.blocker === a && x.blocked === b) || (x.blocker === b && x.blocked === a));
  const refused = () => new DataError("You can't schedule with this member right now.");
  const gone = () => new DataError("That time isn't available.");
  const openOf = (row: Stored) => row.proposals.find((p) => !p.answered) ?? null;
  const openForPair = (lo: string, hi: string) =>
    rows.filter((r) => r.lo === lo && r.hi === hi).flatMap((r) => (openOf(r) ? [openOf(r)!] : []))[0] ?? null;
  const closeLapsed = (lo: string, hi: string) => {
    for (const row of rows.filter((r) => r.lo === lo && r.hi === hi)) {
      const open = openOf(row);
      if (open && hasLapsed(open, now())) {
        open.answered = true;
        open.outcome = 'lapsed';
      }
    }
  };
  /** The asker hosts: whoever sent the request these two came from. */
  const hostOf = (a: string, b: string) => {
    const between = opts
      .requests()
      .filter((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a))
      .sort((x, y) => Number(y.status === 'accepted') - Number(x.status === 'accepted') || x.createdAt.localeCompare(y.createdAt));
    return between[0]?.from ?? null;
  };
  const connected = (a: string, b: string) =>
    opts.requests().some((r) => ((r.from === a && r.to === b) || (r.from === b && r.to === a)) && (r.status === 'accepted' || r.status === 'pending'));

  function view(me: string) {
    const control = { failing: false as boolean };
    const guard = () => {
      if (control.failing) throw new Error('TypeError: Failed to fetch');
    };
    /**
     * The caller's own record. `allowBlocked` is for cancelling alone: calling a time off sends nothing and only
     * removes an obligation, so a block must not leave two people holding a time neither of them can clear.
     */
    const mineOnly = (id: string, allowBlocked = false) => {
      const row = rows.find((r) => r.id === id && (r.lo === me || r.hi === me));
      if (!row) throw gone();
      const other = row.lo === me ? row.hi : row.lo;
      if (!member(other) || (!allowBlocked && blockedBetween(row.lo, row.hi))) throw refused();
      return row;
    };
    const myTurnProposal = (row: Stored) => {
      const open = openOf(row);
      if (!open) throw new DataError('There are no times waiting for your answer.');
      if (open.by === me) throw new DataError("You proposed those times. It's their turn.");
      if (hasLapsed(open, now())) throw new DataError('Those times have all passed.');
      return open;
    };
    const limits = () => {
      const open = rows.flatMap((r) => r.proposals.filter((p) => !p.answered && p.by === me && !hasLapsed(p, now())));
      if (open.length >= 5) throw new DataError('You have times waiting with 5 members. Wait for an answer or cancel one first.');
      const day = Date.now() - 24 * 3600_000;
      const today = rows.flatMap((r) => r.proposals.filter((p) => p.by === me && Date.parse(p.at) > day));
      if (today.length >= 20) throw new DataError('That is a lot of times proposed for one day. Try again tomorrow.');
    };
    const pairFree = (lo: string, hi: string) => {
      closeLapsed(lo, hi);
      if (openForPair(lo, hi)) throw new DataError('You already have times waiting with this member.');
    };

    const repo: SchedulingRepository = {
      async list() {
        guard();
        return rows
          .filter((r) => r.lo === me || r.hi === me)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((r) => {
            const other = r.lo === me ? r.hi : r.lo;
            const open = openOf(r);
            const state = meetingState(r.status, open, now());
            const blocked = blockedBetween(r.lo, r.hi);
            const guest = r.host === other ? me : other;
            const hostLink = member(r.host)?.link ?? '';
            const guestLink = member(guest)?.link ?? '';
            const link = state === 'confirmed' && !blocked ? hostLink || guestLink : '';
            return {
              id: r.id,
              otherId: other,
              otherName: member(other)?.name ?? 'A former member',
              otherTimeZone: member(other)?.timeZone ?? '',
              hostId: r.host,
              iHost: r.host === me,
              state,
              startsAt: r.startsAt,
              durationMinutes: r.durationMinutes,
              revision: r.revision,
              meetingLink: link,
              meetingLinkFrom: link === '' ? ('' as const) : hostLink ? ('host' as const) : ('guest' as const),
              requestId: r.requestId,
              conversationId: r.conversationId,
              proposal: open ? { id: open.id, by: open.by, slots: open.slots, durationMinutes: open.durationMinutes, isChange: open.isChange, at: open.at } : null,
              myTurn: Boolean(open && open.by !== me && !hasLapsed(open, now())),
              blocked,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            };
          });
      },

      async propose(other, times, from = {}) {
        guard();
        const t = clean(times);
        if (!other || other === me || !member(other) || blockedBetween(me, other) || !connected(me, other)) throw refused();
        const lo = me < other ? me : other;
        const hi = me < other ? other : me;
        pairFree(lo, hi);
        limits();
        const id = `meet-${next++}`;
        const at = now().toISOString();
        rows.push({
          id,
          lo,
          hi,
          host: hostOf(me, other) ?? me,
          requestId: from.requestId ?? null,
          conversationId: from.conversationId ?? null,
          status: 'proposed',
          durationMinutes: t.durationMinutes,
          startsAt: null,
          revision: 0,
          createdAt: at,
          updatedAt: at,
          proposals: [{ id: `prop-${next++}`, by: me, slots: t.slots, durationMinutes: t.durationMinutes, isChange: false, at, answered: false, outcome: null }],
          confirmations: [],
        });
        return id;
      },

      async confirm(id, slot) {
        guard();
        const row = mineOnly(id);
        if (row.status === 'cancelled' || row.status === 'declined') throw gone();
        const open = myTurnProposal(row);
        if (!open.slots.includes(slot)) throw new DataError('Pick one of the times they proposed.');
        if (Date.parse(slot) <= Date.now()) throw new DataError('That time has passed. Ask for another one.');
        if (row.confirmations.some((c) => c.proposalId === open.id || c.revision === row.revision + 1)) {
          throw new DataError('That time has just been settled. Open it again to see it.');
        }
        open.answered = true;
        open.outcome = 'confirmed';
        row.status = 'confirmed';
        row.startsAt = slot;
        row.durationMinutes = open.durationMinutes;
        row.revision += 1;
        row.updatedAt = now().toISOString();
        row.confirmations.push({ proposalId: open.id, revision: row.revision, startsAt: slot });
      },

      async counter(id, times) {
        guard();
        const row = mineOnly(id);
        if (row.status === 'cancelled' || row.status === 'declined') throw gone();
        const open = myTurnProposal(row);
        const t = clean(times);
        limits();
        open.answered = true;
        open.outcome = 'countered';
        const at = now().toISOString();
        row.proposals.push({ id: `prop-${next++}`, by: me, slots: t.slots, durationMinutes: t.durationMinutes, isChange: open.isChange, at, answered: false, outcome: null });
        row.durationMinutes = t.durationMinutes;
        row.updatedAt = at;
      },

      async decline(id) {
        guard();
        const row = mineOnly(id);
        if (row.status === 'cancelled' || row.status === 'declined') throw gone();
        const open = myTurnProposal(row);
        open.answered = true;
        open.outcome = 'declined';
        if (row.status !== 'confirmed') row.status = 'declined';
        row.updatedAt = now().toISOString();
      },

      async cancel(id) {
        guard();
        const row = mineOnly(id, true);
        if (row.status === 'cancelled' || row.status === 'declined') throw gone();
        if (row.startsAt && Date.parse(row.startsAt) <= Date.now()) throw new DataError('That case has already happened.');
        const open = openOf(row);
        if (open) {
          open.answered = true;
          open.outcome = 'cancelled';
        }
        if (row.status === 'confirmed') row.revision += 1;
        row.status = 'cancelled';
        row.updatedAt = now().toISOString();
      },

      async change(id, times) {
        guard();
        const row = mineOnly(id);
        if (row.status !== 'confirmed') throw new DataError('There is no time to move yet.');
        if (row.startsAt && Date.parse(row.startsAt) <= Date.now()) throw new DataError('That case has already happened.');
        const t = clean(times);
        pairFree(row.lo, row.hi);
        limits();
        const at = now().toISOString();
        row.proposals.push({ id: `prop-${next++}`, by: me, slots: t.slots, durationMinutes: t.durationMinutes, isChange: true, at, answered: false, outcome: null });
        row.updatedAt = at;
      },
    };
    return Object.assign(repo, { control });
  }

  return { as: view, rows };
}
