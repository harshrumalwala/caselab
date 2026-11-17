import { describe, expect, it } from 'vitest';
import type { Rating, SkillKey } from './constants';
import { NO_SHARING, publicSharingSummary, sharingSummary, type SharedCase, type SharingPrefs } from './community';
import { MIN_CASES_FOR_SKILL_INSIGHTS } from './improvement';
import { MAX_SHARPENING, publicSharpening, sharingShown, sharpeningShown } from './sharpening';

/** One shared case, as `public_person_cases(id)` hands it over, with whichever skill scores we want. */
const shared = (id: number, skills: Partial<Record<SkillKey, Rating>> | null, over: Partial<SharedCase> = {}): SharedCase => ({
  caseId: `c${id}`,
  ownerId: 'bob',
  date: `2026-10-${String(id).padStart(2, '0')}`,
  title: `Case ${id}`,
  source: '',
  partner: '',
  caseType: 'Profitability',
  industry: 'Technology / SaaS',
  overall: 4,
  skillScores: skills,
  feedback: null,
  improvementArea: null,
  notes: null,
  otherNotes: '',
  ...over,
});

/** `n` cases rating every named skill the same each time. */
const run = (n: number, skills: Partial<Record<SkillKey, Rating>>, over: Partial<SharedCase> = {}, from = 1) =>
  Array.from({ length: n }, (_, i) => shared(from + i, skills, over));

const names = (list: { label: string }[]) => list.map((s) => s.label);

describe('what a member is sharpening, from the scores they share', () => {
  it('names the weak skills as sharpening and the strong ones as strong', () => {
    const view = publicSharpening(run(4, { quant: 2, framework: 5 }));
    expect(names(view.sharpen)).toEqual(['Quant / Math']);
    expect(names(view.strengths)).toEqual(['Framework']);
    expect(view.rated).toBe(4);
  });

  it('leaves the middle alone: a skill that is neither being worked on nor strong is on no list', () => {
    // Exhibits alternates 3 and 4, so it averages 3.5: above the Improvement screen's threshold, below the strong band.
    const cases = [3, 4, 3, 4].map((rating, i) => shared(i + 1, { exhibits: rating as Rating, quant: 2 }));
    const view = publicSharpening(cases);
    expect(names(view.sharpen)).toEqual(['Quant / Math']);
    expect(names(view.strengths)).toEqual([]);
  });

  it('names at most three on each side, however many skills qualify', () => {
    const view = publicSharpening(run(4, { quant: 1, framework: 2, exhibits: 2, brainstorm: 3, prompt: 5, recommendation: 5, behavioral1: 5, behavioral2: 5 }));
    expect(view.sharpen).toHaveLength(MAX_SHARPENING);
    expect(view.strengths).toHaveLength(MAX_SHARPENING);
    expect(names(view.sharpen)).toEqual(['Quant / Math', 'Framework', 'Exhibits & Charts']); // worst first, the Improvement screen's own order
  });

  it('never ranks all eight: a skill is on one side, the other, or neither', () => {
    const view = publicSharpening(run(5, { quant: 2, framework: 5, exhibits: 3, brainstorm: 4 }));
    const all = [...names(view.sharpen), ...names(view.strengths)];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeLessThan(8);
  });

  it('hands back names only, so there is no number for a reader to take as a grade', () => {
    const view = publicSharpening(run(4, { quant: 2, framework: 5 }));
    for (const skill of [...view.sharpen, ...view.strengths]) {
      expect(Object.keys(skill).sort()).toEqual(['key', 'label']);
      expect(JSON.stringify(skill)).not.toMatch(/\d/);
    }
  });

  it('says nothing at all below the minimum number of rated cases', () => {
    const under = publicSharpening(run(MIN_CASES_FOR_SKILL_INSIGHTS - 1, { quant: 1, framework: 5 }));
    expect(under).toEqual({ rated: 0, sharpen: [], strengths: [] });
    const at = publicSharpening(run(MIN_CASES_FOR_SKILL_INSIGHTS, { quant: 1, framework: 5 }));
    expect(at.rated).toBe(MIN_CASES_FOR_SKILL_INSIGHTS);
    expect(names(at.sharpen)).toEqual(['Quant / Math']);
  });

  it('counts only the cases that carry a score: a long log of unrated cases says nothing', () => {
    expect(publicSharpening(run(20, {}))).toEqual({ rated: 0, sharpen: [], strengths: [] });
    expect(publicSharpening(run(20, null as never))).toEqual({ rated: 0, sharpen: [], strengths: [] });
  });

  it('says nothing about a skill scored on fewer cases than the minimum, even when the rest are rated', () => {
    const view = publicSharpening([...run(6, { framework: 5 }), ...run(2, { quant: 1 }, {}, 7)]);
    expect(names(view.strengths)).toEqual(['Framework']);
    expect(names(view.sharpen)).toEqual([]); // two rough Quant cases are not a verdict on their Quant
  });

  it('is empty when the member shares no skill scores, whatever else they share', () => {
    const noScores = run(10, {}, { improvementArea: 'quant', overall: 2 });
    expect(publicSharpening(noScores)).toEqual({ rated: 0, sharpen: [], strengths: [] });
  });

  it('reads the two behavioral fields as one skill, the way the rest of the product does', () => {
    const view = publicSharpening(run(4, { behavioral1: 5, behavioral2: 5, quant: 2 }));
    expect(names(view.strengths)).toEqual(['Behavioral']);
    expect(names(view.sharpen)).toEqual(['Quant / Math']);
  });

  it('keeps a skill they tagged themselves on the sharpening side rather than calling it strong', () => {
    // Strong scores, but they named Framework as the thing to improve on most of their recent cases.
    const view = publicSharpening(run(5, { framework: 4, quant: 5 }, { improvementArea: 'framework' }));
    expect(names(view.sharpen)).toEqual(['Framework']);
    expect(names(view.strengths)).toEqual(['Quant / Math']);
  });

  it('ignores a tagged skill it has no scores for: the summary is about the scores they share', () => {
    const view = publicSharpening(run(5, { quant: 5 }, { improvementArea: 'brainstorm' }));
    expect(names(view.sharpen)).toEqual([]);
    expect(names(view.strengths)).toEqual(['Quant / Math']);
  });

  it('is empty for a member who shares nothing', () => {
    expect(publicSharpening([])).toEqual({ rated: 0, sharpen: [], strengths: [] });
  });
});

