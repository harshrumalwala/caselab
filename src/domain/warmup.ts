/**
 * The Warm-up mental-math sprint: case-style arithmetic, answer checking and scoring. Pure functions only. Randomness
 * comes from a function you pass in, so tests (and the "seed" prop on the screen) get the same questions every time.
 */

/** Returns a number in [0, 1), like Math.random. */
export type Rng = () => number;

/** A small, fast, seedable random source (mulberry32). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROUND_SECONDS = 60;
/** Consulting maths is estimation: an answer within 5% of the exact one counts. */
export const TOLERANCE = 0.05;

export type QuestionKind = 'percent' | 'growth' | 'breakeven' | 'market';
export type Level = 0 | 1 | 2;

export interface Question {
  kind: QuestionKind;
  prompt: string;
  /** The exact answer, in plain units (so $408M is 408000000). */
  answer: number;
  /** What a bare number means: 1, 1_000, 1_000_000 ... ("408" for a question answered in $M). */
  scale: number;
  /** Shown beside the answer box, e.g. "in $M". */
  unitHint: string;
  /** The right answer as it is shown after a miss. */
  display: string;
  /** "Here's the quick way". */
  tip: string;
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

// ---- formatting ---------------------------------------------------------------------------------------------------

/** 1234.5 -> "1,234.5"; at most two decimals, none when it is whole. */
export function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function shorten(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${fmt(n / 1e9)}B`;
  if (abs >= 1e6) return `${fmt(n / 1e6)}M`;
  if (abs >= 1e3) return `${fmt(n / 1e3)}k`;
  return fmt(n);
}

/** 120000 -> "$120k"; 85 -> "$85". */
export const money = (n: number) => `$${shorten(n)}`;
/** 4800 -> "4.8k"; 40000000 -> "40M". */
export const count = shorten;

/** The unit a big answer is naturally given in. */
function scaleFor(answer: number): number {
  if (answer >= 1e9) return 1e9;
  if (answer >= 1e6) return 1e6;
  if (answer >= 1e4) return 1e3;
  return 1;
}
function unitHintFor(scale: number): string {
  if (scale === 1) return 'in dollars';
  return `in $${scale === 1e3 ? 'k' : scale === 1e6 ? 'M' : 'B'}`;
}

// ---- the four kinds of question ----------------------------------------------------------------------------------

function percentQuestion(rng: Rng, level: Level): Question {
  const pcts = [[10, 20, 25, 50, 5], [15, 30, 35, 45, 12, 15], [12, 18, 24, 17, 35, 65, 8]][level];
  const bases = [[40, 80, 120, 200, 240, 400, 600], [160, 240, 360, 480, 520, 640, 900], [240, 350, 480, 640, 720, 850, 1200]][level];
  const p = pick(rng, pcts);
  const n = pick(rng, bases);
  const answer = (n * p) / 100;
  const tenth = n / 10;
  let tip: string;
  if (p % 10 === 0) {
    tip = `10% of ${fmt(n)} is ${fmt(tenth)}. ${p}% is ${p / 10} of those: ${fmt(answer)}.`;
  } else if (p === 5) {
    tip = `10% of ${fmt(n)} is ${fmt(tenth)}. 5% is half of that: ${fmt(answer)}.`;
  } else if (p === 25) {
    tip = `25% is a quarter. Halve ${fmt(n)} twice: ${fmt(n / 2)}, then ${fmt(answer)}.`;
  } else if (p % 5 === 0) {
    const tens = (p - 5) / 10;
    tip = `10% of ${fmt(n)} is ${fmt(tenth)}. ${tens * 10}% is ${fmt(tenth * tens)}, plus 5% (${fmt(tenth / 2)}): ${fmt(answer)}.`;
  } else {
    tip = `1% of ${fmt(n)} is ${fmt(n / 100)}. Times ${p} is ${fmt(answer)}. Or round ${p}% to something friendly and nudge.`;
  }
  return { kind: 'percent', prompt: `What is ${p}% of ${fmt(n)}?`, answer, scale: 1, unitHint: 'a plain number', display: fmt(answer), tip };
}

function growthQuestion(rng: Rng, level: Level): Question {
  const rates = [[10], [10, 20], [5, 8, 10, 12, 15]][level];
  const years = [[2], [2, 3], [3, 4]][level];
  const starts = [[100, 200, 50], [50, 80, 150, 200], [80, 120, 250, 400]][level];
  const rate = pick(rng, rates);
  const n = pick(rng, years);
  const start = pick(rng, starts);
  const factor = 1 + rate / 100;
  const steps = [start];
  for (let i = 0; i < n; i++) steps.push(steps[i] * factor);
  const answer = steps[n] * 1e6;
  const chain = steps.map((s) => fmt(Math.round(s * 10) / 10)).join(' → ');
  const tip = `Go one year at a time (each step is +${rate}%): ${chain}. No need for a calculator, just ${rate}% of the last number.`;
  return {
    kind: 'growth',
    prompt: `Revenue is $${start}M and grows ${rate}% a year. About how much after ${n} years?`,
    answer,
    scale: 1e6,
    unitHint: 'in $M',
    display: money(Math.round(answer / 1e5) * 1e5),
    tip,
  };
}

function breakevenQuestion(rng: Rng, level: Level): Question {
  const price = pick(rng, [[40, 50, 100], [30, 45, 60, 80], [45, 55, 95, 120]][level]);
  const margins = [[10, 20, 25], [10, 15, 20, 25], [17, 12, 18, 22]][level];
  const margin = pick(rng, margins.filter((m) => m < price));
  const variable = price - margin;
  const target = pick(rng, [[100, 200, 500], [400, 800, 1_000, 2_500], [3_000, 8_000, 12_500, 20_000]][level]);
  const fixed = level === 2 ? Math.round((target * margin) / 5_000) * 5_000 : target * margin;
  const answer = fixed / margin;
  const tip = `Margin per unit is ${money(price)} − ${money(variable)} = ${money(margin)}. Break-even is fixed costs ÷ margin: ${money(fixed)} ÷ ${money(margin)} ${
    Number.isInteger(answer) ? '=' : '≈'
  } ${fmt(Math.round(answer))}.`;
  return {
    kind: 'breakeven',
    prompt: `Fixed costs are ${money(fixed)} a year. Each unit sells for ${money(price)} and costs ${money(variable)} to make. How many units to break even?`,
    answer,
    scale: 1,
    unitHint: 'in units',
    display: `${Number.isInteger(answer) ? '' : '≈ '}${fmt(Math.round(answer))}`,
    tip,
  };
}

function marketQuestion(rng: Rng, level: Level): Question {
  const pop = pick(rng, [[10, 20, 50, 100], [20, 40, 60, 80], [30, 40, 70, 120]][level]) * 1e6;
  const pct = pick(rng, [[10, 20, 50], [5, 10, 12, 25], [12, 15, 8, 35]][level]);
  const price = pick(rng, [[10, 20, 50], [20, 40, 85, 100], [35, 85, 120, 250]][level]);
  const subject = pick(rng, ['people', 'households', 'small businesses']);
  const verb = pick(rng, ['would buy it', 'sign up', 'are in the market']);
  const answer = pop * (pct / 100) * price;
  const scale = scaleFor(answer);
  const people = pop * (pct / 100);
  return {
    kind: 'market',
    prompt: `${count(pop)} ${subject}, ${pct}% ${verb}, at ${money(price)} a year each. How big is the market?`,
    answer,
    scale,
    unitHint: unitHintFor(scale),
    display: money(answer),
    tip: `Multiply the easy parts first: ${count(pop)} × ${pct}% = ${count(people)}. Then × ${money(price)} = ${money(answer)}. (Rounding ${money(price)} to a friendlier number is fine.)`,
  };
}

const MAKERS: Record<QuestionKind, (rng: Rng, level: Level) => Question> = {
  percent: percentQuestion,
  growth: growthQuestion,
  breakeven: breakevenQuestion,
  market: marketQuestion,
};
const KINDS = Object.keys(MAKERS) as QuestionKind[];

export function makeQuestion(rng: Rng, level: Level, kind: QuestionKind = pick(rng, KINDS)): Question {
  return MAKERS[kind](rng, level);
}

/** Harder questions as you get more right: 0 to 3 right is warm-up, to 8 is the real thing, then it gets cheeky. */
export function levelFor(correct: number): Level {
  return correct < 4 ? 0 : correct < 9 ? 1 : 2;
}

/** A stream of questions that never asks the same kind twice in a row. */
export function createQuestionStream(rng: Rng) {
  let previous: QuestionKind | undefined;
  return {
    next(correctSoFar: number): Question {
      const kind = pick(rng, KINDS.filter((k) => k !== previous));
      previous = kind;
      return makeQuestion(rng, levelFor(correctSoFar), kind);
    },
  };
}

// ---- checking answers --------------------------------------------------------------------------------------------

const SUFFIX: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

/**
 * What a typed answer could mean, in plain units. "408m" is 408 million; a bare "408" means 408 in the question's unit
 * (so 408 million when it said "in $M"), but a bare 408000000 is accepted too. Returns [] when it isn't a number.
 */
export function readAnswer(raw: string, scale: number): number[] {
  const text = raw.toLowerCase().replace(/[$,\s~≈]/g, '').replace(/usd|dollars?|units?/g, '');
  const m = /^(-?(?:\d+\.?\d*|\.\d+))([a-z]*)$/.exec(text);
  if (!m) return [];
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return [];
  if (m[2]) {
    const mult = SUFFIX[m[2]];
    return mult ? [n * mult] : [];
  }
  return scale === 1 ? [n] : [n * scale, n];
}

export type Verdict = 'correct' | 'wrong' | 'invalid';

export function checkAnswer(q: Question, raw: string, tolerance = TOLERANCE): Verdict {
  const values = readAnswer(raw, q.scale);
  if (values.length === 0) return 'invalid';
  return values.some((v) => Math.abs(v - q.answer) <= Math.abs(q.answer) * tolerance + 1e-9) ? 'correct' : 'wrong';
}

// ---- scoring ------------------------------------------------------------------------------------------------------

export interface RoundStats {
  score: number;
  /** Right answers in a row right now. */
  streak: number;
  /** The longest run this round. */
  bestStreak: number;
  correct: number;
  missed: number;
}

export const EMPTY_ROUND: RoundStats = { score: 0, streak: 0, bestStreak: 0, correct: 0, missed: 0 };

/** 10 points, +5 per level, +2 for each answer you are on in a row (up to 10): a streak is worth protecting. */
export function pointsFor(level: Level, streakAfter: number): number {
  return 10 + 5 * level + 2 * Math.min(streakAfter, 10);
}

/** A miss (or a skip) costs the streak, not points. */
export function recordAnswer(stats: RoundStats, level: Level, right: boolean): RoundStats {
  if (!right) return { ...stats, streak: 0, missed: stats.missed + 1 };
  const streak = stats.streak + 1;
  return {
    score: stats.score + pointsFor(level, streak),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    correct: stats.correct + 1,
    missed: stats.missed,
  };
}

// ---- best scores (kept on the device) -----------------------------------------------------------------------------

export interface Best {
  score: number;
  streak: number;
}
export const NO_BEST: Best = { score: 0, streak: 0 };

/** Reads what was saved; anything odd (corrupt, hand-edited, from another version) falls back to no best. */
export function parseBest(json: string | null): Best {
  if (!json) return NO_BEST;
  try {
    const v = JSON.parse(json) as Partial<Best> | null;
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    return v && ok(v.score) && ok(v.streak) ? { score: Math.floor(v.score), streak: Math.floor(v.streak) } : NO_BEST;
  } catch {
    return NO_BEST;
  }
}

/** The better of each: used when the same member's record is held in two places (this device and their account). */
export function mergeBest(a: Best, b: Best): Best {
  return { score: Math.max(a.score, b.score), streak: Math.max(a.streak, b.streak) };
}

export interface BestUpdate {
  best: Best;
  newScore: boolean;
  newStreak: boolean;
}

/** Folds a finished round into the best scores. The very first round counts as a record only if it scored something. */
export function updateBest(best: Best, round: RoundStats): BestUpdate {
  const newScore = round.score > best.score;
  const newStreak = round.bestStreak > best.streak;
  return {
    best: mergeBest(best, { score: round.score, streak: round.bestStreak }),
    newScore,
    newStreak,
  };
}

// ---- the funny line at the end -----------------------------------------------------------------------------------

const END_LINES: { upTo: number; lines: string[] }[] = [
  {
    upTo: 0,
    lines: [
      'Zero right. The mental calculator is on a coffee break.',
      'A bold strategy: let the timer do the thinking.',
      'Warm-up, not a verdict. Go again, it takes a minute.',
    ],
  },
  {
    upTo: 4,
    lines: [
      'You are, technically, warm.',
      'A start. Interviewers also begin with “let me take a moment”.',
      'Not bad. The first few are always the slow ones.',
    ],
  },
  {
    upTo: 9,
    lines: [
      'Solid. You would survive a market-sizing question, and maybe even enjoy it.',
      'Estimation 1, calculator 0.',
      'That is a respectable rounding error of a round.',
    ],
  },
  {
    upTo: Infinity,
    lines: [
      'Double digits. Somewhere, an interviewer is double-checking their own maths.',
      'Someone has been practising the 10% trick.',
      'Fast and roughly right: the whole job, really.',
    ],
  },
];

export function endOfRoundLine(stats: RoundStats, rng: Rng): string {
  const tier = END_LINES.find((t) => stats.correct <= t.upTo) ?? END_LINES[END_LINES.length - 1];
  return pick(rng, tier.lines);
}
