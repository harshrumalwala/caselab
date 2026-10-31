import {
  CASE_TYPE_PRIORITY,
  INDUSTRIES,
  INDUSTRY_PRIORITY,
  MAIN_CASE_TYPES,
  RECENT_WINDOW,
  SKILL_GROUPS,
  type CaseType,
} from './constants';
import { canonicalIndustry, caseTypeCounts, round1, skillStats, sortDesc } from './stats';
import type { CaseRecord } from './types';

export type SuggestionKind =
  | 'skill'
  | 'decline'
  | 'concentration'
  | 'caseType'
  | 'industry'
  | 'feedback'
  | 'repeat';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  text: string;
  /** Optional pre-fill for the Log Case form ("Log a Market Entry case"). */
  action?: { label: string; caseType?: CaseType; industry?: string };
}

/** Below this many cases we lean on coverage gaps and your own notes, not on trends. */
export const MIN_CASES_FOR_TRENDS = 5;
export const MAX_SUGGESTIONS = 3;

const joinOr = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;

const truncate = (s: string, n: number): string => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= n ? one : `${one.slice(0, n - 1).trimEnd()}…`;
};

const fmt = (n: number) => round1(n).toFixed(1);

/**
 * "What should I work on next?" Deterministic, rule-based, built only from recorded data.
 * Every rule stays silent when there isn't enough data to say something true.
 */
