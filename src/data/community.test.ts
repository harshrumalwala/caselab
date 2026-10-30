// @vitest-environment node
//
// The privacy model, enforced in the database and tested the way an attacker would use it:
// direct queries as another signed-in user, with no UI in the way. Runs the real migrations in an
// in-process Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, DAVE, as, createDb, fails as failsOn, resetData } from '../test/pg';

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
const COLS = 'share_id, owner_id, case_date, title, source, case_type, industry, overall, skill_scores, feedback, improvement_area, notes';
const PREFS = ['share_cases', 'share_overall', 'share_skills', 'share_feedback', 'share_improvement', 'share_notes'] as const;
type Pref = (typeof PREFS)[number];

async function createProfile(uid: string, name: string, on: Pref[] = [], extra = '') {
  await as(db, 'authenticated', uid);
  const cols = PREFS.map((p) => `${p}`).join(', ');
  const vals = PREFS.map((p) => (on.includes(p) ? 'true' : 'false')).join(', ');
  await db.query(`insert into public.profiles (user_id, display_name, ${cols}${extra ? ', listed' : ''}) values ($1, $2, ${vals}${extra ? ', ' + extra : ''})`, [uid, name]);
}

async function setPrefs(uid: string, prefs: Partial<Record<Pref | 'listed', boolean>>) {
  await as(db, 'authenticated', uid);
  const sets = Object.entries(prefs).map(([k, v]) => `${k} = ${v}`).join(', ');
  await db.query(`update public.profiles set ${sets} where user_id = $1`, [uid]);
}

const SKILLS = {
  framework: { rating: 4, feedback: 'MECE tree was great' },
  quant: { rating: 2, feedback: 'Slow on math' },
  recommendation: { rating: null, feedback: '' },
};

