import { skillGroupLabel, type SkillGroupKey } from './constants';
import type { LimitedExposure } from './improvement';
import type { LibraryCase } from './library';

/** The gaps in a member's practice, none before once, case types before industries. */
export function gapsFrom(e: LimitedExposure): Gap[] {
  return [
    ...e.caseTypesNone.map((name): Gap => ({ kind: 'type', name, once: false })),
    ...e.industriesNone.map((name): Gap => ({ kind: 'industry', name, once: false })),
    ...e.caseTypesOnce.map((o): Gap => ({ kind: 'type', name: o.name, once: true })),
    ...e.industriesOnce.map((o): Gap => ({ kind: 'industry', name: o.name, once: true })),
  ];
}

/** A case type or industry the member has done little or none of. */
export interface Gap {
  kind: 'type' | 'industry';
  name: string;
  /** True when they have done exactly one; false when none. */
  once: boolean;
}

export interface PlanItem {
  library: LibraryCase;
  /** Why this case is in the plan, in plain words. */
  reasons: string[];
}

export interface PlanInput {
  /** The skills Bucket says to work on, most important first (only ones tied to one skill). */
  focus: SkillGroupKey[];
  /** Unseen casebook cases for each focus skill, best first. */
  skillCases: Partial<Record<SkillGroupKey, LibraryCase[]>>;
  /** Unseen casebook cases of the gaps' types or industries, best first. */
  gapCases: LibraryCase[];
  gaps: Gap[];
  /** How many cases the plan holds. */
  size: number;
}

export const MIN_PLAN = 2;
export const MAX_PLAN = 5;
export const DEFAULT_PLAN = 3;

/** The plan's size: the weekly goal when there is one, kept to something that fits in a week of reading. */
export const planSize = (goal: number | null): number => Math.min(MAX_PLAN, Math.max(MIN_PLAN, goal ?? DEFAULT_PLAN));

const gapWords = (g: Gap): string => (g.once ? `You've done one ${g.name} case` : `Your first ${g.name} case`);

/** The gaps a case would fill (only when its type and industry are really known). */
function fills(c: LibraryCase, gaps: Gap[], covered: Set<string>): Gap[] {
  if (!c.detailsKnown) return [];
  return gaps.filter((g) => !covered.has(`${g.kind}:${g.name}`) && (g.kind === 'type' ? g.name === c.caseType : g.name === c.industry));
}

/** A gap you have done none of counts for more than one you have done once. */
const weight = (gs: Gap[]): number => gs.reduce((sum, g) => sum + (g.once ? 1 : 2), 0);

/**
 * This week's practice, in plain code: first a case for each skill Bucket says to work on (preferring one that also fills a gap), then cases
 * that fill the biggest gaps in the case types and industries practised so far, never the same case twice and never filling the same gap
 * twice. Nothing is invented: a plan can be shorter than asked (or empty) when there is nothing real to suggest.
 */
export function composePlan({ focus, skillCases, gapCases, gaps, size }: PlanInput): PlanItem[] {
  const items: PlanItem[] = [];
  const used = new Set<string>();
  const covered = new Set<string>();
  const take = (c: LibraryCase, reasons: string[]) => {
    used.add(c.id);
    for (const g of fills(c, gaps, covered)) covered.add(`${g.kind}:${g.name}`);
    items.push({ library: c, reasons });
  };

  const skills = [...new Set(focus)].slice(0, Math.max(1, Math.min(2, size - 1)));
  for (const skill of skills) {
    if (items.length >= size) break;
    const list = (skillCases[skill] ?? []).filter((c) => !used.has(c.id));
    const pick = list.find((c) => fills(c, gaps, covered).length > 0) ?? list[0];
    if (pick) take(pick, [`Practises ${skillGroupLabel(skill)}`, ...fills(pick, gaps, covered).map(gapWords)]);
  }

  while (items.length < size) {
    const best = gapCases
      .filter((c) => !used.has(c.id))
      .map((c) => ({ c, gs: fills(c, gaps, covered) }))
      .filter((x) => x.gs.length > 0)
      .sort((a, b) => weight(b.gs) - weight(a.gs) || Number(b.c.cochairPick) - Number(a.c.cochairPick) || b.c.year - a.c.year || a.c.name.localeCompare(b.c.name))[0];
    if (!best) break;
    take(best.c, best.gs.map(gapWords));
  }
  return items;
}
