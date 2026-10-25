// @vitest-environment node
//
// Visitors WITHOUT an account (the database's `anon` role): what they can and cannot read, tried the way
// a scraper would, with direct queries and no CaseLab UI in the way. Real migrations, in-process Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, as, createDb, fails as failsOn, resetData } from '../test/pg';

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

type Row = Record<string, unknown>;
const PREFS = ['share_cases', 'share_overall', 'share_skills', 'share_feedback', 'share_improvement', 'share_notes'] as const;
type Pref = (typeof PREFS)[number];

/** The public tables and the columns visitors may read. */
const PUBLIC_CASES = 'share_id, owner_id, case_date, title, source, partner, case_type, industry, overall, skill_scores, improvement_area';
const PUBLIC_PROFILES = 'user_id, display_name, mba_class, share_cases, share_overall, share_skills, share_improvement, share_partner';
/** What members may read (adds the free-text columns). */
const MEMBER_SHARED = `${PUBLIC_CASES}, feedback, notes`;

async function createProfile(uid: string, name: string, on: Pref[] = [], opts: { isPublic?: boolean; listed?: boolean } = {}) {
  await as(db, 'authenticated', uid);
  await db.query(
    `insert into public.profiles (user_id, display_name, listed, public_profile, ${PREFS.join(', ')})
     values ($1, $2, $3, $4, ${PREFS.map((p) => (on.includes(p) ? 'true' : 'false')).join(', ')})`,
    [uid, name, opts.listed ?? true, opts.isPublic ?? false],
  );
}

async function update(uid: string, sets: string) {
  await as(db, 'authenticated', uid);
  await db.query(`update public.profiles set ${sets} where user_id = $1`, [uid]);
}

const SKILLS = { framework: { rating: 4, feedback: 'MECE tree was great' }, quant: { rating: 2, feedback: 'Slow on math' } };

async function addCase(uid: string, over: Record<string, unknown> = {}): Promise<string> {
  await as(db, 'authenticated', uid);
  const c: Record<string, unknown> = {
    title: 'Airline profitability',
    source: 'Booth casebook',
    case_type: 'Profitability',
    industry: 'Transportation / Logistics',
    overall: 5,
    overall_feedback: 'PRIVATE-OVERALL-FEEDBACK',
    skills: JSON.stringify(SKILLS),
    went_well: 'PRIVATE-WENT-WELL',
    concepts: 'PRIVATE-CONCEPTS',
    improvement_area: 'quant',
    other_notes: 'PRIVATE-OTHER-NOTES',
    partner: 'PRIVATE-PARTNER',
    ...over,
  };
  const cols = Object.keys(c);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.cases (${cols.join(', ')}) values (${cols.map((k, i) => (k === 'skills' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ')}) returning id`,
    cols.map((k) => c[k]),
  );
  return rows[0].id;
}

const visitorSees = async (): Promise<Row[]> => {
  await as(db, 'anon');
  return (await db.query<Row>(`select ${PUBLIC_CASES} from public.public_shared_cases order by title`)).rows;
};
const visitorProfiles = async (): Promise<Row[]> => {
  await as(db, 'anon');
  return (await db.query<Row>(`select ${PUBLIC_PROFILES} from public.public_profiles order by display_name`)).rows;
};
const membersSee = async (viewer = BOB) => {
  await as(db, 'authenticated', viewer);
  return (await db.query<Row>(`select ${MEMBER_SHARED} from public.shared_cases order by title`)).rows;
};

describe('public visibility is opt-in', () => {
  it('shows visitors nothing by default, however much a member shares with other members', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]); // shares everything with members, not public
    await addCase(ALICE);
    expect(await visitorProfiles()).toEqual([]);
    expect(await visitorSees()).toEqual([]);
    expect(await membersSee()).toHaveLength(1); // members still see it
  });

  it('is off for every profile that already exists when this feature arrives', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await as(db, 'authenticated', ALICE);
    const { rows } = await db.query<{ public_profile: boolean }>('select public_profile from public.profiles');
    expect(rows[0].public_profile).toBe(false);
  });

  it('only exposes a member once they switch it on, and takes it away the moment they switch it off', async () => {
    await createProfile(ALICE, 'Alice Adams', ['share_cases']);
    await addCase(ALICE);
    expect(await visitorProfiles()).toEqual([]);

    await update(ALICE, 'public_profile = true');
    expect((await visitorProfiles()).map((p) => p.display_name)).toEqual(['Alice Adams']);
    expect((await visitorSees()).map((r) => r.title)).toEqual(['Airline profitability']);

    await update(ALICE, 'public_profile = false');
    expect(await visitorProfiles()).toEqual([]);
    expect(await visitorSees()).toEqual([]);
  });

  it('requires a public profile to be listed', async () => {
    await createProfile(ALICE, 'Alice', [], { isPublic: true });
    await as(db, 'authenticated', ALICE);
    expect(await fails('update public.profiles set listed = false where user_id = $1', [ALICE])).toMatch(/check constraint/);
    await db.query('update public.profiles set listed = false, public_profile = false where user_id = $1', [ALICE]);
    expect(await visitorProfiles()).toEqual([]);
    await as(db, 'authenticated', BOB);
    expect(await fails(`insert into public.profiles (user_id, display_name, listed, public_profile) values ($1, 'Bob', false, true)`, [BOB])).toMatch(/check constraint/);
  });
});

