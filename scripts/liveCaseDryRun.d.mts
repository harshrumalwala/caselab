import type { LiveSolution, PublicExhibit, handleLive, isFullSolution, readSolution } from '../supabase/functions/_shared/liveCaseCoach';
import type { BeatOutcome, LiveMode, NudgeLevel, PLANNED_MS, Stage, StageLogEntry, isInterviewerSideExhibit, nudgeLevel, timeInStages } from '../supabase/functions/_shared/liveCase';
import type { createMemoryLiveDeps } from '../src/test/memoryLiveDeps';

/** The real engine the dry run plays: the same functions the Edge Function runs, never a copy of them. */
export interface DryRunEngine {
  handleLive: typeof handleLive;
  isFullSolution: typeof isFullSolution;
  readSolution: typeof readSolution;
  isInterviewerSideExhibit: typeof isInterviewerSideExhibit;
  nudgeLevel: typeof nudgeLevel;
  timeInStages: typeof timeInStages;
  PLANNED_MS: typeof PLANNED_MS;
  createMemoryLiveDeps: typeof createMemoryLiveDeps;
}

export type CandidateName = 'brisk' | 'passive' | 'offtrack' | 'asker' | 'plausible';

/** What a scripted candidate pretends. This is the harness's only piece of pretending; everything else is the engine's. */
export interface CandidateSpec {
  what: string;
  /** False for a candidate who writes nothing and presses nothing: only the clock can carry their case. */
  acts: boolean;
  thinkMs: number;
  clarifyQuestions: number;
  directionClear: boolean;
  /** What the stub sends back for a turn on a beat. */
  exhibit: { assessment: 'progress' | 'partial' | 'stuck' | 'unclear'; beatComplete: boolean };
  /** How many messages on one beat the harness allows before it gives up (the engine has no such limit). */
  beatCap?: number;
  /** Which of `WRITES` this candidate sends on a beat, when it is not the shared one. */
  writes?: 'exhibit' | 'plausible';
  /** Whether this candidate can end a beat by itself, by completing it or by choosing "move on". */
  endsBeats: boolean;
  /** What the candidate does next on the beat it is on, given how many times it has written there. */
  beat: (written: number) => 'write' | 'moveOn' | 'wait' | 'nothing';
}

export interface StageTime {
  stage: Stage;
  seconds: number;
  endedBy: StageLogEntry['endedBy'];
  /** The seconds the plan gave this stage (0 where the plan gives none). */
  planned: number;
}

export interface DryRun {
  mode: LiveMode;
  candidate: CandidateName;
  /** Where the case finished: 'done' is the bar. */
  stage: Stage;
  endReason: 'completed' | 'time_limit' | 'ended_early' | null;
  /** The case stopped moving with nothing left for the member to do. */
  stalled: boolean;
  /** How many times the candidate wrote on one beat before the harness gave up on it (0 when it never did). */
  exhausted: number;
  cappedOut: boolean;
  threw: boolean;
  error: string | null;
  /** How many exhibits the member was handed, counted from what arrived rather than from the plan. */
  exhibitsShown: number;
  /** Anything of an interviewer-side exhibit that reached the member. Must stay empty. */
  leaks: string[];
  steps: number;
  coachCalls: number;
  /** Everything the engine refused, as it was said to the member. */
  refusals: string[];
  /** The nudge rung every message on a beat was answered at, in order. */
  rungs: NudgeLevel[];
  /** Replies the clock asked for without the member writing (must stay 0). */
  unprompted: number;
  reachedRecommendWrite: boolean;
  feedback: boolean;
  beatsTotal: number;
  beats: { outcome: BeatOutcome; hints: number }[];
  stages: StageTime[];
  seconds: number;
  limitSeconds: number;
}

export interface DryRunCase {
  name: string;
  book: string;
  beats: number;
  runs: DryRun[];
}

export interface DryRunResult {
  cases: DryRunCase[];
  folded: { name: string; keptName: string }[];
  skipped: { name: string; book: string }[];
  read: number;
  modes: LiveMode[];
  candidates: CandidateName[];
}

export interface DryRunSummary {
  read: number;
  folded: number;
  cases: number;
  skipped: number;
  runs: number;
  done: number;
  /** Runs that did not reach the end, failures and open-by-design together. */
  short: number;
  /** Runs that did not reach the end and that the engine did not mean to leave there: what the command exits non-zero on. */
  failed: number;
  byDesign: number;
  threw: number;
  stalled: number;
  /** Runs where an interviewer-side exhibit reached the member. Must be 0. */
  leaked: number;
  exhibitsDelivered: number;
  /** 'mode/candidate' to how many of its runs reached the end. */
  cells: Map<string, { of: number; done: number }>;
  endStates: Map<string, number>;
  causes: Map<string, number>;
  byDesignCauses: Map<string, number>;
  beatsPlanned: number;
  beatsReached: number;
  outcomes: Map<BeatOutcome, number>;
  everyBeat: number;
  withBeats: number;
  rungs: Map<NudgeLevel, number>;
  hints: number;
  hinted: number;
  recommendReached: number;
  recommendInTime: number;
  hitLimit: number;
  overPlan: Map<Stage, number>;
  refusals: Map<string, number>;
  unprompted: number;
  feedback: number;
  coachCalls: number;
}

export interface PlayOptions {
  modes?: LiveMode[];
  candidates?: CandidateName[];
  /** Only the first N live-eligible cases, in the report's own order. */
  limit?: number;
  onCase?: (one: DryRunCase, index: number, total: number) => void;
}

export const START_AT: number;
export const MODES: LiveMode[];
export const CANDIDATES: CandidateName[];
export const BEAT_OUTCOMES: BeatOutcome[];
export const RUNGS: NudgeLevel[];
export const CANDIDATE_SPECS: Record<CandidateName, CandidateSpec>;

export function loadEngine(): Promise<DryRunEngine>;
export function exhibitLeaks(
  delivered: PublicExhibit[],
  texts: string[],
  solution: LiveSolution,
  isInterviewerSide: typeof isInterviewerSideExhibit,
): string[];
export function stubModel(spec: CandidateSpec): (kind: string) => unknown;
export function playCase(raw: unknown, mode: LiveMode, candidate: CandidateName, engine: DryRunEngine, startAt?: number): Promise<DryRun>;
export function playAll(entries: unknown[], engine: DryRunEngine, options?: PlayOptions): Promise<DryRunResult>;
export function failureCause(run: DryRun): string;
export function reachedEnd(run: DryRun): boolean;
export function openByDesign(run: DryRun): boolean;
export function failedTheBar(run: DryRun): boolean;
export function summarise(result: DryRunResult): DryRunSummary;
export function formatSummary(summary: DryRunSummary, result: DryRunResult): string;
export function formatReport(result: DryRunResult, meta: { dir: string; files: number; at: string; seconds: number }): string;
