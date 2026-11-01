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

/** The lengths a round can be, in seconds. 60 is the one everybody started with. */
export const ROUND_LENGTHS = [30, 60, 120] as const;
export type RoundLength = (typeof ROUND_LENGTHS)[number];
export const ROUND_SECONDS: RoundLength = 60;

export const isRoundLength = (n: unknown): n is RoundLength => ROUND_LENGTHS.includes(n as RoundLength);

/** 30 -> "30 sec", 60 -> "1 min", 120 -> "2 min": short enough for a button. */
export function roundLabel(seconds: RoundLength): string {
  return seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`;
}

/** 30 -> "30 seconds", 60 -> "1 minute", 120 -> "2 minutes": for a sentence. */
export function roundWords(seconds: RoundLength): string {
  if (seconds < 60) return `${seconds} seconds`;
  const m = seconds / 60;
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}
/** Consulting maths is estimation: an answer within 5% of the exact one counts. */
export const TOLERANCE = 0.05;

export type QuestionKind =
  | 'percent'
  | 'growth'
  | 'breakeven'
  | 'market'
  | 'margin'
  | 'change'
  | 'discount'
  | 'share'
  | 'payback'
  | 'pricevolume'
  | 'doubling'
  | 'funnel'
  | 'capacity'
  | 'mix'
  | 'savings';
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


// ---- more kinds: margins, change, discounts, share, payback, price and volume, doubling, funnels, capacity, mix, savings --------

const PCT_HINT = 'in %';
/** 12.25 -> "12.3%"; 25 -> "25%". */
const pctDisplay = (n: number) => `${fmt(Math.round(n * 10) / 10)}%`;
const round1 = (n: number) => Math.round(n * 10) / 10;

function marginQuestion(rng: Rng, level: Level): Question {
  if (rng() < 0.5) {
    const revenue = pick(rng, [[100, 200, 400, 500], [250, 320, 480, 600], [360, 540, 750, 900]][level]);
    const wanted = pick(rng, [[10, 20, 25, 40], [15, 30, 35, 45], [12, 18, 24, 32]][level]);
    const profit = Math.round((revenue * wanted) / 100);
    const cost = revenue - profit;
    const answer = (profit / revenue) * 100;
    return {
      kind: 'margin',
      prompt: `Revenue is $${revenue}M and total costs are $${cost}M. What is the profit margin?`,
      answer,
      scale: 1,
      unitHint: PCT_HINT,
      display: pctDisplay(answer),
      tip: `Profit is $${revenue}M − $${cost}M = $${profit}M. Margin is profit ÷ revenue: ${profit} ÷ ${revenue} ≈ ${pctDisplay(answer)}.`,
    };
  }
  const price = pick(rng, [[20, 40, 50, 100], [30, 45, 60, 80], [35, 55, 75, 120]][level]);
  const wanted = pick(rng, [[10, 20, 25, 50], [15, 30, 40, 60], [12, 35, 45, 65]][level]);
  const cost = Math.round(price * (1 - wanted / 100));
  const answer = ((price - cost) / price) * 100;
  return {
    kind: 'margin',
    prompt: `Each unit sells for $${price} and costs $${cost} to make. What is the margin, as a percentage of the price?`,
    answer,
    scale: 1,
    unitHint: PCT_HINT,
    display: pctDisplay(answer),
    tip: `Margin per unit is $${price} − $${cost} = $${price - cost}. As a share of the price: ${price - cost} ÷ ${price} ≈ ${pctDisplay(answer)}.`,
  };
}

function changeQuestion(rng: Rng, level: Level): Question {
  const base = pick(rng, [[40, 50, 80, 100, 200], [60, 120, 150, 250, 400], [45, 75, 125, 160, 350]][level]);
  const p = pick(rng, [[10, 20, 25, 50], [10, 15, 20, 30, 40], [12, 15, 24, 35]][level]);
  const up = rng() < 0.5;
  const to = Math.round(up ? base * (1 + p / 100) : base * (1 - p / 100));
  const answer = (Math.abs(to - base) / base) * 100;
  return {
    kind: 'change',
    prompt: `Sales went from ${base} to ${to}. By what percentage did they ${up ? 'rise' : 'fall'}?`,
    answer,
    scale: 1,
    unitHint: PCT_HINT,
    display: pctDisplay(answer),
    tip: `The change is ${Math.abs(to - base)}. Always divide by where you started (${base}), not where you ended: ${Math.abs(to - base)} ÷ ${base} ≈ ${pctDisplay(answer)}.`,
  };
}

function discountQuestion(rng: Rng, level: Level): Question {
  const p = pick(rng, [[10, 20, 25, 50], [10, 20, 25, 40, 50], [10, 20, 25, 40]][level]);
  const orig = pick(rng, [[40, 60, 80, 100], [120, 160, 200, 240], [260, 300, 360, 480]][level]);
  const sale = Math.round(orig * (1 - p / 100));
  if (rng() < 0.5) {
    return {
      kind: 'discount',
      prompt: `A $${orig} item is ${p}% off. What is the sale price?`,
      answer: sale,
      scale: 1,
      unitHint: 'in dollars',
      display: money(sale),
      tip: `${p}% off means you pay ${100 - p}%. ${p}% of ${orig} is ${fmt((orig * p) / 100)}, so the price is ${orig} − ${fmt((orig * p) / 100)} = ${money(sale)}.`,
    };
  }
  return {
    kind: 'discount',
    prompt: `After ${p}% off, a jacket costs $${sale}. What was the original price?`,
    answer: orig,
    scale: 1,
    unitHint: 'in dollars',
    display: money(orig),
    tip: `$${sale} is ${100 - p}% of the original, not ${p}% off it. Divide: ${sale} ÷ ${(100 - p) / 100} = ${money(orig)}. Going backwards, never add the percentage on.`,
  };
}

function shareQuestion(rng: Rng, level: Level): Question {
  const share = pick(rng, [[5, 10, 20, 25], [8, 12, 15, 30, 40], [6, 9, 14, 35, 45]][level]);
  const market = pick(rng, [[200, 400, 500, 1000], [250, 500, 800, 1200], [300, 750, 900, 1500]][level]);
  const own = Math.round((market * share) / 100);
  const answer = (own / market) * 100;
  return {
    kind: 'share',
    prompt: `A client has $${own}M of sales in a $${market}M market. What is its market share?`,
    answer,
    scale: 1,
    unitHint: PCT_HINT,
    display: pctDisplay(answer),
    tip: `Share is yours ÷ the whole: ${own} ÷ ${market}. Simplify first: ${market} is ${fmt(market / 100)} per 1%, so ${own} ÷ ${fmt(market / 100)} ≈ ${pctDisplay(answer)}.`,
  };
}

function paybackQuestion(rng: Rng, level: Level): Question {
  if (rng() < 0.6) {
    const saving = pick(rng, [[2, 5, 10], [4, 6, 8, 15], [6, 8, 12, 14]][level]);
    const years = pick(rng, [[2, 3, 4, 5], [3, 4, 5, 6, 8], [2.5, 3.5, 4.5, 6]][level]);
    const invest = saving * years;
    return {
      kind: 'payback',
      prompt: `A project costs $${fmt(invest)}M and saves $${saving}M a year. What is the payback period, in years?`,
      answer: years,
      scale: 1,
      unitHint: 'in years',
      display: `${fmt(years)} years`,
      tip: `Payback is the cost ÷ the yearly benefit: ${fmt(invest)} ÷ ${saving} = ${fmt(years)} years.`,
    };
  }
  const monthly = pick(rng, [[10, 20, 25, 50], [15, 30, 40, 60], [18, 45, 75, 90]][level]);
  const months = pick(rng, [[4, 6, 10], [8, 9, 12, 15], [14, 16, 18, 20]][level]);
  const acquire = monthly * months;
  return {
    kind: 'payback',
    prompt: `A customer costs $${acquire} to win and pays $${monthly} a month. How many months until the cost is earned back?`,
    answer: months,
    scale: 1,
    unitHint: 'in months',
    display: `${months} months`,
    tip: `Cost ÷ monthly revenue: ${acquire} ÷ ${monthly} = ${months} months.`,
  };
}

function priceVolumeQuestion(rng: Rng, level: Level): Question {
  const revenue = pick(rng, [[100, 200, 400], [120, 250, 500], [180, 320, 640]][level]);
  const price = pick(rng, [[10, 20], [10, 20, 25], [5, 8, 10, 15]][level]);
  const volume = pick(rng, [[10, 20], [5, 10, 20], [4, 5, 8, 10]][level]);
  const answer = revenue * (1 + price / 100) * (1 - volume / 100) * 1e6;
  const shown = money(Math.round(answer / 1e5) * 1e5);
  return {
    kind: 'pricevolume',
    prompt: `Revenue is $${revenue}M. Price rises ${price}% and volume falls ${volume}%. What is the new revenue?`,
    answer,
    scale: 1e6,
    unitHint: 'in $M',
    display: shown,
    tip: `Price and volume multiply, they don't just net out. $${revenue}M × ${fmt(1 + price / 100)} × ${fmt(1 - volume / 100)} ≈ ${shown}.`,
  };
}