describe('what visitors can see of a public member', () => {
  it('sees case history and nothing else unless the member shares more', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    await addCase(ALICE);
    const [row] = await visitorSees();
    expect(row).toMatchObject({ title: 'Airline profitability', source: 'Booth casebook', case_type: 'Profitability', industry: 'Transportation / Logistics', owner_id: ALICE });
    expect([row.overall, row.skill_scores, row.improvement_area]).toEqual([null, null, null]);
  });

  it.each([
    ['share_overall', 'overall', 5],
    ['share_skills', 'skill_scores', { framework: 4, quant: 2 }],
    ['share_improvement', 'improvement_area', 'quant'],
  ] as const)('%s reveals %s to visitors, and nothing else', async (pref, column, expected) => {
    await createProfile(ALICE, 'Alice', ['share_cases', pref], { isPublic: true });
    await addCase(ALICE);
    const [row] = await visitorSees();
    expect(row[column]).toEqual(expected);
    for (const other of ['overall', 'skill_scores', 'improvement_area'].filter((c) => c !== column)) expect(row[other], other).toBeNull();
  });

  it('never has written feedback, notes or the private case id for visitors, even when shared with members', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS], { isPublic: true });
    await addCase(ALICE);
    await as(db, 'anon');
    // Free text isn't merely forbidden to visitors: the columns don't exist in the public table at all.
    for (const col of ['feedback', 'notes']) {
      expect(await fails(`select ${col} from public.public_shared_cases`), col).toMatch(/does not exist/);
    }
    // The private case id exists (for the cascade) but visitors have no privilege on it.
    expect(await fails('select case_id from public.public_shared_cases')).toMatch(/permission denied/);
    expect(await fails('select * from public.public_shared_cases')).toMatch(/permission denied/);
    expect(await fails('select title from public.public_shared_cases where case_id is not null')).toMatch(/permission denied/);
    // The public table doesn't even contain free text.
    await as(db, 'postgres');
    const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name in ('public_shared_cases', 'public_profiles')`)).rows.map((c) => c.column_name);
    expect(cols).not.toContain('feedback');
    expect(cols).not.toContain('notes');

    const everything = JSON.stringify(await visitorSees());
    for (const secret of ['PRIVATE-OVERALL-FEEDBACK', 'PRIVATE-WENT-WELL', 'PRIVATE-CONCEPTS', 'MECE tree', 'Slow on math', 'PRIVATE-OTHER-NOTES', 'PRIVATE-PARTNER']) {
      expect(everything).not.toContain(secret);
    }
    expect(JSON.stringify(await membersSee())).toContain('PRIVATE-OVERALL-FEEDBACK'); // members' access is unchanged
  });

  it('shares the same handle as members see, never the private case id', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    const caseId = await addCase(ALICE);
    const [pub] = await visitorSees();
    const [mem] = await membersSee();
    expect(pub.share_id).toBe(mem.share_id);
    expect(pub.share_id).not.toBe(caseId);
  });

  it('respects per-case overrides: a private case stays hidden from visitors too', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS], { isPublic: true });
    await addCase(ALICE, { title: 'Shown' });
    await addCase(ALICE, { title: 'Secret', share_mode: 'private' });
    await addCase(ALICE, { title: 'Name only', share_mode: 'history' });
    const rows = await visitorSees();
    expect(rows.map((r) => r.title).sort()).toEqual(['Name only', 'Shown']);
    expect(JSON.stringify(rows)).not.toContain('Secret');
    expect(rows.find((r) => r.title === 'Name only')?.overall).toBeNull();
  });

  it('keeps members-only profiles out of view even when someone else is public', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    await createProfile(CAROL, 'Carol', [...PREFS]); // shares with members only
    await addCase(ALICE, { title: 'Alice public case' });
    await addCase(CAROL, { title: 'Carol members case' });
    expect((await visitorSees()).map((r) => r.title)).toEqual(['Alice public case']);
    expect((await visitorProfiles()).map((p) => p.display_name)).toEqual(['Alice']);
  });

  it('follows every change at once: edits, switches, deleting a case, and the account', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_overall'], { isPublic: true });
    const id = await addCase(ALICE);
    expect((await visitorSees())[0].overall).toBe(5);

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set title = 'Renamed', overall = 2 where id = $1`, [id]);
    expect(await visitorSees()).toMatchObject([{ title: 'Renamed', overall: 2 }]);

    await update(ALICE, 'share_overall = false');
    expect((await visitorSees())[0].overall).toBeNull();

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'private' where id = $1`, [id]);
    expect(await visitorSees()).toEqual([]);

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'profile' where id = $1`, [id]);
    expect(await visitorSees()).toHaveLength(1);
    await as(db, 'authenticated', ALICE);
    await db.query('delete from public.cases where id = $1', [id]);
    expect(await visitorSees()).toEqual([]);

    await addCase(ALICE, { title: 'Another' });
    expect(await visitorSees()).toHaveLength(1);
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    expect(await visitorSees()).toEqual([]);
    expect(await visitorProfiles()).toEqual([]);
  });

  it('reveals nothing through filters, ordering or counts, because hidden data is not in the table at all', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true }); // scores not shared
    await addCase(ALICE, { title: 'Five', overall: 5 });
    await addCase(ALICE, { title: 'Hidden', overall: 1, share_mode: 'private' });
    await createProfile(CAROL, 'Carol', [...PREFS]); // members only
    for (let i = 0; i < 20; i++) await addCase(CAROL, { title: `Secret merger ${i}` });

    await as(db, 'anon');
    expect((await db.query(`select ${PUBLIC_CASES} from public.public_shared_cases where overall = 5`)).rows).toEqual([]);
    expect((await db.query<{ n: string }>('select count(*)::text as n from public.public_shared_cases')).rows[0].n).toBe('1');
    expect((await db.query(`select ${PUBLIC_CASES} from public.public_shared_cases where title = 'Hidden'`)).rows).toEqual([]);

    // Row estimates and statistics come from tables that only ever hold public rows, so they can't describe
    // members-only data: the planner has no access to (or knowledge of) the member tables.
    for (const table of ['profiles', 'shared_cases', 'cases']) {
      expect(await fails(`explain select 1 from public.${table}`), table).toMatch(/permission denied/);
    }
    await as(db, 'postgres');
    await db.exec('analyze public.public_shared_cases');
    const { rows } = await db.query<{ n_distinct: number }>(`select n_distinct from pg_stats where tablename = 'public_shared_cases' and attname = 'title'`);
    expect(JSON.stringify(rows)).not.toContain('Secret merger');
  });
});

