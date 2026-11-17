import type { CaseType, Rating, ShareMode, SkillGroupKey, SkillKey } from './constants';

export interface SkillEntry {
  /** 1-5, or null when the skill was not tested / not rated. */
  rating: Rating | null;
  feedback: string;
}

export interface CaseRecord {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  title: string;
  source: string;
  caseType: CaseType;
  /** '' means "not specified" (only produced by the MCG Excel import). */
  industry: string;
  /** Interviewer / practice partner. */
  partner: string;
  overall: Rating | null;
  overallFeedback: string;
  skills: Record<SkillKey, SkillEntry>;
  wentWell: string;
  struggled: string;
  /** Business concepts learned; feeds the Knowledge & Learning History. */
  concepts: string;
  nextFocus: string;
  /** Optional explicit "main thing to improve" tag. */
  improvementArea: SkillGroupKey | null;
  /** The template's free-text "Other" column. Never shared with other members. */
  otherNotes: string;
  /** Per-case sharing override; 'profile' follows the Profile & privacy switches. */
  shareMode: ShareMode;
  /** The casebook library case this was picked from (a search in Log case), if any. Private like the rest of the case. */
  libraryId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the form edits: a case without bookkeeping fields. */
export type CaseInput = Omit<CaseRecord, 'id' | 'createdAt' | 'updatedAt'>;

/** A user-maintained entry, mirroring the two columns of the MCG "Opportunity Areas" tab. */
export interface OpportunityItem {
  id: string;
  kind: 'exposure' | 'skill';
  text: string;
  createdAt: string;
}

export const SCHEMA_VERSION = 1;

export interface AppData {
  schemaVersion: number;
  cases: CaseRecord[];
  opportunities: OpportunityItem[];
  /** Derived from cases (industries outside the preset list); never stored on its own. */
  customIndustries: string[];
}

/** How you like to meet, in your own backup. Only ever your own: nobody else's is readable to put in it. */
export interface BackupMeeting {
  link: string;
  timeZone: string;
}

/** The JSON backup file wraps AppData with a little provenance. */
export interface BackupFile {
  app: 'caselab';
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
  /** Left out when there is nothing to put in it, and absent from every file written before it existed. */
  meeting?: BackupMeeting;
}
