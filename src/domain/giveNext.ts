import {
  CASE_TYPE_PRIORITY,
  INDUSTRY_PRIORITY,
  SKILL_GROUPS,
  skillGroupLabel,
  type CaseType,
  type SkillGroupKey,
} from './constants';
import { sharedToRecords, type SharedCase } from './community';
import { caseTypeCounts, exposureOf, industryCounts } from './stats';
import { MIN_CASES_FOR_TRENDS } from './suggestions';

export interface Covered {
  name: string;
  count: number;
}

export interface GiveNext {
  /** Shared cases the numbers are built from. Zero means there is nothing to show at all. */
  total: number;
  /** Case types with at least one shared case, most practised first. */
  coveredTypes: Covered[];
  /** Industries with at least one shared case (including ones they typed themselves), most first. */
  coveredIndustries: Covered[];
  /** Enough shared cases to point anywhere. Below it, the four lists below stay empty on purpose. */
  enough: boolean;
  /** Main case types with nothing shared, the ones interviews use most first. Never "Other". */
  unseenTypes: CaseType[];
  /** Main case types with exactly one shared case. */
  onceTypes: CaseType[];
  /** Known industries with nothing shared, in the order the app suggests them. Never "Other". */
  unseenIndustries: string[];
  /** Known industries with exactly one shared case. */
  onceIndustries: string[];
  /** The improvement focus they tagged most often, when they share it. Their own words, not a verdict of ours. */
  focus: { key: SkillGroupKey; label: string; count: number } | null;
}

const EMPTY: Omit<GiveNext, 'total' | 'coveredTypes' | 'coveredIndustries' | 'focus'> = {
  enough: false,
  unseenTypes: [],
  onceTypes: [],
  unseenIndustries: [],
  onceIndustries: [],
};

const typeOrder = (t: CaseType) => {
  const i = CASE_TYPE_PRIORITY.indexOf(t);
  return i === -1 ? CASE_TYPE_PRIORITY.length : i;
};

/** The improvement focus they tagged most often; ties go to the dashboard's own order of skills. */
function topFocus(shared: SharedCase[]): GiveNext['focus'] {
  const counts = new Map<SkillGroupKey, number>();
  for (const s of shared) {
    if (s.improvementArea) counts.set(s.improvementArea, (counts.get(s.improvementArea) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || SKILL_GROUPS.findIndex((g) => g.key === a[0]) - SKILL_GROUPS.findIndex((g) => g.key === b[0]),
  )[0];
  return best ? { key: best[0], label: skillGroupLabel(best[0]), count: best[1] } : null;
}

/**
 * The industries they have typed themselves. A member's own browser keeps this list for them; a visitor has
 * only these rows, so it is read back off them, first spelling wins, so one industry is counted once.
 */
function customIndustriesOf(records: { industry: string }[]): string[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    const name = r.industry.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

/**
 * "What kind of case would be useful to this person next", worked out only from the cases they have chosen
 * to share. It is the answer for someone holding their profile link, who has no log of their own and so
 * cannot be given the overlap answer that "Find a case for them" gives a member.
 *
 * Three rules, the same ones the dashboard follows:
 * - nothing is said that the shared rows cannot support, and below MIN_CASES_FOR_TRENDS nothing is suggested
 *   at all: there is only coverage;
 * - a case type or industry nobody has shared is new ground, never a weakness, and the catch-all "Other" is
 *   never named as something to practise;
 * - the only judgment of the person is their own: the improvement focus they tagged themselves.
 *
 * Burned cases and interviewed cases cannot reach it: neither is part of a case log, so neither is in these rows.
 */
export function whatToGiveNext(shared: SharedCase[]): GiveNext {
  const records = sharedToRecords(shared);
  const total = records.length;

  const types = caseTypeCounts(records);
  const coveredTypes: Covered[] = types
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || typeOrder(a.caseType) - typeOrder(b.caseType))
    .map((c) => ({ name: c.caseType, count: c.count }));

  // industryCounts already orders by count and keeps every industry they typed themselves.
  const industries = industryCounts(records, customIndustriesOf(records));
  const coveredIndustries: Covered[] = industries
    .filter((c) => c.count > 0)
    .map((c) => ({ name: c.industry, count: c.count }));
  const countOfIndustry = (name: string) => industries.find((c) => c.industry === name)?.count ?? 0;

  const focus = topFocus(shared);
  if (total < MIN_CASES_FOR_TRENDS) return { total, coveredTypes, coveredIndustries, focus, ...EMPTY };

  // CASE_TYPE_PRIORITY is every main type in the order interviews use them, so the catch-all "Other" is
  // never named as something to practise.
  const countOfType = (t: CaseType) => types.find((c) => c.caseType === t)?.count ?? 0;
  const byExposure = (want: 'none' | 'once') => CASE_TYPE_PRIORITY.filter((t) => exposureOf(countOfType(t)) === want);

  // Only the known industries can be called new ground: an industry nobody has named is not a gap.
  const industriesBy = (want: 'none' | 'once') => INDUSTRY_PRIORITY.filter((name) => exposureOf(countOfIndustry(name)) === want);

  return {
    total,
    coveredTypes,
    coveredIndustries,
    enough: true,
    unseenTypes: byExposure('none'),
    onceTypes: byExposure('once'),
    unseenIndustries: industriesBy('none'),
    onceIndustries: industriesBy('once'),
    focus,
  };
}
