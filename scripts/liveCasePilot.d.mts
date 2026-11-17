import type { LiveAction, LiveView, PublicExhibit } from '../supabase/functions/_shared/liveCaseCoach';
import type { Message, Usage } from '../supabase/functions/_shared/liveCase';

/**
 * What the deployed function answered, read defensively: the script is a client and never assumes more of the payload than it uses
 * (the shape it expects is `LiveResponse` in supabase/functions/_shared/liveCaseCoach.ts).
 */
export interface PilotResponse {
  status: string;
  view?: Partial<LiveView> | null;
  message?: string;
}

export const PILOT_DIR: string;
export const DEFAULT_CAP: number;
export const MAX_STARTS_PER_DAY: number;
export const MAX_STARTS_PER_WEEK: number;
export const ACCOUNTS: readonly string[];
export const MODES: readonly string[];
export const TURN_ACTIONS: readonly string[];
export const MODEL_ACTIONS: readonly string[];
export const TRANSCRIPT_WARNING: string;
export const APPROXIMATE_NOTE: string;
export const ATTRIBUTION_NOTE: string;
export const NO_EXHIBIT_SIGNAL: string;
export const LONG_PROMPT_TOKENS: number;
export const RESERVE_FLOOR: number;
export const FINISH_RESERVE_FLOOR: number;
export const EMPTY_USAGE: Usage;

export function callsModel(action: string): boolean;

// Credentials

export function parseEnvFile(text: string | null | undefined): Record<string, string>;

export interface Credentials {
  account: string;
  url: string;
  key: string;
  email: string;
  password: string;
}

export function credentialsFrom(localText: string, e2eText: string, account?: string): Credentials;
export function readCredentials(account?: string, root?: string): Credentials;

// Prices

