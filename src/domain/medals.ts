import { DEVELOPING_AT, SKILL_GROUPS, STRONG_AT, type SkillGroupKey } from './constants';
import { caseSkillValue, mean, sortAsc } from './stats';
import type { CaseRecord } from './types';

/**
 * Skill medals: bronze, silver and gold for each skill, earned by your best run of five ratings of it. It is your best run that
 * counts, so a bad week never takes a medal back (deleting the cases that earned it would). Worked out from the log, never stored.
 * Medals are for show: the XP for a skill getting better is already in the level.
 */

export type MedalTier = 'bronze' | 'silver' | 'gold';

/** The average of five ratings in a row that earns each medal. */
export const MEDAL_AT: Record<MedalTier, number> = { bronze: DEVELOPING_AT, silver: STRONG_AT, gold: 4.6 };
export const MEDAL_TIERS: MedalTier[] = ['bronze', 'silver', 'gold'];
export const MEDAL_WINDOW = 5;

export interface SkillMedal {
  key: SkillGroupKey;
  label: string;
  /** How many times you have rated it. */
  ratings: number;
  /** Your best average over five ratings in a row, once you have five. */
  best: number | null;
  tier: MedalTier | null;
  /** The next medal and the average it needs, none at gold. */
  next: { tier: MedalTier; at: number } | null;
}

const EPS = 1e-9;

export function skillMedals(cases: CaseRecord[]): SkillMedal[] {
  const ordered = sortAsc(cases);
  return SKILL_GROUPS.map((group) => {
    const values = ordered.map((c) => caseSkillValue(c, group.key)).filter((v): v is number => v !== null);
    let best: number | null = null;
    for (let end = MEDAL_WINDOW - 1; end < values.length; end += 1) {
      const avg = mean(values.slice(end - MEDAL_WINDOW + 1, end + 1))!;
      if (best === null || avg > best) best = avg;
    }
    const tier = best === null ? null : [...MEDAL_TIERS].reverse().find((t) => best! >= MEDAL_AT[t] - EPS) ?? null;
    const nextTier = MEDAL_TIERS[tier === null ? 0 : MEDAL_TIERS.indexOf(tier) + 1];
    return { key: group.key, label: group.label, ratings: values.length, best, tier, next: nextTier ? { tier: nextTier, at: MEDAL_AT[nextTier] } : null };
  });
}
