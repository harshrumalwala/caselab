// @vitest-environment node
//
// The profile link stands on its own (issue #244): a member can be reachable by their own link while they do not
// appear in People search. The database half only — the app still forces the old coupling until issue #245.
//
// What this proves, against the real migrations in an in-process Postgres, from the three positions an attacker
// can take (another verified member, a visitor holding a link, and a caller with no account at all):
//   * `listed = false, public_profile = true` is storable at all, and the link serves both the profile AND the
//     cases. The cases are the half that catches the `refresh_shared_case` trap: the public copy is selected from
//     `shared_cases`, so a fix to the second gate alone opens a profile with nothing in it.
//   * the member side stays shut. Widening the first gate leaves an unlisted member's rows in `shared_cases`,
//     where only the policy "shared_cases: members read" holds them. That policy is attacked here directly.
//   * membership is still required: an unverified email gets nothing out of the link, both switches notwithstanding.
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

/** The columns a member is granted on shared_cases (not case_id, which is the private table's id). */
const MEMBER_SHARED = 'share_id, owner_id, case_date, title, source, case_type, industry, overall, skill_scores, improvement_area';

const SKILLS = { framework: { rating: 4, feedback: 'Clear tree' }, quant: { rating: 2, feedback: 'Slow on math' } };

/** A profile saved by the member themselves. `listed` and `public_profile` are the two switches under test. */
async function profile(
  uid: string,
  name: string,
  opts: { listed?: boolean; isPublic?: boolean } = {},
): Promise<void> {
  await as(db, 'authenticated', uid);
  await db.query(
    `insert into public.profiles (user_id, display_name, listed, public_profile, public_link_only,
                                  share_cases, share_overall, share_skills, share_improvement)
     values ($1, $2, $3, $4, $4, true, true, true, true)`,
    [uid, name, opts.listed ?? false, opts.isPublic ?? true],
  );
}

async function addCase(uid: string, title: string): Promise<void> {
  await as(db, 'authenticated', uid);
  await db.query(
    `insert into public.cases (title, case_type, industry, overall, skills, improvement_area)
     values ($1, 'Profitability', 'Technology / SaaS', 4, $2::jsonb, 'framework')`,
    [title, JSON.stringify(SKILLS)],
  );
}

/** What a visitor holding the link reads. */
const byLink = async (id: string): Promise<Row[]> => {
  await as(db, 'anon');
  return (await db.query<Row>('select * from public.public_person($1)', [id])).rows;
};
const casesByLink = async (id: string): Promise<Row[]> => {
  await as(db, 'anon');
  return (await db.query<Row>('select * from public.public_person_cases($1)', [id])).rows;
};

describe('the constraint that made the two switches one', () => {
  it('is gone from the catalogue, by that exact name', async () => {
    await as(db, 'postgres');
    const { rows } = await db.query<{ conname: string }>(
      `select conname from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_public_requires_listed'`,
    );
    expect(rows.map((r) => r.conname)).toEqual([]);
  });

  it('no longer refuses a member who saves the link on and People search off', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await as(db, 'authenticated', ALICE);
    expect(
      (await db.query<Row>('select listed, public_profile from public.profiles where user_id = $1', [ALICE])).rows,
    ).toEqual([{ listed: false, public_profile: true }]);
  });

  it('still refuses the one that was never allowed: link only without the link', async () => {
    // `profiles_link_only_requires_public` is vestigial since issue #96 and is deliberately left in place.
    await as(db, 'authenticated', ALICE);
    expect(
      await fails(
        'insert into public.profiles (user_id, display_name, listed, public_profile, public_link_only) values ($1, $2, true, false, true)',
        [ALICE, 'Alice'],
      ),
    ).toMatch(/profiles_link_only_requires_public/);
  });
});

