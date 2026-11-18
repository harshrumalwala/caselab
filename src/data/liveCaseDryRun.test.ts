// @vitest-environment node
//
// The scripted dry run (scripts/liveCaseDryRun.mjs): it must play a real case through the real engine to the end, drive the clock instead of
// waiting for it, say honestly where a case stopped, and never carry a word of the book's content out of private-data.
import { describe, expect, it } from 'vitest';
import * as coach from '../../supabase/functions/_shared/liveCaseCoach';
import { handleLive, heldResults, isFullSolution, readSolution } from '../../supabase/functions/_shared/liveCaseCoach';
import { PLANNED_MS, isInterviewerSideExhibit, nudgeLevel, timeInStages } from '../../supabase/functions/_shared/liveCase';
import { createMemoryLiveDeps } from '../test/memoryLiveDeps';
import {
  CANDIDATES,
  CANDIDATE_SPECS,
  MODES,
  REPLY_SHAPES,
  privateSentenceOf,
  standInLines,
  exhibitLeaks,
  failedTheBar,
  failureCause,
  openByDesign,
  formatReport,
  formatSummary,
  playAll,
  playCase,
  reachedEnd,
  summarise,
  type DryRun,
  type DryRunEngine,
} from '../../scripts/liveCaseDryRun.mjs';

const engine: DryRunEngine = {
  handleLive,
  isFullSolution,
  readSolution,
  heldResults,
  standIns: standInLines(coach as unknown as Record<string, unknown>),
  isInterviewerSideExhibit,
  nudgeLevel,
  timeInStages,
  PLANNED_MS,
  createMemoryLiveDeps,
};

const exhibit = (n: number, over: Record<string, unknown> = {}) => ({
  title: `Exhibit ${n}: Revenue by region`,
  caption: '',
  columns: ['Region', 'Revenue'],
  rows: [
    ['North', `${n}0`],
    ['South', `${n}5`],
  ],
  howToRead: 'Compare the two regions.',
  takeaways: ['North is the bigger one.'],
  ...over,
});

const writeUp = (over: Record<string, unknown> = {}) => ({
  name: 'Sample Co.',
  book: 'Booth MCG 2026-2027',
  confidence: 'high',
  prompt: 'The client is losing money and wants to know why.',
  facts: ['The client has two regions.'],
  clarifyingQuestions: [{ question: 'Who is the client?', answer: 'A regional retailer.' }],
  recommendation: 'Close the southern shops.',
  recommendationDetail: { because: ['The south loses money.'], delivery: 'Say the recommendation first.', commonMisses: [] },
  steps: [
    { title: 'Size the market', body: 'Work out the market size.', calc: [], whatToNotice: 'The south is small.', commonMiss: [] },
    { title: 'Brainstorm: ways to grow', body: 'Ideas.', calc: [], whatToNotice: '', commonMiss: [] },
  ],
  exhibits: [exhibit(1), exhibit(2)],
  ...over,
});

const play = (mode: string, candidate: string, over: Record<string, unknown> = {}): Promise<DryRun> =>
  playCase(writeUp(over), mode as 'practice', candidate as 'brisk', engine);

const outcomes = (run: DryRun) => run.beats.map((b) => b.outcome);
const hints = (run: DryRun) => run.beats.reduce((t, b) => t + b.hints, 0);

