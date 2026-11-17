// @vitest-environment node
//
// How a member likes to meet (issue #98): a meeting link or phone number and a time zone, readable by exactly one
// person — its owner. Attacked here as another member, as a member who was blocked, as a visitor holding a link, as a
// caller with no account at all and as a member who has not verified their email, against the real migrations in an
// in-process Postgres.
//
// The sharpest tests are the absence ones: the link must not be in `shared_cases`, `public_shared_cases`,
// `public_person`, any profile row or any other function a member or a visitor may call. They are written to look for
// the value itself wherever anyone can read anything, so a column or a function added later that carries it fails here.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseMeetingLink, parseTimeZone } from '../domain/meeting';
import { ALICE, BOB, DAVE, as, createDb, fails as failsOn, resetData } from '../test/pg';

let db: PGlite;
const fails = (sql: string, params: unknown[] = []) => failsOn(db, sql, params);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetData(db);
});

/** Alice's room, distinctive enough to search every readable row for. */
const ROOM = 'https://us02web.zoom.us/j/9876543210?pwd=AliceOnlyRoom';
const ZONE = 'America/Chicago';

type Prefs = { meeting_link: string | null; time_zone: string | null };

const save = async (uid: string, link: string | null, zone: string | null) => {
  await as(db, 'authenticated', uid);
  return (await db.query<Prefs>('select * from public.save_my_meeting_prefs($1, $2)', [link, zone])).rows;
};

const mine = async (uid: string) => {
  await as(db, 'authenticated', uid);
  return (await db.query<Prefs>('select * from public.my_meeting_prefs()')).rows;
};

const rowCount = async (where = '') => {
  await as(db, 'postgres');
  return Number((await db.query<{ n: string }>(`select count(*) as n from public.meeting_prefs ${where}`)).rows[0].n);
};

/** A listed member who shares everything a member or a link holder can be shown. */
async function member(uid: string, name: string) {
  await as(db, 'postgres');
  await db.query(
    `insert into public.profiles (user_id, display_name, listed, public_profile, open_to_requests,
                                  share_cases, share_overall, share_skills, share_feedback, share_improvement,
                                  share_notes, share_partner, share_details, share_burned, share_interviewed, share_level, share_sharpening)
     values ($1, $2, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true)`,
    [uid, name],
  );
  await as(db, 'authenticated', uid);
  await db.query(
    `insert into public.cases (title, case_type, industry, overall, partner, other_notes, skills)
     values ($1, 'Profitability', 'Technology / SaaS', 4, 'Bob', 'notes', $2::jsonb)`,
    [`${name}'s case`, JSON.stringify({ framework: { rating: 4, feedback: 'Clear' } })],
  );
}

describe('the owner, and nobody else', () => {
  it('saves a link and a zone and reads back exactly what the database stored', async () => {
    expect(await save(ALICE, ROOM, ZONE)).toEqual([{ meeting_link: ROOM, time_zone: ZONE, updated_at: expect.anything() }]);
    expect(await mine(ALICE)).toMatchObject([{ meeting_link: ROOM, time_zone: ZONE }]);
  });

  it('has nothing until the member saves something, and both fields are optional', async () => {
    expect(await mine(ALICE)).toEqual([]);
    expect(await save(ALICE, null, ZONE)).toMatchObject([{ meeting_link: null, time_zone: ZONE }]);
    expect(await save(ALICE, '+1 773-555-0134', null)).toMatchObject([{ meeting_link: '+1 773-555-0134', time_zone: null }]);
    // Clearing both is allowed and really clears them.
    expect(await save(ALICE, '   ', '')).toMatchObject([{ meeting_link: null, time_zone: null }]);
  });

  it('keeps each member to their own row, with no way to name anyone else', async () => {
    await save(ALICE, ROOM, ZONE);
    await save(BOB, 'https://meet.google.com/bob-only-room', 'Europe/London');
    expect(await mine(ALICE)).toMatchObject([{ meeting_link: ROOM }]);
    expect(await mine(BOB)).toMatchObject([{ meeting_link: 'https://meet.google.com/bob-only-room' }]);
    expect(await rowCount()).toBe(2);
    // The functions take no user id at all, so there is no argument to point somewhere else.
    expect(await fails('select * from public.save_my_meeting_prefs($1, $2, $3)', [ROOM, ZONE, BOB])).toMatch(/does not exist/);
    expect(await fails('select * from public.my_meeting_prefs($1)', [BOB])).toMatch(/does not exist/);
  });

  it('is gone when the account is', async () => {
    await save(ALICE, ROOM, ZONE);
    await save(BOB, 'https://meet.google.com/bob-only-room', 'Europe/London');
    await as(db, 'authenticated', ALICE);
    await db.query('select public.delete_my_account($1)', ['DELETE']);
    expect(await rowCount()).toBe(1);
    expect(await rowCount(`where meeting_link like '%AliceOnlyRoom%'`)).toBe(0);
  });
});

