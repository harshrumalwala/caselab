import type { buildPlan, isInterviewerSideExhibit } from '../supabase/functions/_shared/liveCase';
import type { givenOnRequest, isFullSolution, planFor, readSolution } from '../supabase/functions/_shared/liveCaseCoach';
import type { ExhibitLimits, parseBookSolution, parseSolutionExhibit } from '../src/domain/bookSolution';

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
  LIVE_EXHIBIT_LIMITS: ExhibitLimits;
}

/** How much of a write-up each parser cap keeps, measured from `parseBookSolution` rather than written down. */
export interface Caps {
  exhibits: number;
  columns: number;
  rows: number;
  points: number;
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
  | 'all_exhibits_hidden';

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
  flags: Map<AuditFlag, number>;
  flagged: number;
  caps: Caps;
}

export const FLAGS: AuditFlag[];
export const CAP_LABEL: Record<keyof Caps, string>;

export function loadRules(): Promise<AuditRules>;
export function measureCaps(rules: Pick<AuditRules, 'parseBookSolution'>): Caps;
export function auditCase(raw: unknown, rules: AuditRules, caps: Caps): CaseAudit;
export function audit(entries: unknown[], rules: AuditRules, caps?: Caps): AuditResult;
export function summarise(result: AuditResult): AuditSummary;
export function formatSummary(summary: AuditSummary): string;
export function formatReport(result: AuditResult, meta: { dir: string; files: number; at: string }): string;
export function readSolutionFiles(dir: string): { files: string[]; entries: Record<string, unknown>[]; broken: string[] };
