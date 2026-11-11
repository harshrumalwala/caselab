// @vitest-environment node
//
// The loader for the case library: the SQL it writes runs against the real migrations, can be run again, and copes with awkward text.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dedupe, nameKey, seedSql, type SeedCase, type SeedSolution } from '../../scripts/librarySeed.mjs';
import { as, createDb } from '../test/pg';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await as(db, 'postgres');
  await db.exec('truncate public.library_cases cascade');
});

const sample = (over: Partial<SeedCase> = {}): SeedCase => ({
  book: 'Booth MCG 2026-2027',
  school: 'Booth',
  year: 2026,
  number: 1,
  name: 'Army Hotel',
  firm: 'McKinsey & Company',
  caseType: 'Market Entry',
  industry: 'Travel / Hospitality',
  cochairPick: true,
  difficulty: 2,
  skills: ['quant', 'framework'],
  concepts: ['Break-even'],
  summary: "A PE firm's call on a hotel.",
  strongAnswer: "It's about the investor's hurdle; the army's per diem caps the price.",
  pitfalls: ["Forgetting the hotel's capacity"],
  confidence: 'high',
  notes: "O'Reilly's note",
  ...over,
});
const run = async (cases: SeedCase[]) => db.exec(seedSql([{ file: 'test.json', cases }]).sql);
const counts = async () => ({
  cases: Number((await db.query<{ n: string }>('select count(*) as n from public.library_cases')).rows[0].n),
  notes: Number((await db.query<{ n: string }>('select count(*) as n from public.library_case_notes')).rows[0].n),
});

describe('loading the case library', () => {
  it('writes each case and its analysis, with apostrophes and ampersands intact', async () => {
    await run([sample(), sample({ number: 2, name: "Linda's Great Burgers", firm: null, caseType: 'Mergers and Acquisitions' })]);
    expect(await counts()).toEqual({ cases: 2, notes: 2 });
    const { rows } = await db.query<Record<string, unknown>>(
      "select c.name, c.firm, c.cochair_pick, n.summary, n.strong_answer, n.pitfalls, n.skills, n.notes from public.library_cases c join public.library_case_notes n on n.case_id = c.id where c.name = 'Army Hotel'",
    );
    expect(rows[0]).toMatchObject({ firm: 'McKinsey & Company', cochair_pick: true, summary: "A PE firm's call on a hotel.", notes: "O'Reilly's note" });
    expect(rows[0].pitfalls).toEqual(["Forgetting the hotel's capacity"]);
    expect(rows[0].skills).toEqual(['quant', 'framework']);
    const linda = await db.query<{ firm: string | null }>("select firm from public.library_cases where name = 'Linda''s Great Burgers'");
    expect(linda.rows[0].firm).toBeNull();
  });

  it('can be run again: it updates what is there and adds nothing twice', async () => {
    await run([sample()]);
    await run([sample({ difficulty: 4, summary: 'Reworded.', cochairPick: false })]);
    expect(await counts()).toEqual({ cases: 1, notes: 1 });
    const { rows } = await db.query<Record<string, unknown>>('select c.cochair_pick, n.difficulty, n.summary from public.library_cases c join public.library_case_notes n on n.case_id = c.id');
    expect(rows[0]).toEqual({ cochair_pick: false, difficulty: 4, summary: 'Reworded.' });
  });

  it('does all of it or none of it: a bad case leaves nothing half-loaded', async () => {
    await expect(run([sample(), sample({ number: 2, name: 'Bad', caseType: 'Not a type' })])).rejects.toThrow();
    await db.exec('rollback'); // what ending the connection does: the whole script is one transaction, so the first case goes too
    expect(await counts()).toEqual({ cases: 0, notes: 0 });
  });

  it('refuses to write a case with something missing, rather than loading a gap', () => {
    const { skills: _skills, ...broken } = sample();
    expect(() => seedSql([{ file: 'x.json', cases: [broken as SeedCase] }])).toThrow(/no skills/);
  });
});

