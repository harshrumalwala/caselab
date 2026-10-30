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
  partner: boolean; // who cased you (practice partner / interviewer) on each shared case
  details: boolean; // open everything: scores, feedback, learning notes and other notes on every shared case
}

export const NO_SHARING: SharingPrefs = {
  cases: false,
  overall: false,
  skills: false,
  feedback: false,
  improvement: false,
  notes: false,
  partner: false,
  details: false,
};

export interface Profile {
  userId: string;
  displayName: string;
  /** e.g. "Class of 2027"; empty when not given. */
  mbaClass: string;
  /** Appear in People search (members). */
  listed: boolean;
  /** Also visible to people without an account. Needs `listed`. Free-text fields are never shown to them. */
  publicProfile: boolean;
  /** Visible without an account, but only to people who have this member's profile address. Needs `publicProfile`. */
  publicLinkOnly: boolean;
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
  /** Who cased them; empty unless they chose to share it. */
  partner: string;
  caseType: CaseType;
  industry: string;
  overall: Rating | null;
  skillScores: Partial<Record<SkillKey, Rating>> | null;
  feedback: { overall?: string; skills?: Partial<Record<SkillKey, string>> } | null;
  improvementArea: SkillGroupKey | null;
  notes: { wentWell?: string; struggled?: string; concepts?: string; nextFocus?: string } | null;
  /** The template's free-text "Other" column. Empty unless the member has opened everything. */
  otherNotes: string;
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
  {
    key: 'partner',
    label: 'Who cased me',
    short: 'who cased them',
    hint: "The name of your practice partner or interviewer on each shared case. They haven't agreed to be listed, so keep this off unless you're sure.",
    needsCases: true,
  },
  {
    key: 'details',
    label: 'Open everything',
    short: 'all case detail',
    hint: 'Show every detail of each case you share: scores, improvement focus, written feedback, learning notes and your other notes. Visitors can open each case to read it.',
    needsCases: true,
  },
];

/** The switches that "Open everything" turns on for you. */
export const INCLUDED_IN_DETAILS: (keyof SharingPrefs)[] = ['overall', 'skills', 'feedback', 'improvement', 'notes'];

/**
 * What a visitor without an account can see. Written feedback, learning notes and other notes are theirs to see
 * only when the member has opened everything.
 */
export const PUBLIC_SHARING_KEYS: (keyof SharingPrefs)[] = ['cases', 'overall', 'skills', 'improvement', 'partner', 'details'];

/** Like sharingSummary, but only the parts visitors without an account can actually see. */
export function publicSharingSummary(sharing: SharingPrefs): string {
  return sharingSummary({ ...NO_SHARING, ...Object.fromEntries(PUBLIC_SHARING_KEYS.map((k) => [k, sharing[k]])) } as SharingPrefs);
}

/** "case history and overall scores", or "nothing" when nothing is on. */
export function sharingSummary(sharing: SharingPrefs): string {
  // "Open everything" covers the single detail switches, so they aren't listed separately when it is on.
  const on = SHARING_OPTIONS.filter((o) => sharing[o.key] && !(sharing.details && INCLUDED_IN_DETAILS.includes(o.key))).map((o) => o.short);
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
      partner: s.partner,
      overall: s.overall,
      overallFeedback: '',
      skills,
      wentWell: '',
      struggled: '',
      concepts: '',
      nextFocus: '',
      improvementArea: s.improvementArea,
      otherNotes: s.otherNotes,
      shareMode: 'profile',
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
}
