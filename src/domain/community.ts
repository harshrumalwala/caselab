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
  burned: boolean; // also show burned books and cases to visitors without an account (members always see them)
  interviewed: boolean; // show other members the cases I have interviewed (members only, never who or my notes)
  level: boolean; // show other members my level and job title (members only, nothing else about my progress). On by default for new profiles
}

/** A case worked through on its own, and the book it came from (which may be blank). */
export interface BurnedCase {
  title: string;
  book: string;
}

/** Burned cases grouped by book (no-book last), books A to Z, in the order they were added within a book. */
export function groupBurnedCases(cases: readonly BurnedCase[]): [string, BurnedCase[]][] {
  const byBook = new Map<string, BurnedCase[]>();
  for (const c of cases) byBook.set(c.book, [...(byBook.get(c.book) ?? []), c]);
  return [...byBook.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
}

export const MAX_BURNED_CASES = 300;
export const MAX_BURNED_TITLE = 200;

/** One title per line; bullets and numbering ("- ", "3. ", "• ") are dropped, blanks are ignored. */
export function parseBurnedTitles(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

/** A tidy list: trimmed, cut to length, no repeats (same title and book, ignoring case), at most 300. */
export function normalizeBurnedCases(items: readonly BurnedCase[]): BurnedCase[] {
  const seen = new Set<string>();
  const out: BurnedCase[] = [];
  for (const raw of items) {
    const title = raw.title.trim().slice(0, MAX_BURNED_TITLE).trim();
    const book = raw.book.trim().slice(0, MAX_BOOK_NAME).trim();
    const key = `${title.toLowerCase()}|${book.toLowerCase()}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, book });
  }
  return out.slice(0, MAX_BURNED_CASES);
}

export const MAX_BURNED_BOOKS = 40;
export const MAX_BOOK_NAME = 100;

/** A tidy list of casebook names: trimmed, no blanks, no repeats (ignoring case), each cut to length, at most 40. */
export function normalizeBurnedBooks(books: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of books) {
    const name = raw.trim().slice(0, MAX_BOOK_NAME).trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, MAX_BURNED_BOOKS);
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
  burned: false,
  interviewed: false,
  level: false,
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
  /** Casebooks this member has already burned (for example solo). Others picking a case for them skip these. */
  burnedBooks: string[];
  /** Individual cases they've burned. Not practice cases: kept apart from the case log, so they never count in any total. */
  burnedCases: BurnedCase[];
  sharing: SharingPrefs;
  /**
   * The level this member shows other members (1 to 30), only while `sharing.level` is on; otherwise null. It is a badge the app keeps
   * up to date from their cases, not something they type, so it is not part of what the profile form saves.
   */
  level?: number | null;
}

export type ProfileInput = Omit<Profile, 'userId' | 'level'>;

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
  {
    key: 'interviewed',
    label: 'Interviewed cases',
    short: 'interviewed cases',
    hint: "Show other members how many cases you've interviewed, with each one's title, book, type and industry, so they know whom to ask. Never who you interviewed or what you told them. Members only, not visitors.",
    needsCases: false,
  },
  {
    key: 'level',
    label: 'Level',
    short: 'level',
    hint: 'Show other members your level and job title (for example "Associate, level 8") next to your name. Just that: never your XP, cases, scores, medals or stickers. It is a badge, kept up to date from your cases. Members only, not visitors.',
    needsCases: false,
  },
  {
    key: 'burned',
    label: 'Show burned books and cases to visitors',
    short: 'burned books and cases',
    hint: "Members can always see the books and cases you've burned. Turn this on to show them to visitors without an account too (only if you're visible without one).",
    needsCases: false,
  },
];

/** The switches that "Open everything" turns on for you. */
export const INCLUDED_IN_DETAILS: (keyof SharingPrefs)[] = ['overall', 'skills', 'feedback', 'improvement', 'notes'];

/**
 * What a visitor without an account can see. Written feedback, learning notes and other notes are theirs to see
 * only when the member has opened everything.
 */
export const PUBLIC_SHARING_KEYS: (keyof SharingPrefs)[] = ['cases', 'overall', 'skills', 'improvement', 'partner', 'details', 'burned'];

/** Like sharingSummary, but only the parts visitors without an account can actually see. */
export function publicSharingSummary(sharing: SharingPrefs): string {
  return sharingSummary({ ...NO_SHARING, ...Object.fromEntries(PUBLIC_SHARING_KEYS.map((k) => [k, sharing[k]])) } as SharingPrefs);
}

/** What is switched on, in short phrases ("case history", "overall scores"), for a sentence or a row of chips. */
export function sharedParts(sharing: SharingPrefs): string[] {
  // "Open everything" covers the single detail switches, so they aren't listed separately when it is on.
  return SHARING_OPTIONS.filter((o) => sharing[o.key] && !(sharing.details && INCLUDED_IN_DETAILS.includes(o.key))).map((o) => o.short);
}

/** "case history and overall scores", or "nothing" when nothing is on. */
export function sharingSummary(sharing: SharingPrefs): string {
  const on = sharedParts(sharing);
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
