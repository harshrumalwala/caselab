import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  createQuestionStream,
  createRng,
  EMPTY_ROUND,
  endOfRoundLine,
  levelFor,
  makeQuestion,
  mergeBest,
  NO_BEST,
  parseBest,
  pointsFor,
  readAnswer,
  recordAnswer,
  updateBest,
  type Level,
  type Question,
  type QuestionKind,
} from './warmup';

const KINDS: QuestionKind[] = ['percent', 'growth', 'breakeven', 'market'];
const LEVELS: Level[] = [0, 1, 2];

const q = (over: Partial<Question>): Question => ({
  kind: 'percent',
  prompt: '',
  answer: 36,
  scale: 1,
  unitHint: '',
  display: '36',
  tip: '',
  ...over,
});

describe('random source', () => {
  it('gives the same numbers for the same seed, and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(first);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(createRng(43)()).not.toBe(first[0]);
  });
});

describe('question generation', () => {
  it('makes sensible questions of every kind at every level (and the same ones for the same seed)', () => {
    for (const kind of KINDS) {
      for (const level of LEVELS) {
        const rng = createRng(level * 10 + 1);
        for (let i = 0; i < 200; i++) {
          const x = makeQuestion(rng, level, kind);
          expect(x.kind).toBe(kind);
          expect(Number.isFinite(x.answer)).toBe(true);
          expect(x.answer).toBeGreaterThan(0);
          expect([1, 1e3, 1e6, 1e9]).toContain(x.scale);
          expect(x.prompt.length).toBeGreaterThan(10);
          expect(x.tip.length).toBeGreaterThan(10);
          expect(x.display).not.toMatch(/NaN|undefined|Infinity/);
          expect(x.tip).not.toMatch(/NaN|undefined|Infinity/);
          expect(x.prompt).not.toMatch(/NaN|undefined|Infinity/);
        }
        expect(makeQuestion(createRng(5), level, kind)).toEqual(makeQuestion(createRng(5), level, kind));
      }
    }
  });

  it('works out the answers right', () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) {
      const p = makeQuestion(rng, 1, 'percent');
      const [, pct, base] = /What is ([\d.]+)% of ([\d,]+)\?/.exec(p.prompt)!;
      expect(p.answer).toBeCloseTo((Number(pct) * Number(base.replace(/,/g, ''))) / 100);

      const g = makeQuestion(rng, 2, 'growth');
      const [, start, rate, years] = /\$(\d+)M and grows (\d+)% a year\. About how much after (\d+) years/.exec(g.prompt)!;
      expect(g.answer).toBeCloseTo(Number(start) * 1e6 * (1 + Number(rate) / 100) ** Number(years), 0);
    }
  });

  it('computes break-even as fixed costs over margin per unit', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      const b = makeQuestion(rng, LEVELS[i % 3], 'breakeven');
      const nums = [...b.prompt.matchAll(/\$([\d.]+)(k?)/g)].map(([, n, k]) => Number(n) * (k ? 1000 : 1));
      const [fixed, price, variable] = nums;
      expect(b.answer).toBeCloseTo(fixed / (price - variable), 6);
      expect(price).toBeGreaterThan(variable);
      expect(b.tip).toMatch(Number.isInteger(b.answer) ? /÷ \$[\d.]+k? = [\d,]+\.$/ : /÷ \$[\d.]+k? ≈ [\d,]+\.$/);
    }
  });

  it('answers market sizing in a unit that fits, and the hint says which', () => {
    const rng = createRng(9);
    for (let i = 0; i < 100; i++) {
      const m = makeQuestion(rng, 2, 'market');
      expect(m.answer / m.scale).toBeGreaterThanOrEqual(1);
      expect(m.unitHint).toMatch(/^in \$[kMB]$|^in dollars$/);
    }
    const fixed = makeQuestion(() => 0, 0, 'market'); // 10M × 10% × $10
    expect(fixed.answer).toBe(10_000_000);
    expect(fixed.display).toBe('$10M');
  });

  it('gets harder as you get more right', () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(3)).toBe(0);
    expect(levelFor(4)).toBe(1);
    expect(levelFor(8)).toBe(1);
    expect(levelFor(9)).toBe(2);
    expect(levelFor(40)).toBe(2);
  });

  it('never asks the same kind twice in a row', () => {
    const stream = createQuestionStream(createRng(11));
    let last: string | undefined;
    for (let i = 0; i < 200; i++) {
      const next = stream.next(i);
      expect(next.kind).not.toBe(last);
      last = next.kind;
    }
  });
});

describe('reading a typed answer', () => {
  it('understands plain numbers, commas, dollar signs and k / M / B', () => {
    expect(readAnswer('36', 1)).toEqual([36]);
    expect(readAnswer(' $1,200 ', 1)).toEqual([1200]);
    expect(readAnswer('4.8k', 1)).toEqual([4800]);
    expect(readAnswer('~$408M', 1e6)).toEqual([408e6]);
    expect(readAnswer('1.2 billion', 1e9)).toEqual([1.2e9]);
    expect(readAnswer('.5', 1)).toEqual([0.5]);
  });

  it('takes a bare number in the unit the question asked for, but also the full number', () => {
    expect(readAnswer('408', 1e6)).toEqual([408e6, 408]);
    expect(readAnswer('408000000', 1e6)).toContain(408e6 * 1);
  });

  it('says nothing for text that is not a number', () => {
    for (const bad of ['', '  ', 'abc', '12 apples', '1.2.3', '$', '4x', '5%']) expect(readAnswer(bad, 1)).toEqual([]);
  });
});