describe('the bar: every case reaches the end', () => {
  it('plays every mode and every candidate through the real handleLive, and says where each one finished', async () => {
    for (const mode of MODES) {
      for (const candidate of CANDIDATES) {
        const run = await play(mode, candidate);
        expect(run.threw, `${mode}/${candidate} threw: ${run.error}`).toBe(false);
        expect(run.mode).toBe(mode);
        expect(run.candidate).toBe(candidate);
        // Learning mode has no clock, so a candidate who never completes a beat and never presses "move on" cannot reach the end.
        const canFinish = mode !== 'learning' || CANDIDATE_SPECS[candidate].endsBeats;
        expect(reachedEnd(run), `${mode}/${candidate} finished at ${run.stage}`).toBe(canFinish);
        if (canFinish) {
          expect(run.stage).toBe('done');
          // `interrupted` stops the case itself wherever the mode allows it; every other candidate plays it to the end.
          const stopsItself = candidate === 'interrupted' && mode !== 'interview';
          expect(run.endReason, `${mode}/${candidate}`).toBe(stopsItself ? 'ended_early' : 'completed');
          expect(run.reachedRecommendWrite).toBe(true);
          // `blocked`'s model declines the feedback as well as the turns, so that one run ends with none, on purpose.
          expect(run.feedback, `${mode}/${candidate}`).toBe(candidate !== 'blocked');
        }
      }
    }
  });

  it('says plainly why a run did not reach the end, in words that group', async () => {
    const stalled = await play('learning', 'passive');
    expect(stalled.stage).toBe('prompt');
    expect(stalled.stalled).toBe(true);
    expect(failureCause(stalled)).toContain('stalled at prompt');
    expect(failureCause(stalled)).toContain('learning mode has no clock');
    const stuck = await play('learning', 'offtrack');
    expect(stuck.stage).toBe('exhibits');
    expect(failureCause(stuck)).toContain('nothing but the member\'s own "move on" ends a beat they never complete');
  });

  it('separates a case that broke from one the engine meant to leave where it is', async () => {
    // Untimed, and the member neither completed a beat nor chose to move on: the design, not a defect, and not a failure.
    for (const candidate of ['passive', 'offtrack'] as const) {
      const run = await play('learning', candidate);
      expect(CANDIDATE_SPECS[candidate].endsBeats).toBe(false);
      expect(openByDesign(run)).toBe(true);
      expect(failedTheBar(run)).toBe(false);
    }
    // The same candidates in a mode that has a clock must be carried to the end; stopping there would be a failure.
    for (const mode of ['practice', 'interview'] as const) {
      for (const candidate of CANDIDATES) {
        const run = await play(mode, candidate);
        expect(openByDesign(run)).toBe(false);
        expect(failedTheBar(run), `${mode}/${candidate} failed the bar`).toBe(false);
      }
    }
  });

  it('counts a learning run that stops although the candidate could have moved on as a failure, not as the design', async () => {
    const run = await play('learning', 'brisk');
    expect(CANDIDATE_SPECS.brisk.endsBeats).toBe(true);
    expect(reachedEnd(run)).toBe(true);
    // If a candidate that can end beats were ever left in an untimed case, it would count against the bar.
    expect(openByDesign({ ...run, stage: 'exhibits', stalled: true })).toBe(false);
    expect(failedTheBar({ ...run, stage: 'exhibits', stalled: true })).toBe(true);
  });

  it('catches an exception instead of losing the run', async () => {
    const broken: DryRunEngine = {
      ...engine,
      handleLive: async (userId, action, deps) => {
        if (action.type === 'say') throw new Error('the engine fell over');
        return handleLive(userId, action, deps);
      },
    };
    const run = await playCase(writeUp(), 'learning', 'offtrack', broken);
    expect(run.threw).toBe(true);
    expect(run.error).toContain('the engine fell over');
    expect(reachedEnd(run)).toBe(false);
    expect(failureCause(run)).toContain('threw an exception');
    expect(failedTheBar(run)).toBe(true); // an exception is a failure even in a mode that has no clock
  });
});

