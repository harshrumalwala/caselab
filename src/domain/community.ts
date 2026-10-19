import type { CaseType, Rating, SkillGroupKey, SkillKey } from './constants';
import { emptySkills } from './factory';
import type { CaseRecord } from './types';

/** The six profile-wide sharing switches. All off until a member opts in. */
export interface SharingPrefs {
  cases: boolean; // case name, source, industry, type, date
  overall: boolean; // overall score of each shared case
  skills: boolean; // per-skill scores of each shared case
  feedback: boolean; // written feedback received
  improvement: boolean; // improvement-focus tag of each shared case
  notes: boolean; // went well / struggled / concepts / next focus
}

export const NO_SHARING: SharingPrefs = {
  cases: false,
  overall: false,
  skills: false,
  feedback: false,
  improvement: false,
  notes: false,
};

export interface Profile {
  userId: string;
  displayName: string;
  /** e.g. "Class of 2027"; empty when not given. */
  mbaClass: string;
  /** Appear in People search. */
  listed: boolean;
  sharing: SharingPrefs;
}

export type ProfileInput = Omit<Profile, 'userId'>;

/** One case as another member sees it: exactly the row the database serves, nothing derived from private data. */
export interface SharedCase {
  caseId: string;
  ownerId: string;
  date: string;
  title: string;
  source: string;
  caseType: CaseType;
  industry: string;
  overall: Rating | null;
  skillScores: Partial<Record<SkillKey, Rating>> | null;
  feedback: { overall?: string; skills?: Partial<Record<SkillKey, string>> } | null;
  improvementArea: SkillGroupKey | null;
  notes: { wentWell?: string; struggled?: string; concepts?: string; nextFocus?: string } | null;
}

/** The labelled switches, in the order they are shown. Shared by settings, onboarding and profile pages. */
export const SHARING_OPTIONS: {
  key: keyof SharingPrefs;
  label: string;
  short: string;
  hint: string;
  /** Needs case-history sharing to have any effect. */
  needsCases: boolean;
}[] = [
  {
    key: 'cases',
    label: 'Case history',
    short: 'case history',
    hint: 'Case name, source, industry, type and date.',
    needsCases: false,
  },
  {
    key: 'overall',
    label: 'Overall scores',
    short: 'overall scores',
    hint: 'Your overall 1–5 rating for each shared case.',
    needsCases: true,
  },
  {
    key: 'skills',
    label: 'Skill scores',
    short: 'skill scores',
    hint: 'Your framework, quant, exhibits, brainstorm and other skill ratings.',
    needsCases: true,
  },
  {
    key: 'feedback',
    label: 'Written feedback',
    short: 'written feedback',
    hint: 'The feedback you received on overall performance and each skill.',
    needsCases: true,
  },
  {
    key: 'improvement',
    label: 'Improvement focus',
    short: 'improvement focus',
    hint: 'The "main thing to improve" you tagged on each shared case.',
    needsCases: true,
  },
  {
    key: 'notes',
    label: 'Learning notes',
    short: 'learning notes',
    hint: 'What went well, what you struggled with, concepts learned and next focus.',
    needsCases: true,
  },
];

/** "case history and overall scores", or "nothing" when nothing is on. */
export function sharingSummary(sharing: SharingPrefs): string {
  const on = SHARING_OPTIONS.filter((o) => sharing[o.key]).map((o) => o.short);
  if (on.length === 0) return 'nothing yet';
  if (on.length === 1) return on[0];
  return `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}`;
}

/**
 * Shared rows as CaseRecord-shaped objects, so the personal calculation code (averages that ignore
 * unrated skills, trends) can summarise what someone chose to share. Hidden fields stay unrated.
 */
export function sharedToRecords(shared: SharedCase[]): CaseRecord[] {
  return shared.map((s) => {
    const skills = emptySkills();
    for (const [key, rating] of Object.entries(s.skillScores ?? {})) {
      skills[key as SkillKey].rating = rating as Rating;
    }
    const stamp = `${s.date}T12:00:00.000Z`;
    return {
      id: s.caseId,
      date: s.date,
      title: s.title,
      source: s.source,
      caseType: s.caseType,
      industry: s.industry,
      partner: '',
      overall: s.overall,
      overallFeedback: '',
      skills,
      wentWell: '',
      struggled: '',
      concepts: '',
      nextFocus: '',
      improvementArea: s.improvementArea,
      otherNotes: '',
      shareMode: 'profile',
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
}
