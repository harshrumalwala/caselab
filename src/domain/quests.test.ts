import { describe, expect, it } from 'vitest';
import { MAIN_CASE_TYPES } from './constants';
import { addDays, toISODate } from './dates';
import { progressFor, xpBreakdown } from './progress';
import { QUEST_XP, QUESTS_PER_WEEK, questsForWeek, questTotals } from './quests';
import { makeCase } from '../test/builders';
import type { CaseRecord } from './types';

const FIRST_MONDAY = new Date(2026, 0, 5);
const monday = (k: number) => toISODate(addDays(FIRST_MONDAY, 7 * k));
const day = (week: string, offset: number) => toISODate(addDays(new Date(`${week}T00:00:00`), offset));
/** The first week (from January 2026) that offers a given quest, given the cases you had before it. */
const weekOffering = (id: string, before: CaseRecord[] = []) => {
  for (let k = 0; k < 200; k += 1) if (questsForWeek(before, monday(k)).some((q) => q.id === id)) return monday(k);
  throw new Error(`no week offers ${id}`);
};
const quest = (cases: CaseRecord[], week: string, id: string) => questsForWeek(cases, week).find((q) => q.id === id)!;
const EARLIER = '2025-12-20';

describe('which quests a week offers', () => {
  it('is three, and always the same three for the same week', () => {
    for (let k = 0; k < 10; k += 1) {
      const a = questsForWeek([], monday(k));
      expect(a).toHaveLength(QUESTS_PER_WEEK);
      expect(questsForWeek([], monday(k)).map((q) => q.id)).toEqual(a.map((q) => q.id));
    }
  });

  it('changes from week to week, so there is something new to try', () => {
    const sets = new Set(Array.from({ length: 12 }, (_, k) => questsForWeek([], monday(k)).map((q) => q.id).sort().join()));
    expect(sets.size).toBeGreaterThan(3);
  });

  it('does not offer a new case type once you have practised every main one', () => {
    const everything = MAIN_CASE_TYPES.map((caseType) => makeCase({ date: EARLIER, caseType }));
    for (let k = 0; k < 40; k += 1) expect(questsForWeek(everything, monday(k)).map((q) => q.id)).not.toContain('new-type');
  });

  it('does not change when you log cases in the week itself', () => {
    const week = monday(5);
    const ids = questsForWeek([], week).map((q) => q.id);
    expect(questsForWeek([makeCase({ date: day(week, 1) }), makeCase({ date: day(week, 2) })], week).map((q) => q.id)).toEqual(ids);
  });
});

describe('keeping quests fresh', () => {
  const log = Array.from({ length: 6 }, (_, i) => makeCase({ date: `2025-12-${10 + i}`, partner: 'Ana', skills: { framework: 3, quant: 2, prompt: 4 } }));
  const year = (before: CaseRecord[]) => Array.from({ length: 52 }, (_, k) => questsForWeek(before, monday(k)).map((q) => q.id));

  it('never offers a quest the week after it was offered, for a whole year', () => {
    for (const before of [[], log]) {
      const weeks = year(before);
      for (let k = 1; k < weeks.length; k += 1) expect(weeks[k].filter((id) => weeks[k - 1].includes(id))).toEqual([]);
    }
  });

  it('offers each kind about as often as any other, so none is stuck in the rotation or missing from it', () => {
    const counts = new Map<string, number>();
    for (const week of year(log)) for (const id of week) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(counts.size).toBe(13);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });

  it('does not bring the same three round together again for at least ten weeks', () => {
    const trios = year(log).map((w) => [...w].sort().join());
    for (let k = 0; k < trios.length; k += 1) for (let j = k + 1; j < Math.min(trios.length, k + 10); j += 1) expect(trios[j]).not.toBe(trios[k]);
  });

  it('only offers the quests that are built from your log once there is something in it to build from', () => {
    const ids = new Set(year([]).flat());
    expect(ids.has('weakest-skill')).toBe(false);
    expect(ids.has('least-practised')).toBe(false);
    expect(ids.has('new-partner')).toBe(false);
    const withLog = new Set(year(log).flat());
    expect(withLog.has('weakest-skill') && withLog.has('least-practised') && withLog.has('new-partner')).toBe(true);
  });
});

