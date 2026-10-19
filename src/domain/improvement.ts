import {
  INDUSTRIES,
  MAIN_CASE_TYPES,
  RECENT_WINDOW,
  SKILL_GROUPS,
  type CaseType,
  type SkillGroupKey,
} from './constants';
import { canonicalIndustry, round1, skillStats, sortDesc, type Trend } from './stats';
import type { CaseRecord } from './types';

// ---------------------------------------------------------------------------------------
// A. Areas with limited exposure
// ---------------------------------------------------------------------------------------

export interface OnceEntry {
  name: string;
  /** Title of the single case, so you remember what it was. */
  caseTitle: string;
}

export interface LimitedExposure {
  /** "Other" is a catch-all, so it is never listed as a gap. */
  caseTypesNone: CaseType[];
  caseTypesOnce: OnceEntry[];
  industriesNone: string[];
  industriesOnce: OnceEntry[];
}

export function limitedExposure(cases: CaseRecord[], customs: string[] = []): LimitedExposure {
  const typeCases = new Map<string, CaseRecord[]>();
  const industryCases = new Map<string, CaseRecord[]>();
  for (const c of cases) {
    typeCases.set(c.caseType, [...(typeCases.get(c.caseType) ?? []), c]);
    const industry = canonicalIndustry(c.industry, customs);
    if (industry) industryCases.set(industry, [...(industryCases.get(industry) ?? []), c]);
  }

  const mainIndustries = INDUSTRIES.filter((i) => i !== 'Other');
  const industryNames = [...new Set([...mainIndustries, ...industryCases.keys()])];

  return {
    caseTypesNone: MAIN_CASE_TYPES.filter((t) => !typeCases.has(t)),
    caseTypesOnce: MAIN_CASE_TYPES.filter((t) => typeCases.get(t)?.length === 1).map((t) => ({
      name: t,
      caseTitle: typeCases.get(t)![0].title,
    })),
    industriesNone: mainIndustries.filter((i) => !industryCases.has(i)),
    industriesOnce: industryNames
      .filter((i) => i !== 'Other' && industryCases.get(i)?.length === 1)
      .map((i) => ({ name: i, caseTitle: industryCases.get(i)![0].title })),
  };
}

// ---------------------------------------------------------------------------------------
// B. Skills to improve
// ---------------------------------------------------------------------------------------

export const MIN_CASES_FOR_SKILL_INSIGHTS = 3;
const TAG_LOOKBACK = 10;
const STRONG_ENOUGH = 3.5;

export interface SkillPriority {
  key: SkillGroupKey;
  label: string;
  windowAverage: number | null;
  trend: Trend | null;
  tagCount: number;
  reasons: string[];
  score: number;
}

/**
 * A short prioritised list built from three signals: lowest recent ratings, declining
 * ratings, and how often you tagged a skill as your main improvement area. A skill that is
 * rated 3.5+ and neither declining nor tagged never appears.
 */
export function skillsToImprove(cases: CaseRecord[]): SkillPriority[] {
  if (cases.length < MIN_CASES_FOR_SKILL_INSIGHTS) return [];
  const stats = skillStats(cases);
  const recent = sortDesc(cases).slice(0, TAG_LOOKBACK);

  const out: SkillPriority[] = [];
  for (const group of SKILL_GROUPS) {
    const stat = stats.find((s) => s.key === group.key);
    if (!stat) continue;
    const tagCount = recent.filter((c) => c.improvementArea === group.key).length;

    const lowRating =
      stat.count >= MIN_CASES_FOR_SKILL_INSIGHTS && stat.windowAverage !== null && stat.windowAverage < STRONG_ENOUGH;
    const declining = stat.trend === 'declining';
    const tagged = tagCount >= 2;
    if (!lowRating && !declining && !tagged) continue;

    const reasons: string[] = [];
    if (lowRating && stat.windowAverage !== null) {
      reasons.push(`Averaging ${round1(stat.windowAverage).toFixed(1)} over your last ${Math.min(stat.count, RECENT_WINDOW)} rated cases`);
    }
    if (declining && stat.delta !== null) {
      reasons.push(`Down ${Math.abs(round1(stat.delta)).toFixed(1)} compared with your earlier cases`);
    }
    if (tagged) {
      reasons.push(`Named as your main improvement area in ${tagCount} of your last ${recent.length} cases`);
    }

    const score =
      (lowRating && stat.windowAverage !== null ? (STRONG_ENOUGH - stat.windowAverage) * 2 : 0) +
      (declining ? 1.5 : 0) +
      tagCount * 0.75;

    out.push({
      key: group.key,
      label: group.label,
      windowAverage: stat.windowAverage,
      trend: stat.trend,
      tagCount,
      reasons,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
