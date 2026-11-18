// @vitest-environment node
//
// Scheduling a practice time (issue #99): a record between exactly two members, its turn rule, its time rules, its
// limits, and the host's meeting link — attacked against the real migrations in an in-process Postgres as a third
// member who is not on the record, as a visitor, as a signed-out caller, as a blocked member in both directions and
// as a member who has not verified their email.
//
// The two sharpest groups are at the bottom: "the host's meeting link" (it must not come back before the time is
// confirmed, nor to anyone who is not one of the two) and "two confirmations at once" (exactly one time is settled,
// and the schema itself refuses the second, not the order the two callers happened to read in).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkMeetingTimes } from '../domain/scheduling';
import { ALICE, BOB, CAROL, DAVE, as, createDb, fails as failsOn, resetData } from '../test/pg';

let db: PGlite;
const fails = (sql: string, params: unknown[] = []) => failsOn(db, sql, params);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

/** Alice's room, distinctive enough to search every readable row for. */
const ALICE_ROOM = 'https://us02web.zoom.us/j/9876543210?pwd=AliceOnlyRoom';
const BOB_ROOM = 'https://meet.google.com/bob-only-room';

const HOUR = 3_600_000;
/** Candidate times as Postgres array literals: `at(24, 48)` is tomorrow and the day after. */
const at = (...hours: number[]) => `{${hours.map((h) => new Date(Date.now() + h * HOUR).toISOString()).join(',')}}`;
const hoursFromNow = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

type Meeting = {
  id: string;
  other_id: string;
  other_name: string | null;
  other_time_zone: string | null;
  host_id: string;
  i_host: boolean;
  state: string;
  starts_at: Date | null;
  duration_minutes: number;
  revision: number;
  meeting_link: string | null;
  meeting_link_from: string | null;
  request_id: string | null;
  conversation_id: string | null;
  proposal_id: string | null;
  proposed_by: string | null;
  proposed_slots: Date[] | null;
  proposed_duration: number | null;
  proposed_is_change: boolean | null;
  proposed_at: Date | null;
  my_turn: boolean;
  blocked: boolean;
};

const mine = async (uid: string) => {
  await as(db, 'authenticated', uid);
  return (await db.query<Meeting>('select * from public.my_practice_meetings()')).rows;
};
const one = async (uid: string) => (await mine(uid))[0];

const propose = async (uid: string, other: string, slots = at(24, 48, 72), duration = 60) => {
  await as(db, 'authenticated', uid);
  return (await db.query<{ id: string }>('select public.propose_practice_meeting($1, $2::timestamptz[], $3) as id', [other, slots, duration])).rows[0].id;
};
const proposeFails = async (uid: string, other: string, slots = at(24), duration = 60) => {
  await as(db, 'authenticated', uid);
  return fails('select public.propose_practice_meeting($1, $2::timestamptz[], $3)', [other, slots, duration]);
};
const confirm = async (uid: string, id: string, slot: string) => {
  await as(db, 'authenticated', uid);
  return fails('select public.confirm_practice_meeting($1, $2)', [id, slot]);
};
const counter = async (uid: string, id: string, slots = at(96), duration = 45) => {
  await as(db, 'authenticated', uid);
  return fails('select public.counter_practice_meeting($1, $2::timestamptz[], $3)', [id, slots, duration]);
};
const decline = async (uid: string, id: string) => {
  await as(db, 'authenticated', uid);
  return fails('select public.decline_practice_meeting($1)', [id]);
};
const cancel = async (uid: string, id: string) => {
  await as(db, 'authenticated', uid);
  return fails('select public.cancel_practice_meeting($1)', [id]);
};
const change = async (uid: string, id: string, slots = at(120), duration = 90) => {
  await as(db, 'authenticated', uid);
  return fails('select public.change_practice_meeting($1, $2::timestamptz[], $3)', [id, slots, duration]);
};
const saveLink = async (uid: string, link: string | null, zone: string | null = null) => {
  await as(db, 'authenticated', uid);
  await db.query('select * from public.save_my_meeting_prefs($1, $2)', [link, zone]);
};
const rowCount = async (table: string, where = '') => {
  await as(db, 'postgres');
  return Number((await db.query<{ n: string }>(`select count(*) as n from public.${table} ${where}`)).rows[0].n);
};
/** The first slot of the proposal waiting for `uid`, as the ISO string the screen would send back. */
const firstSlot = async (uid: string) => (await one(uid)).proposed_slots![0].toISOString();

/** Alice asks Bob to case and Bob says yes, which is what lets the two of them schedule. Alice is the asker, so Alice hosts. */
async function connectAliceAndBob() {
  await as(db, 'authenticated', ALICE);
  const { rows } = await db.query<{ id: string }>(`select public.send_practice_request($1, 'Airline profit', 'Cosentino', 'some evening', 'Up for it?') as id`, [BOB]);
  await as(db, 'authenticated', BOB);
  await db.query('select public.respond_practice_request($1, true, $2, false)', [rows[0].id, 'Yes']);
  return rows[0].id;
}

beforeEach(async () => {
  await resetData(db);
  await as(db, 'postgres');
  await db.query(
    `insert into public.profiles (user_id, display_name, listed, open_to_requests) values
       ($1, 'Alice Adams', true, true), ($2, 'Bob Brown', true, true), ($3, 'Carol Chen', true, true)`,
    [ALICE, BOB, CAROL],
  );
});