describe('how each quest is finished', () => {
  it('"Log 2 cases" counts the cases of the week', () => {
    const week = weekOffering('log-two');
    expect(quest([makeCase({ date: day(week, 0) })], week, 'log-two')).toMatchObject({ have: 1, need: 2, done: false });
    expect(quest([makeCase({ date: day(week, 0) }), makeCase({ date: day(week, 3) })], week, 'log-two').done).toBe(true);
  });

  it('"Case on 2 different days" needs two days, not two cases', () => {
    const week = weekOffering('two-days');
    expect(quest([makeCase({ date: day(week, 1) }), makeCase({ date: day(week, 1) })], week, 'two-days')).toMatchObject({ have: 1, done: false });
    expect(quest([makeCase({ date: day(week, 1) }), makeCase({ date: day(week, 2) })], week, 'two-days').done).toBe(true);
  });

  it('"Try a case type" needs one you had not practised before the week', () => {
    const before = [makeCase({ date: EARLIER, caseType: 'Profitability' })];
    const week = weekOffering('new-type', before);
    expect(quest([...before, makeCase({ date: day(week, 1), caseType: 'Profitability' })], week, 'new-type').done).toBe(false);
    expect(quest([...before, makeCase({ date: day(week, 1), caseType: 'Revenue' })], week, 'new-type').done).toBe(true);
    expect(quest([...before, makeCase({ date: day(week, 1), caseType: 'Other' })], week, 'new-type').done).toBe(false);
  });

  it('"Try an industry" needs one you had not practised, and "Other" does not count', () => {
    const before = [makeCase({ date: EARLIER, industry: 'Insurance' })];
    const week = weekOffering('new-industry', before);
    expect(quest([...before, makeCase({ date: day(week, 1), industry: 'Insurance' })], week, 'new-industry').done).toBe(false);
    expect(quest([...before, makeCase({ date: day(week, 1), industry: 'Other' })], week, 'new-industry').done).toBe(false);
    expect(quest([...before, makeCase({ date: day(week, 1), industry: 'Energy / Utilities' })], week, 'new-industry').done).toBe(true);
  });

  it('"Rate every skill" needs all seven skill groups rated in a single case', () => {
    const week = weekOffering('all-skills');
    const some = makeCase({ date: day(week, 0), skills: { framework: 4, quant: 3 } });
    const all = makeCase({ date: day(week, 1), skills: { behavioral1: 3, prompt: 3, framework: 4, quant: 3, exhibits: 3, brainstorm: 3, recommendation: 4 } });
    expect(quest([some], week, 'all-skills').done).toBe(false);
    expect(quest([some, all], week, 'all-skills').done).toBe(true);
  });

  it('"What you learned" and "Tag what to improve" each need two cases', () => {
    const lessons = weekOffering('lessons');
    expect(quest([makeCase({ date: day(lessons, 0), concepts: 'x' }), makeCase({ date: day(lessons, 1), concepts: '  ' })], lessons, 'lessons')).toMatchObject({ have: 1, done: false });
    expect(quest([makeCase({ date: day(lessons, 0), concepts: 'x' }), makeCase({ date: day(lessons, 1), concepts: 'y' })], lessons, 'lessons').done).toBe(true);
    const tags = weekOffering('tag-improve');
    expect(quest([makeCase({ date: day(tags, 0), improvementArea: 'quant' }), makeCase({ date: day(tags, 1), improvementArea: 'framework' })], tags, 'tag-improve').done).toBe(true);
  });

  it('"Rate your weakest skill" names the skill your recent ratings are lowest in, and needs a case that rates it', () => {
    const before = Array.from({ length: 4 }, (_, i) => makeCase({ date: `2025-12-${10 + i}`, skills: { framework: 4, quant: 2 } }));
    const week = weekOffering('weakest-skill', before);
    expect(quest(before, week, 'weakest-skill').title).toContain('Quant / Math');
    expect(quest([...before, makeCase({ date: day(week, 1), skills: { framework: 5 } })], week, 'weakest-skill').done).toBe(false);
    expect(quest([...before, makeCase({ date: day(week, 1), skills: { quant: 3 } })], week, 'weakest-skill').done).toBe(true);
  });

  it('"Try the case type you have done least" names that type and needs a case of it', () => {
    const others = MAIN_CASE_TYPES.filter((t) => t !== 'Sourcing / Outsourcing');
    const before = [...others, ...others].map((caseType, i) => makeCase({ caseType, date: `2025-11-${String(1 + (i % 28)).padStart(2, '0')}` }));
    const week = weekOffering('least-practised', before);
    expect(quest(before, week, 'least-practised').title).toContain('Sourcing / Outsourcing');
    expect(quest([...before, makeCase({ date: day(week, 1), caseType: 'Revenue' })], week, 'least-practised').done).toBe(false);
    expect(quest([...before, makeCase({ date: day(week, 1), caseType: 'Sourcing / Outsourcing' })], week, 'least-practised').done).toBe(true);
  });

  it('"Case with a new partner" needs a name you had not cased with, and a blank one does not count', () => {
    const before = [makeCase({ date: EARLIER, partner: 'Ana' })];
    const week = weekOffering('new-partner', before);
    expect(quest([...before, makeCase({ date: day(week, 1), partner: ' ana ' })], week, 'new-partner').done).toBe(false);
    expect(quest([...before, makeCase({ date: day(week, 1), partner: '' })], week, 'new-partner').done).toBe(false);
    expect(quest([...before, makeCase({ date: day(week, 1), partner: 'Ben' })], week, 'new-partner').done).toBe(true);
  });

  it('"Log 3 cases" and "Rate 3 cases overall" each need three', () => {
    const three = weekOffering('three-cases');
    expect(quest([makeCase({ date: day(three, 0) }), makeCase({ date: day(three, 1) })], three, 'three-cases')).toMatchObject({ have: 2, done: false });
    expect(quest([0, 1, 2].map((d) => makeCase({ date: day(three, d) })), three, 'three-cases').done).toBe(true);
    const rated = weekOffering('rate-overall');
    expect(quest([0, 1, 2].map((d) => makeCase({ date: day(rated, d) })), rated, 'rate-overall').done).toBe(false);
    expect(quest([0, 1, 2].map((d) => makeCase({ date: day(rated, d), overall: 4 })), rated, 'rate-overall').done).toBe(true);
  });

  it('"A full write-up" needs feedback, a lesson, a next focus and a tag on one case', () => {
    const week = weekOffering('full-writeup');
    const partly = makeCase({ date: day(week, 0), overallFeedback: 'x', concepts: 'y', nextFocus: 'z' });
    expect(quest([partly], week, 'full-writeup').done).toBe(false);
    expect(quest([{ ...partly, improvementArea: 'quant' }], week, 'full-writeup').done).toBe(true);
  });
});

describe('quests and XP', () => {
  const twoCases = (week: string) => [makeCase({ date: day(week, 0) }), makeCase({ date: day(week, 1) })];

  it('earns nothing with no cases, and counts finished quests across every week', () => {
    expect(questTotals([])).toEqual({ done: 0, xp: 0 });
    const week = weekOffering('log-two');
    const t = questTotals(twoCases(week));
    expect(t.done).toBeGreaterThanOrEqual(1);
    expect(t.xp).toBe(t.done * QUEST_XP);
  });

  it('is part of the level, and goes if the cases that finished it are deleted', () => {
    const week = weekOffering('log-two');
    const cases = twoCases(week);
    expect(xpBreakdown(cases).quests).toBe(questTotals(cases).xp);
    expect(progressFor(cases).xp).toBe(Object.values(xpBreakdown(cases)).reduce((a, b) => a + b, 0));
    expect(questTotals([cases[0]]).done).toBeLessThan(questTotals(cases).done);
  });
});