function doublingQuestion(rng: Rng, level: Level): Question {
  if (rng() < 0.5) {
    const rate = pick(rng, [[6, 8, 9, 12], [4, 6, 8, 9, 12], [3, 5, 6, 7, 9, 10]][level]);
    const answer = Math.log(2) / Math.log(1 + rate / 100);
    return {
      kind: 'doubling',
      prompt: `Revenue grows ${rate}% a year. About how many years until it doubles?`,
      answer,
      scale: 1,
      unitHint: 'in years',
      display: `about ${fmt(Math.round(answer))} years`,
      tip: `The rule of 72: years to double ≈ 72 ÷ the growth rate. 72 ÷ ${rate} ≈ ${fmt(round1(72 / rate))} years.`,
    };
  }
  const years = pick(rng, [[6, 8, 9, 12], [5, 6, 8, 9, 10, 12], [5, 6, 7, 8, 9, 10, 12]][level]);
  const answer = (2 ** (1 / years) - 1) * 100;
  return {
    kind: 'doubling',
    prompt: `Revenue has to double in ${years} years. About what growth rate a year is that?`,
    answer,
    scale: 1,
    unitHint: PCT_HINT,
    display: `about ${fmt(Math.round(answer))}%`,
    tip: `The rule of 72 works both ways: rate ≈ 72 ÷ the years. 72 ÷ ${years} ≈ ${fmt(round1(72 / years))}% a year.`,
  };
}