describe('a visitor holding the link of a member who is not in People search', () => {
  it('opens their profile', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    expect(await byLink(ALICE)).toMatchObject([{ user_id: ALICE, display_name: 'Alice', share_cases: true }]);
  });

  it('sees their shared cases, not an empty profile', async () => {
    // The half that catches the two-gate trap: `public_shared_cases` is selected from `shared_cases`, so a member
    // whose member-side rows were deleted by the first gate would open here with zero cases.
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await addCase(ALICE, 'Grocery margins');
    expect((await casesByLink(ALICE)).map((r) => r.title).sort()).toEqual(['Airline profitability', 'Grocery margins']);
    expect(await casesByLink(ALICE)).toMatchObject([
      { owner_id: ALICE, overall: 4, skill_scores: { framework: 4, quant: 2 }, improvement_area: 'framework' },
      { owner_id: ALICE, overall: 4 },
    ]);
  });

  it('sees a case logged after the switches were set, and loses one set back to private', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'authenticated', ALICE);
    await db.query(`update public.cases set share_mode = 'private' where title = 'Airline profitability'`);
    expect(await casesByLink(ALICE)).toEqual([]);
  });

  it('loses the profile and the cases the moment the member closes their link', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set public_profile = false, public_link_only = false where user_id = $1', [ALICE]);
    expect(await byLink(ALICE)).toEqual([]);
    expect(await casesByLink(ALICE)).toEqual([]);
    await as(db, 'postgres');
    // Neither switch is on now, so the member-side projection goes too.
    expect((await db.query('select 1 from public.shared_cases where owner_id = $1', [ALICE])).rows).toEqual([]);
  });

  it('keeps the link working when the member leaves People search, which is the whole point', async () => {
    await profile(ALICE, 'Alice', { listed: true, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    const before = await casesByLink(ALICE);
    expect(before).toHaveLength(1);
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set listed = false where user_id = $1', [ALICE]);
    expect(await byLink(ALICE)).toMatchObject([{ user_id: ALICE }]);
    expect(await casesByLink(ALICE)).toEqual(before);
  });

  it('reads them only through the two functions: both public tables refuse every direct read', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'anon');
    expect(await fails('select * from public.public_profiles')).toMatch(/permission denied/);
    expect(await fails('select * from public.public_shared_cases')).toMatch(/permission denied/);
    expect(await fails('select count(*) from public.public_profiles where not in_directory')).toMatch(/permission denied/);
    expect(await fails('select user_id from public.public_profiles order by display_name limit 1')).toMatch(/permission denied/);
    expect(await fails('select title from public.public_shared_cases where owner_id is not null')).toMatch(/permission denied/);
    // And nothing at all on the member tables.
    expect(await fails('select * from public.profiles')).toMatch(/permission denied/);
    expect(await fails(`select ${MEMBER_SHARED} from public.shared_cases`)).toMatch(/permission denied/);
    expect(await fails('select * from public.cases')).toMatch(/permission denied/);
  });

  it('cannot find them without the exact id: there is nothing to list', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    expect(await byLink(BOB)).toEqual([]); // a member id that has no profile
    expect(await casesByLink(BOB)).toEqual([]);
    await as(db, 'anon');
    expect(await fails('select * from public.public_person(null)')).toBe('');
    expect((await db.query('select * from public.public_person(null)')).rows).toEqual([]);
  });
});

describe('another verified member', () => {
  it('does not see them in People search, which filters on listed exactly as the app does', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await profile(CAROL, 'Carol', { listed: true, isPublic: false });
    await as(db, 'authenticated', BOB);
    // `src/data/supabaseCommunity.ts` reads `from('profiles').select('*').eq('listed', true)`.
    const { rows } = await db.query<Row>('select user_id, display_name from public.profiles where listed = true');
    expect(rows).toEqual([{ user_id: CAROL, display_name: 'Carol' }]);
  });

  it('does not see them with the filter taken off either: the policy, not the query, hides them', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await as(db, 'authenticated', BOB);
    expect((await db.query('select user_id from public.profiles')).rows).toEqual([]);
    expect((await db.query('select count(*)::int as n from public.profiles')).rows).toEqual([{ n: 0 }]);
    expect((await db.query('select user_id from public.profiles where user_id = $1', [ALICE])).rows).toEqual([]);
    expect((await db.query('select user_id from public.profiles where public_profile')).rows).toEqual([]);
  });

  it('cannot read their cases, although the rows are now in shared_cases', async () => {
    // Widening the first gate leaves the row there on purpose; the policy "shared_cases: members read" is the only
    // thing keeping it from another member, so it is attacked here the way a scraper would.
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'postgres');
    expect((await db.query('select title from public.shared_cases where owner_id = $1', [ALICE])).rows).toEqual([
      { title: 'Airline profitability' },
    ]); // the row exists...
    await as(db, 'authenticated', BOB);
    expect((await db.query(`select ${MEMBER_SHARED} from public.shared_cases`)).rows).toEqual([]); // ...and reaches nobody
    expect((await db.query(`select count(*)::int as n from public.shared_cases where owner_id = $1`, [ALICE])).rows).toEqual([{ n: 0 }]);
    expect((await db.query(`select ${MEMBER_SHARED} from public.shared_cases where overall = 4`)).rows).toEqual([]);
    expect((await db.query(`select ${MEMBER_SHARED} from public.shared_cases where title like 'Airline%' order by title limit 1`)).rows).toEqual([]);
    expect((await db.query('select max(overall)::int as m from public.shared_cases')).rows).toEqual([{ m: null }]);
  });

  it('cannot reach them through the visitor functions or the public tables', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'authenticated', BOB);
    expect(await fails('select * from public.public_person($1)', [ALICE])).toMatch(/permission denied/);
    expect(await fails('select * from public.public_person_cases($1)', [ALICE])).toMatch(/permission denied/);
    expect(await fails('select * from public.public_profiles')).toMatch(/permission denied/);
    expect(await fails('select * from public.public_shared_cases')).toMatch(/permission denied/);
    expect(await fails('select * from public.sync_public_profile($1)', [ALICE])).toMatch(/permission denied/);
    expect(await fails('select * from public.refresh_all_shared()')).toMatch(/permission denied/);
  });

  it('still cannot ask them to case, and still cannot read their interviewed cases', async () => {
    // Unlisting still means disappearing from everything member-to-member; only the link changed.
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set share_interviewed = true where user_id = $1', [ALICE]);
    await db.query(
      `insert into public.interviewed_cases (title, case_type, industry) values ('Airline profitability', 'Profitability', 'Technology / SaaS')`,
    );
    await profile(BOB, 'Bob', { listed: true, isPublic: false });
    await as(db, 'authenticated', BOB);
    expect(await fails('select public.send_practice_request($1, $2, $3, $4, $5)', [ALICE, 'Airline profitability', 'Booth MCG', '', 'Fancy a case?'])).toMatch(
      /can't be asked right now/,
    );
    expect((await db.query('select * from public.member_interviewed($1)', [ALICE])).rows).toEqual([]);
  });

  it('is unaffected as a reader of members who are still listed', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await profile(CAROL, 'Carol', { listed: true, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await addCase(CAROL, 'Grocery margins');
    await as(db, 'authenticated', BOB);
    expect((await db.query<Row>(`select title, owner_id from public.shared_cases`)).rows).toEqual([
      { title: 'Grocery margins', owner_id: CAROL },
    ]);
  });
});