describe('checking an answer', () => {
  it('accepts anything within 5%, either side, and nothing outside it', () => {
    const x = q({ answer: 100 });
    for (const ok of ['100', '95', '105', '97.5', '$100']) expect(checkAnswer(x, ok)).toBe('correct');
    for (const bad of ['94', '106', '10', '1000', '0']) expect(checkAnswer(x, bad)).toBe('wrong');
  });

  it('is exact for small whole answers (7 is not 6.9)', () => {
    expect(checkAnswer(q({ answer: 7 }), '7')).toBe('correct');
    expect(checkAnswer(q({ answer: 7 }), '6')).toBe('wrong');
    expect(checkAnswer(q({ answer: 7 }), '8')).toBe('wrong');
  });

  it('handles big answers in every way people type them', () => {
    const x = q({ answer: 408e6, scale: 1e6 });
    for (const ok of ['408', '400', '420', '408m', '$0.4B', '408,000,000', '410M']) expect(checkAnswer(x, ok)).toBe('correct');
    for (const bad of ['4080', '40', '408k', '1b']) expect(checkAnswer(x, bad)).toBe('wrong');
  });

  it('tells a typo from a wrong answer: text is invalid and is not a miss', () => {
    expect(checkAnswer(q({}), 'thirty six')).toBe('invalid');
    expect(checkAnswer(q({}), '')).toBe('invalid');
  });

  it('accepts the exact answer of every generated question, however it is typed', () => {
    const rng = createRng(77);
    for (let i = 0; i < 300; i++) {
      const x = makeQuestion(rng, LEVELS[i % 3]);
      expect(checkAnswer(x, String(x.answer / x.scale))).toBe('correct');
      expect(checkAnswer(x, String(x.answer))).toBe('correct');
      expect(checkAnswer(x, String((x.answer / x.scale) * 3))).toBe('wrong');
    }
  });
});

describe('scoring', () => {
  it('pays more for harder questions and longer streaks, with a cap', () => {
    expect(pointsFor(0, 1)).toBe(12);
    expect(pointsFor(1, 1)).toBe(17);
    expect(pointsFor(2, 1)).toBe(22);
    expect(pointsFor(0, 10)).toBe(30);
    expect(pointsFor(0, 50)).toBe(30);
  });

  it('builds a streak, then a miss breaks the streak but keeps the score and the longest run', () => {
    let s = EMPTY_ROUND;
    s = recordAnswer(s, 0, true);
    s = recordAnswer(s, 0, true);
    s = recordAnswer(s, 0, true);
    expect(s).toEqual({ score: 12 + 14 + 16, streak: 3, bestStreak: 3, correct: 3, missed: 0 });
    s = recordAnswer(s, 0, false);
    expect(s).toEqual({ score: 42, streak: 0, bestStreak: 3, correct: 3, missed: 1 });
    s = recordAnswer(s, 1, true);
    expect(s).toEqual({ score: 42 + 17, streak: 1, bestStreak: 3, correct: 4, missed: 1 });
  });

  it('does not change the stats it was given', () => {
    const before = { ...EMPTY_ROUND };
    recordAnswer(EMPTY_ROUND, 0, true);
    expect(EMPTY_ROUND).toEqual(before);
  });
});

describe('best scores', () => {
  it('reads what was saved, and shrugs off anything strange', () => {
    expect(parseBest(JSON.stringify({ score: 120, streak: 7 }))).toEqual({ score: 120, streak: 7 });
    expect(parseBest(JSON.stringify({ score: 12.9, streak: 3.2 }))).toEqual({ score: 12, streak: 3 });
    for (const bad of [null, '', 'nope', '{}', '[]', 'null', '{"score":-1,"streak":2}', '{"score":"9","streak":2}', '{"score":1}']) {
      expect(parseBest(bad)).toEqual(NO_BEST);
    }
  });

  it('keeps the better of each, and says what was beaten', () => {
    const round = { ...EMPTY_ROUND, score: 90, bestStreak: 4 };
    expect(updateBest({ score: 100, streak: 3 }, round)).toEqual({ best: { score: 100, streak: 4 }, newScore: false, newStreak: true });
    expect(updateBest({ score: 50, streak: 9 }, round)).toEqual({ best: { score: 90, streak: 9 }, newScore: true, newStreak: false });
    expect(updateBest(NO_BEST, round).newScore).toBe(true);
  });

  it('merges two copies of a record by taking the better of each', () => {
    expect(mergeBest({ score: 100, streak: 3 }, { score: 40, streak: 9 })).toEqual({ score: 100, streak: 9 });
    expect(mergeBest(NO_BEST, NO_BEST)).toEqual(NO_BEST);
  });

  it('does not call a zero round a record', () => {
    expect(updateBest(NO_BEST, EMPTY_ROUND)).toEqual({ best: NO_BEST, newScore: false, newStreak: false });
  });
});

describe('end-of-round line', () => {
  it('picks a line that fits how it went, the same one for the same seed', () => {
    const none = endOfRoundLine(EMPTY_ROUND, createRng(1));
    const lots = endOfRoundLine({ ...EMPTY_ROUND, correct: 14 }, createRng(1));
    expect(none).not.toBe(lots);
    expect(endOfRoundLine({ ...EMPTY_ROUND, correct: 14 }, createRng(1))).toBe(lots);
    for (const correct of [0, 1, 4, 5, 9, 10, 99]) expect(endOfRoundLine({ ...EMPTY_ROUND, correct }, createRng(correct)).length).toBeGreaterThan(10);
  });
});