async function addCase(uid: string, over: Record<string, unknown> = {}): Promise<string> {
  await as(db, 'authenticated', uid);
  const c: Record<string, unknown> = {
    title: 'Airline profitability',
    source: 'Booth casebook',
    case_type: 'Profitability',
    industry: 'Transportation / Logistics',
    overall: 5,
    overall_feedback: 'Excellent structure overall',
    skills: JSON.stringify(SKILLS),
    went_well: 'Clear synthesis',
    struggled: 'Math under pressure',
    concepts: 'Load factor',
    next_focus: 'Mental math',
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

const sharedAs = async (viewer: string): Promise<Row[]> => {
  await as(db, 'authenticated', viewer);
  return (await db.query<Row>(`select ${COLS} from public.shared_cases order by title`)).rows;
};

const HISTORY = ['case_date', 'title', 'source', 'case_type', 'industry'];
const OPTIONAL = ['overall', 'skill_scores', 'feedback', 'improvement_area', 'notes'];
const nullOnly = (row: Row, keep: string[]) => OPTIONAL.filter((c) => !keep.includes(c)).every((c) => row[c] === null);

describe('profiles and the member directory', () => {
  it('holds no email address, and starts with every sharing switch off', async () => {
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name in ('profiles', 'shared_cases')`,
    );
    expect(cols.rows.some((c) => /email|password|phone/i.test(c.column_name))).toBe(false);

    await as(db, 'authenticated', ALICE);
    await db.query(`insert into public.profiles (user_id, display_name) values ($1, 'Alice')`, [ALICE]);
    const { rows } = await db.query<Row>('select * from public.profiles');
    for (const p of PREFS) expect(rows[0][p], p).toBe(false);
    expect(rows[0].listed).toBe(true);
  });

  it('lets verified members find each other by name, but only listed profiles', async () => {
    await createProfile(ALICE, 'Alice Adams');
    await createProfile(BOB, 'Bob Brown');
    await createProfile(CAROL, 'Carol Chen', [], 'false'); // not listed

    await as(db, 'authenticated', BOB);
    const names = (await db.query<{ display_name: string }>('select display_name from public.profiles order by display_name')).rows.map((r) => r.display_name);
    expect(names).toEqual(['Alice Adams', 'Bob Brown']); // Carol is unlisted

    await as(db, 'authenticated', CAROL);
    expect((await db.query('select * from public.profiles where user_id = $1', [CAROL])).rows).toHaveLength(1); // she sees herself
  });

  it('only lets a member create and edit their own profile', async () => {
    await createProfile(ALICE, 'Alice');
    await as(db, 'authenticated', BOB);
    expect(await fails(`insert into public.profiles (user_id, display_name) values ($1, 'Fake Alice')`, [ALICE])).toMatch(/row-level security/);
    expect((await db.query(`update public.profiles set display_name = 'Hacked', share_cases = true where user_id = $1 returning user_id`, [ALICE])).rows).toEqual([]);
    expect(await fails('delete from public.profiles')).toMatch(/permission denied/);
    await as(db, 'postgres');
    expect((await db.query('select display_name, share_cases from public.profiles')).rows).toEqual([{ display_name: 'Alice', share_cases: false }]);
  });

  it('keeps unverified accounts and the anonymous role out of the directory', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']);
    await addCase(ALICE);

    await as(db, 'authenticated', DAVE); // signed up, email not verified
    expect((await db.query('select * from public.profiles')).rows).toEqual([]);
    expect((await db.query(`select ${COLS} from public.shared_cases`)).rows).toEqual([]);
    expect(await fails(`insert into public.profiles (user_id, display_name) values ($1, 'Dave')`, [DAVE])).toMatch(/row-level security/);

    await as(db, 'anon');
    expect(await fails('select * from public.profiles')).toMatch(/permission denied/);
    expect(await fails(`select ${COLS} from public.shared_cases`)).toMatch(/permission denied/);
  });

  it('validates names and class', async () => {
    await as(db, 'authenticated', ALICE);
    expect(await fails(`insert into public.profiles (user_id, display_name) values ($1, '  ')`, [ALICE])).toMatch(/check constraint/);
    expect(await fails(`insert into public.profiles (user_id, display_name) values ($1, $2)`, [ALICE, 'x'.repeat(81)])).toMatch(/check constraint/);
    expect(await fails(`insert into public.profiles (user_id, display_name, mba_class) values ($1, 'Alice', '')`, [ALICE])).toMatch(/check constraint/);
  });
});

describe('nothing is shared until someone opts in', () => {
  it('shares nothing by default, even after a profile exists', async () => {
    await addCase(ALICE); // a case that existed before the community feature
    await createProfile(ALICE, 'Alice'); // default switches: all off
    await addCase(ALICE, { title: 'A second case' });
    expect(await sharedAs(BOB)).toEqual([]);
  });

  it('never exposes the full case record to another member', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    const id = await addCase(ALICE);

    await as(db, 'authenticated', BOB);
    expect((await db.query('select * from public.cases')).rows).toEqual([]);
    expect((await db.query('select * from public.cases where id = $1', [id])).rows).toEqual([]);
    expect((await db.query(`update public.cases set share_mode = 'full' where id = $1 returning id`, [id])).rows).toEqual([]);
    expect((await db.query('delete from public.cases where id = $1 returning id', [id])).rows).toEqual([]);
    const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'shared_cases'`)).rows.map((c) => c.column_name);
    expect(cols).toContain('other_notes'); // empty unless the member opens everything (see public.test.ts)
    expect(cols).toContain('partner'); // projected only when the member turns "who cased me" on (see public.test.ts)
    expect(cols).not.toContain('skills');
  });
});

describe('what each sharing switch reveals', () => {
  it('case history alone reveals only the case metadata', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']);
    await addCase(ALICE);
    const [row] = await sharedAs(BOB);
    expect(row).toMatchObject({ title: 'Airline profitability', source: 'Booth casebook', case_type: 'Profitability', industry: 'Transportation / Logistics', owner_id: ALICE });
    expect(Object.keys(row)).toEqual(expect.arrayContaining(HISTORY));
    expect(nullOnly(row, [])).toBe(true);
  });

  it.each([
    ['share_overall', 'overall', 5],
    ['share_skills', 'skill_scores', { framework: 4, quant: 2 }],
    ['share_feedback', 'feedback', { overall: 'Excellent structure overall', skills: { framework: 'MECE tree was great', quant: 'Slow on math' } }],
    ['share_improvement', 'improvement_area', 'quant'],
    ['share_notes', 'notes', { went_well: 'Clear synthesis', struggled: 'Math under pressure', concepts: 'Load factor', next_focus: 'Mental math' }],
  ] as const)('%s reveals %s and nothing else', async (pref, column, expected) => {
    await createProfile(ALICE, 'Alice', ['share_cases', pref]);
    await addCase(ALICE);
    const [row] = await sharedAs(BOB);
    expect(row[column]).toEqual(expected);
    expect(nullOnly(row, [column])).toBe(true);
  });

  it('skill scores contain ratings only, never the feedback text; unrated skills are absent', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_skills']);
    await addCase(ALICE);
    const [row] = await sharedAs(BOB);
    expect(row.skill_scores).toEqual({ framework: 4, quant: 2 });
    expect(JSON.stringify(row)).not.toContain('MECE');
    expect(JSON.stringify(row)).not.toContain('Slow on math');
  });

  it('a score or feedback switch does nothing without case-history sharing', async () => {
    await createProfile(ALICE, 'Alice', ['share_overall', 'share_skills', 'share_feedback', 'share_notes']);
    await addCase(ALICE);
    expect(await sharedAs(BOB)).toEqual([]);
  });

  it('never shares other notes, and the practice partner only with its own switch', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await addCase(ALICE, { share_mode: 'full' });
    const rows = await sharedAs(BOB);
    const everything = JSON.stringify(rows);
    expect(everything).not.toContain('PRIVATE-OTHER-NOTES');
    expect(everything).not.toContain('PRIVATE-PARTNER');
  });

  it('leaves blank feedback and notes out instead of exposing empty strings', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_feedback', 'share_notes']);
    await addCase(ALICE, { overall_feedback: '  ', skills: '{}', went_well: '', struggled: null, concepts: ' ', next_focus: null });
    const [row] = await sharedAs(BOB);
    expect(row.feedback).toBeNull();
    expect(row.notes).toBeNull();
  });
});