describe('who cased the member (the practice partner)', () => {
  it('is off for everyone by default: no partner name is visible to members or visitors', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS], { isPublic: true });
    await addCase(ALICE, { share_mode: 'full' });
    expect((await visitorSees())[0].partner).toBeNull();
    expect((await membersSee())[0].partner).toBeNull();
    expect(JSON.stringify([await visitorSees(), await membersSee(), await visitorProfiles()])).not.toContain('PRIVATE-PARTNER');
    expect((await visitorProfiles())[0].share_partner).toBe(false);
  });

  it('shows the name to members and visitors once the switch is on, and removes it the moment it is off', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    await addCase(ALICE, { partner: '  Sam Lee  ' });
    await update(ALICE, 'share_partner = true');
    expect((await visitorSees())[0].partner).toBe('Sam Lee');
    expect((await membersSee())[0].partner).toBe('Sam Lee');
    expect((await visitorProfiles())[0].share_partner).toBe(true);

    await update(ALICE, 'share_partner = false');
    expect((await visitorSees())[0].partner).toBeNull();
    expect((await membersSee())[0].partner).toBeNull();
  });

  it('follows edits to the case, leaves blank names out, and never reveals partners of private cases', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    const shown = await addCase(ALICE, { title: 'Shown case', partner: 'Sam' });
    await addCase(ALICE, { title: 'Blank partner', partner: '   ' });
    await addCase(ALICE, { title: 'Hidden case', partner: 'Secret Partner', share_mode: 'private' });
    await update(ALICE, 'share_partner = true');

    const rows = await visitorSees();
    expect(rows.map((r) => [r.title, r.partner])).toEqual([['Blank partner', null], ['Shown case', 'Sam']]);
    expect(JSON.stringify([rows, await membersSee()])).not.toContain('Secret Partner');

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set partner = 'Pat' where id = $1`, [shown]);
    expect((await visitorSees()).find((r) => r.title === 'Shown case')?.partner).toBe('Pat');
    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'private' where id = $1`, [shown]);
    expect((await visitorSees()).map((r) => r.title)).toEqual(['Blank partner']);
  });

  it('does not show the partner to visitors of a members-only profile, and cuts long names', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']);
    await update(ALICE, 'share_partner = true');
    await addCase(ALICE, { partner: 'x'.repeat(100) });
    expect(await visitorSees()).toEqual([]);
    expect((await membersSee())[0].partner).toBe('x'.repeat(100));
    await as(db, 'authenticated', ALICE);
    await expect(db.query(`update public.cases set partner = $1`, ['x'.repeat(101)])).rejects.toThrow(/cases_partner_length/);
  });

  it('applies the whole-profile switch to the partner of cases shared with a name-only override', async () => {
    await createProfile(ALICE, 'Alice', [], { isPublic: true });
    await addCase(ALICE, { share_mode: 'history' });
    expect((await visitorSees())[0].partner).toBeNull();
    await update(ALICE, 'share_partner = true');
    expect((await visitorSees())[0].partner).toBe('PRIVATE-PARTNER');
  });
});