describe('the candidates, and the one piece of pretending', () => {
  it('a brisk candidate completes every beat on its own', async () => {
    const run = await play('interview', 'brisk');
    expect(run.beatsTotal).toBe(3); // the two exhibits, and the step of the analysis that has none
    expect(outcomes(run)).toEqual(['independent', 'independent', 'independent']);
    expect(hints(run)).toBe(0);
  });

  it('a passive candidate writes nothing and is carried to the end by the clock alone', async () => {
    const run = await play('practice', 'passive');
    expect(run.coachCalls).toBe(0); // the model is never asked, because the member never writes
    expect(run.stage).toBe('done');
    expect(run.endReason).toBe('completed');
    // Only the first beat ever comes out, and the clock closes it: the rest of the case is never reached.
    expect(outcomes(run)).toEqual(['timed_out']);
    expect(run.beatsTotal).toBe(3);
    expect(run.stages.every((s) => s.endedBy === 'timer')).toBe(true);
    expect(run.reachedRecommendWrite).toBe(true);
  });

  it('an off-track candidate climbs the hint ladder and is moved on by the coach', async () => {
    const run = await play('practice', 'offtrack');
    expect(outcomes(run)).toEqual(['coach_moved', 'coach_moved', 'coach_moved']);
    expect(hints(run)).toBeGreaterThan(0);
    expect(run.rungs).toContain('process_hint');
    expect(run.rungs).toContain('directional_hint');
    expect(run.rungs).toContain('advance');
  });

  it('a plausible-sounding candidate climbs the ladder although the model calls every message a step forward', async () => {
    // The pilot's own failure (issue #130): the score says progress, the message says nothing, and the rung counter used to stand
    // still at zero for the whole beat. The engine now reads what was written, so the ladder engages in an interview too.
    expect(CANDIDATE_SPECS.plausible.exhibit).toEqual({ assessment: 'progress', beatComplete: false });
    const run = await play('interview', 'plausible');
    expect(run.rungs).toContain('process_hint');
    expect(run.rungs).toContain('advance');
    expect(hints(run)).toBeGreaterThan(0);
    expect(outcomes(run)).toContain('coach_moved');
    expect(run.stage).toBe('done');
  });

  it('an asker asks for data and then chooses to move on, which no other candidate does', async () => {
    const run = await play('learning', 'asker');
    expect(outcomes(run)).toEqual(['member_moved', 'member_moved', 'member_moved']);
    expect(run.stage).toBe('done');
  });

  it('asks and counts every brainstorm the case has, wherever the book put them', async () => {
    const two = {
      steps: [
        { title: 'Brainstorm #1: ways to grow', body: 'Ideas.', calc: [], whatToNotice: '', commonMiss: [] },
        { title: 'Size the market', body: 'Work out the market size.', calc: [], whatToNotice: 'The south is small.', commonMiss: [] },
        { title: 'Brainstorm #2: ways to cut cost', body: 'More ideas.', calc: [], whatToNotice: '', commonMiss: [] },
      ],
    };
    const run = await play('practice', 'brisk', two);
    expect(run.brainstorms).toEqual({ planned: 2, asked: 2, answered: 2 });
    expect(run.beatsTotal).toBe(3); // the discussion is still the two exhibits and the sizing step
    expect(run.stage).toBe('done');
    // The default case has one, and the member is asked it.
    expect((await play('practice', 'brisk')).brainstorms).toEqual({ planned: 1, asked: 1, answered: 1 });
  });

  it('the stub decides only assessment, beat_complete and direction_clear, from the candidate alone', () => {
    expect(Object.keys(CANDIDATE_SPECS)).toEqual([...CANDIDATES]);
    for (const name of CANDIDATES) {
      const spec = CANDIDATE_SPECS[name];
      expect(typeof spec.what).toBe('string');
      expect(['progress', 'partial', 'stuck', 'unclear']).toContain(spec.exhibit.assessment);
    }
    expect(CANDIDATE_SPECS.brisk.exhibit).toEqual({ assessment: 'progress', beatComplete: true });
    expect(CANDIDATE_SPECS.passive.acts).toBe(false);
  });
});

describe('the clock', () => {
  it('is driven through deps.now, so a whole case takes no real time and always lands in the same place', async () => {
    const began = Date.now();
    const first = await play('interview', 'passive');
    const again = await play('interview', 'passive');
    expect(Date.now() - began).toBeLessThan(5000);
    // Three beats (two exhibits and a step with none): 16 minutes of discussion inside a 31-minute case, which is the plan, not a constant.
    expect(first.limitSeconds).toBe(31 * 60);
    expect(first.seconds).toBe(again.seconds);
    expect(first.stages).toEqual(again.stages);
  });

  it('reports the seconds in each stage against the time the plan gave it', async () => {
    const run = await play('practice', 'passive');
    const stage = (name: string) => run.stages.find((s) => s.stage === name);
    expect(stage('prompt')).toMatchObject({ seconds: 180, planned: 180 });
    expect(stage('exhibits')).toMatchObject({ seconds: 16 * 60, planned: 16 * 60 });
    expect(stage('recommend_write')).toMatchObject({ seconds: 90, planned: 90 });
  });

  it('never gives the member a reply they did not ask for', async () => {
    for (const candidate of CANDIDATES) {
      expect((await play('practice', candidate)).unprompted).toBe(0);
    }
  });

  it('sizes a one-beat case to its own clock, not to a constant', async () => {
    // One exhibit, and the write-up's only step is that exhibit's own discussion, so there is one thing to work through.
    const run = await play('practice', 'passive', { exhibits: [exhibit(1)], steps: [{ title: 'Exhibit 1: Revenue by region', body: 'Read the two regions.', calc: [], whatToNotice: '', commonMiss: [] }] });
    expect(run.beatsTotal).toBe(1);
    expect(run.limitSeconds).toBe(23 * 60); // 8 minutes of discussion plus the fixed 15
    expect(run.stage).toBe('done');
  });
});

