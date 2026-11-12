import { describe, expect, it } from 'vitest';
import type { Feedback } from '../data/liveCase';
import { COACH_PARTNER, formatClock, liveCaseToInput } from './liveCase';

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
    expect(input.otherNotes).toContain('30 minutes ran out');
    expect(input.otherNotes).toContain('Saved as a draft when time ran out: recommendation.');
    expect(input.otherNotes).toContain('Not finished: Brainstorm.');
  });

  it('keeps the notes short when nothing went wrong, and falls back to "Other" for a type it does not know', () => {
    const calm = liveCaseToInput({ ...VIEW, submissions: [], endReason: 'completed' }, { ...INFO, caseType: 'Something New' }, { ...FEEDBACK, unfinished: [] });
    expect(calm.caseType).toBe('Other');
    expect(calm.otherNotes).not.toContain('ran out');
    expect(calm.otherNotes).not.toContain('Not finished');
  });
});
