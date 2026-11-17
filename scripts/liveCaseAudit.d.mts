import type { buildPlan, isInterviewerSideExhibit } from '../supabase/functions/_shared/liveCase';
import type { givenOnRequest, isFullSolution, planFor, readSolution } from '../supabase/functions/_shared/liveCaseCoach';
import type { ExhibitLimits, parseBookSolution, parseSolutionExhibit } from '../src/domain/bookSolution';
import type { ExhibitLoss, exhibitLoss } from '../src/domain/exhibitFidelity';

/** The real rules the report applies: the same functions the Edge Function and the screen use, never a copy of them. */
export interface AuditRules {
  isInterviewerSideExhibit: typeof isInterviewerSideExhibit;
  buildPlan: typeof buildPlan;
  readSolution: typeof readSolution;
  isFullSolution: typeof isFullSolution;
  givenOnRequest: typeof givenOnRequest;
  planFor: typeof planFor;
  parseBookSolution: typeof parseBookSolution;
  parseSolutionExhibit: typeof parseSolutionExhibit;
  exhibitLoss: typeof exhibitLoss;
  LIVE_EXHIBIT_LIMITS: ExhibitLimits;
}

/** How much of a write-up each parser cap keeps, measured from `parseBookSolution` rather than written down. */
export interface Caps {
  exhibits: number;
  columns: number;
  rows: number;
  points: number;
  series: number;
  panels: number;
  structure: number;
  clarifyingQuestions: number;
  takeaways: number;
}

export type AuditFlag =
  | 'not_live_eligible'
  | 'full_solution_refused'
  | 'fewer_than_2_beats'
  | 'candidate_exhibit_empty'
  | 'cut_by_parser_cap'
  | 'all_exhibits_hidden'
  | 'exhibit_not_whole'
  | 'exhibit_text_shortened';

export interface ShownExhibit {
  /** Its place in the write-up's own list of exhibits, from 1. */
  index: number;
  title: string;
  /** The chart the member will see ('bar', 'line (3 panels)', ...), or '' when none is drawn. */
  chart: string;
  chartInWriteUp: boolean;
  empty: boolean;
}

export interface HiddenExhibit {
  index: number;
  title: string;
  /** Which parts of `isInterviewerSideExhibit` caught it: 'title', 'caption', 'column', 'cell'. */
  rules: string[];
  class: 'reference' | 'onRequest';
}

/** One exhibit's trip from the write-up to the screen, on both the screens that draw one. Only exhibits that lost something appear. */
export interface ExhibitFidelity {
  index: number;
  title: string;
  /** False when the live case keeps this exhibit back: only the Full solution screen draws it. */
  candidate: boolean;
  live: ExhibitLoss;
  full: ExhibitLoss;
}

export interface CaseAudit {
  name: string;
  book: string;
  eligible: boolean;
  /** Why not, when it is not eligible (descriptive; `isFullSolution` is what decides). */
  reasons: string[];
  beats: { total: number; exhibits: number; steps: number; hasBrainstorm: boolean };
  exhibits: { inWriteUp: number; read: number; shown: number; hidden: number };
  shown: ShownExhibit[];
  hidden: HiddenExhibit[];
  /** The write-up against the render, for every exhibit that lost something on the way. */
  fidelity: ExhibitFidelity[];
  /** What a parser cap cuts, as counts only. */
  cuts: string[];
  flags: AuditFlag[];
}

export interface AuditResult {
  cases: CaseAudit[];
  folded: { name: string; keptName: string }[];
  caps: Caps;
  read: number;
}

export interface AuditSummary {
  exhibitsCompared: number;
  notWholeLive: number;
  notWholeFull: number;
  notWhole: number;
  shortened: number;
  lostBy: Map<string, number>;
  shortenedBy: Map<string, number>;
  read: number;
  folded: number;
  audited: number;
  eligible: number;
  notEligible: number;
  reasons: Map<string, number>;
  exhibitsInWriteUps: number;
  exhibitsRead: number;
  exhibitsNotEligible: number;
  shown: number;
  hidden: number;
  hiddenReference: number;
  hiddenOnRequest: number;
  hiddenByRule: Map<string, number>;
  chartsDrawn: number;
  chartsNotDrawn: number;
  chartsLost: number;
  chartKinds: Map<string, number>;
  noCandidateExhibit: number;
  beats: Map<number, number>;
  beatsExhibit: number;
  beatsStep: number;
  bothKinds: number;
  flags: Map<AuditFlag, number>;
  flagged: number;
  caps: Caps;
}

export const FLAGS: AuditFlag[];
/** The one flag `npm run audit:live` exits non-zero on. */
export const BREACH: 'exhibit_not_whole';
export const CAP_LABEL: Record<keyof Caps, string>;
export function lossKind(line: string): string;

export function loadRules(): Promise<AuditRules>;
export function measureCaps(rules: Pick<AuditRules, 'parseBookSolution'>): Caps;
export function auditCase(raw: unknown, rules: AuditRules, caps: Caps): CaseAudit;
export function audit(entries: unknown[], rules: AuditRules, caps?: Caps): AuditResult;
export function summarise(result: AuditResult): AuditSummary;
export function formatSummary(summary: AuditSummary): string;
export function formatReport(result: AuditResult, meta: { dir: string; files: number; at: string }): string;
export function readSolutionFiles(dir: string): { files: string[]; entries: Record<string, unknown>[]; broken: string[] };