function funnelQuestion(rng: Rng, level: Level): Question {
  const visitors = pick(rng, [[10_000, 20_000, 50_000], [40_000, 80_000, 120_000], [25_000, 60_000, 150_000]][level]);
  const signup = pick(rng, [[10, 20], [5, 10, 25], [4, 8, 12]][level]);
  const paid = pick(rng, [[10, 20, 50], [10, 20, 25], [8, 15, 30]][level]);
  const price = pick(rng, [[10, 20, 50], [15, 30, 40], [25, 45, 90]][level]);
  const signups = (visitors * signup) / 100;
  const payers = (signups * paid) / 100;
  const answer = payers * price;
  const scale = scaleFor(answer);
  return {
    kind: 'funnel',
    prompt: `${count(visitors)} people visit a site a month. ${signup}% sign up and ${paid}% of those pay $${price} a month. What is the monthly revenue?`,
    answer,
    scale,
    unitHint: unitHintFor(scale),
    display: money(answer),
    tip: `Walk down the funnel: ${count(visitors)} × ${signup}% = ${count(signups)} sign-ups. × ${paid}% = ${count(payers)} payers. × $${price} = ${money(answer)}.`,
  };
}

function capacityQuestion(rng: Rng, level: Level): Question {
  if (rng() < 0.5) {
    const seats = pick(rng, [[100, 150, 200], [120, 180, 240], [150, 180, 300]][level]);
    const flights = pick(rng, [[2, 4, 5], [3, 6, 8], [6, 10, 12]][level]);
    const full = pick(rng, [[50, 80], [60, 75, 80, 90], [65, 72, 85]][level]);
    const fare = pick(rng, [[100, 200], [120, 150, 250], [110, 180, 325]][level]);
    const answer = (seats * flights * full * fare) / 100;
    const scale = scaleFor(answer);
    return {
      kind: 'capacity',
      prompt: `A plane has ${seats} seats and flies ${flights} flights a day, ${full}% full, at $${fare} a ticket. What is the daily revenue?`,
      answer,
      scale,
      unitHint: unitHintFor(scale),
      display: money(answer),
      tip: `Capacity first, then how full, then price: ${seats} × ${flights} = ${fmt(seats * flights)} seats a day. × ${full}% = ${fmt((seats * flights * full) / 100)} sold. × $${fare} = ${money(answer)}.`,
    };
  }
  const rooms = pick(rng, [[50, 100, 200], [80, 120, 250], [150, 220, 340]][level]);
  const occupied = pick(rng, [[50, 80], [60, 75, 90], [65, 72, 85]][level]);
  const rate = pick(rng, [[100, 200], [120, 150, 220], [135, 180, 260]][level]);
  const answer = (rooms * occupied * rate) / 100;
  const scale = scaleFor(answer);
  return {
    kind: 'capacity',
    prompt: `A hotel has ${rooms} rooms, ${occupied}% occupied, at $${rate} a night. What is the revenue for one night?`,
    answer,
    scale,
    unitHint: unitHintFor(scale),
    display: money(answer),
    tip: `Rooms × occupancy × rate: ${rooms} × ${occupied}% = ${fmt((rooms * occupied) / 100)} rooms sold. × $${rate} = ${money(answer)}.`,
  };
}

