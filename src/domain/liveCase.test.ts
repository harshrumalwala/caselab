import { describe, expect, it } from 'vitest';
import type { Feedback } from '../data/liveCase';
import type { LiveCatalogCase } from '../data/liveCase';
import { bucketLine, COACH_PARTNER, formatClock, groupLanes, liveCaseToInput, searchCases } from './liveCase';

const SKILLS = ['behavioral1', 'behavioral2', 'prompt', 'framework', 'quant', 'exhibits', 'brainstorm', 'recommendation'] as const;
const blank = () => Object.fromEntries(SKILLS.map((k) => [k, { rating: null, feedback: '', evidence: '' }])) as Feedback['skills'];

const FEEDBACK: Feedback = {
  overall: { rating: 3, feedback: 'You found the main issue.' },
  skills: { ...blank(), framework: { rating: 4, feedback: 'Clear buckets.', evidence: 'Demand, supply and cost' }, quant: { rating: 9 as unknown as number, feedback: 'Slow.', evidence: '' } },
  wentWell: 'A clear structure.',
  struggled: 'Time.',
  concepts: 'Seasonality',
  nextFocus: 'Implications.',
  improvementArea: 'quant',
  debrief: [],
  unfinished: ['Brainstorm'],
};
const INFO = { name: 'Army Hotel', book: 'Booth MCG 2026-2027', caseType: 'Profitability', industry: 'Hospitality', libraryId: 'lib-1' };
const VIEW = { submissions: [{ kind: 'recommendation' as const, text: 'Open if', timedOut: true }, { kind: 'framework' as const, text: 'x', timedOut: false }], endReason: 'time_limit' as const, beatsShown: 2, beatsTotal: 3 };

describe('formatClock', () => {
  it('shows minutes and seconds, rounding up so the last second still shows, and never goes negative', () => {
    expect(formatClock(30 * 60_000)).toBe('30:00');
    expect(formatClock(90_500)).toBe('1:31');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(-5_000)).toBe('0:00');
  });
});

describe('the case log entry for a finished live case', () => {
  const input = liveCaseToInput(VIEW, INFO, FEEDBACK, new Date('2026-11-12T20:00:00Z'));

  it('names the case, the book and the library case, with Bucket as the interviewer', () => {
    expect(input).toMatchObject({ title: 'Army Hotel', source: 'Booth MCG 2026-2027', caseType: 'Profitability', industry: 'Hospitality', libraryId: 'lib-1', partner: COACH_PARTNER, shareMode: 'profile' });
    expect(input.date).toBe('2026-11-12');
  });

  it('carries the ratings and the words, and ignores a rating that is not 1 to 5', () => {
    expect(input.overall).toBe(3);
    expect(input.skills.framework).toEqual({ rating: 4, feedback: 'Clear buckets.' });
    expect(input.skills.quant.rating).toBeNull();
    expect(input.skills.behavioral1.rating).toBeNull();
    expect(input).toMatchObject({ wentWell: 'A clear structure.', struggled: 'Time.', concepts: 'Seasonality', nextFocus: 'Implications.', improvementArea: 'quant' });
  });

  it('says in the notes that it is a draft, that time ran out, what was saved unfinished and what was not done', () => {
    expect(input.otherNotes).toContain('drafted by the AI');
    expect(input.otherNotes).toContain('The time ran out before the end.');
    expect(input.otherNotes).toContain('Saved as a draft when time ran out: recommendation.');
    expect(input.otherNotes).toContain('Not finished: Brainstorm.');
  });

  it('says when the member chose to end the case early', () => {
    const early = liveCaseToInput({ ...VIEW, endReason: 'ended_early' }, INFO, FEEDBACK);
    expect(early.otherNotes).toContain('Ended early, by choice.');
    expect(early.otherNotes).toContain('Saved as a draft when the case ended: recommendation.');
    expect(early.otherNotes).not.toContain('ran out');
  });

  it('keeps the notes short when nothing went wrong, and falls back to "Other" for a type it does not know', () => {
    const calm = liveCaseToInput({ ...VIEW, submissions: [], endReason: 'completed' }, { ...INFO, caseType: 'Something New' }, { ...FEEDBACK, unfinished: [] });
    expect(calm.caseType).toBe('Other');
    expect(calm.otherNotes).not.toContain('ran out');
    expect(calm.otherNotes).not.toContain('Not finished');
  });
});

const aCase = (over: Partial<LiveCatalogCase>): LiveCatalogCase => ({ id: 'x', name: 'Case', book: 'Booth MCG', school: 'Booth', year: 2026, caseType: 'Profitability', industry: 'Retail', cochairPick: false, done: false, ...over });

describe('the lanes of the case picker', () => {
  const cases = [
    aCase({ id: '1', name: 'A', caseType: 'Profitability', industry: 'Retail', done: true }),
    aCase({ id: '2', name: 'B', caseType: 'Profitability', industry: 'Healthcare' }),
    aCase({ id: '3', name: 'C', caseType: 'Market Entry', industry: 'Retail' }),
    aCase({ id: '4', name: 'D', caseType: 'Growth Strategy', industry: '  ' }),
  ];

  it('gathers cases by type or by industry, the biggest lane first, counting the ones already done', () => {
    const byType = groupLanes(cases, 'type');
    expect(byType.map((l) => [l.name, l.cases.length, l.done])).toEqual([['Profitability', 2, 1], ['Growth Strategy', 1, 0], ['Market Entry', 1, 0]]);
    expect(groupLanes(cases, 'industry').map((l) => [l.name, l.cases.length])).toEqual([['Retail', 2], ['Healthcare', 1], ['Other', 1]]); // no industry goes in Other
    expect(groupLanes([], 'type')).toEqual([]);
  });

  it('finds cases by every word typed, in the name, book, type or industry', () => {
    expect(searchCases(cases, 'retail profit').map((c) => c.id)).toEqual(['1']);
    expect(searchCases(cases, 'MARKET').map((c) => c.id)).toEqual(['3']);
    expect(searchCases(cases, '   ')).toEqual([]);
    expect(searchCases(cases, 'zzz')).toEqual([]);
  });
});

describe('what Bucket says, and how Bucket looks', () => {
  const base = { sessionId: 'abc', frameworkPhase: 'framework' as const, serverNow: 0, endsAt: 35 * 60_000 };
  const at = (stage: Parameters<typeof bucketLine>[0]['stage'], over = {}, now = 0, hint = false) => bucketLine({ ...base, stage, ...over }, now, hint);

  it('is quietly thinking while the member thinks, and speaks in the stage at hand', () => {
    expect(at('framework_think').mood).toBe('thinking');
    expect(at('recommend_think').mood).toBe('thinking');
    expect(at('prompt').text).toMatch(/Bucket|Welcome|Ask me/);
    expect(at('exhibits').mood).toBe('happy');
  });

  it('shows a light bulb after a hint, a worried face when the clock is low, and cheers at the end', () => {
    expect(at('exhibits', {}, 0, true).mood).toBe('hint');
    expect(at('exhibits', {}, 35 * 60_000 - 100_000).mood).toBe('worried');
    expect(at('done', {}, 35 * 60_000 - 100_000).mood).toBe('cheer'); // the end is a party, not a worry
    expect(at('framework_write', { frameworkPhase: 'direction' }).text).toContain('where would you begin');
  });

  it('says the same thing again for the same case (a refresh does not change it), and varies between cases', () => {
    expect(at('prompt').text).toBe(at('prompt').text);
    const texts = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => at('prompt', { sessionId: id }).text));
    expect(texts.size).toBeGreaterThan(1);
  });
});