describe('the line at the top of a profile, worded from what the page carries', () => {
  /** Someone sharing their case history, their overall scores, their skill scores and the summary. */
  const SHARER: SharingPrefs = { ...NO_SHARING, cases: true, overall: true, skills: true, sharpening: true };
  /** Four rated cases: enough for the summary to name Quant and Framework. */
  const ENOUGH = run(4, { quant: 2, framework: 5 });
  /** Two of the same: under MIN_CASES_FOR_SKILL_INSIGHTS, so the card names nothing and renders nothing. */
  const TOO_FEW = ENOUGH.slice(0, 2);

  it('claims the summary to a link holder who has it in front of them', () => {
    expect(sharpeningShown(SHARER, ENOUGH, 'visitor')).toBe(true);
    expect(publicSharingSummary(sharingShown(SHARER, ENOUGH, 'visitor'))).toBe("case history, overall scores, skill scores and what they're sharpening");
  });

  it('says nothing of it below the minimum, where the switch is on and the card is not there', () => {
    expect(publicSharpening(TOO_FEW).rated).toBeLessThan(MIN_CASES_FOR_SKILL_INSIGHTS);
    expect(sharpeningShown(SHARER, TOO_FEW, 'visitor')).toBe(false);
    expect(publicSharingSummary(sharingShown(SHARER, TOO_FEW, 'visitor'))).toBe('case history, overall scores and skill scores');
  });

  it('says nothing of it when every shared score sits in the middle and no skill stands out', () => {
    const middling = [3, 4, 3, 4].map((rating, i) => shared(i + 1, { framework: rating as Rating }));
    expect(publicSharpening(middling)).toMatchObject({ sharpen: [], strengths: [] });
    expect(sharpeningShown(SHARER, middling, 'visitor')).toBe(false);
  });

  it('says nothing of it when the member shares no skill scores for it to read', () => {
    const unrated = ENOUGH.map((c) => ({ ...c, skillScores: null }));
    expect(sharpeningShown({ ...SHARER, skills: false }, unrated, 'visitor')).toBe(false);
    expect(publicSharingSummary(sharingShown({ ...SHARER, skills: false }, unrated, 'visitor'))).toBe('case history and overall scores');
  });

  it('says nothing of it with the switch off, however many scores there are', () => {
    const off = { ...SHARER, sharpening: false };
    expect(sharpeningShown(off, ENOUGH, 'visitor')).toBe(false);
    expect(publicSharingSummary(sharingShown(off, ENOUGH, 'visitor'))).toBe('case history, overall scores and skill scores');
  });

  it('says nothing of it to another member, whose page carries the card in no case', () => {
    expect(sharpeningShown(SHARER, ENOUGH, 'member')).toBe(false);
    expect(sharingSummary(sharingShown(SHARER, ENOUGH, 'member'))).toBe('case history, overall scores and skill scores');
  });

  it('leaves every other switch exactly as it was, and the prefs untouched when nothing changes', () => {
    const everything: SharingPrefs = { ...SHARER, feedback: true, notes: true, improvement: true, partner: true, level: true, interviewed: true, burned: true };
    expect(sharingShown(everything, TOO_FEW, 'visitor')).toEqual({ ...everything, sharpening: false });
    expect(sharingShown(everything, ENOUGH, 'visitor')).toBe(everything); // nothing to correct: the same object back
    const off = { ...everything, sharpening: false };
    expect(sharingShown(off, ENOUGH, 'member')).toBe(off);
  });
});
