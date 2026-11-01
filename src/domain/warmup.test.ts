import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  createQuestionStream,
  createRng,
  EMPTY_ROUND,
  endOfRoundLine,
  hasAnyBest,
  isRoundLength,
  levelFor,
  makeQuestion,
  mergeBest,
  mergeBests,
  NO_BEST,
  NO_BESTS,
  parseBest,
  parseBests,
  ROUND_LENGTHS,
  roundLabel,
  roundWords,
  serializeBests,
  pointsFor,
  QUESTION_KINDS,
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
    for (const bad of ['', '  ', 'abc', '12 apples', '1.2.3', '$', '4x', '%', 'five%']) expect(readAnswer(bad, 1)).toEqual([]);
  });

  it('reads percentages, years and months written the way people write them', () => {
    expect(readAnswer('25%', 1)).toEqual([25]);
    expect(readAnswer('12.5 %', 1)).toEqual([12.5]);
    expect(readAnswer('25 percent', 1)).toEqual([25]);
    expect(readAnswer('8 years', 1)).toEqual([8]);
    expect(readAnswer('4.5yrs', 1)).toEqual([4.5]);
    expect(readAnswer('18 months', 1)).toEqual([18]);
    expect(readAnswer('408m', 1)).toEqual([408e6]); // a million is still a million
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


describe('the wider set of quant questions', () => {
  const draw = (kind: QuestionKind, level: Level, n = 300, seed = 7) => {
    const rng = createRng(seed + level);
    return Array.from({ length: n }, () => makeQuestion(rng, level, kind));
  };
  const num = (v: string) => Number(v.replace(/,/g, ''));

  it('has fifteen kinds, the original four plus eleven more', () => {
    expect(QUESTION_KINDS).toHaveLength(15);
    expect(QUESTION_KINDS).toEqual(
      expect.arrayContaining(['percent', 'growth', 'breakeven', 'market', 'margin', 'change', 'discount', 'share', 'payback', 'pricevolume', 'doubling', 'funnel', 'capacity', 'mix', 'savings']),
    );
  });

  it('makes sound questions of every kind at every level: finite, positive, readable, and marked right when answered exactly', () => {
    for (const kind of QUESTION_KINDS) {
      for (const level of LEVELS) {
        for (const x of draw(kind, level, 150)) {
          expect(x.kind).toBe(kind);
          expect(Number.isFinite(x.answer) && x.answer > 0, `${kind}: ${x.prompt}`).toBe(true);
          expect([1, 1e3, 1e6, 1e9]).toContain(x.scale);
          for (const text of [x.prompt, x.tip, x.display, x.unitHint]) expect(text, `${kind}: ${x.prompt}`).not.toMatch(/NaN|undefined|Infinity|null/);
          expect(x.prompt.length, `${kind} prompt: ${x.prompt}`).toBeGreaterThan(10);
          expect(x.tip.length, `${kind} tip: ${x.tip}`).toBeGreaterThan(10);
          // The exact answer is accepted, in the unit the box asks for, and something well off is not.
          expect(checkAnswer(x, String(x.answer / x.scale)), `${kind}: ${x.prompt}`).toBe('correct');
          expect(checkAnswer(x, String((x.answer / x.scale) * 1.5))).toBe('wrong');
        }
        expect(makeQuestion(createRng(9), level, kind)).toEqual(makeQuestion(createRng(9), level, kind));
      }
    }
  });

  it('asks for percentages, years and months in a way the box understands, and says which', () => {
    for (const kind of ['margin', 'change', 'share', 'doubling', 'payback'] as const) {
      for (const x of draw(kind, 1, 60)) {
        expect(x.unitHint).toMatch(/^in (%|years|months)$/);
        const written = `${x.answer}${x.unitHint === 'in %' ? '%' : ' ' + x.unitHint.slice(3)}`;
        expect(readAnswer(written, x.scale)).toEqual([x.answer]);
      }
    }
  });

  it('accepts the rule of 72 for doubling, both ways round (it is the whole point of the question)', () => {
    for (const level of LEVELS) {
      for (const x of draw('doubling', level, 200)) {
        const grows = /grows (\d+)% a year/.exec(x.prompt);
        const years = /double in (\d+) years/.exec(x.prompt);
        const given = grows ? Number(grows[1]) : Number(years![1]);
        expect(checkAnswer(x, String(72 / given)), x.prompt).toBe('correct');
        expect(x.tip).toContain('72');
      }
    }
  });

  it('works out each answer from what the question says', () => {
    for (const level of LEVELS) {
      for (const x of draw('margin', level)) {
        const a = /Revenue is \$(\d+)M and total costs are \$(\d+)M/.exec(x.prompt);
        const b = /sells for \$(\d+) and costs \$(\d+)/.exec(x.prompt);
        const [rev, cost] = (a ?? b)!.slice(1).map(Number);
        expect(x.answer).toBeCloseTo(((rev - cost) / rev) * 100, 6);
        expect(cost).toBeLessThan(rev);
      }
      for (const x of draw('change', level)) {
        const [, from, to, dir] = /from (\d+) to (\d+)\. By what percentage did they (rise|fall)/.exec(x.prompt)!;
        expect(x.answer).toBeCloseTo((Math.abs(Number(to) - Number(from)) / Number(from)) * 100, 6);
        expect(Number(to) > Number(from)).toBe(dir === 'rise');
      }
      for (const x of draw('discount', level)) {
        const sale = /A \$(\d+) item is (\d+)% off/.exec(x.prompt);
        const back = /After (\d+)% off, a jacket costs \$(\d+)/.exec(x.prompt);
        if (sale) expect(x.answer).toBeCloseTo(Number(sale[1]) * (1 - Number(sale[2]) / 100), 6);
        else expect(x.answer * (1 - Number(back![1]) / 100)).toBeCloseTo(Number(back![2]), 6);
      }
      for (const x of draw('share', level)) {
        const [, own, market] = /\$(\d+)M of sales in a \$(\d+)M market/.exec(x.prompt)!;
        expect(x.answer).toBeCloseTo((Number(own) / Number(market)) * 100, 6);
        expect(Number(own)).toBeLessThan(Number(market));
      }
      for (const x of draw('payback', level)) {
        const y = /costs \$([\d.,]+)M and saves \$(\d+)M a year/.exec(x.prompt);
        const m = /costs \$(\d+) to win and pays \$(\d+) a month/.exec(x.prompt);
        const [cost, per] = (y ?? m)!.slice(1).map(num);
        expect(x.answer).toBeCloseTo(cost / per, 6);
      }
      for (const x of draw('pricevolume', level)) {
        const [, rev, up, down] = /Revenue is \$(\d+)M\. Price rises (\d+)% and volume falls (\d+)%/.exec(x.prompt)!;
        expect(x.answer).toBeCloseTo(Number(rev) * 1e6 * (1 + Number(up) / 100) * (1 - Number(down) / 100), 0);
        expect(x.answer).not.toBe(Number(rev) * 1e6 * (1 + (Number(up) - Number(down)) / 100)); // multiplying, not netting
      }
      for (const x of draw('mix', level)) {
        const [, share, low, high] = /(\d+)% of units sell at \$(\d+) and the rest at \$(\d+)/.exec(x.prompt)!;
        expect(x.answer).toBeCloseTo((Number(share) / 100) * Number(low) + (1 - Number(share) / 100) * Number(high), 6);
        expect(x.answer).toBeGreaterThan(Number(low));
        expect(x.answer).toBeLessThan(Number(high));
      }
      for (const x of draw('savings', level)) {
        const cut = /Costs are \$(\d+)M a year\. A programme cuts (\d+)%/.exec(x.prompt);
        const after = /Costs are \$(\d+)M and fall (\d+)%/.exec(x.prompt);
        if (cut) expect(x.answer).toBeCloseTo(((Number(cut[1]) * Number(cut[2])) / 100) * 1e6, 0);
        else expect(x.answer).toBeCloseTo(Number(after![1]) * (1 - Number(after![2]) / 100) * 1e6, 0);
      }
    }
  });

  it('works out funnels and capacity step by step', () => {
    const rng = createRng(21);
    for (let i = 0; i < 200; i++) {
      const level = LEVELS[i % 3];
      const f = makeQuestion(rng, level, 'funnel');
      const [, v, a, b, price] = /^([\d.]+k?) people visit a site a month\. (\d+)% sign up and (\d+)% of those pay \$(\d+) a month/.exec(f.prompt)!;
      const visitors = v.endsWith('k') ? Number(v.slice(0, -1)) * 1e3 : Number(v);
      expect(f.answer).toBeCloseTo(((visitors * Number(a)) / 100) * (Number(b) / 100) * Number(price), 6);

      const c = makeQuestion(rng, level, 'capacity');
      const plane = /(\d+) seats and flies (\d+) flights a day, (\d+)% full, at \$(\d+)/.exec(c.prompt);
      const hotel = /(\d+) rooms, (\d+)% occupied, at \$(\d+) a night/.exec(c.prompt);
      if (plane) expect(c.answer).toBeCloseTo(Number(plane[1]) * Number(plane[2]) * (Number(plane[3]) / 100) * Number(plane[4]), 6);
      else expect(c.answer).toBeCloseTo(Number(hotel![1]) * (Number(hotel![2]) / 100) * Number(hotel![3]), 6);
    }
  });

  it('mixes kinds well in a round, and does not repeat a recent question', () => {
    const stream = createQuestionStream(createRng(3));
    const seen = new Map<string, number>();
    const kinds = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const next = stream.next(Math.floor(i / 4));
      kinds.add(next.kind);
      const last = seen.get(next.prompt);
      if (last !== undefined) expect(i - last, `repeated too soon: ${next.prompt}`).toBeGreaterThan(12);
      seen.set(next.prompt, i);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(12);
  });
});


describe('round lengths', () => {
  it('are 30, 60 and 120 seconds, and nothing else counts', () => {
    expect(ROUND_LENGTHS).toEqual([30, 60, 120]);
    expect([30, 60, 120].every(isRoundLength)).toBe(true);
    expect([0, 15, 45, 90, '60', null, undefined, NaN].some(isRoundLength)).toBe(false);
  });

  it('are named for a button and for a sentence', () => {
    expect(ROUND_LENGTHS.map(roundLabel)).toEqual(['30 sec', '1 min', '2 min']);
    expect(ROUND_LENGTHS.map(roundWords)).toEqual(['30 seconds', '1 minute', '2 minutes']);
  });

  it('judge a round by its pace, so ten right in 2 minutes is calmer than ten right in 30 seconds', () => {
    const stats = (correct: number) => ({ ...EMPTY_ROUND, correct });
    const lines = (n: number, seconds: 30 | 60 | 120) => new Set(Array.from({ length: 60 }, (_, i) => endOfRoundLine(stats(n), createRng(i), seconds)));
    // 4 right in a minute is a warm-up pace; in 2 minutes it is only 2 a minute, a slower pace; in 30 seconds it is 8 a minute.
    const slow = lines(4, 120);
    const fast = lines(4, 30);
    expect([...slow].some((l) => fast.has(l))).toBe(false);
    expect(endOfRoundLine(stats(0), createRng(1), 30)).toMatch(/./);
    expect(endOfRoundLine(stats(4), createRng(1))).toEqual(endOfRoundLine(stats(4), createRng(1), 60)); // 60 unless told otherwise
  });
});

describe('a best for each round length', () => {
  const some = { 30: { score: 31, streak: 2 }, 60: { score: 100, streak: 6 }, 120: { score: 260, streak: 12 } };

  it('starts with nothing for every length', () => {
    expect(NO_BESTS).toEqual({ 30: NO_BEST, 60: NO_BEST, 120: NO_BEST });
    expect(hasAnyBest(NO_BESTS)).toBe(false);
    expect(hasAnyBest({ ...NO_BESTS, 120: { score: 1, streak: 0 } })).toBe(true);
  });

  it('keeps the 60-second record exactly where it was saved before there were lengths, and the others under "by"', () => {
    expect(serializeBests({ ...NO_BESTS, 60: { score: 42, streak: 3 } })).toBe('{"score":42,"streak":3}'); // identical to the old format
    expect(JSON.parse(serializeBests(some))).toEqual({ score: 100, streak: 6, by: { 30: some[30], 120: some[120] } });
    expect(JSON.parse(serializeBests({ ...NO_BESTS, 120: some[120] }))).toEqual({ score: 0, streak: 0, by: { 120: some[120] } });
  });

  it('reads back what it wrote, and reads the old single record as the 60-second one', () => {
    expect(parseBests(serializeBests(some))).toEqual(some);
    expect(parseBests('{"score":142,"streak":9}')).toEqual({ ...NO_BESTS, 60: { score: 142, streak: 9 } });
    expect(parseBests(null)).toEqual(NO_BESTS);
  });

  it('shrugs off anything strange, one length at a time', () => {
    expect(parseBests('{not json')).toEqual(NO_BESTS);
    expect(parseBests('"hello"')).toEqual(NO_BESTS);
    expect(parseBests('{"score":5,"streak":1,"by":{"30":{"score":-3,"streak":1},"120":"nope","45":{"score":9,"streak":9}}}')).toEqual({ ...NO_BESTS, 60: { score: 5, streak: 1 } });
  });

  it('takes the better of each, length by length', () => {
    expect(mergeBests(some, { 30: { score: 10, streak: 9 }, 60: { score: 500, streak: 1 }, 120: NO_BEST })).toEqual({
      30: { score: 31, streak: 9 },
      60: { score: 500, streak: 6 },
      120: { score: 260, streak: 12 },
    });
  });
});