describe('abuse limits', () => {
  it('limits the length of what can be shown to others', async () => {
    await as(db, 'authenticated', ALICE);
    const attempt = (cols: string, vals: string) => fails(`insert into public.cases (title, case_type${cols}) values ($1, 'Revenue'${vals})`, ['x']);
    expect(await fails(`insert into public.cases (title, case_type) values ($1, 'Revenue')`, ['t'.repeat(201)])).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type, source) values ('x', 'Revenue', $1)`, ['s'.repeat(201)])).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type, industry) values ('x', 'Revenue', $1)`, ['i'.repeat(101)])).toMatch(/check constraint/);
    expect(await fails(`insert into public.cases (title, case_type, source, industry) values ($1, 'Revenue', $2, $3)`, ['t'.repeat(200), 's'.repeat(200), 'i'.repeat(100)])).toBe('');
    void attempt;
  });

  it('projects only the eight known skills with ratings of 1 to 5', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_skills', 'share_feedback'], { isPublic: true });
    const skills = {
      'BUY CHEAP PILLS http://spam.example': { rating: 5, feedback: 'spam' },
      framework: { rating: 99, feedback: 'out of range' },
      exhibits: { rating: 0 },
      quant: { rating: 3, feedback: 'ok' },
      prompt: { rating: 'five' },
    };
    await addCase(ALICE, { skills: JSON.stringify(skills) });
    const [pub] = await visitorSees();
    expect(pub.skill_scores).toEqual({ quant: 3 });
    const [mem] = await membersSee();
    expect(mem.skill_scores).toEqual({ quant: 3 });
    expect(JSON.stringify(mem.feedback)).not.toContain('spam'); // unknown skill names are dropped from feedback too
  });
});