function mixQuestion(rng: Rng, level: Level): Question {
  const share = pick(rng, [[50, 75, 25], [60, 80, 30, 70], [40, 65, 85, 35]][level]);
  const low = pick(rng, [[10, 20, 30], [15, 25, 40], [18, 28, 45]][level]);
  const high = low + pick(rng, [[10, 20, 30], [20, 30, 50], [22, 32, 55]][level]);
  const answer = (share / 100) * low + (1 - share / 100) * high;
  return {
    kind: 'mix',
    prompt: `${share}% of units sell at $${low} and the rest at $${high}. What is the average price per unit?`,
    answer,
    scale: 1,
    unitHint: 'in dollars',
    display: money(round1(answer)),
    tip: `Weight each price by its share: ${share}% × ${low} = ${fmt((share * low) / 100)}, plus ${100 - share}% × ${high} = ${fmt(((100 - share) * high) / 100)}. Together: ${money(round1(answer))}. It must land between $${low} and $${high}, closer to the bigger share.`,
  };
}

function savingsQuestion(rng: Rng, level: Level): Question {
  const base = pick(rng, [[100, 200, 400], [250, 350, 600], [420, 640, 900]][level]);
  const p = pick(rng, [[10, 20, 25], [8, 12, 15], [6, 9, 14, 18]][level]);
  const cut = (base * p) / 100;
  if (rng() < 0.5) {
    const answer = cut * 1e6;
    const scale = scaleFor(answer);
    return {
      kind: 'savings',
      prompt: `Costs are $${base}M a year. A programme cuts ${p}% of them. What are the annual savings?`,
      answer,
      scale,
      unitHint: unitHintFor(scale),
      display: money(answer),
      tip: `10% of ${base} is ${fmt(base / 10)}. Build ${p}% from that, or take 1% (${fmt(base / 100)}) times ${p}: ${money(answer)}.`,
    };
  }
  const answer = (base - cut) * 1e6;
  const scale = scaleFor(answer);
  return {
    kind: 'savings',
    prompt: `Costs are $${base}M and fall ${p}%. What are costs after the cut?`,
    answer,
    scale,
    unitHint: unitHintFor(scale),
    display: money(answer),
    tip: `The cut is ${p}% of ${base} = ${fmt(cut)}. Subtract it: ${base} − ${fmt(cut)} = ${money(answer)}. (Or take ${100 - p}% of ${base} straight away.)`,
  };
}

