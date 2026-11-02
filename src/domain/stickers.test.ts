import { describe, expect, it } from 'vitest';
import { MAIN_CASE_TYPES } from './constants';
import { longestWeekRun, newStickers, stickerBook } from './stickers';
import { makeCase } from '../test/builders';

const earned = (cases: Parameters<typeof stickerBook>[0]) => stickerBook(cases).filter((s) => s.earned).map((s) => s.id);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekly = (n: number) => Array.from({ length: n }, (_, i) => makeCase({ date: iso(new Date(2026, 0, 5 + 7 * i)) }));
const many = (n: number) => Array.from({ length: n }, (_, i) => makeCase({ date: iso(new Date(2026, 0, 1 + i)) }));

describe('the sticker book', () => {
  it('lists every sticker, all locked to begin with, each with a name and what earns it', () => {
    const book = stickerBook([]);
    expect(book.length).toBeGreaterThanOrEqual(20);
    expect(book.every((s) => !s.earned && s.name && s.how)).toBe(true);
    expect(new Set(book.map((s) => s.id)).size).toBe(book.length);
  });

  it('gives every sticker a look of its own, so two never differ by colour alone', () => {
    const looks = stickerBook([]).map((s) => `${s.mark ? `mark ${s.mark}` : s.icon}`);
    expect(new Set(looks).size).toBe(looks.length);
  });

  it('gives the first-case and count stickers at 1, 10, 25, 50 and 100 cases', () => {
    expect(earned(many(1))).toEqual(['first-case']);
    expect(earned(many(10))).toContain('cases-10');
    expect(earned(many(25))).toContain('cases-25');
    expect(earned(many(50))).toContain('cases-50');
    expect(earned(many(99))).not.toContain('cases-100');
    expect(earned(many(100))).toContain('cases-100');
  });

  it('gives "Well rounded" only for every main case type', () => {
    const types = MAIN_CASE_TYPES.map((caseType, i) => makeCase({ caseType, date: iso(new Date(2026, 8, 1 + i)) }));
    expect(earned(types)).toContain('all-types');
    expect(earned(types.slice(1))).not.toContain('all-types');
  });

  it('counts industries, but not "Other" or a blank one', () => {
    const industries = ['Insurance', 'Energy / Utilities', 'Technology / SaaS', 'Financial Services', 'Telecom / Media'];
    const cases = industries.map((industry, i) => makeCase({ industry, date: iso(new Date(2026, 8, 1 + i)) }));
    expect(earned(cases)).toContain('industries-5');
    expect(earned([...cases.slice(1), makeCase({ industry: 'Other' }), makeCase({ industry: '' })])).not.toContain('industries-5');
  });

  it('gives "Full house" and "Show your work" for one thoroughly filled-in case', () => {
    const c = makeCase({
      skills: { behavioral1: 3, prompt: 3, framework: 4, quant: 3, exhibits: 3, brainstorm: 3, recommendation: 4 },
      overallFeedback: 'x',
      concepts: 'y',
      nextFocus: 'z',
      improvementArea: 'quant',
    });
    expect(earned([c])).toEqual(expect.arrayContaining(['full-house', 'show-your-work']));
    expect(earned([makeCase()])).not.toContain('full-house');
  });

  it('finds the longest run of weeks in a row, and a gap breaks it', () => {
    expect(longestWeekRun([])).toBe(0);
    expect(longestWeekRun(weekly(3))).toBe(3);
    expect(longestWeekRun([...weekly(3), makeCase({ date: '2026-03-30' })])).toBe(3);
    expect(earned(weekly(3))).toContain('run-3');
    expect(earned(weekly(7))).not.toContain('run-8');
    expect(earned(weekly(8))).toContain('run-8');
  });

  it('gives a rank sticker for each job title once you reach its level', () => {
    expect(earned([makeCase()])).not.toContain('rank-analyst');
    const lots = Array.from({ length: 40 }, (_, i) =>
      makeCase({ date: iso(new Date(2026, 0, 1 + i * 2)), overall: 4, concepts: 'x', improvementArea: 'quant', caseType: MAIN_CASE_TYPES[i % MAIN_CASE_TYPES.length] }),
    );
    expect(earned(lots)).toContain('rank-analyst');
  });

  it('says which stickers one more case won, and none when it changed nothing', () => {
    const a = [makeCase({ date: '2026-09-01' })];
    expect(newStickers([], a).map((s) => s.id)).toEqual(['first-case']);
    expect(newStickers(a, [...a, makeCase({ date: '2026-09-02' })])).toEqual([]);
  });

  it('loses a sticker if the cases behind it are deleted', () => {
    expect(earned([makeCase()])).toContain('first-case');
    expect(earned([])).not.toContain('first-case');
  });
});