describe('changes take effect immediately and leave nothing behind', () => {
  it('turning a switch off removes the data at once, including from storage', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await addCase(ALICE);
    expect((await sharedAs(BOB))[0].feedback).not.toBeNull();

    await setPrefs(ALICE, { share_feedback: false });
    expect((await sharedAs(BOB))[0].feedback).toBeNull();
    expect((await sharedAs(BOB))[0].overall).toBe(5); // other switches unaffected

    await as(db, 'postgres');
    expect(JSON.stringify((await db.query(`select ${COLS} from public.shared_cases`)).rows)).not.toContain('Excellent structure overall');
  });

  it('turning case-history sharing off hides every case immediately', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await addCase(ALICE);
    await addCase(ALICE, { title: 'Second' });
    expect(await sharedAs(BOB)).toHaveLength(2);
    await setPrefs(ALICE, { share_cases: false });
    expect(await sharedAs(BOB)).toEqual([]);
    await as(db, 'postgres');
    expect((await db.query(`select ${COLS} from public.shared_cases`)).rows).toEqual([]);
  });

  it('unlisting hides a member entirely, and relisting restores only what they had chosen', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_overall']);
    await addCase(ALICE);
    await setPrefs(ALICE, { listed: false });
    expect(await sharedAs(BOB)).toEqual([]);
    await setPrefs(ALICE, { listed: true });
    const [row] = await sharedAs(BOB);
    expect(row.overall).toBe(5);
    expect(row.feedback).toBeNull();
  });

  it('follows edits to a case and removes a deleted case', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_overall']);
    const id = await addCase(ALICE);

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set title = 'Renamed', overall = 2 where id = $1`, [id]);
    expect(await sharedAs(BOB)).toMatchObject([{ title: 'Renamed', overall: 2 }]);

    await as(db, 'authenticated', ALICE);
    await db.query('delete from public.cases where id = $1', [id]);
    expect(await sharedAs(BOB)).toEqual([]);
  });

  it('removes everything when the account is deleted', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await addCase(ALICE);
    await as(db, 'postgres');
    await db.query('delete from auth.users where id = $1', [ALICE]);
    expect((await db.query(`select ${COLS} from public.shared_cases`)).rows).toEqual([]);
    expect((await db.query('select * from public.profiles')).rows).toEqual([]);
  });
});

describe('per-case sharing overrides', () => {
  it('keeps one case fully private while everything else is shared', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await addCase(ALICE, { title: 'Shared one' });
    await addCase(ALICE, { title: 'Secret one', share_mode: 'private' });
    const rows = await sharedAs(BOB);
    expect(rows.map((r) => r.title)).toEqual(['Shared one']);
    expect(JSON.stringify(rows)).not.toContain('Secret one');
  });

  it("'history' shares the case name but withholds scores, feedback and notes the profile would share", async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await addCase(ALICE, { share_mode: 'history' });
    const [row] = await sharedAs(BOB);
    expect(row.title).toBe('Airline profitability');
    expect(nullOnly(row, [])).toBe(true);
  });

  it("'full' shares one case in detail even when the profile shares nothing", async () => {
    await createProfile(ALICE, 'Alice'); // all switches off
    await addCase(ALICE, { title: 'Hidden', share_mode: 'profile' });
    await addCase(ALICE, { title: 'Open book', share_mode: 'full' });
    const rows = await sharedAs(BOB);
    expect(rows.map((r) => r.title)).toEqual(['Open book']);
    expect(rows[0]).toMatchObject({ overall: 5, improvement_area: 'quant' });
    expect(rows[0].feedback).not.toBeNull();
    expect(rows[0].notes).not.toBeNull();
    expect(JSON.stringify(rows)).not.toContain('PRIVATE-OTHER-NOTES');
  });

  it('applies a changed override immediately, in both directions', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases', 'share_overall']);
    const id = await addCase(ALICE);
    expect((await sharedAs(BOB))[0].overall).toBe(5);

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'private' where id = $1`, [id]);
    expect(await sharedAs(BOB)).toEqual([]);

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'history' where id = $1`, [id]);
    expect((await sharedAs(BOB))[0].overall).toBeNull();

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'profile' where id = $1`, [id]);
    expect((await sharedAs(BOB))[0].overall).toBe(5);
  });
});