describe('the whole run', () => {
  const entries = [
    writeUp(),
    writeUp({ name: 'Midwest Machinery Co.' }),
    writeUp({ name: 'Midwest machinery' }),
    writeUp({ name: 'Half Case', confidence: 'partial' }),
  ];
  const result = async () => playAll(entries, engine, { modes: ['practice'], candidates: ['brisk', 'passive'] });

  it('folds a duplicate case name, skips what live practice refuses, and plays the rest in a fixed order', async () => {
    const r = await result();
    expect(r.read).toBe(4);
    expect(r.folded).toEqual([{ name: 'Midwest machinery', keptName: 'Midwest Machinery Co.' }]);
    expect(r.skipped.map((c) => c.name)).toEqual(['Half Case']);
    expect(r.cases.map((c) => c.name)).toEqual(['Midwest Machinery Co.', 'Sample Co.']);
    expect(r.cases[0].runs.map((x) => `${x.mode}/${x.candidate}`)).toEqual(['practice/brisk', 'practice/passive']);
  });

  it('counts the end states, the beat outcomes and the nudge rungs over everything played', async () => {
    const s = summarise(await result());
    expect(s).toMatchObject({ read: 4, folded: 1, cases: 2, skipped: 1, runs: 4, done: 4, short: 0, failed: 0, byDesign: 0, threw: 0, stalled: 0 });
    expect(s.cells.get('practice/brisk')).toEqual({ of: 2, done: 2 });
    expect(s.endStates.get('done / completed')).toBe(4);
    expect(s.outcomes.get('independent')).toBe(6); // three beats in each of the two cases the brisk candidate played
    expect(s.outcomes.get('timed_out')).toBe(2);
    expect(s.rungs.get('process_hint')).toBe(2); // the brisk candidate's first message on a beat is already at the first rung
    expect(s.rungs.get('none')).toBe(2);
    expect(s.recommendReached).toBe(4);
    expect(s.unprompted).toBe(0);
  });

  it('prints the summary in a fixed order, so two runs can be diffed', async () => {
    const r = await result();
    const text = formatSummary(summarise(r), r);
    expect(text).toBe(formatSummary(summarise(await result()), r));
    for (const line of ['The bar', 'Reached the end, by mode and candidate', 'practice/brisk', 'Beat outcomes', 'Highest nudge rung reached in a run', 'The engine refused the member', 'Open by design']) {
      expect(text).toContain(line);
    }
  });

  it('exits non-zero on failures only, and names the open-by-design runs separately', async () => {
    const s = summarise(await playAll(entries, engine, { modes: ['learning'], candidates: ['passive'] }));
    expect(s.short).toBe(2);
    expect(s.failed).toBe(0); // a gate that is permanently red is a gate nobody reads
    expect(s.byDesign).toBe(2);
    expect(s.causes.size).toBe(0);
    expect([...s.byDesignCauses.values()]).toEqual([2]);
  });
});

describe('what the report may contain', () => {
  const secret = {
    prompt: 'ZZPROMPT the client sells widgets',
    recommendation: 'ZZRECOMMENDATION close the plant',
    facts: ['ZZFACT revenue is 100'],
    steps: [{ title: 'ZZSTEP size it', body: 'ZZSTEPBODY the maths', calc: ['ZZCALC 2 x 2'] }],
    clarifyingQuestions: [{ question: 'ZZQUESTION why', answer: 'ZZANSWER because' }],
    exhibits: [exhibit(1, { title: 'ZZEXHIBIT revenue', caption: 'ZZCAPTION in millions', rows: [['ZZCELL', '10']], howToRead: 'ZZHOWTOREAD', takeaways: ['ZZTAKEAWAY'] })],
  };

  it('holds no prompt, figure or solution text, and names the cases that stopped in the middle', async () => {
    const r = await playAll([writeUp(secret)], engine, { modes: ['practice', 'learning'], candidates: ['brisk', 'passive'] });
    const report = formatReport(r, { dir: 'private-data/solutions', files: 1, at: '2026-11-16T00:00:00.000Z', seconds: 1 });
    expect(report).not.toMatch(/ZZ(PROMPT|RECOMMENDATION|FACT|STEP|STEPBODY|CALC|QUESTION|ANSWER|EXHIBIT|CAPTION|CELL|HOWTOREAD|TAKEAWAY)/);
    expect(report).toContain('Sample Co.');
    expect(report).toContain('Booth MCG 2026-2027');
    expect(report).toContain('Cases that failed the bar (0)');
    expect(report).toContain('Open by design (1)');
    expect(report).toContain('learning/passive, left at prompt');
  });

  it('says so plainly when every case reached the end', async () => {
    const r = await playAll([writeUp()], engine, { modes: ['interview'], candidates: ['brisk'] });
    const report = formatReport(r, { dir: 'private-data/solutions', files: 1, at: '2026-11-16T00:00:00.000Z', seconds: 1 });
    expect(report).toContain('None: every case reached stage done in every timed mode, for every candidate');
    expect(report).toContain('## Open by design (0)');
  });
});

