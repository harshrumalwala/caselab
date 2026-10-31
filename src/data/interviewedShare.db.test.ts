// @vitest-environment node
//
// Showing the cases you interviewed to other members: off by default, members only, only while listed and switched on,
// and never who you interviewed or your notes. Run against the real migrations in an in-process Postgres.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const profile = (uid: string, name: string, listed = true, share = false) =>
  db.query('insert into public.profiles (user_id, display_name, listed, share_interviewed) values ($1, $2, $3, $4)', [uid, name, listed, share]);
const interview = (title: string, date = '2026-10-10') =>
  db.query(
    `insert into public.interviewed_cases (case_date, title, source, case_type, industry, partner, feedback, learned)
     values ($1, $2, 'Darden 2019', 'Profitability', 'Transportation / Logistics', 'Secret Partner', 'Private feedback', 'Private lesson')`,
    [date, title],
  );
const seen = async (of: string) => (await db.query<Record<string, unknown>>('select * from public.member_interviewed($1)', [of])).rows;

/** Alice has interviewed two cases; Bob and Dave are other accounts. */
async function aliceInterviewed(opts: { listed?: boolean; share?: boolean } = {}) {
  await as(db, 'postgres');
  await profile(ALICE, 'Alice', opts.listed ?? true, opts.share ?? true);
  await profile(BOB, 'Bob');
  await as(db, 'authenticated', ALICE);
  await interview('Airline profit', '2026-10-10');
  await interview('Bank entry', '2026-10-20');
}

describe('members seeing the cases someone interviewed', () => {
  it('is off by default: until the switch is on, nobody else learns anything', async () => {
    await aliceInterviewed({ share: false });
    await as(db, 'authenticated', BOB);
    expect(await seen(ALICE)).toEqual([]);
  });

  it('shows another verified member the cases, newest first, once the switch is on', async () => {
    await aliceInterviewed();
    await as(db, 'authenticated', BOB);
    const rows = await seen(ALICE);
    expect(rows.map((r) => r.title)).toEqual(['Bank entry', 'Airline profit']);
    expect(rows[0]).toMatchObject({ source: 'Darden 2019', case_type: 'Profitability', industry: 'Transportation / Logistics' });
  });

  it('never returns who they interviewed, what they told them or what they learned', async () => {
    await aliceInterviewed();
    await as(db, 'authenticated', BOB);
    const rows = await seen(ALICE);
    expect(Object.keys(rows[0]).sort()).toEqual(['case_date', 'case_type', 'industry', 'source', 'title']);
    expect(JSON.stringify(rows)).not.toMatch(/Secret Partner|Private feedback|Private lesson/);
  });

  it('hides everything again the moment the switch is turned off, or the profile is unlisted', async () => {
    await aliceInterviewed();
    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set share_interviewed = false where user_id = $1', [ALICE]);
    await as(db, 'authenticated', BOB);
    expect(await seen(ALICE)).toEqual([]);

    await as(db, 'authenticated', ALICE);
    await db.query('update public.profiles set share_interviewed = true, listed = false where user_id = $1', [ALICE]);
    await as(db, 'authenticated', BOB);
    expect(await seen(ALICE)).toEqual([]);
  });

  it('gives visitors without an account, and members who have not verified their email, nothing', async () => {
    await aliceInterviewed();
    await as(db, 'anon');
    expect(await fails('select * from public.member_interviewed($1)', [ALICE])).toBeTruthy();
    await as(db, 'authenticated', DAVE);
    expect(await seen(ALICE)).toEqual([]);
  });

  it('leaves the table itself owner-only: switching the share on does not open it', async () => {
    await aliceInterviewed();
    await as(db, 'authenticated', BOB);
    expect((await db.query('select * from public.interviewed_cases')).rows).toEqual([]);
  });

  it('is a switch only the owner can flip', async () => {
    await aliceInterviewed({ share: false });
    await as(db, 'authenticated', BOB);
    await db.query('update public.profiles set share_interviewed = true where user_id = $1', [ALICE]);
    expect(await seen(ALICE)).toEqual([]);
  });
});
