import {
  CASE_TYPE_PRIORITY,
  DASHBOARD_SKILLS,
  INDUSTRY_PRIORITY,
  SKILL_GROUPS,
  skillGroupLabel,
  type CaseType,
  type DashboardSkillKey,
  type SkillGroupKey,
} from './constants';
import { sharedToRecords, type SharedCase } from './community';
import { MIN_CASES_FOR_SKILL_INSIGHTS } from './improvement';
import { caseTypeCounts, exposureOf, industryCounts, round1, skillStats, type Exposure } from './stats';
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

// ---------------------------------------------------------------------------------------
// The pairing view: the same rules, laid out as the profile link draws them.
// ---------------------------------------------------------------------------------------

/**
 * How many shared cases must carry a score before it is read as something they can help with. It is the
 * minimum the Improvement Areas screen and the sharpening summary already use, so one number governs every
 * reading of a member's scores: below it, an average is one or two cases and is shown as that.
 */
export const MIN_SHARED_FOR_SKILL = MIN_CASES_FOR_SKILL_INSIGHTS;

/** One case type or industry, with how many of their shared cases are in it. */
export interface PracticeArea {
  name: string;
  count: number;
  /** `none` nothing shared, `once` one case, `multiple` two or more. */
  band: Exposure;
}

/** One score they share, averaged over the shared cases that carry it. */
export interface SharedScore {
  key: DashboardSkillKey;
  label: string;
  /** The average of those cases, to one decimal. */
  average: number;
  /** How many shared cases carry this score. */
  count: number;
  /** Fewer than MIN_SHARED_FOR_SKILL cases carry it, so it is one or two cases, not a measurement. */
  thin: boolean;
}

/**
 * Everything the profile card draws, in the order it draws it. It carries `GiveNext` whole, so the signed-in
 * view (overlap with the reader's own log) can add fields to this without any of it being rewritten.
 */
export interface GiveNextView extends GiveNext {
  /** Case types, least practised first. Gaps join it only once there are enough cases to point anywhere. */
  typeLane: PracticeArea[];
  /** Industries, the same way, including the ones they typed themselves. */
  industryLane: PracticeArea[];
  /** The scores they share that enough cases carry, strongest first. */
  scores: SharedScore[];
  /** The scores one or two cases carry, in the app's own order of skills: never ranked, never a headline. */
  thinScores: SharedScore[];
}

/** Least practised first, and within a count the order interviews ask about them. */
const byCountThen = (order: (name: string) => number) => (a: PracticeArea, b: PracticeArea) =>
  a.count - b.count || order(a.name) - order(b.name) || a.name.localeCompare(b.name);

const indexIn = (names: readonly string[]) => (name: string) => {
  const i = names.indexOf(name);
  return i === -1 ? names.length : i;
};

/**
 * What to give this member next and what they can help with, from the cases they share and nothing else:
 * `whatToGiveNext`'s rules, laid out as lanes a chart can draw and scores a reader can weigh.
 *
 * Two readings are deliberately kept apart. A case type or industry is counted, which is a fact about their
 * log; a score is averaged, which is only worth reading when enough cases carry it, so a score from one or two
 * cases is kept out of the ordering and shown as the one or two cases it is.
 */
export function giveNextView(shared: SharedCase[]): GiveNextView {
  const base = whatToGiveNext(shared);
  const records = sharedToRecords(shared);

  // Gaps are named only where whatToGiveNext would name them: never below the minimum, and never "Other".
  const unseenTypes = new Set<string>(base.unseenTypes);
  const typeLane = caseTypeCounts(records)
    .filter((t) => t.count > 0 || unseenTypes.has(t.caseType))
    .map((t) => ({ name: t.caseType, count: t.count, band: t.exposure }))
    .sort(byCountThen(indexIn(CASE_TYPE_PRIORITY)));

  const unseenIndustries = new Set<string>(base.unseenIndustries);
  const industryLane = industryCounts(records, customIndustriesOf(records))
    .filter((c) => c.count > 0 || unseenIndustries.has(c.industry))
    .map((c) => ({ name: c.industry, count: c.count, band: exposureOf(c.count) }))
    .sort(byCountThen(indexIn(INDUSTRY_PRIORITY)));

  const measured: SharedScore[] = skillStats(records)
    .filter((s) => s.count > 0 && s.average !== null)
    .map((s) => ({
      key: s.key,
      label: s.label,
      average: round1(s.average as number),
      count: s.count,
      thin: s.count < MIN_SHARED_FOR_SKILL,
    }));
  const skillOrder = indexIn(DASHBOARD_SKILLS.map((s) => s.key));

  return {
    ...base,
    typeLane,
    industryLane,
    scores: measured.filter((s) => !s.thin).sort((a, b) => b.average - a.average || skillOrder(a.key) - skillOrder(b.key)),
    thinScores: measured.filter((s) => s.thin).sort((a, b) => skillOrder(a.key) - skillOrder(b.key)),
  };
}