describe('one entry per case name', () => {
  const kellogg = (over: Partial<SeedCase> = {}) => sample({ book: 'Kellogg Case Book 2020', school: 'Kellogg', year: 2020, number: 9, ...over });
  const ross = (over: Partial<SeedCase> = {}) => sample({ book: 'Ross Case Book 2024', school: 'Ross', year: 2024, number: 4, ...over });
  const names = async () => (await db.query<{ book: string; also_in: string[] }>('select book, also_in from public.library_cases order by book')).rows;

  it('treats the same name as the same case, ignoring case, punctuation and "Co."', () => {
    expect(nameKey('Midwest Machinery Co.')).toBe(nameKey('midwest machinery'));
    expect(nameKey("Linda's Great Burgers")).toBe(nameKey('LINDA S GREAT BURGERS'));
    expect(nameKey('Smith & Sons Inc.')).toBe(nameKey('Smith and Sons'));
    expect(nameKey('Army Hotel')).not.toBe(nameKey('Army Base Housing'));
  });

  it('keeps the Booth MCG copy over a newer book, and notes the other books', async () => {
    const { winners, dropped } = dedupe([ross(), sample(), kellogg()]);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({ book: 'Booth MCG 2026-2027', alsoIn: ['Ross Case Book 2024', 'Kellogg Case Book 2020'].sort((a, b) => a.localeCompare(b)).reverse() });
    expect(dropped.map((d) => d.book).sort()).toEqual(['Kellogg Case Book 2020', 'Ross Case Book 2024']);
  });

  it('otherwise keeps the newest book, whatever order the books arrive in', () => {
    for (const order of [[kellogg(), ross()], [ross(), kellogg()]]) {
      const { winners } = dedupe(order);
      expect(winners).toHaveLength(1);
      expect(winners[0].book).toBe('Ross Case Book 2024');
      expect(winners[0].alsoIn).toEqual(['Kellogg Case Book 2020']);
    }
  });

  it('loads one row for it, with the other books listed', async () => {
    await run([ross(), kellogg(), sample({ number: 2, name: 'Hawaiian Smoothies' })]);
    expect(await counts()).toEqual({ cases: 2, notes: 2 });
    const { rows } = await db.query<{ book: string; also_in: string[] }>("select book, also_in from public.library_cases where name = 'Army Hotel'");
    expect(rows).toEqual([{ book: 'Ross Case Book 2024', also_in: ['Kellogg Case Book 2020'] }]);
  });

  it('lets a case be only listed, with no analysis, and still be found', async () => {
    const { difficulty: _d, skills: _s, concepts: _c, summary: _su, strongAnswer: _sa, pitfalls: _p, confidence: _co, ...listed } = kellogg({ name: 'Maine Apples' });
    await run([listed as SeedCase]);
    expect(await counts()).toEqual({ cases: 1, notes: 0 });
  });

  it('gives a listed winner the analysis of a copy that has one, and says where it came from', () => {
    const { difficulty: _d, skills: _s, concepts: _c, summary: _su, strongAnswer: _sa, pitfalls: _p, confidence: _co, ...listed } = ross();
    const { winners } = dedupe([listed as SeedCase, kellogg({ strongAnswer: 'From Kellogg.' })]);
    expect(winners[0].book).toBe('Ross Case Book 2024');
    expect(winners[0].strongAnswer).toBe('From Kellogg.');
    expect(winners[0].notes).toMatch(/Analysis from Kellogg Case Book 2020/);
  });

  it('refuses a half-written analysis rather than loading a gap', () => {
    const { pitfalls: _p, ...half } = sample({ name: 'Half' });
    expect(() => seedSql([{ file: 'x.json', cases: [half as SeedCase] }])).toThrow(/no pitfalls/);
  });

  it('folds a copy loaded earlier into the better one, and moves the link on a logged case across so it is not lost', async () => {
    await run([kellogg()]); // an earlier run: only the Kellogg copy
    await as(db, 'postgres');
    const old = (await db.query<{ id: string }>("select id from public.library_cases where name = 'Army Hotel'")).rows[0].id;
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ('11111111-1111-4111-8111-111111111111', 'a@example.com', now())");
    await db.query("insert into public.cases (user_id, case_date, title, case_type, library_id) values ('11111111-1111-4111-8111-111111111111', '2026-10-01', 'Army Hotel', 'Market Entry', $1)", [old]);

    await run([kellogg(), ross()]); // a later run adds the newer book
    expect(await names()).toEqual([{ book: 'Ross Case Book 2024', also_in: ['Kellogg Case Book 2020'] }]);
    const link = (await db.query<{ book: string }>('select l.book from public.cases c join public.library_cases l on l.id = c.library_id')).rows;
    expect(link).toEqual([{ book: 'Ross Case Book 2024' }]);
  });
});