describe('bypassing the interface does not help', () => {
  it('cannot write to the shared table or to anyone else’s profile', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']);
    const id = await addCase(ALICE, { share_mode: 'private' });
    await as(db, 'authenticated', BOB);
    expect(await fails(`insert into public.shared_cases (case_id, owner_id, case_date, title, case_type) values ($1, $2, current_date, 'x', 'Revenue')`, [id, ALICE])).toMatch(/permission denied/);
    expect(await fails(`update public.shared_cases set title = 'x'`)).toMatch(/permission denied/);
    expect(await fails('delete from public.shared_cases')).toMatch(/permission denied/);
  });

  it('grants signed-in members only the table privileges the app needs', async () => {
    const privilege = async (table: string, priv: string) => {
      await as(db, 'postgres');
      const { rows } = await db.query<{ ok: boolean }>(`select has_table_privilege('authenticated', $1, $2) as ok`, [`public.${table}`, priv]);
      return rows[0].ok;
    };
    const granted = async (table: string) => {
      const out: string[] = [];
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) if (await privilege(table, p)) out.push(p);
      return out;
    };
    expect(await granted('cases')).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    expect(await granted('opportunities')).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    expect(await granted('profiles')).toEqual(['SELECT', 'INSERT', 'UPDATE']);
    expect(await granted('shared_cases')).toEqual([]); // no table-level rights; read access is per column (below)
    await as(db, 'postgres');
    const colPriv = async (col: string) =>
      (await db.query<{ ok: boolean }>(`select has_column_privilege('authenticated', 'public.shared_cases', $1, 'SELECT') as ok`, [col])).rows[0].ok;
    expect(await colPriv('title')).toBe(true);
    expect(await colPriv('share_id')).toBe(true);
    expect(await colPriv('case_id')).toBe(false); // the private table's id is never readable by members
    for (const table of ['cases', 'opportunities', 'profiles', 'shared_cases']) {
      await as(db, 'postgres');
      const { rows } = await db.query<{ ok: boolean }>(`select has_table_privilege('anon', $1, 'SELECT') as ok`, [`public.${table}`]);
      expect(rows[0].ok, `anon on ${table}`).toBe(false);
    }
  });

  it('cannot call the internal projection functions through the API', async () => {
    await createProfile(ALICE, 'Alice');
    const id = await addCase(ALICE);
    await as(db, 'authenticated', BOB);
    for (const call of [
      `select public.refresh_shared_case('${id}')`,
      `select public.refresh_shared_for_owner('${ALICE}')`,
      `select public._skill_scores('{}'::jsonb)`,
      `select public._feedback('x', '{}'::jsonb)`,
    ]) {
      expect(await fails(call), call).toMatch(/permission denied/);
    }
    expect(await fails('select public.is_member()')).toBe('');
    await as(db, 'anon');
    expect(await fails('select public.is_member()')).toMatch(/permission denied/);
  });

  it('cannot learn hidden values by filtering, sorting or counting', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']); // scores NOT shared
    await addCase(ALICE, { title: 'Five out of five', overall: 5 });
    await addCase(ALICE, { title: 'Private', overall: 1, share_mode: 'private' });

    await as(db, 'authenticated', BOB);
    expect((await db.query(`select ${COLS} from public.shared_cases where overall = 5`)).rows).toEqual([]); // not in the table
    expect((await db.query(`select ${COLS} from public.shared_cases where overall is not null`)).rows).toEqual([]);
    expect((await db.query<{ n: string }>('select count(*)::text as n from public.shared_cases where owner_id = $1', [ALICE])).rows[0].n).toBe('1'); // counts only what is shared
    expect((await db.query<{ n: string }>('select count(*)::text as n from public.cases')).rows[0].n).toBe('0'); // Bob owns none
    expect((await db.query(`select ${COLS} from public.shared_cases where title = $1`, ['Private'])).rows).toEqual([]);
  });

  it('keeps each member’s personal data and shared view separate', async () => {
    await createProfile(ALICE, 'Alice', [...PREFS]);
    await createProfile(BOB, 'Bob', ['share_cases']);
    await addCase(ALICE, { title: 'Alice case' });
    await addCase(BOB, { title: 'Bob case', overall: 3 });

    // Personal tables only ever show your own rows...
    await as(db, 'authenticated', BOB);
    expect((await db.query<{ title: string }>('select title from public.cases')).rows.map((r) => r.title)).toEqual(['Bob case']);
    // ...and the shared table shows each person's rows with their own settings.
    const bySeen = (await sharedAs(ALICE)).map((r) => [r.title, r.overall]);
    expect(bySeen).toEqual([['Alice case', 5], ['Bob case', null]]);
  });
});