describe('proposing a time', () => {
  beforeEach(connectAliceAndBob);

  it('makes one record both people can see, with a stable id, the other’s name and the times proposed', async () => {
    const id = await propose(BOB, ALICE, at(24, 48, 72), 45);

    const bob = await one(BOB);
    expect(bob).toMatchObject({ id, other_id: ALICE, other_name: 'Alice Adams', state: 'proposed', starts_at: null, revision: 0, duration_minutes: 45, proposed_by: BOB, my_turn: false, blocked: false });
    expect(bob.proposed_slots).toHaveLength(3);

    const alice = await one(ALICE);
    expect(alice).toMatchObject({ id, other_id: BOB, other_name: 'Bob Brown', state: 'proposed', proposed_by: BOB, my_turn: true });
    // It is tied to the request and the conversation it came from.
    expect(alice.request_id).not.toBeNull();
    expect(alice.conversation_id).not.toBeNull();

    // The id survives every change to the record, which is what lets a later invite update one calendar event.
    expect(await confirm(ALICE, id, await firstSlot(ALICE))).toBe('');
    expect(await change(ALICE, id)).toBe('');
    expect(await counter(BOB, id, at(130))).toBe('');
    expect((await one(ALICE)).id).toBe(id);
    expect(await rowCount('practice_meetings')).toBe(1);
  });

  it('makes the asker the host, whichever of them proposes the times', async () => {
    const id = await propose(BOB, ALICE);
    expect(await one(ALICE)).toMatchObject({ host_id: ALICE, i_host: true });
    expect(await one(BOB)).toMatchObject({ host_id: ALICE, i_host: false });
    expect(await cancel(ALICE, id)).toBe('');

    // Alice proposing changes nothing: she asked, so she hosts.
    await propose(ALICE, BOB);
    expect(await one(ALICE)).toMatchObject({ host_id: ALICE, i_host: true });
  });

  it('refuses a member there is no request or conversation with, and says nothing about why', async () => {
    expect(await proposeFails(ALICE, CAROL)).toMatch(/You can't schedule with this member right now\./);
    // Yourself, nobody, and a member who never verified their email read the same.
    expect(await proposeFails(ALICE, ALICE)).toMatch(/You can't schedule with this member right now\./);
    expect(await proposeFails(ALICE, DAVE)).toMatch(/You can't schedule with this member right now\./);
    expect(await rowCount('practice_meetings')).toBe(0);
  });
});

describe('the turn rule', () => {
  let id: string;
  beforeEach(async () => {
    await connectAliceAndBob();
    id = await propose(BOB, ALICE);
  });

  it('will not let you answer your own proposal, however you try', async () => {
    const slot = await firstSlot(ALICE);
    expect(await confirm(BOB, id, slot)).toMatch(/You proposed those times\. It's their turn\./);
    expect(await counter(BOB, id)).toMatch(/You proposed those times/);
    expect(await decline(BOB, id)).toMatch(/You proposed those times/);
    expect(await one(ALICE)).toMatchObject({ state: 'proposed', my_turn: true });
    expect(await one(BOB)).toMatchObject({ my_turn: false });
  });

  it('hands the turn over on a counter, and back again', async () => {
    expect(await counter(ALICE, id, at(96, 120))).toBe('');
    expect(await one(ALICE)).toMatchObject({ my_turn: false, proposed_by: ALICE, proposed_duration: 45 });
    expect(await one(BOB)).toMatchObject({ my_turn: true, proposed_by: ALICE });
    expect(await counter(ALICE, id)).toMatch(/You proposed those times/);
    expect(await counter(BOB, id, at(140))).toBe('');
    expect(await one(ALICE)).toMatchObject({ my_turn: true, proposed_by: BOB });
    // Every proposal is kept, so the record remembers how the two of them got there.
    expect(await rowCount('practice_meeting_proposals')).toBe(3);
    expect(await rowCount('practice_meeting_proposals', `where outcome = 'countered'`)).toBe(2);
  });

  it('ends the record on a decline, and will not take another answer afterwards', async () => {
    const slot = await firstSlot(ALICE);
    expect(await decline(ALICE, id)).toBe('');
    expect(await one(ALICE)).toMatchObject({ state: 'declined', my_turn: false, starts_at: null });
    expect(await confirm(ALICE, id, slot)).toMatch(/That time isn't available\./);
    expect(await counter(ALICE, id)).toMatch(/That time isn't available\./);
    expect(await cancel(BOB, id)).toMatch(/That time isn't available\./);
    // They can start again: a declined record is out of the way.
    expect(await proposeFails(ALICE, BOB, at(24))).toBe('');
    expect(await rowCount('practice_meetings')).toBe(2);
  });

  it('lets either of them call it off, and refuses everything afterwards', async () => {
    const slot = await firstSlot(ALICE);
    expect(await cancel(BOB, id)).toBe('');
    expect(await one(ALICE)).toMatchObject({ state: 'cancelled', proposal_id: null });
    expect(await confirm(ALICE, id, slot)).toMatch(/That time isn't available\./);
    expect(await cancel(ALICE, id)).toMatch(/That time isn't available\./);
    // Cancelling a proposal nobody had agreed to is not a revision: there is no calendar event to call off.
    expect(await one(ALICE)).toMatchObject({ revision: 0 });
  });

  it('refuses every answer once the case has happened', async () => {
    const slot = await firstSlot(ALICE);
    expect(await confirm(ALICE, id, slot)).toBe('');
    await as(db, 'postgres');
    await db.query(`update public.practice_meetings set starts_at = now() - interval '1 hour'`);
    expect(await change(ALICE, id)).toMatch(/That case has already happened\./);
    expect(await cancel(BOB, id)).toMatch(/That case has already happened\./);
  });
});

describe('the time rules', () => {
  beforeEach(connectAliceAndBob);

  it('refuses times that have passed, times too far ahead, the same time twice, and the wrong number of them', async () => {
    expect(await proposeFails(ALICE, BOB, at(-1))).toMatch(/Propose times at least ten minutes from now\./);
    expect(await proposeFails(ALICE, BOB, at(0.1))).toMatch(/Propose times at least ten minutes from now\./);
    expect(await proposeFails(ALICE, BOB, at(24 * 61))).toMatch(/Propose times within the next 60 days\./);
    expect(await proposeFails(ALICE, BOB, at(24, 24))).toMatch(/Those times are the same\./);
    expect(await proposeFails(ALICE, BOB, at(24, 48, 72, 96))).toMatch(/Propose one, two or three times\./);
    expect(await proposeFails(ALICE, BOB, '{}')).toMatch(/Propose one, two or three times\./);
    await as(db, 'authenticated', ALICE);
    expect(await fails('select public.propose_practice_meeting($1, null, 60)', [BOB])).toMatch(/Propose one, two or three times\./);
    expect(await rowCount('practice_meetings')).toBe(0);
  });

  it('takes only a length from the short list', async () => {
    for (const bad of [0, 15, 61, 120, -30]) {
      expect(await proposeFails(ALICE, BOB, at(24), bad), String(bad)).toMatch(/Pick a length of 30, 45, 60 or 90 minutes\./);
    }
    for (const good of [30, 45, 60, 90]) {
      const id = await propose(ALICE, BOB, at(24), good);
      expect((await one(ALICE)).duration_minutes, String(good)).toBe(good);
      await cancel(ALICE, id);
    }
  });

  it('only confirms a time that was actually proposed, and never one that has passed', async () => {
    const id = await propose(BOB, ALICE, at(24, 48));
    expect(await confirm(ALICE, id, hoursFromNow(36))).toMatch(/Pick one of the times they proposed\./);
    expect(await confirm(ALICE, id, hoursFromNow(-2))).toMatch(/Pick one of the times they proposed\./);
    // A proposed time that passed while they were deciding: one of the two is still live, so the record is not lapsed.
    await as(db, 'postgres');
    await db.query(`update public.practice_meeting_proposals set slots = array[now() - interval '1 hour', now() + interval '3 days']::timestamptz[]`);
    const [gone] = (await mine(ALICE))[0].proposed_slots!;
    expect(await confirm(ALICE, id, gone.toISOString())).toMatch(/That time has passed\./);
    expect(await one(ALICE)).toMatchObject({ state: 'proposed' });
  });

  it('cannot be got round by writing the rows directly, even as the database owner', async () => {
    const id = await propose(BOB, ALICE, at(24));
    await as(db, 'postgres');
    const fourSlots = `{${[24, 48, 72, 96].map((h) => new Date(Date.now() + h * HOUR).toISOString()).join(',')}}`;
    expect(await fails(`update public.practice_meeting_proposals set slots = $1::timestamptz[]`, [fourSlots])).toMatch(/practice_meeting_proposals_slots_check|violates check constraint/);
    expect(await fails(`update public.practice_meeting_proposals set slots = '{}'::timestamptz[]`)).toMatch(/violates (check|not-null) constraint/);
    expect(await fails(`update public.practice_meetings set duration_minutes = 25 where id = $1`, [id])).toMatch(/violates check constraint/);
    // A record is between two people, and the host is one of them.
    expect(await fails(`update public.practice_meetings set host = $1 where id = $2`, [CAROL, id])).toMatch(/violates check constraint/);
    expect(await fails(`update public.practice_meetings set user_hi = user_lo where id = $1`, [id])).toMatch(/violates check constraint/);
    // A record cannot claim a confirmed time it never settled, or a settled time with no revision.
    expect(await fails(`update public.practice_meetings set status = 'confirmed' where id = $1`, [id])).toMatch(/violates check constraint/);
    expect(await fails(`update public.practice_meetings set starts_at = now() + interval '1 day' where id = $1`, [id])).toMatch(/violates check constraint/);
  });
});

describe('the database enforces the screen’s rule, not a weaker one', () => {
  // The same times through the plain function in src/domain/scheduling.ts and through the database. If the two ever
  // disagree about one of them, this fails and says which.
  beforeEach(connectAliceAndBob);

  const samples: { slots: number[]; duration: number }[] = [
    { slots: [24], duration: 60 },
    { slots: [1, 2, 3], duration: 30 },
    { slots: [0.5], duration: 45 },
    { slots: [24], duration: 90 },
    { slots: [24, 24], duration: 60 },
    { slots: [24, 48, 72, 96], duration: 60 },
    { slots: [], duration: 60 },
    { slots: [-1], duration: 60 },
    { slots: [0.1], duration: 60 },
    { slots: [24 * 59], duration: 60 },
    { slots: [24 * 61], duration: 60 },
    { slots: [24], duration: 15 },
    { slots: [24], duration: 0 },
    { slots: [24], duration: 120 },
    { slots: [1, 24 * 61], duration: 60 },
  ];

  it('accepts and refuses exactly the same times, with the same sentence', async () => {
    const disagreed: string[] = [];
    for (const sample of samples) {
      const iso = sample.slots.map((h) => new Date(Date.now() + h * HOUR).toISOString());
      const screen = checkMeetingTimes({ slots: iso, durationMinutes: sample.duration });
      const database = await proposeFails(ALICE, BOB, `{${iso.join(',')}}`, sample.duration);
      const agreed = screen.ok ? database === '' : database.includes(screen.message);
      if (!agreed) disagreed.push(`${JSON.stringify(sample)}: screen ${JSON.stringify(screen)}, database ${JSON.stringify(database)}`);
      if (database === '') {
        const [made] = await mine(ALICE);
        await cancel(ALICE, made.id);
      }
    }
    expect(disagreed).toEqual([]);
  });
});

describe('a proposal nobody answered lapses when its last time passes', () => {
  let id: string;
  beforeEach(async () => {
    await connectAliceAndBob();
    id = await propose(BOB, ALICE, at(24, 48));
    await as(db, 'postgres');
    await db.query(`update public.practice_meeting_proposals set slots = array[now() - interval '2 hours', now() - interval '1 hour']::timestamptz[]`);
  });

  it('reads as lapsed, with nothing waiting for anyone, and is answered by nobody', async () => {
    expect(await one(ALICE)).toMatchObject({ state: 'lapsed', my_turn: false, starts_at: null });
    expect(await one(BOB)).toMatchObject({ state: 'lapsed', my_turn: false });
    expect(await confirm(ALICE, id, hoursFromNow(-1))).toMatch(/Those times have all passed\./);
    expect(await counter(ALICE, id, at(24))).toMatch(/Those times have all passed\./);
  });

  it('is closed by the next proposal rather than by anything running in the background', async () => {
    // Nothing sweeps it: it is still open until somebody writes again, and reads already call it lapsed.
    expect(await rowCount('practice_meeting_proposals', 'where answered_at is null')).toBe(1);
    // And it no longer holds the one-open-proposal-per-pair place.
    expect(await proposeFails(ALICE, BOB, at(24))).toBe('');
    expect(await rowCount('practice_meeting_proposals', `where outcome = 'lapsed'`)).toBe(1);
    expect(await rowCount('practice_meetings')).toBe(2);
    expect(await one(ALICE)).toMatchObject({ state: 'proposed', my_turn: false });
  });
});

describe('the limits', () => {
  beforeEach(connectAliceAndBob);

  it('allows one open proposal per pair', async () => {
    await propose(BOB, ALICE, at(24));
    expect(await proposeFails(BOB, ALICE, at(48))).toMatch(/You already have times waiting with this member\./);
    // Including from the other side, and including a change: one negotiation at a time.
    expect(await proposeFails(ALICE, BOB, at(48))).toMatch(/You already have times waiting with this member\./);
    expect(await rowCount('practice_meeting_proposals')).toBe(1);
  });

  it('allows five open proposals at a time and refuses the sixth', async () => {
    // Four more members who have all agreed to case with Alice.
    const others: string[] = [];
    for (let i = 0; i < 5; i++) {
      const uid = `55555555-5555-4555-8555-00000000000${i}`;
      others.push(uid);
      await as(db, 'postgres');
      await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [uid, `m${i}@example.com`]);
      await db.query(`insert into public.profiles (user_id, display_name, listed, open_to_requests) values ($1, $2, true, true)`, [uid, `Member ${i}`]);
      await as(db, 'authenticated', uid);
      const { rows } = await db.query<{ id: string }>(`select public.send_practice_request($1, 'A case', null, null, null) as id`, [ALICE]);
      await as(db, 'authenticated', ALICE);
      await db.query('select public.respond_practice_request($1, true, null, false)', [rows[0].id]);
    }
    expect(await proposeFails(ALICE, BOB, at(24))).toBe('');
    for (let i = 0; i < 4; i++) expect(await proposeFails(ALICE, others[i], at(24)), `open ${i}`).toBe('');
    expect(await proposeFails(ALICE, others[4], at(24))).toMatch(/You have times waiting with 5 members\./);
    // The other person is not limited by what Alice has open.
    expect(await proposeFails(others[4], ALICE, at(24))).toBe('');
  });

  it('allows twenty proposals in a day, counting counters and changes, and refuses the twenty-first', async () => {
    const id = await propose(ALICE, BOB, at(24));
    // Alice and Bob bounce times back and forth; every one of Alice's counts against her day.
    for (let i = 0; i < 19; i++) {
      expect(await counter(BOB, id, at(30 + i)), `bob ${i}`).toBe('');
      expect(await counter(ALICE, id, at(60 + i)), `alice ${i}`).toBe('');
    }
    expect(await counter(BOB, id, at(100))).toBe('');
    expect(await counter(ALICE, id, at(101))).toMatch(/That is a lot of times proposed for one day\./);
    // Yesterday's proposals are not in the window.
    await as(db, 'postgres');
    await db.query(`update public.practice_meeting_proposals set created_at = created_at - interval '25 hours' where proposed_by = $1`, [ALICE]);
    expect(await counter(ALICE, id, at(102))).toBe('');
  });
});

describe('changing a time that is already standing', () => {
  let id: string;
  beforeEach(async () => {
    await connectAliceAndBob();
    id = await propose(BOB, ALICE, at(24, 48));
    expect(await confirm(ALICE, id, await firstSlot(ALICE))).toBe('');
  });

  it('leaves the old time standing until the new one is confirmed', async () => {
    const was = (await one(ALICE)).starts_at;
    expect(await change(ALICE, id, at(120), 90)).toBe('');

    // Both of them still have the old time, and Bob is the one being asked.
    expect(await one(ALICE)).toMatchObject({ state: 'confirmed', starts_at: was, revision: 1, my_turn: false, proposed_is_change: true });
    expect(await one(BOB)).toMatchObject({ state: 'confirmed', starts_at: was, my_turn: true, proposed_is_change: true });

    expect(await confirm(BOB, id, await firstSlot(BOB))).toBe('');
    const after = await one(ALICE);
    expect(after.starts_at).not.toEqual(was);
    expect(after).toMatchObject({ state: 'confirmed', revision: 2, duration_minutes: 90, proposal_id: null });
  });

  it('keeps the standing time when the other person says no to the change', async () => {
    const was = (await one(ALICE)).starts_at;
    expect(await change(ALICE, id, at(120))).toBe('');
    expect(await decline(BOB, id)).toBe('');
    expect(await one(ALICE)).toMatchObject({ state: 'confirmed', starts_at: was, revision: 1, proposal_id: null });
  });

  it('counts the change as a revision only when it is settled, and a cancellation as one of its own', async () => {
    expect(await one(ALICE)).toMatchObject({ revision: 1 });
    expect(await cancel(BOB, id)).toBe('');
    // The time that was called off is kept, so a later invite can cancel the right event.
    expect(await one(ALICE)).toMatchObject({ state: 'cancelled', revision: 2, starts_at: expect.anything() });
  });

  it('has nothing to move before a time is settled', async () => {
    expect(await cancel(ALICE, id)).toBe('');
    const second = await propose(ALICE, BOB, at(24));
    expect(await change(ALICE, second, at(48))).toMatch(/There is no time to move yet\./);
  });
});

describe('two confirmations at once settle exactly one time', () => {
  // PGlite is one in-process connection, so two transactions cannot really overlap here. What the tests below prove
  // instead is the thing that makes the overlap safe: the second write of a racing pair is refused by the schema and
  // by the conditional update, from the state both callers had read a moment earlier — not by the order they read in.
  let id: string;
  let slots: Date[];
  beforeEach(async () => {
    await connectAliceAndBob();
    id = await propose(BOB, ALICE, at(24, 48, 72));
    slots = (await one(ALICE)).proposed_slots!;
  });

  it('settles the first and tells the second the same sentence, leaving one time and one revision', async () => {
    expect(await confirm(ALICE, id, slots[0].toISOString())).toBe('');
    expect(await confirm(ALICE, id, slots[1].toISOString())).toMatch(/There are no times waiting for your answer\./);
    const after = await one(ALICE);
    expect(after.starts_at?.toISOString()).toBe(slots[0].toISOString());
    expect(after.revision).toBe(1);
    expect(await rowCount('practice_meeting_confirmations')).toBe(1);
  });

  it('refuses the second caller’s writes even when both of them read the record unanswered', async () => {
    await as(db, 'postgres');
    const [{ id: proposalId }] = (await db.query<{ id: string }>('select id from public.practice_meeting_proposals')).rows;
    const seen = (await db.query<{ revision: number }>('select revision from public.practice_meetings where id = $1', [id])).rows[0].revision;

    // Caller one, writing exactly what confirm_practice_meeting writes.
    const answered = await db.query(`update public.practice_meeting_proposals set answered_at = now(), outcome = 'confirmed' where id = $1 and answered_at is null`, [proposalId]);
    expect(answered.affectedRows).toBe(1);
    await db.query(`update public.practice_meetings set status = 'confirmed', starts_at = $2, revision = revision + 1 where id = $1 and revision = $3`, [id, slots[0], seen]);
    await db.query(
      `insert into public.practice_meeting_confirmations (proposal_id, meeting_id, revision, starts_at, duration_minutes, confirmed_by)
       values ($1, $2, $3, $4, 60, $5)`,
      [proposalId, id, seen + 1, slots[0], ALICE],
    );

    // Caller two, from the same reads, a moment later. Each of its three writes is refused on its own.
    const second = await db.query(`update public.practice_meeting_proposals set answered_at = now(), outcome = 'confirmed' where id = $1 and answered_at is null`, [proposalId]);
    expect(second.affectedRows).toBe(0); // the conditional update: nothing left to answer
    const stale = await db.query(`update public.practice_meetings set starts_at = $2, revision = revision + 1 where id = $1 and revision = $3`, [id, slots[1], seen]);
    expect(stale.affectedRows).toBe(0); // the compare-and-set on the revision it read
    expect(
      await fails(
        `insert into public.practice_meeting_confirmations (proposal_id, meeting_id, revision, starts_at, duration_minutes, confirmed_by)
         values ($1, $2, $3, $4, 60, $5)`,
        [proposalId, id, seen + 1, slots[1], ALICE],
      ),
    ).toMatch(/duplicate key value|unique constraint/); // the primary key: one confirmation per proposal

    // One time, one revision, one confirmation, whichever caller got there first.
    expect(await rowCount('practice_meeting_confirmations')).toBe(1);
    const after = await one(ALICE);
    expect(after.starts_at?.toISOString()).toBe(slots[0].toISOString());
    expect(after.revision).toBe(1);
  });

  it('refuses the real function a second time from the exact state the first caller started in', async () => {
    // The nearest a single connection gets to the real overlap: Alice confirms, then everything a second transaction
    // could not have seen is rewound and the real function is called again on the state that caller read. It gets
    // through its own checks and is stopped by the ledger, which is the point of the ledger.
    expect(await confirm(ALICE, id, slots[0].toISOString())).toBe('');
    await as(db, 'postgres');
    await db.query(`update public.practice_meeting_proposals set answered_at = null, outcome = null`);
    await db.query(`update public.practice_meetings set status = 'proposed', starts_at = null, revision = 0 where id = $1`, [id]);

    expect(await confirm(ALICE, id, slots[1].toISOString())).toMatch(/That time has just been settled\./);
    expect(await rowCount('practice_meeting_confirmations')).toBe(1);
    // And nothing of the refused call was kept: the whole function rolls back.
    expect(await rowCount('practice_meetings', `where status = 'confirmed'`)).toBe(0);
    expect(await rowCount('practice_meeting_proposals', 'where answered_at is not null')).toBe(0);
  });

  it('refuses a second confirmation of the same record at the same revision, however it is written', async () => {
    expect(await confirm(ALICE, id, slots[0].toISOString())).toBe('');
    await as(db, 'postgres');
    const [{ id: proposalId }] = (await db.query<{ id: string }>('select id from public.practice_meeting_proposals')).rows;
    // A different proposal row cannot take a revision that is already settled either.
    const other = (
      await db.query<{ id: string }>(
        `insert into public.practice_meeting_proposals (meeting_id, user_lo, user_hi, proposed_by, slots, duration_minutes, answered_at, outcome)
         select meeting_id, user_lo, user_hi, proposed_by, slots, duration_minutes, now(), 'confirmed' from public.practice_meeting_proposals where id = $1
         returning id`,
        [proposalId],
      )
    ).rows[0].id;
    expect(
      await fails(
        `insert into public.practice_meeting_confirmations (proposal_id, meeting_id, revision, starts_at, duration_minutes, confirmed_by)
         values ($1, $2, 1, $3, 60, $4)`,
        [other, id, slots[1], BOB],
      ),
    ).toMatch(/duplicate key value|unique constraint/);
    expect(await rowCount('practice_meeting_confirmations')).toBe(1);
  });

  it('keeps one open proposal per pair even if two proposals are written at the same moment', async () => {
    await as(db, 'postgres');
    const row = (await db.query<{ meeting_id: string; user_lo: string; user_hi: string }>('select meeting_id, user_lo, user_hi from public.practice_meeting_proposals')).rows[0];
    expect(
      await fails(
        `insert into public.practice_meeting_proposals (meeting_id, user_lo, user_hi, proposed_by, slots, duration_minutes)
         values ($1, $2, $3, $4, $5::timestamptz[], 60)`,
        [row.meeting_id, row.user_lo, row.user_hi, BOB, at(96)],
      ),
    ).toMatch(/duplicate key value|unique constraint/);
  });
});

describe('the host’s meeting link', () => {
  let id: string;
  beforeEach(async () => {
    await connectAliceAndBob();
    await saveLink(ALICE, ALICE_ROOM, 'America/Chicago');
    await saveLink(BOB, BOB_ROOM, 'Europe/London');
    id = await propose(BOB, ALICE, at(24, 48));
  });

  it('is not returned to anyone while the time is only proposed', async () => {
    expect(await one(ALICE)).toMatchObject({ meeting_link: null, meeting_link_from: null });
    expect(await one(BOB)).toMatchObject({ meeting_link: null, meeting_link_from: null });
    await as(db, 'authenticated', BOB);
    expect(JSON.stringify(await mine(BOB))).not.toMatch(/AliceOnlyRoom/);
  });

  it('goes to both of them once the time is confirmed, and it is the asker’s', async () => {
    expect(await confirm(ALICE, id, await firstSlot(ALICE))).toBe('');
    expect(await one(ALICE)).toMatchObject({ meeting_link: ALICE_ROOM, meeting_link_from: 'host', i_host: true });
    expect(await one(BOB)).toMatchObject({ meeting_link: ALICE_ROOM, meeting_link_from: 'host', i_host: false });
  });

  it('falls back to the other person’s link when the host saved none, and to nothing when neither did', async () => {
    await saveLink(ALICE, null);
    expect(await confirm(ALICE, id, await firstSlot(ALICE))).toBe('');
    expect(await one(ALICE)).toMatchObject({ meeting_link: BOB_ROOM, meeting_link_from: 'guest' });
    expect(await one(BOB)).toMatchObject({ meeting_link: BOB_ROOM, meeting_link_from: 'guest' });

    await saveLink(BOB, null);
    expect(await one(ALICE)).toMatchObject({ meeting_link: null, meeting_link_from: null });
  });

  it('is gone again when the time is called off, and while either of them has blocked the other', async () => {
    expect(await confirm(ALICE, id, await firstSlot(ALICE))).toBe('');
    await as(db, 'authenticated', BOB);
    await db.query('select public.block_member($1)', [ALICE]);
    expect(await one(ALICE)).toMatchObject({ meeting_link: null, blocked: true });
    expect(await one(BOB)).toMatchObject({ meeting_link: null, blocked: true });

    await as(db, 'authenticated', BOB);
    await db.query('select public.unblock_practice_asker($1)', [ALICE]);
    expect(await one(BOB)).toMatchObject({ meeting_link: ALICE_ROOM, blocked: false });
    expect(await cancel(BOB, id)).toBe('');
    expect(await one(BOB)).toMatchObject({ state: 'cancelled', meeting_link: null });
  });

  it('never reaches a third member or a visitor, by any route at all', async () => {
    expect(await confirm(ALICE, id, await firstSlot(ALICE))).toBe('');

    await as(db, 'authenticated', CAROL);
    expect(await mine(CAROL)).toEqual([]);
    await as(db, 'authenticated', CAROL);
    expect(await readableRowsHolding('AliceOnlyRoom')).toEqual([]);
    const carol = await db.query<{ row: unknown }>('select to_jsonb(m) as row from public.my_practice_meetings() m');
    expect(JSON.stringify(carol.rows)).not.toMatch(/AliceOnlyRoom/);

    for (const role of ['anon', 'authenticated'] as const) {
      await as(db, role); // `authenticated` with nobody behind it is the signed-out caller
      expect(await readableRowsHolding('AliceOnlyRoom'), role).toEqual([]);
    }
    await as(db, 'anon');
    const person = await db.query<{ row: unknown }>('select to_jsonb(p) as row from public.public_person($1) p', [ALICE]);
    expect(JSON.stringify(person.rows)).not.toMatch(/AliceOnlyRoom/);

    // The same search finds it where it is allowed to, so the checks above mean something.
    await as(db, 'postgres');
    expect(await readableRowsHolding('AliceOnlyRoom')).toEqual(['meeting_prefs']);
  });

  it('gives each of them the other’s time zone, and nobody else’s', async () => {
    expect(await one(ALICE)).toMatchObject({ other_time_zone: 'Europe/London' });
    expect(await one(BOB)).toMatchObject({ other_time_zone: 'America/Chicago' });
    await as(db, 'authenticated', CAROL);
    expect(JSON.stringify(await mine(CAROL))).not.toMatch(/America\/Chicago|Europe\/London/);
  });
});

describe('a third member who is not on the record', () => {
  let id: string;
  let slot: string;
  beforeEach(async () => {
    await connectAliceAndBob();
    id = await propose(BOB, ALICE, at(24, 48));
    slot = await firstSlot(ALICE);
  });

  it('cannot read it, answer it, change it or call it off', async () => {
    expect(await mine(CAROL)).toEqual([]);
    expect(await confirm(CAROL, id, slot)).toMatch(/That time isn't available\./);
    expect(await counter(CAROL, id)).toMatch(/That time isn't available\./);
    expect(await decline(CAROL, id)).toMatch(/That time isn't available\./);
    expect(await cancel(CAROL, id)).toMatch(/That time isn't available\./);
    expect(await change(CAROL, id)).toMatch(/That time isn't available\./);
    expect(await one(ALICE)).toMatchObject({ state: 'proposed' });
  });

  it('cannot read or write the tables directly, however the query is shaped', async () => {
    await as(db, 'authenticated', CAROL);
    for (const [table, column] of [
      ['practice_meetings', 'status'],
      ['practice_meeting_proposals', 'outcome'],
      ['practice_meeting_confirmations', 'revision'],
    ]) {
      for (const sql of [`select * from public.${table}`, `select count(*) from public.${table}`, `select * from public.${table} limit 1`]) {
        expect(await fails(sql), sql).toMatch(/permission denied/);
      }
      expect(await fails(`insert into public.${table} default values`), table).toMatch(/permission denied/);
      expect(await fails(`update public.${table} set ${column} = null`), table).toMatch(/permission denied/);
      expect(await fails(`delete from public.${table}`), table).toMatch(/permission denied/);
    }
  });
});

describe('a visitor and a signed-out caller', () => {
  beforeEach(async () => {
    await connectAliceAndBob();
    await propose(BOB, ALICE, at(24));
  });

  it('may not touch the tables at all', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(db, role);
      for (const table of ['practice_meetings', 'practice_meeting_proposals', 'practice_meeting_confirmations']) {
        expect(await fails(`select * from public.${table}`), `${role} ${table}`).toMatch(/permission denied/);
        expect(await fails(`insert into public.${table} default values`), `${role} ${table}`).toMatch(/permission denied/);
      }
    }
  });

  it('may not call the functions without an account, and is told to sign in when signed out', async () => {
    const id = (await (async () => (await one(ALICE)).id)()) as string;
    await as(db, 'anon');
    for (const [sql, params] of [
      ['select * from public.my_practice_meetings()', []],
      ['select public.propose_practice_meeting($1, $2::timestamptz[], 60)', [BOB, at(24)]],
      ['select public.confirm_practice_meeting($1, now() + interval ' + "'1 day')", [id]],
      ['select public.counter_practice_meeting($1, $2::timestamptz[], 60)', [id, at(24)]],
      ['select public.decline_practice_meeting($1)', [id]],
      ['select public.cancel_practice_meeting($1)', [id]],
      ['select public.change_practice_meeting($1, $2::timestamptz[], 60)', [id, at(24)]],
    ] as [string, unknown[]][]) {
      expect(await fails(sql, params), sql).toMatch(/permission denied/);
    }
    // The internal helpers are nobody's to call either.
    for (const role of ['anon', 'authenticated'] as const) {
      await as(db, role);
      expect(await fails('select public._check_meeting_times($1::timestamptz[], 60)', [at(24)]), role).toMatch(/permission denied/);
      expect(await fails('select public._close_lapsed_proposals($1, $2)', [ALICE, BOB]), role).toMatch(/permission denied/);
      expect(await fails('select public._my_meeting($1)', [id]), role).toMatch(/permission denied/);
      expect(await fails('select public._open_proposal_for_me($1, $2)', [id, ALICE]), role).toMatch(/permission denied/);
    }

    await as(db, 'authenticated'); // signed out: allowed to call, told to sign in, changes nothing
    expect(await fails('select * from public.my_practice_meetings()')).toMatch(/Not signed in/);
    expect(await fails('select public.propose_practice_meeting($1, $2::timestamptz[], 60)', [BOB, at(24)])).toMatch(/Not signed in/);
    expect(await fails('select public.confirm_practice_meeting($1, now() + interval \'1 day\')', [id])).toMatch(/Not signed in/);
    expect(await fails('select public.cancel_practice_meeting($1)', [id])).toMatch(/Not signed in/);
    expect(await rowCount('practice_meetings', `where status <> 'proposed'`)).toBe(0);
  });
});

describe('a block in either direction', () => {
  let id: string;
  let slot: string;
  beforeEach(async () => {
    await connectAliceAndBob();
    id = await propose(BOB, ALICE, at(24, 48));
    slot = await firstSlot(ALICE);
  });

  const refusedBothWays = async (blocker: string, blocked: string) => {
    await as(db, 'authenticated', blocker);
    await db.query('select public.block_member($1)', [blocked]);
    for (const uid of [ALICE, BOB]) {
      expect(await confirm(uid, id, slot), uid).toMatch(/You can't schedule with this member right now\./);
      expect(await counter(uid, id), uid).toMatch(/You can't schedule with this member right now\./);
      expect(await decline(uid, id), uid).toMatch(/You can't schedule with this member right now\./);
      expect(await change(uid, id), uid).toMatch(/You can't schedule with this member right now\./);
    }
    expect(await proposeFails(ALICE, BOB, at(96))).toMatch(/You can't schedule with this member right now\./);
    expect(await proposeFails(BOB, ALICE, at(96))).toMatch(/You can't schedule with this member right now\./);
    expect(await one(ALICE)).toMatchObject({ state: 'proposed', blocked: true });
  };

  it('refuses every function but cancelling when the one who proposed is the blocker', async () => {
    await refusedBothWays(BOB, ALICE);
    // The blocked member can still clear it, which is the whole point of the exception.
    expect(await cancel(ALICE, id)).toBe('');
    expect(await one(BOB)).toMatchObject({ state: 'cancelled', blocked: true });
  });

  it('refuses every function but cancelling when the one who was asked is the blocker', async () => {
    await refusedBothWays(ALICE, BOB);
    expect(await cancel(BOB, id)).toBe('');
    expect(await one(ALICE)).toMatchObject({ state: 'cancelled', blocked: true });
  });

  it('lets either of them call a settled time off, whoever did the blocking', async () => {
    // A block must end a commitment, not make it permanent: four pairings of who blocked and who cancels.
    for (const [blocker, canceller] of [
      [ALICE, ALICE],
      [ALICE, BOB],
      [BOB, BOB],
      [BOB, ALICE],
    ]) {
      await resetData(db);
      await as(db, 'postgres');
      await db.query(
        `insert into public.profiles (user_id, display_name, listed, open_to_requests) values ($1, 'Alice', true, true), ($2, 'Bob', true, true)`,
        [ALICE, BOB],
      );
      await connectAliceAndBob();
      const settled = await propose(BOB, ALICE, at(24, 48));
      expect(await confirm(ALICE, settled, await firstSlot(ALICE))).toBe('');
      await as(db, 'authenticated', blocker);
      await db.query('select public.block_member($1)', [blocker === ALICE ? BOB : ALICE]);

      const label = `${blocker} blocked, ${canceller} cancels`;
      expect(await cancel(canceller, settled), label).toBe('');
      // Called off, counted as a revision, and carrying no link to either of them.
      expect(await one(canceller), label).toMatchObject({ state: 'cancelled', revision: 2, meeting_link: null, blocked: true });
      // And it stays called off: a second one is refused for the usual reason, not because of the block.
      expect(await cancel(canceller, settled), label).toMatch(/That time isn't available\./);
    }
  });

  it('lets them carry on once the block is lifted', async () => {
    await as(db, 'authenticated', ALICE);
    await db.query('select public.block_member($1)', [BOB]);
    expect(await confirm(ALICE, id, slot)).toMatch(/You can't schedule with this member right now\./);
    await as(db, 'authenticated', ALICE);
    await db.query('select public.unblock_practice_asker($1)', [BOB]);
    expect(await confirm(ALICE, id, slot)).toBe('');
    expect(await one(BOB)).toMatchObject({ state: 'confirmed', blocked: false });
  });
});

describe('a member who has not verified their email', () => {
  it('cannot propose anything, and cannot be scheduled with', async () => {
    await connectAliceAndBob();
    await as(db, 'authenticated', DAVE);
    expect(await fails('select public.propose_practice_meeting($1, $2::timestamptz[], 60)', [ALICE, at(24)])).toMatch(/Verify your email before scheduling a case\./);
    expect(await mine(DAVE)).toEqual([]);
    expect(await rowCount('practice_meetings')).toBe(0);
  });

  it('cannot answer a record written for them behind the functions’ back, and neither can the other person', async () => {
    await as(db, 'postgres');
    const lo = ALICE < DAVE ? ALICE : DAVE;
    const hi = ALICE < DAVE ? DAVE : ALICE;
    const id = (
      await db.query<{ id: string }>(
        `insert into public.practice_meetings (user_lo, user_hi, host, created_by, duration_minutes) values ($1, $2, $1, $1, 60) returning id`,
        [lo, hi],
      )
    ).rows[0].id;
    await db.query(
      `insert into public.practice_meeting_proposals (meeting_id, user_lo, user_hi, proposed_by, slots, duration_minutes)
       values ($1, $2, $3, $4, $5::timestamptz[], 60)`,
      [id, lo, hi, ALICE, at(24)],
    );
    expect(await confirm(DAVE, id, hoursFromNow(24))).toMatch(/You can't schedule with this member right now\./);
    expect(await cancel(ALICE, id)).toMatch(/You can't schedule with this member right now\./);
  });
});

describe('deleting an account', () => {
  it('removes the record, its proposals and its confirmation, from whichever side leaves', async () => {
    for (const leaver of [ALICE, BOB]) {
      await resetData(db);
      await as(db, 'postgres');
      await db.query(
        `insert into public.profiles (user_id, display_name, listed, open_to_requests) values ($1, 'Alice', true, true), ($2, 'Bob', true, true)`,
        [ALICE, BOB],
      );
      await connectAliceAndBob();
      const id = await propose(BOB, ALICE, at(24, 48));
      expect(await confirm(ALICE, id, await firstSlot(ALICE))).toBe('');
      expect(await rowCount('practice_meetings')).toBe(1);

      await as(db, 'authenticated', leaver);
      await db.query('select public.delete_my_account($1)', ['DELETE']);
      expect(await rowCount('practice_meetings'), leaver).toBe(0);
      expect(await rowCount('practice_meeting_proposals'), leaver).toBe(0);
      expect(await rowCount('practice_meeting_confirmations'), leaver).toBe(0);
      const other = leaver === ALICE ? BOB : ALICE;
      expect(await mine(other)).toEqual([]);
    }
  });
});

/**
 * Every table the current role may read, searched for the value. A table it may not read is not a leak, so it counts
 * as clean; a table that is readable and holds the string is named.
 */
async function readableRowsHolding(value: string): Promise<string[]> {
  const { rows: tables } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const found: string[] = [];
  for (const { table_name } of tables) {
    try {
      const { rows } = await db.query<{ n: string }>(`select count(*) as n from public.${table_name} t where to_jsonb(t)::text like '%${value}%'`);
      if (Number(rows[0].n) > 0) found.push(table_name);
    } catch {
      // Refused: the role cannot read it at all, which is the point.
    }
  }
  return found;
}
