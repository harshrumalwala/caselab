import { COUNT_MILESTONES, MAIN_CASE_TYPES } from './constants';
import { canonicalIndustry, sortAsc } from './stats';
import type { CaseRecord } from './types';

export interface Milestone {
  id: string;
  label: string;
  /** Date of the case that unlocked it. */
  date: string;
  kind: 'count' | 'industry' | 'caseTypes';
}

/**
 * Milestones are derived from the case history, never stored, so they can't drift out of
 * sync and deleting a case can't leave a stale "achievement" behind. Returned oldest first.
 */
export function milestones(cases: CaseRecord[]): Milestone[] {
  const ordered = sortAsc(cases);
  const events: { order: number; milestone: Milestone }[] = [];

  for (const target of COUNT_MILESTONES) {
    if (ordered.length >= target) {
      events.push({
        order: target - 1,
        milestone: { id: `count-${target}`, label: `${target} cases completed`, date: ordered[target - 1].date, kind: 'count' },
      });
    }
  }

  const seenIndustries = new Set<string>();
  const seenTypes = new Set<string>();
  let allTypesDone = false;
  ordered.forEach((c, i) => {
    const industry = canonicalIndustry(c.industry);
    if (industry && !seenIndustries.has(industry.toLowerCase())) {
      seenIndustries.add(industry.toLowerCase());
      events.push({
        order: i,
        milestone: { id: `industry-${industry.toLowerCase()}`, label: `First ${industry} case`, date: c.date, kind: 'industry' },
      });
    }
    seenTypes.add(c.caseType);
    if (!allTypesDone && MAIN_CASE_TYPES.every((t) => seenTypes.has(t))) {
      allTypesDone = true;
      events.push({
        order: i,
        milestone: { id: 'all-case-types', label: 'Practiced every main case type', date: c.date, kind: 'caseTypes' },
      });
    }
  });

  return events.sort((a, b) => a.order - b.order).map((e) => e.milestone);
}

export function nextCountMilestone(total: number): { target: number; remaining: number } | null {
  const target = COUNT_MILESTONES.find((t) => t > total);
  return target === undefined ? null : { target, remaining: target - total };
}

/** Milestones present in `after` but not in `before`, e.g. what a newly saved case unlocked. */
export function newMilestones(before: CaseRecord[], after: CaseRecord[]): Milestone[] {
  const had = new Set(milestones(before).map((m) => m.id));
  return milestones(after).filter((m) => !had.has(m.id));
}
