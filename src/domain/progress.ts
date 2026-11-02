import { MAIN_CASE_TYPES, SKILL_GROUPS, type CaseType } from './constants';
import { weekStartISO } from './dates';
import { caseSkillValue, canonicalIndustry, mean, sortAsc } from './stats';
import type { CaseRecord } from './types';

/**
 * Levels and XP, worked out from your case log every time and never stored, so nothing can drift out of step and an Excel import
 * levels you up on arrival. It rewards how well you practise, not just how much: a fully written-up case earns about three times
 * what a bare one does, trying something new earns a bonus, and the biggest reward is a skill actually getting better.
 *
 * Burned cases are not in `cases`, so they never earn anything. Interviewed cases are kept apart and earn nothing here either.
 */

export const XP_RULES = {
  /** A case with a title, a type and an industry. */
  logged: 20,
  /** Rating the case overall. */
  overall: 5,
  /** Each skill you rate (up to eight). */
  perSkill: 2,
  /** Any written feedback, overall or on a skill. */
  feedback: 5,
  /** A concept you learned. */
  concept: 5,
  /** The main thing to improve, tagged. */
  improvementTag: 5,
  /** What to focus on next. */
  nextFocus: 3,
  /** The first case in a case type you hadn't practised. */
  newCaseType: 30,
  /** The first case in an industry you hadn't practised. */
  newIndustry: 20,
  /** A week (Monday to Sunday) with at least this many cases earns the bonus. */
  solidWeekCases: 3,
  solidWeek: 25,
  /** A skill whose best run of five ratings beats your first five by this much earns the XP each time. */
  improvement: [
    { by: 0.5, xp: 50 },
    { by: 1, xp: 50 },
  ],
  /** Only the first few cases of a day earn in full; more than that earn a quarter, so logging a pile at once doesn't pay. */
  fullPerDay: 3,
  afterThat: 0.25,
} as const;

/** What one case earns on its own, before anything about the day or about trying something new. */
export function caseXp(c: CaseRecord): number {
  const r = XP_RULES;
  let xp = r.logged;
  if (c.overall !== null) xp += r.overall;
  xp += r.perSkill * Object.values(c.skills).filter((s) => s.rating !== null).length;
  const wroteFeedback = c.overallFeedback.trim() !== '' || Object.values(c.skills).some((s) => s.feedback.trim() !== '');
  if (wroteFeedback) xp += r.feedback;
  if (c.concepts.trim() !== '') xp += r.concept;
  if (c.improvementArea) xp += r.improvementTag;
  if (c.nextFocus.trim() !== '') xp += r.nextFocus;
  return xp;
}

export interface XpBreakdown {
  /** From logging cases, and how fully you wrote them up. */
  logging: number;
  /** From the first case in each new case type and industry. */
  coverage: number;
  /** From weeks with several cases. */
  consistency: number;
  /** From skills that got better. */
  improvement: number;
}

function loggingXp(ordered: CaseRecord[]): number {
  const perDay = new Map<string, number>();
  let total = 0;
  for (const c of ordered) {
    const n = perDay.get(c.date) ?? 0;
    perDay.set(c.date, n + 1);
    const xp = caseXp(c);
    total += n < XP_RULES.fullPerDay ? xp : Math.round(xp * XP_RULES.afterThat);
  }
  return total;
}

function coverageXp(ordered: CaseRecord[]): number {
  const types = new Set<CaseType>();
  const industries = new Set<string>();
  let total = 0;
  for (const c of ordered) {
    if (MAIN_CASE_TYPES.includes(c.caseType) && !types.has(c.caseType)) {
      types.add(c.caseType);
      total += XP_RULES.newCaseType;
    }
    const industry = canonicalIndustry(c.industry).toLowerCase();
    if (industry && industry !== 'other' && !industries.has(industry)) {
      industries.add(industry);
      total += XP_RULES.newIndustry;
    }
  }
  return total;
}

function consistencyXp(cases: CaseRecord[]): number {
  const perWeek = new Map<string, number>();
  for (const c of cases) perWeek.set(weekStartISO(c.date), (perWeek.get(weekStartISO(c.date)) ?? 0) + 1);
  return [...perWeek.values()].filter((n) => n >= XP_RULES.solidWeekCases).length * XP_RULES.solidWeek;
}

/**
 * For each skill with ten or more ratings: how far your best run of five ratings (after the first five) beats your first five. It
 * only ever reflects your best, so a bad week doesn't take it back; deleting the cases that made it would.
 */