describe('another member', () => {
  beforeEach(async () => {
    await member(ALICE, 'Alice');
    await member(BOB, 'Bob');
    await save(ALICE, ROOM, ZONE);
  });

  it('cannot read the table, however the read is shaped', async () => {
    await as(db, 'authenticated', BOB);
    for (const sql of [
      'select * from public.meeting_prefs',
      'select meeting_link from public.meeting_prefs',
      'select count(*) from public.meeting_prefs',
      `select user_id from public.meeting_prefs where meeting_link like 'https://us02web%'`,
      'select * from public.meeting_prefs order by updated_at desc limit 1',
    ]) {
      expect(await fails(sql), sql).toMatch(/permission denied/);
    }
  });

  it('cannot write one for somebody else, or change or delete theirs', async () => {
    await as(db, 'authenticated', BOB);
    expect(await fails('insert into public.meeting_prefs (user_id, meeting_link) values ($1, $2)', [ALICE, 'https://evil.example.com/j/1'])).toMatch(/permission denied/);
    expect(await fails('update public.meeting_prefs set meeting_link = null')).toMatch(/permission denied/);
    expect(await fails('delete from public.meeting_prefs')).toMatch(/permission denied/);
    // Their own call only ever touches their own row.
    await save(BOB, 'https://meet.google.com/bob-only-room', null);
    expect(await mine(ALICE)).toMatchObject([{ meeting_link: ROOM }]);
  });

  it('gets nothing of it through any read they are allowed, including one who was blocked', async () => {
    await as(db, 'authenticated', ALICE);
    await db.query('select public.block_member($1)', [BOB]); // blocked, in case a block ever changed what is visible
    await as(db, 'authenticated', BOB);
    expect(await readableRowsHolding(ROOM)).toEqual([]);
  });
});

describe('a visitor holding the link, and a caller with no account at all', () => {
  beforeEach(async () => {
    await member(ALICE, 'Alice');
    await save(ALICE, ROOM, ZONE);
  });

  it('is refused by the table with any filter, and by both functions', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(db, role); // `authenticated` with no user behind it is the signed-out caller
      expect(await fails('select * from public.meeting_prefs'), role).toMatch(/permission denied/);
      expect(await fails('select count(*) from public.meeting_prefs'), role).toMatch(/permission denied/);
      expect(await fails('insert into public.meeting_prefs (user_id) values ($1)', [ALICE]), role).toMatch(/permission denied/);
    }
    await as(db, 'anon');
    expect(await fails('select * from public.my_meeting_prefs()')).toMatch(/permission denied/);
    expect(await fails('select * from public.save_my_meeting_prefs($1, $2)', [ROOM, ZONE])).toMatch(/permission denied/);
    await as(db, 'authenticated'); // signed out: allowed to call, told to sign in, writes nothing
    expect(await fails('select * from public.my_meeting_prefs()')).toMatch(/Not signed in/);
    expect(await fails('select * from public.save_my_meeting_prefs($1, $2)', ['https://zoom.us/j/1', ZONE])).toMatch(/Not signed in/);
    expect(await rowCount()).toBe(1);
  });

  it('finds nothing of it anywhere a visitor can read, including through the profile link', async () => {
    await as(db, 'anon');
    expect(await readableRowsHolding(ROOM)).toEqual([]);
    const person = await db.query<Record<string, unknown>>('select to_jsonb(p) as row from public.public_person($1) p', [ALICE]);
    const cases = await db.query<Record<string, unknown>>('select to_jsonb(c) as row from public.public_person_cases($1) c', [ALICE]);
    expect(person.rows.length).toBe(1);
    expect(JSON.stringify([person.rows, cases.rows])).not.toMatch(/AliceOnlyRoom|America\/Chicago/);
  });
});

