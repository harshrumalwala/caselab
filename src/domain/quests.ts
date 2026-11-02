import { MAIN_CASE_TYPES, SKILL_GROUPS, type CaseType, type SkillGroupKey } from './constants';
import { parseISODate, weekStartISO } from './dates';
import { canonicalIndustry, caseSkillValue, mean, sortAsc } from './stats';
import type { CaseRecord } from './types';

/**
 * Weekly quests: three small things to try each week (Monday to Sunday), such as "try a case type you haven't" or "rate every skill in
 * one case". Like everything else here they are worked out from the case log, never stored: which three a week offers depends only on
 * that week and what you had practised before it, so a quest never changes under you and an old week always works out the same.
 *
 * To keep them fresh there are a dozen or so kinds, a few of them built from your own log (your weakest skill, your least practised
 * case type, a new practice partner), and the weeks step through the list in turn rather than drawing at random, so a quest never
 * comes back the week after it was offered and none is offered much more often than another.
 */

export const QUESTS_PER_WEEK = 3;
/** XP for each quest finished. Small on purpose: quests point at good practice, they are not the way to level. */
export const QUEST_XP = 5;

interface QuestKind {
  id: string;
  /** What it asks, which can name something from your own log. */
  title: (before: CaseRecord[]) => string;
  /** How many it takes. */
  need: number;
  /** Whether it makes sense this week, given what you had practised before the week began. */
  eligible: (before: CaseRecord[]) => boolean;
  /** How far this week's cases get you. */
  count: (week: CaseRecord[], before: CaseRecord[]) => number;
}

const types = (cases: CaseRecord[]) => new Set<CaseType>(cases.map((c) => c.caseType).filter((t) => MAIN_CASE_TYPES.includes(t)));
const industries = (cases: CaseRecord[]) => {
  const set = new Set<string>();
  for (const c of cases) {
    const name = canonicalIndustry(c.industry).toLowerCase();
    if (name && name !== 'other') set.add(name);
  }
  return set;
};
const partners = (cases: CaseRecord[]) => new Set(cases.map((c) => c.partner.trim().toLowerCase()).filter(Boolean));
const hasFeedback = (c: CaseRecord) => c.overallFeedback.trim() !== '' || Object.values(c.skills).some((s) => s.feedback.trim() !== '');

/** The skill whose last few ratings average lowest (needs three ratings), so there is something real to work on. */
function weakestSkill(before: CaseRecord[]): { key: SkillGroupKey; label: string } | null {
  const ordered = sortAsc(before);
  let worst: { key: SkillGroupKey; label: string; avg: number } | null = null;
  for (const g of SKILL_GROUPS) {
    const values = ordered.map((c) => caseSkillValue(c, g.key)).filter((v): v is number => v !== null);
    if (values.length < 3) continue;
    const avg = mean(values.slice(-5))!;
    if (worst === null || avg < worst.avg) worst = { key: g.key, label: g.label, avg };
  }
  return worst;
}

/** The main case type you have done least (needs three cases to have something to compare). */
function leastPractisedType(before: CaseRecord[]): CaseType | null {
  if (before.length < 3) return null;
  let least: { type: CaseType; n: number } | null = null;
  for (const type of MAIN_CASE_TYPES) {
    const n = before.filter((c) => c.caseType === type).length;
    if (least === null || n < least.n) least = { type, n };
  }
  return least?.type ?? null;
}

/**
 * The kinds, in the order the weeks step through them: each week takes the next three that suit it. They are mixed up so that a
 * week's three are rarely all of one sort.
 */