// The second half of issue #95: an exhibit the rule classes as the interviewer's must never reach the member — not its table, not its
// chart, not its title, not its caption — in any mode, for any candidate. The dry run already holds every message the member received,
// so the check is made over the whole catalogue for free.
describe('nothing of the interviewer\'s own exhibits reaches the member', () => {
  const answerKey = exhibit(9, { title: 'Exhibit 9: Solution to the profit calculation', caption: 'The book\'s working, for the interviewer only.' });
  const withAnswerKey = writeUp({ exhibits: [exhibit(1), answerKey, exhibit(2)] });

  it('hands over the candidate exhibits only, in every mode and for every candidate', async () => {
    expect(isInterviewerSideExhibit(answerKey)).toBe(true);
    for (const mode of MODES) {
      for (const candidate of CANDIDATES) {
        const run = await playCase(withAnswerKey, mode as 'practice', candidate as 'brisk', engine);
        expect(run.leaks, `${mode}/${candidate}`).toEqual([]);
        // A candidate who works through the case is handed the two candidate exhibits and never the third.
        expect(run.exhibitsShown, `${mode}/${candidate}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('asks the production rule of every payload the member was handed, not of the plan that chose it', () => {
    const solution = readSolution(withAnswerKey)!;
    const handed = [{ beat: 2, ...answerKey, columns: answerKey.columns, rows: answerKey.rows, approx: false, chart: null }];
    expect(exhibitLeaks(handed as never, [], solution, isInterviewerSideExhibit)).toEqual([
      'shown as an exhibit: Exhibit 9: Solution to the profit calculation',
    ]);
  });

  it('counts its title or its caption written out in a message as a leak', () => {
    const solution = readSolution(withAnswerKey)!;
    const titled = exhibitLeaks([], [`Here is ${answerKey.title} for you.`], solution, isInterviewerSideExhibit);
    expect(titled).toEqual(['its title was written to the member: Exhibit 9: Solution to the profit calculation']);
    const captioned = exhibitLeaks([], [`As it says: ${answerKey.caption}`], solution, isInterviewerSideExhibit);
    expect(captioned).toEqual(['its caption was written to the member: Exhibit 9: Solution to the profit calculation']);
  });

  it('does not count a figure read out of an interviewer table: that is the interviewer answering a question (issue #83)', () => {
    const solution = readSolution(withAnswerKey)!;
    expect(exhibitLeaks([], ['North is 90 and South is 95.'], solution, isInterviewerSideExhibit)).toEqual([]);
  });

  it('fails the bar on a leak even when the case ran to the end, and names it in the report', async () => {
    const run = await playCase(withAnswerKey, 'interview', 'brisk', engine);
    expect(reachedEnd(run)).toBe(true);
    const leaked: DryRun = { ...run, leaks: ['shown as an exhibit: Exhibit 9: Solution to the profit calculation'] };
    expect(failedTheBar(leaked)).toBe(true);
    expect(openByDesign(leaked)).toBe(false);
    expect(failureCause(leaked)).toBe('an interviewer-side exhibit reached the member');
  });

  it('says plainly in the report that nothing reached the member, over the whole run', async () => {
    const r = await playAll([withAnswerKey], engine, { modes: ['practice', 'interview'], candidates: ['brisk', 'asker'] });
    const s = summarise(r);
    expect(s.leaked).toBe(0);
    expect(s.exhibitsDelivered).toBeGreaterThan(0);
    const report = formatReport(r, { dir: 'private-data/solutions', files: 1, at: '2026-11-16T00:00:00.000Z', seconds: 1 });
    expect(report).toContain('## Interviewer-side exhibits that reached the member (0)');
    expect(report).toContain('None: in every mode, for every candidate, over the whole catalogue.');
    // The title of the interviewer's own exhibit is not in the report either.
    expect(report).not.toContain('Solution to the profit calculation');
  });
});

// Issue #181: the stub used to write one fixed sentence and never anything else, so every content filter in `parseTurn`, the whole
// refusal path, `recordDataRequest`, 'partial', the `hinted` outcome and every one of pause / continue / end / draft were out of the
// harness's reach. These are the shapes the engine branches on, each one played through the real engine.
describe('the shapes the engine branches on', () => {
  const longRecommendation =
    'Close the southern shops over the next two quarters and move their best staff north, because the northern shops earn more per square metre than the southern ones ever have.';
  /** The book's own working, in a table the member never sees: 4321 appears nowhere they can look it up. */
  const workedTable = exhibit(9, {
    title: 'Exhibit 9: Solution to the profit calculation',
    caption: "The book's working, for the interviewer only.",
    columns: ['Line', 'Value'],
    rows: [
      ['Profit', '= 4321'],
      ['Margin', '= 37'],
    ],
  });
  const rich = writeUp({ recommendation: longRecommendation, exhibits: [exhibit(1), workedTable, exhibit(2)] });
  const playRich = (mode: string, candidate: string): Promise<DryRun> => playCase(rich, mode as 'practice', candidate as 'brisk', engine);

  it('takes a hint and then closes the part, so a beat can come out hinted at all', async () => {
    for (const mode of MODES) {
      const run = await playRich(mode, 'coached');
      expect(reachedEnd(run), `${mode}/coached finished at ${run.stage}`).toBe(true);
      // The one order no candidate could play before: help first, and the step forward that ends the part after it.
      expect(outcomes(run).every((o) => o === 'hinted'), `${mode}: ${outcomes(run).join(', ')}`).toBe(true);
      expect(hints(run)).toBeGreaterThan(0);
    }
    // ...and the oldest candidate still produces none of them, so the number says something.
    expect(outcomes(await playRich('practice', 'brisk'))).not.toContain('hinted');
  });

  it("holds the model's score to what the member wrote, in both directions", async () => {
    // The `coached` candidate's model calls all three of its messages a step forward. The first two are not: one is giving up and one
    // names a figure and says plainly they do not know what to do with it, so the help ladder engages anyway.
    expect(CANDIDATE_SPECS.coached.exhibitTurn?.(0)).toEqual({ assessment: 'progress', beatComplete: false });
    const run = await playRich('practice', 'coached');
    expect(run.rungs).toContain('process_hint');
    expect(run.rungs).toContain('directional_hint');
  });

  it('asks for data, which costs no rung of help', async () => {
    const run = await playRich('practice', 'probing');
    expect(run.stub.dataRequests).toBeGreaterThan(0);
    // Every message is a question, so the count that climbs the ladder is given back every time and the first rung is as far as it goes.
    expect([...new Set(run.rungs)]).toEqual(['process_hint']);
    expect([...new Set((await playRich('interview', 'probing')).rungs)]).toEqual(['none']);
    expect(outcomes(run)).toEqual(['member_moved', 'member_moved', 'member_moved']);
  });

  it('lets the model decline a turn, which the engine answers in character', async () => {
    for (const mode of MODES) {
      const run = await playRich(mode, 'blocked');
      expect(run.stub.refused, `${mode}/blocked`).toBeGreaterThan(0);
      expect(reachedEnd(run)).toBe(true);
      // A declined turn is an ordinary reply in everything the engine records: no hint, no beat finished (issue #142).
      expect(hints(run)).toBe(0);
      expect(outcomes(run).every((o) => o === 'member_moved')).toBe(true);
      // The feedback is declined too, so the one thing the member is told is that it could not be written.
      expect(run.feedback).toBe(false);
      expect(run.refusals.join(' ')).toContain('The feedback could not be written');
    }
  });

  it('scores a part partial, which moves the clock on and, once they are circling, takes the part away (issue #184)', async () => {
    const run = await playRich('practice', 'circling');
    expect(run.stub.partials).toBeGreaterThan(0);
    // 'partial' is the one score `assessmentOf` does not police, and it used to reach the top of the ladder with nothing there: the
    // rung said 'advance' and no rung could fire, so every part this candidate left, it left by pressing the button itself.
    expect(run.rungs).toContain('advance');
    expect(reachedEnd(run)).toBe(true);
    expect(outcomes(run).every((o) => o === 'coach_moved')).toBe(true);
    // Learning has no rung that moves a member on, so a learner circling is left exactly where they are: the parts are still theirs
    // to leave (DECISIONS.md, #119).
    const learner = await playRich('learning', 'circling');
    expect(learner.stub.partials).toBeGreaterThan(0);
    expect(outcomes(learner)).not.toContain('coach_moved');
    expect(outcomes(learner).every((o) => o === 'member_moved')).toBe(true);
  });

  it('writes replies worth filtering, and says what became of each shape', async () => {
    const run = await playRich('interview', 'unfiltered');
    const sent = (shape: string) => run.replies[shape as 'plain']?.sent ?? 0;
    const kept = (shape: string) => run.replies[shape as 'plain']?.kept ?? 0;
    for (const shape of REPLY_SHAPES) expect(sent(shape), `${shape} was never written`).toBeGreaterThan(0);
    // An interview never tells the member their reading is right, whatever the model wrote — on the turns where they are working
    // something out. A clarifying question is answered the same way in every mode, so a verdict in reply to one is not touched, and
    // those are the only verdicts that can survive here.
    const clarifyTurns = CANDIDATE_SPECS.unfiltered.clarifyQuestions;
    expect(kept('verdict')).toBeLessThanOrEqual(clarifyTurns);
    expect(kept('bare_verdict')).toBeLessThanOrEqual(clarifyTurns);
    expect(kept('verdict') + kept('bare_verdict')).toBeLessThan(sent('verdict') + sent('bare_verdict'));
    // Bucket never talks about the member in the third person, never narrates the source, and never announces a withheld answer.
    for (const shape of ['tell', 'tell_only', 'narration', 'withholds']) expect(kept(shape), shape).toBe(0);
    // A reply that is no reply reaches nobody.
    expect(run.replies.not_json?.dropped).toBe(sent('not_json'));
    expect(run.replies.empty?.dropped).toBe(sent('empty'));
  });

  it('writes the two shapes that carry the answer, and the engine catches both of them', async () => {
    expect(privateSentenceOf(readSolution(rich))).toBe(longRecommendation);
    for (const mode of ['practice', 'interview'] as const) {
      const run = await playRich(mode, 'unfiltered');
      expect(run.replies.private_note?.sent, `${mode}: no private note was written`).toBeGreaterThan(0);
      expect(run.replies.held_figure?.sent, `${mode}: no held figure was written`).toBeGreaterThan(0);
      expect(run.replies.private_note?.kept).toBe(0);
      expect(run.replies.held_figure?.kept).toBe(0);
      // The harder question than "was it changed": none of it was still there when the member read it.
      expect(run.answerReached, `${mode}: the answer reached the member`).toBe(0);
    }
    // A learning case is taught the answer once it has tried, so no figure is held back there and the shape is skipped, not sent.
    expect((await playRich('learning', 'unfiltered')).replies.held_figure).toBeUndefined();
  });

  it('counts a reply that carried the answer as a failure, and says so', async () => {
    const run = await playRich('practice', 'unfiltered');
    const told: DryRun = { ...run, answerReached: 1 };
    expect(failedTheBar(told)).toBe(true);
    expect(openByDesign(told)).toBe(false);
    expect(failureCause(told)).toBe("a reply carried the book's own answer to the member");
    expect(failedTheBar(run)).toBe(false);
  });

  it('pauses and comes back, types and leaves it there, and ends the case early', async () => {
    const practice = await playRich('practice', 'interrupted');
    expect(reachedEnd(practice)).toBe(true);
    expect(practice.endReason).toBe('ended_early');
    // What was in the box when they stopped is kept, and so is every answer the clock took from them.
    expect(practice.timedOutDrafts).toBeGreaterThan(0);
    // Pressing "move on" before writing is refused where the member is assessed on what they cover.
    expect(practice.refusals.join(' ')).toContain('Tell me what you make of this one first.');
    const interview = await playRich('interview', 'interrupted');
    expect(reachedEnd(interview)).toBe(true);
    expect(interview.endReason).toBe('completed'); // interview mode has no pause and no early end
    expect(interview.refusals.join(' ')).toContain('Interview mode has no pause and no early end.');
    const learning = await playRich('learning', 'interrupted');
    expect(learning.endReason).toBe('ended_early');
    expect(learning.refusals.join(' ')).toContain('Learning mode has no clock to pause.');
    // Learning lets a member leave a part without writing on it; the other two modes do not.
    expect(outcomes(learning).every((o) => o === 'member_moved')).toBe(true);
  });

  it('counts what the stub put the engine through, in the summary', async () => {
    const r = await playAll([rich], engine, { modes: ['practice'], candidates: [...CANDIDATES] });
    const s = summarise(r);
    expect(s.outcomes.get('hinted')).toBeGreaterThan(0);
    expect(s.declined).toBeGreaterThan(0);
    expect(s.dataRequests).toBeGreaterThan(0);
    expect(s.partials).toBeGreaterThan(0);
    expect(s.timedOutDrafts).toBeGreaterThan(0);
    expect(s.toldTheAnswer).toBe(0);
    const text = formatSummary(s, r);
    for (const line of ['What the model said, and what the member read back', 'private_note', 'held_figure', 'turns the model declined outright']) {
      expect(text).toContain(line);
    }
    // The shapes are counted, never quoted: no reply of the stub's, and nothing of the case, is in the summary.
    expect(text).not.toContain(longRecommendation);
    expect(text).not.toContain('4321');
  });
});

// The five candidates the dry run has always had must behave exactly as they did, so every earlier report is still comparable.
describe('the original candidates are untouched', () => {
  it('plays the same lines, word for word, as they did before the shapes were added', async () => {
    const r = await playAll([writeUp()], engine, { modes: [...MODES], candidates: ['brisk', 'passive', 'offtrack', 'asker', 'plausible'] });
    const report = formatReport(r, { dir: 'private-data/solutions', files: 1, at: '2026-11-16T00:00:00.000Z', seconds: 1 });
    const lines = report.split('\n').filter((l) => /^ {2}(practice|interview|learning)\//.test(l));
    expect(lines).toEqual([
      '  practice/brisk         done/completed         beats 3/3    independent 3                      hints 0   rung process_hint      242s of 1860s',
      '  practice/passive       done/completed         beats 1/3    timed_out 1                        hints 0   rung none              1650s of 1860s',
      '  practice/offtrack      done/completed         beats 3/3    coach_moved 3                      hints 9   rung advance           725s of 1860s',
      '  practice/asker         done/completed         beats 3/3    member_moved 3                     hints 6   rung directional_hint  502s of 1860s',
      '  practice/plausible     done/completed         beats 3/3    coach_moved 3                      hints 9   rung advance           630s of 1860s',
      '  interview/brisk        done/completed         beats 3/3    independent 3                      hints 0   rung none              242s of 1860s',
      '  interview/passive      done/completed         beats 1/3    timed_out 1                        hints 0   rung none              1650s of 1860s',
      '  interview/offtrack     done/completed         beats 3/3    coach_moved 3                      hints 6   rung advance           725s of 1860s',
      '  interview/asker        done/completed         beats 3/3    member_moved 3                     hints 3   rung process_hint      502s of 1860s',
      '  interview/plausible    done/completed         beats 3/3    coach_moved 3                      hints 6   rung advance           630s of 1860s',
      '  learning/brisk         done/completed         beats 3/3    independent 3                      hints 0   rung process_hint      242s (untimed)',
      '  learning/passive       prompt/-               beats 0/3    none                               hints 0   rung none              0s (untimed)  [no recommendation stage; no feedback; OPEN BY DESIGN]',
      '  learning/offtrack      exhibits/-             beats 1/3    open 1                             hints 12  rung lead              597s (untimed)  [no recommendation stage; no feedback; OPEN BY DESIGN]',
      '  learning/asker         done/completed         beats 3/3    member_moved 3                     hints 6   rung directional_hint  502s (untimed)',
      '  learning/plausible     exhibits/-             beats 1/3    open 1                             hints 12  rung lead              512s (untimed)  [no recommendation stage; no feedback; OPEN BY DESIGN]',
    ]);
  });

  it('writes nothing but its one fixed sentence for them, which the engine keeps', async () => {
    for (const candidate of ['brisk', 'offtrack', 'asker', 'plausible'] as const) {
      const run = await playCase(writeUp(), 'practice', candidate, engine);
      expect(Object.keys(run.replies), candidate).toEqual(['plain']);
      expect(run.stub).toEqual({ refused: 0, dataRequests: 0, partials: 0, skipped: 0 });
    }
  });
});
