import {
  CASE_TYPES,
  DASHBOARD_SKILLS,
  INDUSTRIES,
  MIN_FOR_FIRST_VS_LATEST,
  MIN_FOR_TREND,
  RECENT_WINDOW,
  SKILL_GROUPS,
  TREND_THRESHOLD,
  type CaseType,
  type DashboardSkillKey,
  type Rating,
} from './constants';
import { addDays, formatShortDate, startOfWeek, toISODate, weekStartISO } from './dates';
import type { CaseRecord } from './types';

// ---------------------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------------------

export function compareCases(a: CaseRecord, b: CaseRecord): number {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Oldest first. */
export function sortAsc(cases: CaseRecord[]): CaseRecord[] {
  return [...cases].sort(compareCases);
}

/** Newest first. */
export function sortDesc(cases: CaseRecord[]): CaseRecord[] {
  return sortAsc(cases).reverse();
}

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const PRESET_INDUSTRY_SET = new Set<string>(INDUSTRIES);

/**
 * Match a free-typed industry against the known names case-insensitively so that
 * "healthcare / pharmaceuticals" and "Healthcare / Pharmaceuticals" count once.
 */
export function canonicalIndustry(name: string, customs: string[] = []): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  for (const known of [...INDUSTRIES, ...customs]) {
    if (known.toLowerCase() === lower) return known;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------------------
// A1. Overview
// ---------------------------------------------------------------------------------------

export interface Overview {
  total: number;
  thisWeek: number;
  caseTypesCovered: number;
  caseTypesTotal: number;
  industriesCovered: number;
  presetIndustriesCovered: number;
  presetIndustriesTotal: number;
  customIndustriesCovered: number;
}

export function overview(cases: CaseRecord[], now: Date = new Date()): Overview {
  const weekStart = toISODate(startOfWeek(now));
  const weekEnd = toISODate(addDays(startOfWeek(now), 6));
  const thisWeek = cases.filter((c) => c.date >= weekStart && c.date <= weekEnd).length;

  const types = new Set(cases.map((c) => c.caseType));
  const industries = new Set<string>();
  const names = new Map<string, string>();
  for (const c of cases) {
    const name = c.industry.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, canonicalIndustry(name));
    industries.add(key);
  }
  const canonical = [...names.values()];
  const presetCovered = canonical.filter((n) => PRESET_INDUSTRY_SET.has(n)).length;

  return {
    total: cases.length,
    thisWeek,
    caseTypesCovered: types.size,
    caseTypesTotal: CASE_TYPES.length,
    industriesCovered: industries.size,
    presetIndustriesCovered: presetCovered,
    presetIndustriesTotal: INDUSTRIES.length,
    customIndustriesCovered: canonical.length - presetCovered,
  };
}

// ---------------------------------------------------------------------------------------
// A2. Skills performance
// ---------------------------------------------------------------------------------------

/**
 * One case's score for a dashboard category. For Behavioral this is the mean of whichever
 * of Behavioral 1 / Behavioral 2 were rated, so each case counts once. Unrated -> null.
 */
export function caseSkillValue(c: CaseRecord, key: DashboardSkillKey): number | null {
  if (key === 'overall') return c.overall;
  const group = SKILL_GROUPS.find((g) => g.key === key);
  if (!group) return null;
  const vals = group.fields
    .map((f) => c.skills[f]?.rating)
    .filter((r): r is Rating => r !== null && r !== undefined);
  return mean(vals);
}

export type Trend = 'improving' | 'declining' | 'steady';

export interface SkillStat {
  key: DashboardSkillKey;
  label: string;
  /** Number of cases that rated this skill. */
  count: number;
  average: number | null;
  /** Mean of the last 5 ratings; only present once there are 5 ratings. */
  recentAverage: number | null;
  /** Mean of the last up-to-5 ratings, available from the first rating. */
  windowAverage: number | null;
  earlierAverage: number | null;
  /** recentAverage - earlierAverage, when there are enough ratings to trust it. */
  delta: number | null;
  trend: Trend | null;
  firstFive: number | null;
  latestFive: number | null;
}

export function skillStats(cases: CaseRecord[]): SkillStat[] {
  const ordered = sortAsc(cases);
  return DASHBOARD_SKILLS.map(({ key, label }) => {
    const values = ordered
      .map((c) => caseSkillValue(c, key))
      .filter((v): v is number => v !== null);
    const count = values.length;
    const average = mean(values);
    const window = values.slice(-RECENT_WINDOW);
    const windowAverage = mean(window);
    const recentAverage = count >= RECENT_WINDOW ? windowAverage : null;

    let earlierAverage: number | null = null;
    let delta: number | null = null;
    let trend: Trend | null = null;
    if (count >= MIN_FOR_TREND && recentAverage !== null) {
      earlierAverage = mean(values.slice(0, count - RECENT_WINDOW));
      if (earlierAverage !== null) {
        delta = recentAverage - earlierAverage;
        trend = delta >= TREND_THRESHOLD ? 'improving' : delta <= -TREND_THRESHOLD ? 'declining' : 'steady';
      }
    }

    const hasBoth = count >= MIN_FOR_FIRST_VS_LATEST;
    return {
      key,
      label,
      count,
      average,
      recentAverage,
      windowAverage,
      earlierAverage,
      delta,
      trend,
      firstFive: hasBoth ? mean(values.slice(0, RECENT_WINDOW)) : null,
      latestFive: hasBoth ? mean(values.slice(-RECENT_WINDOW)) : null,
    };
  });
}

export interface TrendPoint {
  n: number;
  date: string;
  title: string;
  overall: number;
  /** Rolling mean of the last 5 overall ratings, from the fifth rated case on. */
  rolling: number | null;
}

/** Overall rating per rated case over time, with a 5-case rolling average. */
export function overallTrend(cases: CaseRecord[]): TrendPoint[] {
  const rated = sortAsc(cases).filter((c) => c.overall !== null);
  return rated.map((c, i) => {
    const window = rated.slice(Math.max(0, i - RECENT_WINDOW + 1), i + 1).map((x) => x.overall as number);
    return {
      n: i + 1,
      date: c.date,
      title: c.title,
      overall: c.overall as number,
      rolling: i + 1 >= RECENT_WINDOW ? mean(window) : null,
    };
  });
}

// ---------------------------------------------------------------------------------------
// A3. Case type coverage
// ---------------------------------------------------------------------------------------

export type Exposure = 'none' | 'once' | 'multiple';

export function exposureOf(count: number): Exposure {
  return count === 0 ? 'none' : count === 1 ? 'once' : 'multiple';
}

export interface CaseTypeCount {
  caseType: CaseType;
  count: number;
  exposure: Exposure;
}

export function caseTypeCounts(cases: CaseRecord[]): CaseTypeCount[] {
  return CASE_TYPES.map((caseType) => {
    const count = cases.filter((c) => c.caseType === caseType).length;
    return { caseType, count, exposure: exposureOf(count) };
  });
}

// ---------------------------------------------------------------------------------------
// A4. Industry coverage
// ---------------------------------------------------------------------------------------

export interface IndustryCount {
  industry: string;
  count: number;
  isPreset: boolean;
}

/**
 * Every preset industry (including zeros) plus any custom industry that has cases.
 * Cases whose industry is blank (MCG import) are not attributed to any industry.
 */
export function industryCounts(cases: CaseRecord[], customs: string[] = []): IndustryCount[] {
  const counts = new Map<string, number>();
  for (const name of INDUSTRIES) counts.set(name, 0);
  for (const c of cases) {
    const name = canonicalIndustry(c.industry, customs);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const presetOrder = new Map<string, number>(INDUSTRIES.map((n, i) => [n, i]));
  return [...counts.entries()]
    .map(([industry, count]) => ({ industry, count, isPreset: PRESET_INDUSTRY_SET.has(industry) }))
    .filter((r) => r.isPreset || r.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        (presetOrder.get(a.industry) ?? 99) - (presetOrder.get(b.industry) ?? 99) ||
        a.industry.localeCompare(b.industry),
    );
}

// ---------------------------------------------------------------------------------------
// A5. Industry x case type matrix
// ---------------------------------------------------------------------------------------

export interface CoverageMatrix {
  columns: readonly CaseType[];
  rows: { industry: string; cells: number[]; total: number }[];
  max: number;
  combinationsSeen: number;
}

export function coverageMatrix(cases: CaseRecord[], customs: string[] = []): CoverageMatrix {
  const industries = industryCounts(cases, customs).map((r) => r.industry);
  const presetOrder = new Map<string, number>(INDUSTRIES.map((n, i) => [n, i]));
  industries.sort(
    (a, b) => (presetOrder.get(a) ?? 99) - (presetOrder.get(b) ?? 99) || a.localeCompare(b),
  );

  let max = 0;
  let combinationsSeen = 0;
  const rows = industries.map((industry) => {
    const cells = CASE_TYPES.map((type) => {
      const n = cases.filter((c) => canonicalIndustry(c.industry, customs) === industry && c.caseType === type).length;
      if (n > 0) combinationsSeen += 1;
      if (n > max) max = n;
      return n;
    });
    return { industry, cells, total: cells.reduce((a, b) => a + b, 0) };
  });
  return { columns: CASE_TYPES, rows, max, combinationsSeen };
}

// ---------------------------------------------------------------------------------------
// Practice consistency
// ---------------------------------------------------------------------------------------

export interface WeekBucket {
  weekStart: string;
  label: string;
  count: number;
  isCurrent: boolean;
}

/** The last `weeks` calendar weeks (Mon-Sun), oldest first. Empty weeks are simply 0. */
export function weeklyHistory(cases: CaseRecord[], now: Date = new Date(), weeks = 8): WeekBucket[] {
  const currentStart = startOfWeek(now);
  const perWeek = new Map<string, number>();
  for (const c of cases) {
    const key = weekStartISO(c.date);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }
  const out: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = toISODate(addDays(currentStart, -7 * i));
    out.push({
      weekStart: start,
      label: formatShortDate(start),
      count: perWeek.get(start) ?? 0,
      isCurrent: i === 0,
    });
  }
  return out;
}
