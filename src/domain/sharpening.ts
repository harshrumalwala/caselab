import { SKILL_GROUPS, STRONG_AT, type SkillGroupKey } from './constants';
import { sharedToRecords, type SharedCase, type SharingPrefs } from './community';
import { MIN_CASES_FOR_SKILL_INSIGHTS, skillsToImprove } from './improvement';
import { skillStats } from './stats';
import type { CaseRecord } from './types';

/** How many skills are named on each side. A short answer to "what are they working on", never a league table. */
export const MAX_SHARPENING = 3;

export interface SharpeningSkill {
  key: SkillGroupKey;
  label: string;
}

export interface Sharpening {
  /** Shared cases that carry at least one skill score. Zero means there is nothing to work from. */
  rated: number;
  /** Skills they are sharpening, the product's own rule, at most three. */
  sharpen: SharpeningSkill[];
  /** Skills their shared scores are strong in, at most three. */
  strengths: SharpeningSkill[];
}

const EMPTY: Sharpening = { rated: 0, sharpen: [], strengths: [] };

const groupOrder = (key: SkillGroupKey) => SKILL_GROUPS.findIndex((g) => g.key === key);

/** A case counts as rated when any of the eight skills carries a score. */
const isRated = (c: CaseRecord) => SKILL_GROUPS.some((g) => g.fields.some((f) => c.skills[f]?.rating != null));

/**
 * "What is this member sharpening, and what are they strong at", from the cases they share and nothing else.
 * It is the summary a link holder sees when the member has switched it on, and the member sees the same thing
 * in their own preview before they decide.
 *
 * The rules are the ones the product already follows for the member themselves:
 * - the sharpening side is `skillsToImprove`, the Improvement Areas screen's own rule (recent average, a decline,
 *   and how often they tagged a skill), cut to three;
 * - the strong side is the Dashboard's own band (an average of 4 or better on the last up-to-five ratings);
 * - a skill needs MIN_CASES_FOR_SKILL_INSIGHTS shared ratings before it is named at all, so one rough case never
 *   defines anybody and a member who does not share skill scores has nothing here;
 * - names only. No average, no position, no eighth place: nothing a reader could take for a grade.
 *
 * Burned cases and interviewed cases cannot reach it: neither is part of a case log, so neither is in these rows.
 * Nothing is inferred from written text, and no model is involved: this is arithmetic over the scores themselves.
 */
export function publicSharpening(shared: SharedCase[]): Sharpening {
  const records = sharedToRecords(shared);
  const rated = records.filter(isRated).length;
  if (rated < MIN_CASES_FOR_SKILL_INSIGHTS) return EMPTY;

  const stats = skillStats(records);
  const ratings = (key: SkillGroupKey) => stats.find((s) => s.key === key)?.count ?? 0;
  const enough = (key: SkillGroupKey) => ratings(key) >= MIN_CASES_FOR_SKILL_INSIGHTS;

  const sharpen = skillsToImprove(records)
    .filter((p) => enough(p.key))
    .slice(0, MAX_SHARPENING)
    .map(({ key, label }) => ({ key, label }));

  const named = new Set(sharpen.map((s) => s.key));
  const strengths = stats
    .flatMap((s) => (s.key === 'overall' ? [] : [{ ...s, key: s.key as SkillGroupKey }]))
    .filter((s) => !named.has(s.key) && enough(s.key) && s.windowAverage !== null && s.windowAverage >= STRONG_AT)
    .sort((a, b) => (b.windowAverage as number) - (a.windowAverage as number) || groupOrder(a.key) - groupOrder(b.key))
    .slice(0, MAX_SHARPENING)
    .map(({ key, label }) => ({ key, label }));

  return { rated, sharpen, strengths };
}

/** Whether the summary has a skill to name. One rule, read by the card that draws it and by the line that announces it. */
export function hasSharpening(view: Sharpening): boolean {
  return view.sharpen.length > 0 || view.strengths.length > 0;
}

/** Who is reading a profile. The summary is part of a member's link; members have the fuller picture on their own screens. */
export type ProfileAudience = 'visitor' | 'member';

/** Whether this reader has the sharpening summary in front of them: their audience, the member's switch, and enough shared scores to name a skill. */
export function sharpeningShown(sharing: SharingPrefs, shared: SharedCase[], audience: ProfileAudience): boolean {
  return audience === 'visitor' && sharing.sharpening && hasSharpening(publicSharpening(shared));
}

/**
 * The switches as this page can honour them, for the "Shares ..." line at the top of a profile. Every other
 * switch speaks for itself the moment it is on; the sharpening summary also needs scores it can read and a
 * reader whose page carries it, so the line reads it the same way the card does and promises only what is there.
 */
export function sharingShown(sharing: SharingPrefs, shared: SharedCase[], audience: ProfileAudience): SharingPrefs {
  const sharpening = sharpeningShown(sharing, shared, audience);
  return sharpening === sharing.sharpening ? sharing : { ...sharing, sharpening };
}