const KINDS: QuestKind[] = [
  { id: 'log-two', title: () => 'Log 2 cases', need: 2, eligible: () => true, count: (week) => week.length },
  {
    id: 'new-type',
    title: () => "Try a case type you haven't practised",
    need: 1,
    eligible: (before) => types(before).size < MAIN_CASE_TYPES.length,
    count: (week, before) => [...types(week)].filter((t) => !types(before).has(t)).length,
  },
  { id: 'lessons', title: () => 'Write down what you learned in 2 cases', need: 2, eligible: () => true, count: (week) => week.filter((c) => c.concepts.trim() !== '').length },
  {
    id: 'weakest-skill',
    title: (before) => `Rate ${weakestSkill(before)?.label} in a case: it is your weakest skill right now`,
    need: 1,
    eligible: (before) => weakestSkill(before) !== null,
    count: (week, before) => {
      const w = weakestSkill(before);
      return w ? week.filter((c) => caseSkillValue(c, w.key) !== null).length : 0;
    },
  },
  { id: 'two-days', title: () => 'Case on 2 different days', need: 2, eligible: () => true, count: (week) => new Set(week.map((c) => c.date)).size },
  {
    id: 'full-writeup',
    title: () => 'One full write-up: feedback, a lesson, a next focus and an improvement tag',
    need: 1,
    eligible: () => true,
    count: (week) => week.filter((c) => hasFeedback(c) && c.concepts.trim() !== '' && c.nextFocus.trim() !== '' && c.improvementArea !== null).length,
  },
  {
    id: 'new-industry',
    title: () => "Try an industry you haven't practised",
    need: 1,
    eligible: () => true,
    count: (week, before) => [...industries(week)].filter((i) => !industries(before).has(i)).length,
  },
  { id: 'tag-improve', title: () => 'Tag what to improve on 2 cases', need: 2, eligible: () => true, count: (week) => week.filter((c) => c.improvementArea !== null).length },
  {
    id: 'least-practised',
    title: (before) => `Try ${leastPractisedType(before)}, the case type you have done least`,
    need: 1,
    eligible: (before) => leastPractisedType(before) !== null,
    count: (week, before) => {
      const t = leastPractisedType(before);
      return t ? week.filter((c) => c.caseType === t).length : 0;
    },
  },
  {
    id: 'all-skills',
    title: () => 'Rate every skill in one case',
    need: 1,
    eligible: () => true,
    count: (week) => week.filter((c) => SKILL_GROUPS.every((g) => caseSkillValue(c, g.key) !== null)).length,
  },
  { id: 'three-cases', title: () => 'Log 3 cases', need: 3, eligible: () => true, count: (week) => week.length },
  {
    id: 'new-partner',
    title: () => 'Case with a partner you have not cased with before',
    need: 1,
    eligible: (before) => partners(before).size > 0,
    count: (week, before) => [...partners(week)].filter((p) => !partners(before).has(p)).length,
  },
  { id: 'rate-overall', title: () => 'Rate 3 cases overall', need: 3, eligible: () => true, count: (week) => week.filter((c) => c.overall !== null).length },
];

export interface Quest {
  id: string;
  title: string;
  need: number;
  /** How far you are, never more than `need`. */
  have: number;
  done: boolean;
}

/** Monday 5 January 2026: weeks are counted from here, so every week has one fixed place in the rotation. */
const EPOCH = parseISODate('2026-01-05').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const weekNumber = (weekStart: string) => Math.round((parseISODate(weekStart).getTime() - EPOCH) / WEEK_MS);

/**
 * Which kinds a week offers: the next three that suit it, stepping through the list three at a time. As the list does not divide by
 * three, the trios shift by one place each lap, so the same three only come round together again after a full 13 weeks.
 */
function offered(weekStart: string, before: CaseRecord[]): QuestKind[] {
  const suitable = KINDS.filter((k) => k.eligible(before));
  const n = weekNumber(weekStart);
  const start = 3 * n;
  const out: QuestKind[] = [];
  for (let i = 0; i < Math.min(QUESTS_PER_WEEK, suitable.length); i += 1) {
    const at = (((start + i) % suitable.length) + suitable.length) % suitable.length;
    out.push(suitable[at]);
  }
  return out;
}

/** The quests of the week starting on the given Monday (YYYY-MM-DD), and how far each one is. */
export function questsForWeek(cases: CaseRecord[], weekStart: string): Quest[] {
  const before = cases.filter((c) => c.date < weekStart);
  const week = cases.filter((c) => weekStartISO(c.date) === weekStart);
  return offered(weekStart, before).map((k) => {
    const have = Math.min(k.need, k.count(week, before));
    return { id: k.id, title: k.title(before), need: k.need, have, done: have >= k.need };
  });
}

/** How many quests you have finished across every week, and the XP they earned. */
export function questTotals(cases: CaseRecord[]): { done: number; xp: number } {
  const weeks = new Set(cases.map((c) => weekStartISO(c.date)));
  let done = 0;
  for (const w of weeks) done += questsForWeek(cases, w).filter((q) => q.done).length;
  return { done, xp: done * QUEST_XP };
}

/** The quests that saving a case finished: done in the week of `date` after the save, and not before it. */
export function questsFinishedBy(before: CaseRecord[], after: CaseRecord[], date: string): Quest[] {
  const week = weekStartISO(date);
  const was = new Set(questsForWeek(before, week).filter((q) => q.done).map((q) => q.id));
  return questsForWeek(after, week).filter((q) => q.done && !was.has(q.id));
}