export interface PriceRow {
  model: string;
  tier: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICES: { haiku: PriceRow; haikuLong: PriceRow; sonnet: PriceRow };

export function readUsage(value: unknown): Usage;
export function usageDelta(before: unknown, after: unknown): Usage;
export function addUsage(a: unknown, b: unknown): Usage;
export function priceUsage(usage: unknown, rates: PriceRow): number;

export interface TurnCost {
  usd: number;
  model: string;
  tier: string;
  /** The turn's prompt (input plus cache reads) passed the higher tier's threshold. */
  overThreshold: boolean;
  /** False when the turn made more than one call: a running total cannot say which prompt was the large one. */
  tierCertain: boolean;
  promptTokens: number;
  approximate: true;
}

export function priceTurn(delta: unknown, options?: { finish?: boolean }): TurnCost;
export function usd(n: number): string;

// The cap

export interface CapDecision {
  allowed: boolean;
  action: string;
  reserve: number;
  spent: number;
  projected: number;
  cap: number;
  message: string;
}

export function reserveFor(action: string, largestTurnUsd?: number): number;
export function capDecision(input: { action: string; spentUsd?: number; largestTurnUsd?: number; cap?: number }): CapDecision;
export function largestTurnCost(transcripts: readonly Transcript[]): number;
export function capFromArgv(argv: readonly string[]): number;

// Reading the sessions

export function isUuid(value: unknown): boolean;
export function parseQueryRows(stdout: string): Record<string, unknown>[];
export function runQuery(sql: string, options?: { workdir?: string; run?: unknown }): Record<string, unknown>[];
export function sessionsSql(userId: string): string;
export function sessionStateSql(userId: string, sessionId: string): string;

export interface SessionRow {
  id: string;
  libraryId: string;
  status: string;
  mode: string;
  usage: Usage;
  createdAt: number;
}

export function readSessionRows(rows: readonly Record<string, unknown>[]): SessionRow[];

export interface StartsLeft {
  today: number;
  week: number;
  leftToday: number;
  leftWeek: number;
  allowed: boolean;
  message: string;
}

export function startsLeft(sessions: readonly { createdAt: number }[], now?: number): StartsLeft;

// Transcripts

export interface TurnRecord {
  n: number;
  at: string;
  do: string;
  text?: string;
  status: string;
  message: string | null;
  stage: string | null;
  frameworkPhase: string | null;
  beatsShown: number | null;
  beatsTotal: number | null;
  stageEndsAt: number | null;
  endsAt: number | null;
  serverNow: number | null;
  sessionStatus: string | null;
  endReason: string | null;
  newMessages: Message[];
  newExhibits: PublicExhibit[];
  usage: { before: Usage; after: Usage; delta: Usage };
  cost: TurnCost | null;
  spentAfterUsd: number;
}

export interface Transcript {
  warning: string;
  version: 1;
  account: string;
  userId: string;
  sessionId: string;
  libraryId: string;
  caseName: string;
  book: string;
  mode: string;
  cap: number;
  startedAt: string;
  turns: TurnRecord[];
  finalView: LiveView | null;
  finalState: Record<string, unknown> | null;
}

export function transcriptName(input: { account: string; caseName: string; mode: string; startedAt: number | string }): string;
export function newTranscript(input: {
  account: string;
  userId: string;
  sessionId: string;
  libraryId: string;
  caseName: string;
  book: string;
  mode: string;
  cap: number;
  startedAt: number | string;
}): Transcript;
export function readTranscripts(dir: string): { path: string; data: Transcript }[];
export function latestTranscript(transcripts: readonly { path: string; data: Transcript }[], account: string): { path: string; data: Transcript } | null;
export function writeTranscript(path: string, data: Transcript): void;

// What was spent

export interface SpendRow {
  id: string;
  caseName: string;
  mode: string;
  status: string;
  usage: Usage;
  turns: number;
  hasTranscript: boolean;
  attributedUsd: number;
  unattributed: Usage;
  unattributedUsd: number;
  usd: number;
}

export interface SpendReport {
  sessions: SpendRow[];
  totalUsd: number;
  unattributedUsd: number;
  approximate: true;
}

export function spendReport(sessions: readonly SessionRow[], transcripts: readonly Transcript[]): SpendReport;
/** The same report, counting one turn that has happened but is not in a transcript on disk yet. */
export function spendWithTurn(input: {
  sessions: readonly SessionRow[];
  transcripts: readonly Transcript[];
  sessionId: string;
  turn: { cost: TurnCost | null; usage: { delta: Usage } };
}): SpendReport;
export function formatPriceTable(): string;
export function formatSpend(report: SpendReport, options?: { cap?: number }): string;

// A script of steps

export interface Step {
  do: string;
  text?: string;
  stage?: string;
  /** Which step of the file this came from (a step with `repeat` becomes several). */
  from: number;
}

export function readScriptSteps(json: unknown): Step[];
export const STAGES_FOR: Record<string, string[]>;
export function stepFitsStage(step: Step, view: Partial<LiveView> | null): string | null;
export function actionFor(step: Step, sessionId: string): LiveAction;
export function stepFromArgv(argv: readonly string[]): Step;

// What the member would have seen

export function diffView(previous: Partial<LiveView> | null, next: Partial<LiveView> | null): { messages: Message[]; exhibits: PublicExhibit[] };
export function formatClock(ms: number): string;
export function chartSummary(chart: unknown): string;
export function formatExhibit(exhibit: Partial<PublicExhibit>): string;
export function formatStageLine(view: Partial<LiveView> | null): string;
export function formatTurn(input: {
  n: number;
  step: { do: string; text?: string };
  response: PilotResponse | null;
  diff: { messages: Message[]; exhibits: PublicExhibit[] };
  cost: TurnCost | null;
  spentUsd: number;
  cap: number;
}): string;
export function turnRecord(input: {
  n: number;
  step: { do: string; text?: string };
  response: PilotResponse | null;
  diff: { messages: Message[]; exhibits: PublicExhibit[] };
  usageBefore: unknown;
  usageAfter: unknown;
  cost: TurnCost | null;
  spentUsd: number;
}): TurnRecord;

// One step against the deployed function

export interface StepState {
  sessionId: string;
  view: Partial<LiveView> | null;
  usage: Usage;
  spentUsd: number;
  largestTurnUsd: number;
  cap: number;
  n: number;
  /** An unattended run stops when a step does not belong where the case stands; a hand-driven one only says so. */
  strict?: boolean;
}

/** One reading of what has been spent: this session's running usage, and everything a spend report is built from. */
export interface SpendRead {
  usage: Usage;
  sessions: readonly SessionRow[];
  transcripts: readonly Transcript[];
}

export interface StepResult {
  misfit?: string | null;
  stopped: 'cap' | 'stage' | 'refused' | null;
  why?: string | null;
  decision?: CapDecision;
  record?: TurnRecord;
  printed?: string;
  response?: PilotResponse;
  cost?: TurnCost | null;
  state: StepState;
}

export function runStep(
  step: Step,
  state: StepState,
  deps: { send: (action: LiveAction) => Promise<PilotResponse>; readSpend: () => Promise<SpendRead> | SpendRead },
): Promise<StepResult>;

// Talking to the project

export function makeSend(client: { functions: { invoke: (name: string, options: { body: unknown }) => Promise<{ data: unknown; error: unknown }> } }): (action: LiveAction) => Promise<PilotResponse>;

export interface CatalogCase {
  id: string;
  name: string;
  book: string;
  school: string;
  year: number;
  caseType: string;
  industry: string;
  cochairPick: boolean;
  done: boolean;
}

export function catalogRow(row: Record<string, unknown>): CatalogCase;
export function filterCatalog(rows: readonly CatalogCase[], book: string): CatalogCase[];
export function formatCatalog(rows: readonly CatalogCase[]): string;

export function main(argv: readonly string[]): Promise<number>;
