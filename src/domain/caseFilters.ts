import { DEVELOPING_AT, SKILL_GROUPS, STRONG_AT, skillGroupLabel, type SkillGroupKey } from './constants';
import { daysAgoISO } from './dates';
import { canonicalIndustry, caseSkillValue, compareCases } from './stats';
import type { CaseRecord } from './types';

export type DatePreset = 'all' | '7d' | '30d' | '90d' | 'custom';
export type ScoreFilter = 'all' | 'strong' | 'developing' | 'needs' | 'unrated';
export type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest';

export interface CaseFilters {
  query: string;
  industry: string; // 'all' | industry name
  caseType: string; // 'all' | case type
  datePreset: DatePreset;
  from: string;
  to: string;
  score: ScoreFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: CaseFilters = {
  query: '',
  industry: 'all',
  caseType: 'all',
  datePreset: 'all',
  from: '',
  to: '',
  score: 'all',
  sort: 'newest',
};

export function hasActiveFilters(f: CaseFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.industry !== 'all' ||
    f.caseType !== 'all' ||
    f.datePreset !== 'all' ||
    f.score !== 'all'
  );
}

const PRESET_DAYS: Record<'7d' | '30d' | '90d', number> = { '7d': 6, '30d': 29, '90d': 89 };

export function applyFilters(cases: CaseRecord[], f: CaseFilters, now: Date = new Date()): CaseRecord[] {
  const q = f.query.trim().toLowerCase();
  let from = '';
  let to = '';
  if (f.datePreset === 'custom') {
    from = f.from;
    to = f.to;
  } else if (f.datePreset !== 'all') {
    from = daysAgoISO(now, PRESET_DAYS[f.datePreset]);
  }

  const filtered = cases.filter((c) => {
    if (q && ![c.title, c.source, c.partner].some((s) => s.toLowerCase().includes(q))) return false;
    if (f.industry !== 'all' && canonicalIndustry(c.industry) !== f.industry) return false;
    if (f.caseType !== 'all' && c.caseType !== f.caseType) return false;
    if (from && c.date < from) return false;
    if (to && c.date > to) return false;
    switch (f.score) {
      case 'strong':
        if (c.overall === null || c.overall < STRONG_AT) return false;
        break;
      case 'developing':
        if (c.overall !== DEVELOPING_AT) return false;
        break;
      case 'needs':
        if (c.overall === null || c.overall >= DEVELOPING_AT) return false;
        break;
      case 'unrated':
        if (c.overall !== null) return false;
        break;
    }
    return true;
  });

  const newestFirst = (a: CaseRecord, b: CaseRecord) => compareCases(b, a);
  return filtered.sort((a, b) => {
    switch (f.sort) {
      case 'oldest':
        return compareCases(a, b);
      case 'highest':
      case 'lowest': {
        // Unrated cases always sink to the bottom.
        if (a.overall === null && b.overall === null) return newestFirst(a, b);
        if (a.overall === null) return 1;
        if (b.overall === null) return -1;
        const diff = f.sort === 'highest' ? b.overall - a.overall : a.overall - b.overall;
        return diff || newestFirst(a, b);
      }
      default:
        return newestFirst(a, b);
    }
  });
}

export interface KeyImprovement {
  label: string;
  /** 'tag' = you chose it; 'lowest' = derived from your lowest rating (3 or below). */
  source: 'tag' | 'lowest';
}

/** The "key improvement area" column: your explicit tag, else the lowest rating if it's <= 3. */
export function keyImprovement(c: CaseRecord): KeyImprovement | null {
  if (c.improvementArea) return { label: skillGroupLabel(c.improvementArea), source: 'tag' };
  let lowest: { key: SkillGroupKey; value: number } | null = null;
  for (const g of SKILL_GROUPS) {
    const v = caseSkillValue(c, g.key);
    if (v !== null && (lowest === null || v < lowest.value)) lowest = { key: g.key, value: v };
  }
  if (lowest && lowest.value <= DEVELOPING_AT) return { label: skillGroupLabel(lowest.key), source: 'lowest' };
  return null;
}