describe('a caller with no account at all', () => {
  it('gets nothing from any table, and cannot call the visitor functions as a signed-out session', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    await as(db, 'authenticated'); // the API role with no user behind it
    expect((await db.query('select user_id from public.profiles')).rows).toEqual([]);
    expect((await db.query(`select ${MEMBER_SHARED} from public.shared_cases`)).rows).toEqual([]);
    expect(await fails('select * from public.public_profiles')).toMatch(/permission denied/);
    expect(await fails('select * from public.public_shared_cases')).toMatch(/permission denied/);
    expect(await fails('select * from public.public_person($1)', [ALICE])).toMatch(/permission denied/);
    expect(await fails('select * from public.public_person_cases($1)', [ALICE])).toMatch(/permission denied/);
  });

  it('leaves the grants exactly where they were: anon executes the two functions and nothing else', async () => {
    await as(db, 'postgres');
    const can = async (role: string, fn: string) =>
      (await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])).rows[0].ok;
    expect(await can('anon', 'public.public_person(uuid)')).toBe(true);
    expect(await can('anon', 'public.public_person_cases(uuid)')).toBe(true);
    expect(await can('authenticated', 'public.public_person(uuid)')).toBe(false);
    expect(await can('authenticated', 'public.public_person_cases(uuid)')).toBe(false);
    for (const role of ['anon', 'authenticated']) {
      expect(await can(role, 'public.sync_public_profile(uuid)')).toBe(false);
      expect(await can(role, 'public.refresh_shared_case(uuid)')).toBe(false);
      expect(await can(role, 'public.refresh_all_shared()')).toBe(false);
      expect(await can(role, 'public.revoke_nonmembers()')).toBe(false);
      for (const table of ['public_profiles', 'public_shared_cases']) {
        expect(
          (await db.query<{ ok: boolean }>(`select has_table_privilege($1, $2, 'SELECT') as ok`, [role, `public.${table}`])).rows[0].ok,
        ).toBe(false);
      }
    }
  });
});

describe('a verified email is still required', () => {
  it('gives a member with an unverified email nothing through their link, both switches on', async () => {
    // Dave signed up and never verified. He cannot save a profile himself (the insert policy asks is_member()),
    // so the row is written as the database owner, the way a profile that predates a rule change would be.
    await as(db, 'postgres');
    await db.query(
      `insert into public.profiles (user_id, display_name, listed, public_profile, share_cases) values ($1, 'Dave', false, true, true)`,
      [DAVE],
    );
    await db.query(
      `insert into public.cases (user_id, title, case_type, industry) values ($1, 'Airline profitability', 'Profitability', 'Technology / SaaS')`,
      [DAVE],
    );
    expect(await byLink(DAVE)).toEqual([]);
    expect(await casesByLink(DAVE)).toEqual([]);
    await as(db, 'postgres');
    expect((await db.query('select 1 from public.public_profiles where user_id = $1', [DAVE])).rows).toEqual([]);
    expect((await db.query('select 1 from public.public_shared_cases where owner_id = $1', [DAVE])).rows).toEqual([]);
  });

  it('closes the link of a member who stops being one, through revoke_nonmembers()', async () => {
    await profile(ALICE, 'Alice', { listed: false, isPublic: true });
    await addCase(ALICE, 'Airline profitability');
    expect(await casesByLink(ALICE)).toHaveLength(1);
    await as(db, 'postgres');
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [ALICE]); // no longer a member
    expect((await db.query<{ n: number }>('select public.revoke_nonmembers() as n')).rows).toEqual([{ n: 1 }]);
    expect(
      (await db.query<Row>('select listed, public_profile from public.profiles where user_id = $1', [ALICE])).rows,
    ).toEqual([{ listed: false, public_profile: false }]);
    expect(await byLink(ALICE)).toEqual([]);
    expect(await casesByLink(ALICE)).toEqual([]);
  });
});