describe('a member who has not verified their email', () => {
  it('is refused, and nothing is written for them', async () => {
    await as(db, 'authenticated', DAVE);
    expect(await fails('select * from public.save_my_meeting_prefs($1, $2)', [ROOM, ZONE])).toMatch(/Verify your email/);
    expect(await rowCount()).toBe(0);
    // Reading is harmless: they have no row.
    expect(await mine(DAVE)).toEqual([]);
  });
});

describe('the value is in no projection, no profile and no function anyone else can call', () => {
  beforeEach(async () => {
    await member(ALICE, 'Alice');
    await member(BOB, 'Bob');
    await save(ALICE, ROOM, ZONE);
  });

  it('is in no column of any table but its own', async () => {
    await as(db, 'postgres');
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and (column_name like '%meeting%' or column_name like '%time_zone%' or column_name like '%link%')
        order by table_name, column_name`,
    );
    expect(rows.map((r) => `${r.table_name}.${r.column_name}`)).toEqual([
      'meeting_prefs.meeting_link',
      'meeting_prefs.time_zone',
      // A historical flag with nothing reading it (see KNOWN_ISSUES); it is a boolean, not an address.
      'profiles.public_link_only',
    ]);
  });

  it('is in nothing the two projections hold, and in no row of a profile', async () => {
    await as(db, 'postgres');
    for (const table of ['shared_cases', 'public_shared_cases', 'profiles', 'public_profiles']) {
      const { rows } = await db.query<{ n: string }>(
        `select count(*) as n from public.${table} t where to_jsonb(t)::text like '%AliceOnlyRoom%' or to_jsonb(t)::text like '%America/Chicago%'`,
      );
      expect(Number(rows[0].n), table).toBe(0);
    }
  });

  it('is in no function another member or a visitor may call', async () => {
    await as(db, 'postgres');
    // Every function either role may execute, and what it reads: only the member's own two may name the table.
    const { rows } = await db.query<{ name: string; role: string; reads: boolean }>(
      `select p.proname as name, r.rolname as role,
              (pg_get_functiondef(p.oid) like '%meeting_prefs%') as reads
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join (select 'anon' as rolname union all select 'authenticated') r
        where n.nspname = 'public'
          and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
          and p.prokind = 'f'
        order by p.proname, r.rolname`,
    );
    expect(rows.filter((r) => r.reads).map((r) => `${r.name} (${r.role})`)).toEqual([
      'my_meeting_prefs (authenticated)',
      'save_my_meeting_prefs (authenticated)',
    ]);
    // And no function hands the column name back to a caller either.
    const { rows: returns } = await db.query<{ name: string }>(
      `select distinct p.proname as name
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and has_function_privilege('anon', p.oid, 'EXECUTE')
          and array_to_string(coalesce(p.proargnames, array[]::text[]), ',') like '%meeting%'`,
    );
    expect(returns).toEqual([]);
  });

  it('is found by that same search when the reader is allowed to find it, so the checks above mean something', async () => {
    await as(db, 'postgres');
    expect(await readableRowsHolding(ROOM)).toEqual(['meeting_prefs']);
  });

  it('is in nothing another member reads, by any route at all', async () => {
    await as(db, 'authenticated', BOB);
    expect(await readableRowsHolding(ROOM)).toEqual([]);
    const calls: [string, unknown[]][] = [
      ['select to_jsonb(r) as row from public.my_practice_requests() r', []],
      ['select to_jsonb(b) as row from public.my_practice_blocks() b', []],
      ['select to_jsonb(c) as row from public.my_conversations() c', []],
      ['select to_jsonb(i) as row from public.member_interviewed($1) i', [ALICE]],
    ];
    for (const [sql, params] of calls) {
      const { rows } = await db.query<{ row: unknown }>(sql, params);
      expect(JSON.stringify(rows), sql).not.toMatch(/AliceOnlyRoom/);
    }
  });
});

/**
 * Every table the current role may read, searched for the value. A table it may not read is not a leak, so it counts
 * as clean; a table that is readable and holds the string is named.
 */
async function readableRowsHolding(value: string): Promise<string[]> {
  const needle = value.replace(/^https:\/\//, '').slice(0, 40);
  const { rows: tables } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const found: string[] = [];
  for (const { table_name } of tables) {
    try {
      const { rows } = await db.query<{ n: string }>(
        `select count(*) as n from public.${table_name} t where to_jsonb(t)::text like '%${needle}%'`,
      );
      if (Number(rows[0].n) > 0) found.push(table_name);
    } catch {
      // Refused: the role cannot read it at all, which is the point.
    }
  }
  return found;
}

describe('the database enforces the screen\u2019s rule, not a weaker one', () => {
  // The same inputs through the plain function in src/domain/meeting.ts and through the database. If the two ever
  // disagree about one of them, this fails and says which.
  const samples = [
    'https://us02web.zoom.us/j/9876543210?pwd=aBcD',
    'https://zoom.us/my/firstname',
    'https://meet.google.com/abc-defg-hij',
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting',
    'https://teams.live.com/meet/9360',
    'https://chicagobooth.webex.com/meet/student',
    'HTTPS://MEET.GOOGLE.COM/ABC-DEFG-HIJ',
    'https://caselab.example.co.uk:8443/room?x=1#start',
    '+1 773-555-0134',
    '07700 900123',
    '+91 98765 43210',
    '12345',
    '+1234567890123456',
    '0000',
    '+',
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///C:/Users/me/room.html',
    'tel:+17735550134',
    'mailto:me@example.com',
    'http://us02web.zoom.us/j/9876543210',
    '//evil.example.com/j/1',
    '/rooms/mine',
    '../rooms/mine',
    'rooms/mine',
    'zoom.us/j/9876543210',
    'www.zoom.us/j/1',
    'Ping me on Slack and I will send the link',
    'https:/zoom.us/j/1',
    'https://',
    'https://localhost:5173/room',
    'https://zoom',
    'https://zoom.us/j/1 and then https://evil.example.com',
    'https://zoom.us/j/1\njavascript:alert(1)',
    '<a href="https://zoom.us/j/1">my room</a>',
    "https://zoom.us/j/1'; drop table public.cases; --",
    '1 (773) 555-0134',
    `https://zoom.us/j/${'9'.repeat(300)}`,
  ];

  it('accepts and refuses exactly the same links', async () => {
    const disagreed: string[] = [];
    for (const raw of samples) {
      const screen = parseMeetingLink(raw).ok;
      await as(db, 'authenticated', ALICE);
      const database = (await fails('select * from public.save_my_meeting_prefs($1, null)', [raw])) === '';
      if (screen !== database) disagreed.push(`${JSON.stringify(raw)}: screen ${screen}, database ${database}`);
    }
    expect(disagreed).toEqual([]);
  });

  it('refuses a bad link with a sentence worth showing, and leaves what was already stored alone', async () => {
    await save(ALICE, ROOM, ZONE);
    expect(await fails('select * from public.save_my_meeting_prefs($1, null)', ['javascript:alert(1)'])).toMatch(
      /Paste a link starting with https:\/\/, or a phone number\./,
    );
    expect(await mine(ALICE)).toMatchObject([{ meeting_link: ROOM, time_zone: ZONE }]);
  });

  it('refuses a time zone that is not one, including a well-shaped name no zone goes by', async () => {
    await as(db, 'authenticated', ALICE);
    for (const zone of ['Chicago', 'CST', 'GMT+5', '-05:00', 'America//Chicago', 'America/', 'Mars/Olympus_Mons', "America/Chicago'", 'A/'.repeat(40)]) {
      expect(await fails('select * from public.save_my_meeting_prefs(null, $1)', [zone]), zone).toMatch(/Pick a time zone/);
      // And the plain function agrees about every one of them (with the browser's list, where it needs it).
      expect(parseTimeZone(zone, ['America/Chicago', 'Europe/London']).ok, zone).toBe(false);
    }
    expect(await rowCount()).toBe(0);
  });

  it('takes the zones a browser really offers', async () => {
    await as(db, 'authenticated', ALICE);
    for (const zone of ['America/Chicago', 'Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5', 'UTC', 'Europe/London']) {
      expect(await fails('select * from public.save_my_meeting_prefs(null, $1)', [zone]), zone).toBe('');
      expect(parseTimeZone(zone).ok, zone).toBe(true);
    }
  });

  it('cannot be got round by writing the row directly as the database owner either', async () => {
    await as(db, 'postgres');
    expect(await fails('insert into public.meeting_prefs (user_id, meeting_link) values ($1, $2)', [ALICE, 'javascript:alert(1)'])).toMatch(/meeting_prefs_meeting_link_check|violates check constraint/);
    expect(await fails('insert into public.meeting_prefs (user_id, time_zone) values ($1, $2)', [ALICE, 'Mars/Olympus_Mons'])).toMatch(/Pick a time zone/);
    expect(await fails('insert into public.meeting_prefs (user_id, time_zone) values ($1, $2)', [ALICE, 'nonsense'])).toMatch(/Pick a time zone|violates check constraint/);
  });
});

describe('the save limit', () => {
  beforeEach(async () => {
    await as(db, 'authenticated', ALICE);
  });

  it('allows twenty changes a day and refuses the twenty-first, then lets the next day through', async () => {
    for (let i = 0; i < 20; i++) {
      expect(await fails('select * from public.save_my_meeting_prefs($1, null)', [`https://zoom.us/j/${1000 + i}`]), `save ${i + 1}`).toBe('');
    }
    expect(await fails('select * from public.save_my_meeting_prefs($1, null)', ['https://zoom.us/j/2000'])).toMatch(
      /a lot of changes for one day/,
    );
    // The twentieth value is still there: a refused save changes nothing.
    expect(await mine(ALICE)).toMatchObject([{ meeting_link: 'https://zoom.us/j/1019' }]);

    // Clearing the fields does not clear the counter, so emptying and refilling cannot be used to get more saves.
    expect(await fails('select * from public.save_my_meeting_prefs(null, null)')).toMatch(/a lot of changes for one day/);

    await as(db, 'postgres');
    await db.query(`update public.meeting_prefs set saves_since = now() - interval '25 hours' where user_id = $1`, [ALICE]);
    await as(db, 'authenticated', ALICE);
    expect(await fails('select * from public.save_my_meeting_prefs($1, null)', ['https://zoom.us/j/3000'])).toBe('');
    expect(await mine(ALICE)).toMatchObject([{ meeting_link: 'https://zoom.us/j/3000' }]);
  });

  it('counts each member separately', async () => {
    await as(db, 'postgres');
    await db.query('insert into public.meeting_prefs (user_id, saves, saves_since) values ($1, 20, now())', [ALICE]);
    await as(db, 'authenticated', ALICE);
    expect(await fails('select * from public.save_my_meeting_prefs($1, null)', ['https://zoom.us/j/1'])).toMatch(/a lot of changes/);
    await as(db, 'authenticated', BOB);
    expect(await fails('select * from public.save_my_meeting_prefs($1, null)', ['https://zoom.us/j/1'])).toBe('');
  });
});
