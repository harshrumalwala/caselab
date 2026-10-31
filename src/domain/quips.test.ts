import { describe, expect, it } from 'vitest';
import { QUIPS, quipOfTheDay } from './quips';

describe('the daily line', () => {
  it('has plenty of lines, so one comes back only after months', () => {
    expect(QUIPS.length).toBeGreaterThanOrEqual(100);
  });

  it('never repeats a line within the list, and every line is attributed and a sensible length', () => {
    expect(new Set(QUIPS.map((q) => q.text)).size).toBe(QUIPS.length);
    for (const q of QUIPS) {
      expect(q.text.trim()).toBe(q.text);
      expect(q.by.trim()).not.toBe('');
      expect(q.text.length).toBeLessThanOrEqual(160);
    }
  });

  it('shows the same line all day and a different one the next day', () => {
    const morning = quipOfTheDay(new Date(2026, 9, 31, 7, 0));
    const night = quipOfTheDay(new Date(2026, 9, 31, 23, 59));
    expect(night).toEqual(morning);
    expect(quipOfTheDay(new Date(2026, 10, 1, 7, 0))).not.toEqual(morning);
  });

  it('walks through every line before repeating one', () => {
    const seen = new Set<string>();
    for (let day = 0; day < QUIPS.length; day += 1) seen.add(quipOfTheDay(new Date(2026, 9, 1 + day, 12)).text);
    expect(seen.size).toBe(QUIPS.length);
  });

  it('never shows the same line two days running, across a whole year', () => {
    let previous = '';
    for (let day = 0; day < 365; day += 1) {
      const text = quipOfTheDay(new Date(2026, 0, 1 + day, 12)).text;
      expect(text).not.toBe(previous);
      previous = text;
    }
  });
});
