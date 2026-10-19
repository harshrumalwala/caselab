import type { CaseType, Rating, SkillKey } from '../domain/constants';
import { emptyAppData, emptySkills } from '../domain/factory';
import type { AppData, CaseRecord } from '../domain/types';

/** Wednesday 21 Oct 2026, local noon. Its calendar week runs Mon 19 Oct to Sun 25 Oct. */
export const NOW = new Date(2026, 9, 21, 12, 0, 0);

let counter = 0;

export interface CaseOverrides extends Partial<Omit<CaseRecord, 'skills'>> {
  skills?: Partial<Record<SkillKey, Rating | null>>;
}

export function makeCase(overrides: CaseOverrides = {}): CaseRecord {
  counter += 1;
  const { skills: skillRatings, ...rest } = overrides;
  const skills = emptySkills();
  for (const [key, rating] of Object.entries(skillRatings ?? {})) {
    skills[key as SkillKey] = { rating: rating ?? null, feedback: '' };
  }
  const stamp = `2026-10-01T10:${String(counter % 60).padStart(2, '0')}:00.000Z`;
  return {
    id: `case-${counter}`,
    date: '2026-10-01',
    title: `Case ${counter}`,
    source: '',
    caseType: 'Profitability' as CaseType,
    industry: 'Technology / SaaS',
    partner: '',
    overall: null,
    overallFeedback: '',
    skills,
    wentWell: '',
    struggled: '',
    concepts: '',
    nextFocus: '',
    improvementArea: null,
    otherNotes: '',
    shareMode: 'profile',
    createdAt: stamp,
    updatedAt: stamp,
    ...rest,
  };
}

/** n cases on consecutive days (oldest first) with the given framework ratings. */
export function casesWithRatings(key: SkillKey, ratings: (Rating | null)[], caseTypes?: CaseType[]): CaseRecord[] {
  return ratings.map((rating, i) =>
    makeCase({
      date: `2026-09-${String(10 + i).padStart(2, '0')}`,
      caseType: caseTypes?.[i] ?? (['Profitability', 'Market Entry', 'Revenue', 'Cost Reduction'][i % 4] as CaseType),
      overall: 3,
      skills: { [key]: rating },
    }),
  );
}

export function appDataWith(cases: CaseRecord[]): AppData {
  return { ...emptyAppData(), cases };
}

/** A case that exercises every field, used for lossless export/import checks. */
export function richCase(): CaseRecord {
  const skills = emptySkills();
  skills.behavioral1 = { rating: 4, feedback: 'Strong story, "quoted" detail' };
  skills.behavioral2 = { rating: 3, feedback: 'Second story\nwas weaker, with a comma' };
  skills.prompt = { rating: 5, feedback: 'Clarified well' };
  skills.framework = { rating: 2, feedback: 'Not MECE' };
  skills.quant = { rating: null, feedback: 'Not tested' };
  skills.exhibits = { rating: 3, feedback: '' };
  skills.brainstorm = { rating: 4, feedback: 'Bucketed ideas' };
  skills.recommendation = { rating: 1, feedback: 'Ran out of time' };
  return {
    id: 'rich-1',
    date: '2026-10-12',
    title: 'Airline, "Alpha" profitability',
    source: 'Booth casebook',
    caseType: 'Profitability',
    industry: 'Aerospace & Defense',
    partner: 'Alex',
    overall: 4,
    overallFeedback: 'Solid overall',
    skills,
    wentWell: 'Clear structure',
    struggled: 'Math under pressure',
    concepts: 'Load factor\nCost per available seat mile',
    nextFocus: 'Slow down on the quant setup',
    improvementArea: 'quant',
    otherNotes: 'Unicode: café – naïve',
    shareMode: 'history',
    createdAt: '2026-10-12T15:00:00.000Z',
    updatedAt: '2026-10-12T16:30:00.000Z',
  };
}