export function skillGains(ordered: CaseRecord[]): { skill: string; label: string; first: number; best: number; gain: number }[] {
  const out: { skill: string; label: string; first: number; best: number; gain: number }[] = [];
  for (const group of SKILL_GROUPS) {
    const values = ordered.map((c) => caseSkillValue(c, group.key)).filter((v): v is number => v !== null);
    if (values.length < 10) continue;
    const first = mean(values.slice(0, 5))!;
    let best = -Infinity;
    for (let end = 9; end < values.length; end += 1) best = Math.max(best, mean(values.slice(end - 4, end + 1))!);
    out.push({ skill: group.key, label: group.label, first, best, gain: best - first });
  }
  return out;
}

function improvementXp(ordered: CaseRecord[]): number {
  let total = 0;
  for (const { gain } of skillGains(ordered)) for (const step of XP_RULES.improvement) if (gain >= step.by - 1e-9) total += step.xp;
  return total;
}

export function xpBreakdown(cases: CaseRecord[]): XpBreakdown {
  const ordered = sortAsc(cases);
  return {
    logging: loggingXp(ordered),
    coverage: coverageXp(ordered),
    consistency: consistencyXp(ordered),
    improvement: improvementXp(ordered),
  };
}

// ---- levels ----------------------------------------------------------------------------------------------------------------

export const MAX_LEVEL = 30;

/**
 * The XP a level starts at: level 1 at 0, then steeper and steeper. Partner (level 20, about 5,000 XP) is meant to be reachable in
 * about a hundred cases for someone who logs them in the ordinary way: a bit sooner for someone who writes each one up in full
 * (around 65 to 75), a good deal later for someone who only ever logs the bare minimum (around 140).
 */
export const xpAtLevel = (level: number): number => (level <= 1 ? 0 : Math.round(60 * (level - 1) ** 1.5));

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xpAtLevel(level + 1) <= xp) level += 1;
  return level;
}

/** The job titles, with a touch of humour. A title is held from the level it starts at until the next one. */
export const TITLES: { from: number; title: string; joke: string }[] = [
  { from: 1, title: 'Intern', joke: 'Fetching coffee, learning frameworks.' },
  { from: 4, title: 'Analyst', joke: 'You now own a very good spreadsheet.' },
  { from: 8, title: 'Associate', joke: 'People are starting to ask for your opinion.' },
  { from: 12, title: 'Consultant', joke: 'Your slides have an action title now.' },
  { from: 16, title: 'Engagement Manager', joke: 'You say "let us take that offline" without blinking.' },
  { from: 20, title: 'Partner', joke: 'You may now bill for this advice.' },
];

export function titleForLevel(level: number): { from: number; title: string; joke: string } {
  return [...TITLES].reverse().find((t) => level >= t.from) ?? TITLES[0];
}

export interface Progress {
  xp: number;
  level: number;
  title: string;
  /** XP into the current level, and how many the whole level needs. */
  intoLevel: number;
  forLevel: number;
  /** 0 to 100 through the current level (100 at the top). */
  pct: number;
  toNext: number;
  atMax: boolean;
  /** The next job title you will earn, and the level it starts at (none once you are a Partner). */
  nextTitle: { title: string; level: number } | null;
  breakdown: XpBreakdown;
}

export function progressFor(cases: CaseRecord[]): Progress {
  const breakdown = xpBreakdown(cases);
  const xp = breakdown.logging + breakdown.coverage + breakdown.consistency + breakdown.improvement;
  const level = levelForXp(xp);
  const atMax = level >= MAX_LEVEL;
  const start = xpAtLevel(level);
  const forLevel = atMax ? 0 : xpAtLevel(level + 1) - start;
  const next = TITLES.find((t) => t.from > level) ?? null;
  return {
    xp,
    level,
    title: titleForLevel(level).title,
    intoLevel: xp - start,
    forLevel,
    pct: atMax ? 100 : Math.min(100, Math.floor(((xp - start) / forLevel) * 100)),
    toNext: atMax ? 0 : xpAtLevel(level + 1) - xp,
    atMax,
    nextTitle: next ? { title: next.title, level: next.from } : null,
    breakdown,
  };
}

/** What saving one more case changed. */
export function xpGained(before: CaseRecord[], after: CaseRecord[]): { gained: number; from: Progress; to: Progress; leveledUp: boolean } {
  const from = progressFor(before);
  const to = progressFor(after);
  return { gained: Math.max(0, to.xp - from.xp), from, to, leveledUp: to.level > from.level };
}