describe('cases that are only listed', () => {
  const listed = (over: Partial<SeedCase> = {}): SeedCase => {
    const { difficulty: _d, skills: _s, concepts: _c, summary: _su, strongAnswer: _sa, pitfalls: _p, confidence: _co, ...rest } = sample({ caseType: 'Other', industry: 'Other', ...over });
    return { ...rest, detailsKnown: false } as SeedCase;
  };

  it('is stored with its details marked as not known, and no analysis', async () => {
    await run([listed({ name: 'Rural Broadband Rollout', book: 'Haas Case Book', school: 'Haas', year: 2015 })]);
    const { rows } = await db.query<{ details_known: boolean; case_type: string }>('select details_known, case_type from public.library_cases');
    expect(rows).toEqual([{ details_known: false, case_type: 'Other' }]);
    expect(await counts()).toEqual({ cases: 1, notes: 0 });
  });

  it('takes the case type and industry from another copy of the case that has them', () => {
    const { winners } = dedupe([
      listed({ name: 'Maine Apples', book: 'Ross Case Book 2024', school: 'Ross', year: 2024 }),
      sample({ name: 'Maine Apples', book: 'Kellogg Case Book 2020', school: 'Kellogg', year: 2020, caseType: 'Profitability', industry: 'Consumer Products / Retail' }),
    ]);
    expect(winners[0]).toMatchObject({ book: 'Ross Case Book 2024', caseType: 'Profitability', industry: 'Consumer Products / Retail', detailsKnown: true });
    expect(winners[0].strongAnswer).toBeTruthy(); // and the analysis too
  });

  it('keeps the analysed row when the same case is also listed in the very same book (never deletes the winner)', async () => {
    const both = [
      listed({ name: 'Zoo Co', book: 'Kellogg Case Book 2024', school: 'Kellogg', year: 2024 }),
      sample({ name: 'Zoo Co', book: 'Kellogg Case Book 2024', school: 'Kellogg', year: 2024 }),
    ];
    const { dropped } = dedupe(both);
    expect(dropped).toEqual([]);
    await run(both);
    expect(await counts()).toEqual({ cases: 1, notes: 1 });
    // and again, on top of a row an earlier run loaded
    await run(both);
    expect(await counts()).toEqual({ cases: 1, notes: 1 });
  });

  it('keeps the placeholder marked as unknown when no copy knows them', () => {
    const { winners } = dedupe([listed({ name: 'Maine Apples', book: 'Ross Case Book 2024', school: 'Ross', year: 2024 }), listed({ name: 'Maine Apples', book: 'Ross Case Book 2013', school: 'Ross', year: 2013 })]);
    expect(winners[0]).toMatchObject({ book: 'Ross Case Book 2024', detailsKnown: false });
  });
});