describe('hardening from the second independent review', () => {
  it('publishes only whole-number ratings from 1 to 5, however the data was written', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_skills'], { isPublic: true });
    const huge = `1.${'0'.repeat(5000)}1`;
    await addCase(ALICE, {
      skills: `{"quant":{"rating":1.5},"framework":{"rating":${huge}},"prompt":{"rating":4},"exhibits":{"rating":4.0},"brainstorm":{"rating":6},"recommendation":{"rating":3.0000}}`,
    });
    const [pub] = await visitorSees();
    expect(pub.skill_scores).toEqual({ prompt: 4, exhibits: 4, recommendation: 3 });
    expect(JSON.stringify(pub.skill_scores).length).toBeLessThan(80);
    const [mem] = await membersSee();
    expect(mem.skill_scores).toEqual({ prompt: 4, exhibits: 4, recommendation: 3 });
  });

  it('cuts old over-length text in what others see, instead of publishing it at full length', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    // A row written before the length limits existed (the constraints only check new and edited rows).
    await as(db, 'postgres');
    await db.exec('alter table public.cases drop constraint cases_title_length, drop constraint cases_source_length, drop constraint cases_industry_length');
    await db.query(`insert into public.cases (user_id, title, source, industry, case_type) values ($1, $2, $3, $4, 'Revenue')`, [ALICE, 't'.repeat(100000), 's'.repeat(5000), 'i'.repeat(5000)]);
    const [pub] = await visitorSees();
    expect([String(pub.title).length, String(pub.source).length, String(pub.industry).length]).toEqual([200, 200, 100]);
    const [mem] = await membersSee();
    expect(String(mem.title).length).toBe(200);
  });

  it('stops refreshing the public copy of a former member’s cases', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    const id = await addCase(ALICE, { title: 'Before' });
    expect((await visitorSees()).map((r) => r.title)).toEqual(['Before']);
    await as(db, 'postgres');
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [ALICE]);
    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set title = 'After an edit by a former member' where id = $1`, [id]);
    const titles = (await visitorSees()).map((r) => r.title);
    expect(titles).not.toContain('After an edit by a former member');
    expect(titles).toEqual([]); // the stale public copy is removed rather than updated
  });
});

describe('membership', () => {
  it('stops a former member from re-listing or going public, but lets them switch themselves off', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    await addCase(ALICE);
    await as(db, 'postgres');
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [ALICE]);

    await as(db, 'authenticated', ALICE);
    expect(await fails(`update public.profiles set display_name = 'Still Public' where user_id = $1`, [ALICE])).toMatch(/row-level security/);
    expect(await fails('update public.profiles set public_profile = true where user_id = $1', [ALICE])).toMatch(/row-level security/);
    await db.query('update public.profiles set listed = false, public_profile = false where user_id = $1', [ALICE]);
    expect(await visitorSees()).toEqual([]);
    expect(await membersSee(BOB)).toEqual([]);
    await as(db, 'authenticated', ALICE);
    expect(await fails('update public.profiles set listed = true where user_id = $1', [ALICE])).toMatch(/row-level security/);
  });

  it('hides everyone who no longer qualifies when the owner runs revoke_nonmembers()', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    await createProfile(CAROL, 'Carol', ['share_cases']);
    await addCase(ALICE, { title: 'Alice case' });
    await addCase(CAROL, { title: 'Carol case' });
    await as(db, 'postgres');
    await db.query('update auth.users set email_confirmed_at = null where id = any($1::uuid[])', [[ALICE, CAROL]]);
    // Nothing happens by itself...
    expect(await visitorSees()).toHaveLength(1);

    // ...until the owner re-checks membership.
    await as(db, 'postgres');
    const { rows } = await db.query<{ n: number }>('select public.revoke_nonmembers() as n');
    expect(rows[0].n).toBe(2);
    expect(await visitorSees()).toEqual([]);
    expect(await visitorProfiles()).toEqual([]);
    expect(await membersSee(BOB)).toEqual([]);
  });

  it('keeps the maintenance functions out of reach of visitors and members', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(db, role, role === 'authenticated' ? BOB : undefined);
      for (const call of ['select public.revoke_nonmembers()', 'select public.refresh_all_shared()', `select public.sync_public_profile('${ALICE}')`, `select public.is_member_id('${ALICE}')`]) {
        expect(await fails(call), `${role}: ${call}`).toMatch(/permission denied/);
      }
    }
  });
});

describe('everything else stays closed to visitors', () => {
  it('has no access at all to the member and personal tables', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS], { isPublic: true });
    await addCase(ALICE);
    await as(db, 'anon');
    for (const table of ['cases', 'opportunities', 'profiles', 'shared_cases']) {
      expect(await fails(`select * from public.${table}`), table).toMatch(/permission denied/);
      for (const col of table === 'profiles' ? ['display_name'] : table === 'shared_cases' ? ['title'] : []) {
        expect(await fails(`select ${col} from public.${table}`), `${table}.${col}`).toMatch(/permission denied/);
      }
    }
    expect(await fails('select public.is_member()')).toMatch(/permission denied/);
  });

  it('cannot write anything, anywhere', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases'], { isPublic: true });
    await addCase(ALICE);
    await as(db, 'anon');
    for (const sql of [
      `insert into public.public_profiles (user_id, display_name, share_cases, share_overall, share_skills, share_improvement) values ('${BOB}', 'x', true, true, true, true)`,
      `update public.public_profiles set display_name = 'hacked'`,
      'delete from public.public_profiles',
      `update public.public_shared_cases set title = 'x'`,
      'delete from public.public_shared_cases',
      `insert into public.profiles (user_id, display_name) values ('${BOB}', 'x')`,
      `update public.profiles set public_profile = false`,
      `insert into public.cases (title, case_type) values ('x', 'Revenue')`,
    ]) {
      expect(await fails(sql), sql).toMatch(/permission denied/);
    }
  });

  it('has exactly the intended read access, and members have none on the public tables', async () => {
    await as(db, 'postgres');
    const any = async (role: string, table: string) =>
      (await db.query<{ ok: boolean }>(`select has_any_column_privilege($1, $2, 'SELECT') as ok`, [role, `public.${table}`])).rows[0].ok;
    for (const t of ['cases', 'opportunities', 'profiles', 'shared_cases']) expect(await any('anon', t), `anon on ${t}`).toBe(false);
    expect(await any('anon', 'public_profiles')).toBe(true);
    for (const t of ['public_profiles', 'public_shared_cases']) expect(await any('authenticated', t), `authenticated on ${t}`).toBe(false);

    const col = async (c: string) =>
      (await db.query<{ ok: boolean }>(`select has_column_privilege('anon', 'public.public_shared_cases', $1, 'SELECT') as ok`, [c])).rows[0].ok;
    for (const c of ['share_id', 'owner_id', 'case_date', 'title', 'source', 'partner', 'case_type', 'industry', 'overall', 'skill_scores', 'improvement_area']) {
      expect(await col(c), c).toBe(true);
    }
    expect(await col('case_id')).toBe(false);
    for (const t of ['public_profiles', 'public_shared_cases']) {
      for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const { rows } = await db.query<{ ok: boolean }>(`select has_table_privilege('anon', $1, $2) as ok`, [`public.${t}`, p]);
        expect(rows[0].ok, `${p} on ${t}`).toBe(false);
      }
    }
  });

  it('does not change what verified members can see or do', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]); // not public
    await addCase(ALICE);
    await as(db, 'authenticated', BOB);
    expect((await db.query('select display_name from public.profiles')).rows).toEqual([{ display_name: 'Alice' }]);
    expect(await membersSee()).toHaveLength(1);
    expect((await db.query('select * from public.cases')).rows).toEqual([]); // still no access to private cases
    expect((await db.query(`update public.profiles set public_profile = true where user_id = $1 returning user_id`, [ALICE])).rows).toEqual([]); // can't make someone else public
  });
});
