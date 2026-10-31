import { describe, expect, it } from 'vitest';
import { makeCase } from '../test/builders';
import { goalProgress, isValidGoal, MAX_GOAL } from './goal';

// Wednesday 28 October 2026: this week runs Monday 26 to Sunday 1 November.
const NOW = new Date(2026, 9, 28, 12);
const on = (date: string) => makeCase({ date });
const many = (date: string, n: number) => Array.from({ length: n }, () => on(date));

describe('goalProgress', () => {
  it('counts only this week, Monday to Sunday', () => {
    const p = goalProgress([on('2026-10-26'), on('2026-10-28'), on('2026-10-25'), on('2026-11-02')], NOW, 3);
    expect(p.count).toBe(2);
    expect(p).toMatchObject({ goal: 3, pct: 67, met: false, remaining: 1 });
  });

  it('is met at the goal and stops at 100 percent when passed', () => {
    const p = goalProgress(many('2026-10-27', 5), NOW, 3);
    expect(p).toMatchObject({ count: 5, pct: 100, met: true, remaining: 0 });
  });

  it('counts this week in the streak only once it has reached the goal', () => {
    const lastTwo = [...many('2026-10-20', 3), ...many('2026-10-13', 3)];
    expect(goalProgress([...lastTwo, ...many('2026-10-27', 2)], NOW, 3).streak).toBe(2); // this week unfinished: not broken, not counted
    expect(goalProgress([...lastTwo, ...many('2026-10-27', 3)], NOW, 3).streak).toBe(3);
  });

  it('breaks the streak at the first week that fell short', () => {
    const cases = [...many('2026-10-20', 3), ...many('2026-10-13', 2), ...many('2026-10-06', 3)];
    expect(goalProgress(cases, NOW, 3).streak).toBe(1);
  });

  it('has no streak with no cases, and does not blow up on a goal of one', () => {
    expect(goalProgress([], NOW, 1)).toMatchObject({ count: 0, pct: 0, met: false, remaining: 1, streak: 0 });
    expect(goalProgress([on('2026-10-19')], NOW, 1).streak).toBe(1);
  });

  it('only accepts whole numbers from 1 to the maximum', () => {
    expect([1, 3, MAX_GOAL].every(isValidGoal)).toBe(true);
    expect([0, -1, 2.5, MAX_GOAL + 1, NaN, '3', null].some(isValidGoal)).toBe(false);
  });
});