const MAKERS: Record<QuestionKind, (rng: Rng, level: Level) => Question> = {
  percent: percentQuestion,
  growth: growthQuestion,
  breakeven: breakevenQuestion,
  market: marketQuestion,
  margin: marginQuestion,
  change: changeQuestion,
  discount: discountQuestion,
  share: shareQuestion,
  payback: paybackQuestion,
  pricevolume: priceVolumeQuestion,
  doubling: doublingQuestion,
  funnel: funnelQuestion,
  capacity: capacityQuestion,
  mix: mixQuestion,
  savings: savingsQuestion,
};
const KINDS = Object.keys(MAKERS) as QuestionKind[];
/** Every kind of question, for the tests and for anything that wants to list them. */
export const QUESTION_KINDS: readonly QuestionKind[] = KINDS;

export function makeQuestion(rng: Rng, level: Level, kind: QuestionKind = pick(rng, KINDS)): Question {
  return MAKERS[kind](rng, level);
}

/** Harder questions as you get more right: 0 to 3 right is warm-up, to 8 is the real thing, then it gets cheeky. */
export function levelFor(correct: number): Level {
  return correct < 4 ? 0 : correct < 9 ? 1 : 2;
}

/** How many recent questions a round remembers, so the same one doesn't come round again while you are still on it. */
const RECENT = 12;

/** A stream of questions that never asks the same kind twice in a row, and doesn't repeat a recent question. */
export function createQuestionStream(rng: Rng) {
  let previous: QuestionKind | undefined;
  const recent: string[] = [];
  return {
    next(correctSoFar: number): Question {
      const level = levelFor(correctSoFar);
      let question: Question;
      let tries = 0;
      do {
        const kind = pick(rng, KINDS.filter((k) => k !== previous));
        question = makeQuestion(rng, level, kind);
        tries += 1;
      } while (recent.includes(question.prompt) && tries < 8);
      previous = question.kind;
      recent.push(question.prompt);
      if (recent.length > RECENT) recent.shift();
      return question;
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
  const text = raw.toLowerCase().replace(/[$,\s~≈]/g, '').replace(/usd|dollars?|units?|years?|yrs?|months?|percent|pct|%/g, '');
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

/** A best for each round length: a 2-minute round naturally scores more than a 30-second one, so they are never compared. */
export type Bests = Record<RoundLength, Best>;
export const NO_BESTS: Bests = { 30: NO_BEST, 60: NO_BEST, 120: NO_BEST };

/**
 * Reads what was saved on this device. The record for the 60-second round is kept at the top level exactly as it was before there
 * were other lengths (so what is already saved still reads, and an older open tab still understands it); the other lengths sit
 * under `by`. Anything odd falls back to no best.
 */
export function parseBests(json: string | null): Bests {
  if (!json) return NO_BESTS;
  try {
    const v = JSON.parse(json) as { by?: Record<string, unknown> } | null;
    const by = v && typeof v === 'object' && v.by && typeof v.by === 'object' ? v.by : {};
    return {
      30: parseBest(JSON.stringify(by['30'] ?? null)),
      60: parseBest(json),
      120: parseBest(JSON.stringify(by['120'] ?? null)),
    };
  } catch {
    return NO_BESTS;
  }
}

/** What to keep on this device: the 60-second best at the top level, the others under `by` (left out while empty). */
export function serializeBests(bests: Bests): string {
  const by: Record<string, Best> = {};
  for (const length of [30, 120] as const) if (bests[length].score > 0 || bests[length].streak > 0) by[length] = bests[length];
  return JSON.stringify({ ...bests[60], ...(Object.keys(by).length > 0 ? { by } : {}) });
}

/** The better of each, for each length. */
export function mergeBests(a: Bests, b: Bests): Bests {
  return { 30: mergeBest(a[30], b[30]), 60: mergeBest(a[60], b[60]), 120: mergeBest(a[120], b[120]) };
}

export const hasAnyBest = (b: Bests): boolean => ROUND_LENGTHS.some((n) => b[n].score > 0 || b[n].streak > 0);

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
      'Warm-up, not a verdict. Go again, it takes no time at all.',
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

/** `seconds` scales what counts as a good round: ten right in 2 minutes is a calmer pace than ten right in 30 seconds. */
export function endOfRoundLine(stats: RoundStats, rng: Rng, seconds: RoundLength = ROUND_SECONDS): string {
  const perMinute = stats.correct / (seconds / 60);
  const tier = END_LINES.find((t) => perMinute <= t.upTo) ?? END_LINES[END_LINES.length - 1];
  return pick(rng, tier.lines);
}