export function nextPracticeFocus(cases: CaseRecord[]): Suggestion[] {
  if (cases.length === 0) return [];
  const total = cases.length;
  const enoughForTrends = total >= MIN_CASES_FOR_TRENDS;
  const recentFirst = sortDesc(cases);

  const counts = caseTypeCounts(cases);
  const countOf = (t: CaseType) => counts.find((c) => c.caseType === t)?.count ?? 0;

  // ---- Skill: weakest recent skill ------------------------------------------------------
  const stats = skillStats(cases).filter((s) => s.key !== 'overall');
  const weakest = stats
    .filter((s) => s.recentAverage !== null && s.recentAverage <= 3)
    .sort((a, b) => (a.recentAverage as number) - (b.recentAverage as number))[0];
  let skill: Suggestion | null = null;
  if (weakest && weakest.recentAverage !== null) {
    const group = SKILL_GROUPS.find((g) => g.key === weakest.key);
    skill = {
      id: `skill-${weakest.key}`,
      kind: 'skill',
      text: `${weakest.label} is averaging ${fmt(weakest.recentAverage)} over your last ${RECENT_WINDOW} rated cases, so it's due some love. ${group?.tip ?? ''}`.trim(),
    };
  }

  // ---- Skill: declining -----------------------------------------------------------------
  const decliner = stats
    .filter((s) => s.trend === 'declining' && s.delta !== null && s.delta <= -0.5 && s.key !== weakest?.key)
    .sort((a, b) => (a.delta as number) - (b.delta as number))[0];
  const decline: Suggestion | null =
    decliner && decliner.earlierAverage !== null && decliner.recentAverage !== null
      ? {
          id: `decline-${decliner.key}`,
          kind: 'decline',
          text: `Your ${decliner.label} ratings have slipped from ${fmt(decliner.earlierAverage)} earlier to ${fmt(decliner.recentAverage)} over the last ${RECENT_WINDOW} rated cases. It happens to everyone. Worth a refresher.`,
        }
      : null;

  // ---- Concentration on one case type ---------------------------------------------------
  const alternatives = (exclude: CaseType): CaseType[] =>
    MAIN_CASE_TYPES.filter((t) => t !== exclude)
      .sort((a, b) => countOf(a) - countOf(b) || CASE_TYPE_PRIORITY.indexOf(a) - CASE_TYPE_PRIORITY.indexOf(b))
      .slice(0, 2);

  let concentration: Suggestion | null = null;
  const lastThree = recentFirst.slice(0, 3);
  if (total >= 3 && lastThree.every((c) => c.caseType === lastThree[0].caseType)) {
    const type = lastThree[0].caseType;
    const alts = alternatives(type);
    concentration = {
      id: `concentration-${type}`,
      kind: 'concentration',
      text: `Your last three cases were all ${type}. Great commitment, but interviewers do like variety. Try ${joinOr(alts)} next.`,
      action: { label: `Log a ${alts[0]} case`, caseType: alts[0] },
    };
  } else if (total >= 10) {
    const top = [...counts].sort((a, b) => b.count - a.count)[0];
    if (top.count / total >= 0.4) {
      const alts = alternatives(top.caseType);
      concentration = {
        id: `concentration-share-${top.caseType}`,
        kind: 'concentration',
        text: `${top.caseType} makes up ${top.count} of your ${total} cases. Someone has a favourite. Mixing in ${joinOr(alts)} would broaden your range.`,
        action: { label: `Log a ${alts[0]} case`, caseType: alts[0] },
      };
    }
  }

  // ---- Case type gap --------------------------------------------------------------------
  const uncoveredTypes = CASE_TYPE_PRIORITY.filter((t) => countOf(t) === 0);
  let caseTypeGap: Suggestion | null = null;
  if (uncoveredTypes.length > 0) {
    const named = uncoveredTypes.slice(0, 2);
    const rest = uncoveredTypes.length - named.length;
    caseTypeGap = {
      id: `casetype-${named.join('-')}`,
      kind: 'caseType',
      text: `You haven't practiced any ${joinOr(named)} cases yet${rest > 0 ? ` (${rest} more case type${rest === 1 ? '' : 's'} still unexplored)` : ''}. Fresh territory awaits.`,
      action: { label: `Log a ${named[0]} case`, caseType: named[0] },
    };
  }

  // ---- Industry gap ---------------------------------------------------------------------
  const seenIndustries = new Set(cases.map((c) => canonicalIndustry(c.industry)).filter(Boolean));
  const uncoveredIndustries = INDUSTRY_PRIORITY.filter((i) => (INDUSTRIES as readonly string[]).includes(i) && !seenIndustries.has(i));
  let industryGap: Suggestion | null = null;
  if (uncoveredIndustries.length > 0) {
    const named = uncoveredIndustries.slice(0, 2);
    industryGap = {
      id: `industry-${named.join('-')}`,
      kind: 'industry',
      text: `You haven't practiced any ${joinOr(named)} cases yet. Time to find out what they actually do all day.`,
      action: { label: `Log a ${named[0]} case`, industry: named[0] },
    };
  }

  // ---- Your own notes from the latest case ----------------------------------------------
  let feedback: Suggestion | null = null;
  const latestWithNote = recentFirst.find((c) => c.title && (c.nextFocus.trim() || c.struggled.trim()));
  if (latestWithNote) {
    const noted = latestWithNote.nextFocus.trim();
    feedback = {
      id: `feedback-${latestWithNote.id}`,
      kind: 'feedback',
      text: noted
        ? `After "${latestWithNote.title}" you wrote down a next focus: "${truncate(noted, 120)}"`
        : `In "${latestWithNote.title}" you noted a struggle: "${truncate(latestWithNote.struggled, 120)}". Worth targeting in your next case.`,
    };
  }

  // ---- Seen only once -------------------------------------------------------------------
  const onceTypes = CASE_TYPE_PRIORITY.filter((t) => countOf(t) === 1);
  const repeat: Suggestion | null =
    onceTypes.length > 0
      ? {
          id: `repeat-${onceTypes[0]}`,
          kind: 'repeat',
          text: `You've done ${onceTypes[0]} only once. A second case helps lock in the pattern.`,
          action: { label: `Log a ${onceTypes[0]} case`, caseType: onceTypes[0] },
        }
      : null;

  const ordered = enoughForTrends
    ? [skill, concentration, decline, caseTypeGap, industryGap, feedback, repeat]
    : [feedback, caseTypeGap, industryGap, repeat];

  return ordered.filter((s): s is Suggestion => s !== null).slice(0, MAX_SUGGESTIONS);
}