describe("the book's own solutions", () => {
  const solution = (over: Partial<SeedSolution> = {}): SeedSolution => ({
    name: 'Army Hotel',
    book: 'Booth MCG 2026-2027',
    prompt: "Should the chain open a hotel? It's the army's call.",
    facts: ['A fact'],
    steps: [{ title: 'Step one', body: "O'Reilly's maths", calc: ['1 + 1 = 2'] }],
    exhibits: [{ title: 'Exhibit 1', columns: ['A', 'B'], rows: [['1', '2']] }],
    recommendation: 'Open it.',
    ...over,
  });
  const run2 = (cases: SeedCase[], solutions: SeedSolution[]) => db.exec(seedSql([{ file: 'test.json', cases }], solutions).sql);
  const stored = async () =>
    (await db.query<{ name: string; solution: Record<string, unknown> }>('select c.name, s.solution from public.library_case_solutions s join public.library_cases c on c.id = s.case_id order by c.name')).rows;
  const build = (solutions: SeedSolution[]) => () => seedSql([{ file: 't', cases: [sample()] }], solutions);

  it('is stored against the case, with apostrophes intact, and without the identity keys', async () => {
    await run2([sample()], [solution()]);
    const [row] = await stored();
    expect(row.name).toBe('Army Hotel');
    expect(row.solution.prompt).toBe("Should the chain open a hotel? It's the army's call.");
    expect((row.solution.steps as { body: string }[])[0].body).toBe("O'Reilly's maths");
    expect(row.solution).not.toHaveProperty('name');
    expect(row.solution).not.toHaveProperty('book');
  });

  it('keeps the coaching layers, not only the original fields', async () => {
    await run2(
      [sample()],
      [
        solution({
          clarifyingQuestions: [{ question: 'Who pays?', answer: 'The army', why: 'Caps price' }],
          hypothesis: { statement: 'Build it', basis: 'Peak is strong' },
          recommendationDetail: { because: ['Reason'], delivery: 'Say it first.', commonMisses: ['Risks'] },
          steps: [{ title: 'S', body: 'b', whatToNotice: 'Look', commonMiss: ['Peak only'], checkYourself: ['Did you?'] }],
        }),
      ],
    );
    const [row] = await stored();
    expect(row.solution.clarifyingQuestions).toEqual([{ question: 'Who pays?', answer: 'The army', why: 'Caps price' }]);
    expect(row.solution.hypothesis).toEqual({ statement: 'Build it', basis: 'Peak is strong' });
    expect((row.solution.recommendationDetail as { delivery: string }).delivery).toBe('Say it first.');
    expect((row.solution.steps as { checkYourself: string[] }[])[0].checkYourself).toEqual(['Did you?']);
  });

  it('says how many it attached', () => {
    expect(seedSql([{ file: 't', cases: [sample()] }], [solution()]).solutionCount).toBe(1);
    expect(seedSql([{ file: 't', cases: [sample()] }]).solutionCount).toBe(0);
  });

  it('can be loaded again, replacing what was there', async () => {
    await run2([sample()], [solution()]);
    await run2([sample()], [solution({ recommendation: 'Do not open it.' })]);
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0].solution.recommendation).toBe('Do not open it.');
  });

  it('goes to the entry that won for that case name, whichever book the write-up was made from', async () => {
    const cases = [
      sample({ name: 'Zoo Co', book: 'Kellogg Case Book 2020', school: 'Kellogg', year: 2020, cochairPick: false }),
      sample({ name: 'Zoo Co.', book: 'Kellogg Case Book 2024', school: 'Kellogg', year: 2024, cochairPick: false }),
    ];
    await run2(cases, [solution({ name: 'Zoo Co', book: 'Kellogg Case Book 2020' })]);
    const { rows } = await db.query<{ book: string }>('select c.book from public.library_case_solutions s join public.library_cases c on c.id = s.case_id');
    expect(rows).toEqual([{ book: 'Kellogg Case Book 2024' }]);
  });

  it('is refused unless it has a question, a recommendation and steps, or when it matches no case, or when a case has two', () => {
    expect(build([solution({ prompt: '' })])).toThrow(/no prompt/);
    expect(build([solution({ recommendation: ' ' })])).toThrow(/no recommendation/);
    expect(build([solution({ steps: [] })])).toThrow(/no steps/);
    expect(build([solution({ name: 'Nowhere Inc' })])).toThrow(/matches no case/);
    expect(build([solution(), solution()])).toThrow(/two solutions/);
  });

  it('is removed with the case', async () => {
    await run2([sample()], [solution()]);
    await db.exec("delete from public.library_cases where name = 'Army Hotel'");
    expect(await stored()).toEqual([]);
  });
});

describe('linking the cases members already logged', () => {
  it('links a case with the same name that names the book, changes nothing else about it, and leaves a maybe alone', async () => {
    await as(db, 'postgres');
    await db.exec('delete from public.cases');
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ('11111111-1111-4111-8111-111111111111', 'a@example.com', now()) on conflict do nothing");
    const mine = (title: string, source: string | null) =>
      db.query("insert into public.cases (user_id, case_date, title, source, case_type, industry) values ('11111111-1111-4111-8111-111111111111', '2026-10-01', $1, $2, 'Profitability', 'Energy / Utilities')", [title, source]);
    await mine('army hotel', 'Booth casebook');
    await mine('Army Hotel', null);
    await mine('Unrelated', 'Booth');
    await run([sample()]);
    const rows = (await db.query<{ title: string; source: string | null; case_type: string; industry: string; linked: boolean }>('select title, source, case_type, industry, library_id is not null as linked from public.cases')).rows;
    const byTitle = Object.fromEntries(rows.map((r) => [`${r.title}|${r.source ?? ''}`, r]));
    // Linked, and its wording untouched.
    expect(byTitle['army hotel|Booth casebook']).toMatchObject({ source: 'Booth casebook', case_type: 'Profitability', industry: 'Energy / Utilities', linked: true });
    // A maybe (no book given) and an unrelated case are left alone.
    expect(byTitle['Army Hotel|']).toMatchObject({ linked: false });
    expect(byTitle['Unrelated|Booth']).toMatchObject({ linked: false });
  });
});