describe('hardening from the independent security review', () => {
  it('keeps the private case id unreadable and unprobeable for other members', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']);
    const caseId = await addCase(ALICE);

    await as(db, 'authenticated', BOB);
    for (const sql of [
      'select case_id from public.shared_cases',
      'select * from public.shared_cases',
      'select title from public.shared_cases where case_id is not null',
      'select title from public.shared_cases order by case_id',
    ]) {
      expect(await fails(sql), sql).toMatch(/permission denied/);
    }

    const { rows } = await db.query<{ share_id: string }>('select share_id from public.shared_cases');
    expect(rows).toHaveLength(1);
    expect(rows[0].share_id).not.toBe(caseId); // the public handle is unrelated to the private id
    // So what Bob can see tells him nothing about which case ids exist.
    expect(await fails(`insert into public.cases (id, title, case_type) values ($1, 'probe', 'Revenue')`, [rows[0].share_id])).toBe('');
    // ...and the private id is just as unprobeable even after the case stops being shared.
    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'private' where id = $1`, [caseId]);
    await as(db, 'authenticated', BOB);
    expect((await db.query('select share_id from public.shared_cases')).rows).toEqual([]);
  });

  it('carries no timestamps that would reveal edits to private fields', async () => {
    const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'shared_cases'`)).rows.map((c) => c.column_name);
    expect(cols).not.toContain('updated_at');
    expect(cols).not.toContain('created_at');
  });

  it('rewrites a shared row only when something members can see changes', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']); // scores, feedback and notes are NOT shared
    const id = await addCase(ALICE);
    const version = async () => {
      await as(db, 'postgres');
      return (await db.query<{ v: string }>('select xmin::text as v from public.shared_cases where case_id = $1', [id])).rows[0].v;
    };
    const before = await version();

    // Edit only private things: other notes, score, feedback, notes.
    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set other_notes = 'more secret', overall = 1, overall_feedback = 'new feedback', went_well = 'x' where id = $1`, [id]);
    expect(await version()).toBe(before); // untouched: nothing observable changed

    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set title = 'A new visible title' where id = $1`, [id]);
    expect(await version()).not.toBe(before);
  });

  it('never serves a stale shared row for a member who is no longer listed', async () => {
    await createProfile(ALICE, 'Alice', ['share_cases']);
    await addCase(ALICE);
    expect(await sharedAs(BOB)).toHaveLength(1);

    // Simulate what a race could leave behind: the profile is unlisted but the shared row survived.
    await as(db, 'postgres');
    await db.exec('alter table public.profiles disable trigger profiles_refresh_shared');
    await db.query('update public.profiles set listed = false where user_id = $1', [ALICE]);
    await db.exec('alter table public.profiles enable trigger profiles_refresh_shared');
    expect((await db.query('select 1 from public.shared_cases')).rows).toHaveLength(1); // the stale row exists...

    expect(await sharedAs(BOB)).toEqual([]); // ...but the read policy refuses to serve it
  });
});
