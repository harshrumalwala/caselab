// @vitest-environment node
//
// The scripted dry run (scripts/liveCaseDryRun.mjs): it must play a real case through the real engine to the end, drive the clock instead of
// waiting for it, say honestly where a case stopped, and never carry a word of the book's content out of private-data.
import { describe, expect, it } from 'vitest';
import { handleLive, isFullSolution } from '../../supabase/functions/_shared/liveCaseCoach';
import { PLANNED_MS, nudgeLevel, timeInStages } from '../../supabase/functions/_shared/liveCase';
import { createMemoryLiveDeps } from '../test/memoryLiveDeps';
import {
  CANDIDATES,
  CANDIDATE_SPECS,
  MODES,
  failureCause,
  formatReport,
  formatSummary,
  playAll,
  playCase,
  reachedEnd,
  summarise,
  type DryRun,
  type DryRunEngine,
} from '../../scripts/liveCaseDryRun.mjs';

const engine: DryRunEngine = { handleLive, isFullSolution, nudgeLevel, timeInStages, PLANNED_MS, createMemoryLiveDeps };

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
        const canFinish = mode !== 'learning' || candidate === 'brisk' || candidate === 'asker';
        expect(reachedEnd(run), `${mode}/${candidate} finished at ${run.stage}`).toBe(canFinish);
        if (canFinish) {
          expect(run.stage).toBe('done');
          expect(run.endReason).toBe('completed');
          expect(run.reachedRecommendWrite).toBe(true);
          expect(run.feedback).toBe(true);
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

  it('catches an exception instead of losing the run', async () => {
    const broken: DryRunEngine = {
      ...engine,
      handleLive: async (userId, action, deps) => {
        if (action.type === 'say') throw new Error('the engine fell over');
        return handleLive(userId, action, deps);
      },
    };
    const run = await playCase(writeUp(), 'practice', 'brisk', broken);
    expect(run.threw).toBe(true);
    expect(run.error).toContain('the engine fell over');
    expect(reachedEnd(run)).toBe(false);
    expect(failureCause(run)).toContain('threw an exception');
  });
});

describe('the candidates, and the one piece of pretending', () => {
  it('a brisk candidate completes every beat on its own', async () => {
    const run = await play('interview', 'brisk');
    expect(run.beatsTotal).toBe(2);
    expect(outcomes(run)).toEqual(['independent', 'independent']);
    expect(hints(run)).toBe(0);
  });

  it('a passive candidate writes nothing and is carried to the end by the clock alone', async () => {
    const run = await play('practice', 'passive');
    expect(run.coachCalls).toBe(0); // the model is never asked, because the member never writes
    expect(run.stage).toBe('done');
    expect(run.endReason).toBe('completed');
    // Only the first beat ever comes out, and the clock closes it: the rest of the case is never reached.
    expect(outcomes(run)).toEqual(['timed_out']);
    expect(run.beatsTotal).toBe(2);
    expect(run.stages.every((s) => s.endedBy === 'timer')).toBe(true);
    expect(run.reachedRecommendWrite).toBe(true);
  });

  it('an off-track candidate climbs the hint ladder and is moved on by the coach', async () => {
    const run = await play('practice', 'offtrack');
    expect(outcomes(run)).toEqual(['coach_moved', 'coach_moved']);
    expect(hints(run)).toBeGreaterThan(0);
    expect(run.rungs).toContain('process_hint');
    expect(run.rungs).toContain('directional_hint');
    expect(run.rungs).toContain('advance');
  });

  it('an asker asks for data and then chooses to move on, which no other candidate does', async () => {
    const run = await play('learning', 'asker');
    expect(outcomes(run)).toEqual(['member_moved', 'member_moved']);
    expect(run.stage).toBe('done');
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
    // Two exhibits: 12 minutes of discussion inside a 27-minute case, which is the plan, not a constant.
    expect(first.limitSeconds).toBe(27 * 60);
    expect(first.seconds).toBe(again.seconds);
    expect(first.stages).toEqual(again.stages);
  });

  it('reports the seconds in each stage against the time the plan gave it', async () => {
    const run = await play('practice', 'passive');
    const stage = (name: string) => run.stages.find((s) => s.stage === name);
    expect(stage('prompt')).toMatchObject({ seconds: 180, planned: 180 });
    expect(stage('exhibits')).toMatchObject({ seconds: 12 * 60, planned: 12 * 60 });
    expect(stage('recommend_write')).toMatchObject({ seconds: 90, planned: 90 });
  });

  it('never gives the member a reply they did not ask for', async () => {
    for (const candidate of CANDIDATES) {
      expect((await play('practice', candidate)).unprompted).toBe(0);
    }
  });

  it('sizes a one-beat case to its own clock, not to a constant', async () => {
    const run = await play('practice', 'passive', { exhibits: [exhibit(1)] });
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
    expect(s).toMatchObject({ read: 4, folded: 1, cases: 2, skipped: 1, runs: 4, done: 4, failed: 0, threw: 0, stalled: 0 });
    expect(s.cells.get('practice/brisk')).toEqual({ of: 2, done: 2 });
    expect(s.endStates.get('done / completed')).toBe(4);
    expect(s.outcomes.get('independent')).toBe(4);
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
    for (const line of ['The bar', 'Reached the end, by mode and candidate', 'practice/brisk', 'Beat outcomes', 'Highest nudge rung reached in a run', 'The engine refused the member']) {
      expect(text).toContain(line);
    }
  });

  it('exits non-zero by counting the runs that did not reach the end', async () => {
    const r = await playAll(entries, engine, { modes: ['learning'], candidates: ['passive'] });
    const s = summarise(r);
    expect(s.failed).toBe(2);
    expect([...s.causes.values()]).toEqual([2]);
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
    expect(report).toContain('Cases that did not reach the end (1)');
    expect(report).toContain('learning/passive, stopped at prompt');
  });

  it('says so plainly when every case reached the end', async () => {
    const r = await playAll([writeUp()], engine, { modes: ['interview'], candidates: ['brisk'] });
    const report = formatReport(r, { dir: 'private-data/solutions', files: 1, at: '2026-11-16T00:00:00.000Z', seconds: 1 });
    expect(report).toContain('None: every case reached stage done in every mode, for every candidate.');
  });
});
