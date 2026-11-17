// The live case ("practise a whole case with Bucket"): the clock, the stages and the pacing rules, as plain functions over one saved state.
//
// The app and this file decide WHEN things happen: which stage the member is in, how long it lasts, when a hint is due, when the next exhibit
// comes out, and that the closing stages are always protected. The model (liveCaseCoach.ts) only writes the coach's words and judges what the
// member wrote. Everything here is deterministic, has no clock of its own (the time is always passed in) and is tested without a network.
//
// Nothing Deno-specific lives here, so the app, the Edge Function and the tests all run the same code.

export type Stage =
  | 'prompt'
  | 'framework_think'
  | 'framework_write'
  | 'exhibits'
  | 'brainstorm_think'
  | 'brainstorm_write'
  | 'recommend_think'
  | 'recommend_write'
  | 'done';

const SECOND = 1000;
/** The whole case, from the moment the prompt first appears. */
export const LIMIT_MS = 30 * 60 * SECOND;

/** The default plan: 25 minutes 30 seconds; the other 4 minutes 30 seconds are flexible time. */
export const PLANNED_MS: Record<Exclude<Stage, 'done'>, number> = {
  prompt: 3 * 60 * SECOND,
  framework_think: 90 * SECOND,
  framework_write: 3 * 60 * SECOND,
  exhibits: 15 * 60 * SECOND,
  brainstorm_think: 30 * SECOND,
  brainstorm_write: 90 * SECOND,
  recommend_think: 30 * SECOND,
  recommend_write: 90 * SECOND,
};

/** How much longer a writing stage may run for someone still typing when its time is up. */
export const WRITING_GRACE_MS = 30 * SECOND;
/** Typing within this long counts as working, not as being stuck. */
export const DRAFT_ACTIVE_MS = 20 * SECOND;
/** The exhibit discussion may run past its planned 15 minutes only while the member keeps making progress within this long. */
export const PROGRESS_WINDOW_MS = 60 * SECOND;

/** A saved response is cut to this long. */
export const MAX_RESPONSE_CHARS = 4000;

export const ORDER: Stage[] = [
  'prompt',
  'framework_think',
  'framework_write',
  'exhibits',
  'brainstorm_think',
  'brainstorm_write',
  'recommend_think',
  'recommend_write',
  'done',
];

export type DraftKey = 'clarify' | 'framework' | 'direction' | 'exhibit' | 'brainstorm' | 'recommendation';
export type SubmissionKind = 'framework' | 'direction' | 'brainstorm' | 'recommendation';
export type BeatOutcome = 'open' | 'independent' | 'hinted' | 'coach_moved' | 'member_moved' | 'timed_out';
/**
 * Practice mode can be paused and ended early; interview mode is the real thing, with the clock running from start to finish; learning mode has no
 * clock at all: nothing runs out, Bucket teaches as the case goes, and the member can stop whenever they like.
 */
export type LiveMode = 'practice' | 'interview' | 'learning';
export type NudgeLevel = 'none' | 'process_hint' | 'directional_hint' | 'lead' | 'advance';

/** One thing to work through in the main section: an exhibit, or (for a case without exhibits) a step of the book's analysis. */
export interface Beat {
  kind: 'exhibit' | 'step';
  index: number;
}

export interface CasePlan {
  /** The time the exhibit discussion is planned for. Plans saved before this existed use 15 minutes. */
  exhibitMs?: number;
  /** The whole case. Plans saved before this existed use 30 minutes. */
  limitMs?: number;
  beats: Beat[];
  hasBrainstorm: boolean;
  /** What the brainstorm is about, from the book's own step (never its ideas). */
  brainstormTopic: string;
}

/** The little the plan needs to know about a case's write-up. */
export interface PlanSource {
  exhibits: readonly { title?: string; caption?: string; columns?: readonly string[]; rows?: readonly (readonly string[])[] }[];
  steps: readonly { title: string }[];
}

const BRAINSTORM = /brainstorm/i;
// A step that is only about building the framework ("Framework", "Framework for revenue growth", "Framework: what to weigh", "Structure the problem"): the framework
// has its own stages, so it is not discussed again. ("Framework and Exhibit 1" has more in it, so it stays.)
const FRAMEWORK_STEP = /^\s*(framework|structure|structuring|clarifying questions?)(\s+for\b.*|\s*[:/].*|\s+the\s+(problem|approach|project)\b.*)?\s*$/i;

/**
 * Some of a write-up's tables are the interviewer's own: guidance, solutions, a sample approach, "calculation to be performed by the candidate",
 * a list of brainstorm ideas. They are never shown to the member (they would give the case away); they are reference for Bucket only.
 *
 * A title says so in one of two ways. A **hard** marker belongs to the interviewer's sheet wherever it turns up, so it hides a table on its
 * own. A **soft** marker is a word the books also put in the titles of exhibits they hand the candidate ("Exhibit D – Expected Claims Per
 * Years of Warranty", "Exhibit 3: Annual Cost Calculation"), so on its own it hides a table only when the title is not the book's own name
 * for an exhibit (see `namesABookExhibit`). Hiding a candidate exhibit is still the safer way to be wrong (PR #70): a title that is not the
 * book's own name for an exhibit is hidden exactly as before, and one that is stays hidden by a hard marker, or by what its caption,
 * column headings or cells say.
 */
// ("Interviewee" is deliberately not here, though it is a caption and column marker: in a title it means the opposite — "Interviewee
// Handout", "Data for interviewee" is the sheet the candidate is given.)
const HARD_INTERVIEWER_SIDE = /interviewer|guidance|\bguide\b|\bsolution\b|performed by|answer key|keep private|not for (the )?candidate/i;
/** Matches every soft marker in a title, so that one list both spots them and takes them out. */
const SOFT_INTERVIEWER_SIDE = /sample|approach|answer|brainstorm|expected|calculation|\bmath\b/gi;
/**
 * The book's own numbering of an exhibit ("Exhibit 1:", "Exhibit #3 -", "Exhibit D – ...", "Figure 2", "Appendix A"). The number has to end
 * the title or be followed by a separator: "Exhibit 1 calculation" names the book's working *for* Exhibit 1, not the exhibit itself.
 */
const BOOK_EXHIBIT_LABEL = /^\s*(?:case\s+)?(?:exhibit|exh\.|figure|fig\.|appendix|attachment|chart|table)\s*#?\s*(?:\d+\s*[a-z]?|[a-z])\s*(?:[:.)\]|,\-–—]|$)/i;
/** Words that say nothing about what is in a table, so they do not count as naming its subject. */
const TITLE_FILLER = /\b(?:the|a|an|and|or|of|for|to|in|on|at|by|with|per|its|only|detail|details|exercise|table|tables|sheet|sheets|page|pages|part|step|steps|question|questions|notes?|summary|workings?|work)\b/gi;
/**
 * Is this title the book's own name for an exhibit the candidate is given? It has to start with the book's numbering **and** go on to say
 * what the table is about: "Exhibit 1: Answers" and "Exhibit 3: Calculations" name the book's working for an exhibit rather than an
 * exhibit, so they keep no exemption, while "Exhibit 3: Annual Cost Calculation" is a table of annual costs.
 */
const namesABookExhibit = (title: string, withoutSoftMarkers: string): boolean =>
  BOOK_EXHIBIT_LABEL.test(title) && /[a-z]{2,}/i.test(withoutSoftMarkers.replace(BOOK_EXHIBIT_LABEL, ' ').replace(TITLE_FILLER, ' '));
/** "Solutions" is the interviewer's when it is the book's answer ("Solutions to Exhibit 2"), but not when it is what the case is about ("Exhibit 1: Current solutions for retirees"). */
const SOLUTIONS_OF_THE_CASE = /\b(current|existing|possible|potential|alternative|competing|available|other|rival|today'?s)\s+solutions\b/i;
export const isInterviewerSide = (title: string): boolean => {
  if (HARD_INTERVIEWER_SIDE.test(title)) return true;
  if (/\bsolutions\b/i.test(title) && !SOLUTIONS_OF_THE_CASE.test(title)) return true;
  const withoutSoftMarkers = title.replace(SOFT_INTERVIEWER_SIDE, ' ');
  if (withoutSoftMarkers === title) return false;
  return !namesABookExhibit(title, withoutSoftMarkers);
};

/** Words in a table's caption, column headings or cells that mark it as the interviewer's sheet ("Information for Interviewee", "Keep Private", "interviewer's math page"). */
const INTERVIEWER_WORDS = /keep private|interviewee|interviewer|not for (the )?candidate|only when the candidate asks|given if prompted/i;

/** How a caption says the table is the book's own working or answer (the ordinary words "solution" and "working" are not enough on their own). */
const SOLUTION_CAPTION = /solution page|solution table|book'?s (working|solution|sizing|math)|\bworking for\b|completed in the book|math solution|guidance for/i;
/** A cell that gives the answer away. */
const ANSWER_CELL = /\(answer\b|answer key/i;

/** A table the member must not see: the interviewer's by its title, or by what its caption, headings or cells say. */
export function isInterviewerSideExhibit(e: { title?: string; caption?: string; columns?: readonly string[]; rows?: readonly (readonly string[])[] }): boolean {
  if (isInterviewerSide(e.title ?? '')) return true;
  if (INTERVIEWER_WORDS.test(e.caption ?? '') || SOLUTION_CAPTION.test(e.caption ?? '')) return true;
  if ((e.columns ?? []).some((c) => INTERVIEWER_WORDS.test(c))) return true;
  return (e.rows ?? []).slice(0, 80).some((r) => r.some((c) => INTERVIEWER_WORDS.test(c) || ANSWER_CELL.test(c)));
}

/**
 * How the exhibit discussion is sized: a few minutes to settle into the data section, plus a few for every thing to work through.
 * Four beats comes to exactly the 20 minutes every case used to get, so the common sizes are undisturbed; the ceiling is the 25 minutes
 * the longest cases already had.
 */
const EXHIBIT_SETUP_MS = 4 * 60 * SECOND;
const EXHIBIT_PER_BEAT_MS = 4 * 60 * SECOND;
/** A case with something to work through never gets less than this (the formula's own value at one beat), nor more than the ceiling. */
const EXHIBIT_MIN_MS = 8 * 60 * SECOND;
const EXHIBIT_MAX_MS = 25 * 60 * SECOND;
/** Everything around the discussion: 7:30 of prompt and framework, 4:00 the closing stages need, 3:30 of flexible time. */
const AROUND_EXHIBITS_MS = 15 * 60 * SECOND;

/**
 * The time a case is planned for, from how much it has in it. A case with nothing to work through has no exhibit stage at all, so it is
 * given no exhibit time; the opening, the closing and the flexible time are the same for every case, which is what keeps the closing
 * stages safe at any size.
 */
function planTimes(beats: number): { exhibitMs: number; limitMs: number } {
  const exhibitMs = beats <= 0 ? 0 : Math.min(Math.max(EXHIBIT_SETUP_MS + beats * EXHIBIT_PER_BEAT_MS, EXHIBIT_MIN_MS), EXHIBIT_MAX_MS);
  return { exhibitMs, limitMs: exhibitMs + AROUND_EXHIBITS_MS };
}

export function buildPlan(solution: PlanSource): CasePlan {
  const brainstormStep = solution.steps.find((s) => BRAINSTORM.test(s.title));
  const brainstormTable = solution.exhibits.find((e) => BRAINSTORM.test(e.title ?? ''));
  // Only the exhibits meant for the candidate are brought out.
  const exhibitBeats: Beat[] = solution.exhibits.flatMap((e, index) => (isInterviewerSideExhibit(e) ? [] : [{ kind: 'exhibit' as const, index }]));
  // A case with no exhibits for the candidate is worked through the book's own steps instead (the brainstorm has its own stages).
  // (The framework is done in its own stages, so a step that is just the framework is not discussed again.)
  const stepBeats: Beat[] = solution.steps.flatMap((s, index) => (BRAINSTORM.test(s.title) || FRAMEWORK_STEP.test(s.title) ? [] : [{ kind: 'step' as const, index }]));
  const beats = exhibitBeats.length > 0 ? exhibitBeats : stepBeats;
  // More to cover, more time: the case is as long as there is to work through, up to the 25-in-40 the busiest cases always had.
  return {
    ...planTimes(beats.length),
    beats,
    hasBrainstorm: Boolean(brainstormStep || brainstormTable),
    brainstormTopic: brainstormStep
      ? brainstormStep.title.replace(/^\s*brainstorm(?:s|ing)?\s*[:\-–]?\s*/i, '').trim()
      : brainstormTable && brainstormTable.title?.includes(':')
        ? brainstormTable.title.slice(brainstormTable.title.indexOf(':') + 1).trim()
        : '',
  };
}

export interface Message {
  id: number;
  at: number;
  from: 'coach' | 'user';
  stage: Stage;
  kind: 'text' | 'hint' | 'exhibit' | 'notice';
  text: string;
  /** For an exhibit: its place in the plan's beats. */
  beat?: number;
}

export interface BeatRecord {
  /** Place in `plan.beats`. */
  index: number;
  revealedAt: number;
  /** The last time the member made progress here (or when it was revealed). Hints and the move-on rule count from it. */
  lastProgressAt: number;
  /** The last time the member wrote to Bucket about this exhibit (or when it appeared). */
  lastUserAt: number;
  lastNudgeAt: number;
  /** The time this one is worth, set when it comes out from what is left. */
  budgetMs: number;
  hints: number;
  userMessages: number;
  /** Messages the member has sent on this exhibit since they last made clear progress on it, not counting the ones that asked for data. How far up the help ladder they are. (Missing in sessions saved before this was kept: counts as none.) */
  asked?: number;
  outcome: BeatOutcome;
}

export interface Submission {
  kind: SubmissionKind;
  text: string;
  at: number;
  /** A draft captured when time ran out, not something the member handed in. */
  timedOut: boolean;
}

export interface StageLogEntry {
  stage: Stage;
  startedAt: number;
  endedAt: number | null;
  endedBy: 'user' | 'timer' | 'coach' | 'limit' | null;
}

/** What the model used for this case, summed over its calls, so the real cost can be read back (see the README). */
export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SessionState {
  version: 1;
  usage?: Usage;
  /** Bumped by every change, so a late reply from the model can tell that the session moved on. */
  rev: number;
  startedAt: number;
  plan: CasePlan;
  stage: Stage;
  stageStartedAt: number;
  frameworkPhase: 'framework' | 'direction';
  messages: Message[];
  drafts: Partial<Record<DraftKey, string>>;
  lastDraftAt: number;
  scratchpad: string;
  submissions: Submission[];
  beats: BeatRecord[];
  stageLog: StageLogEntry[];
  clarifyCount: number;
  directionFollowUps: number;
  endedAt: number | null;
  endReason: 'completed' | 'time_limit' | 'ended_early' | null;
  /** When the member paused the case: the clock stands still until they continue. Missing or null when it is running. */
  pausedAt?: number | null;
  /** How many times the case has been paused. */
  pauses?: number;
  /** Missing (a case from before there were modes) counts as practice. */
  mode?: LiveMode;
}

/** A learning case has no clock: no stage, and not the case, ever runs out. */
export const isUntimed = (s: Pick<SessionState, 'mode'>): boolean => s.mode === 'learning';

export const hardEnd = (s: SessionState): number => s.startedAt + (s.plan.limitMs ?? LIMIT_MS);
const exhibitPlanned = (s: SessionState): number => s.plan.exhibitMs ?? PLANNED_MS.exhibits;
const stageIndex = (stage: Stage): number => ORDER.indexOf(stage);
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
const clip = (t: string): string => t.replace(/\r\n/g, '\n').trim().slice(0, MAX_RESPONSE_CHARS);

/** Adds one model call's tokens to the case's running total. Not a change the member can see, so the revision stays as it is. */
export function addUsage(state: SessionState, used: Partial<Omit<Usage, 'calls'>> | undefined): SessionState {
  if (!used) return state;
  const s = structuredClone(state);
  const u = s.usage ?? { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  s.usage = {
    calls: u.calls + 1,
    inputTokens: u.inputTokens + (used.inputTokens ?? 0),
    outputTokens: u.outputTokens + (used.outputTokens ?? 0),
    cacheReadTokens: u.cacheReadTokens + (used.cacheReadTokens ?? 0),
    cacheWriteTokens: u.cacheWriteTokens + (used.cacheWriteTokens ?? 0),
  };
  return s;
}

export function newSession(plan: CasePlan, now: number, promptText: string, mode: LiveMode = 'practice'): SessionState {
  const s: SessionState = {
    version: 1,
    mode,
    rev: 0,
    startedAt: now,
    plan,
    stage: 'prompt',
    stageStartedAt: now,
    frameworkPhase: 'framework',
    messages: [],
    drafts: {},
    lastDraftAt: 0,
    scratchpad: '',
    submissions: [],
    beats: [],
    stageLog: [{ stage: 'prompt', startedAt: now, endedAt: null, endedBy: null }],
    clarifyCount: 0,
    directionFollowUps: 0,
    endedAt: null,
    endReason: null,
  };
  say(s, now, promptText, 'notice');
  return s;
}

function say(s: SessionState, at: number, text: string, kind: Message['kind'], beat?: number, from: Message['from'] = 'coach'): void {
  const id = (s.messages[s.messages.length - 1]?.id ?? 0) + 1;
  s.messages.push({ id, at, from, stage: s.stage, kind, text, ...(beat === undefined ? {} : { beat }) });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------------------------------------

/** What is still to come after this stage, in the planned time (the writing and thinking stages that have not happened yet). */
function laterPlanned(s: SessionState, stage: Stage): number {
  let total = 0;
  for (const next of ORDER.slice(stageIndex(stage) + 1)) {
    if (next === 'done') continue;
    if (next === 'exhibits' && s.plan.beats.length === 0) continue;
    if ((next === 'brainstorm_think' || next === 'brainstorm_write') && !s.plan.hasBrainstorm) continue;
    total += next === 'exhibits' ? exhibitPlanned(s) : PLANNED_MS[next];
  }
  return total;
}

/** The time the closing stages need at the least: the brainstorm (if the case has one) and the recommendation. */
function closingNeeded(s: SessionState): number {
  return laterPlanned(s, 'exhibits');
}

export interface Deadlines {
  /** The planned end. */
  soft: number;
  /** The latest end, using flexible time but never the time the closing stages need. */
  hard: number;
}

export function deadlines(s: SessionState, stage: Stage, startAt: number): Deadlines {
  const end = hardEnd(s);
  if (stage === 'done') return { soft: end, hard: end };
  if (stage === 'exhibits') {
    const latest = Math.max(startAt, end - closingNeeded(s));
    return { soft: Math.min(startAt + exhibitPlanned(s), latest), hard: latest };
  }
  const soft = Math.min(startAt + PLANNED_MS[stage], end);
  const writing = stage === 'framework_write' || stage === 'brainstorm_write' || stage === 'recommend_write';
  return { soft, hard: writing ? Math.min(soft + WRITING_GRACE_MS, Math.max(soft, end - laterPlanned(s, stage))) : soft };
}

const WRITING_DRAFT: Partial<Record<Stage, DraftKey>> = {
  framework_write: 'framework',
  brainstorm_write: 'brainstorm',
  recommend_write: 'recommendation',
};

function writingKey(s: SessionState): DraftKey | undefined {
  if (s.stage === 'framework_write') return s.frameworkPhase === 'direction' ? 'direction' : 'framework';
  return WRITING_DRAFT[s.stage];
}

export const openBeat = (s: SessionState): BeatRecord | undefined => s.beats.find((b) => b.outcome === 'open');

/** When the current stage ends if nothing else happens. It can move later while the member is typing or making progress (never past `hard`). */
export function stageEndsAt(s: SessionState): number {
  if (s.stage === 'done') return s.endedAt ?? hardEnd(s);
  const d = deadlines(s, s.stage, s.stageStartedAt);
  if (s.stage === 'exhibits') {
    const b = openBeat(s);
    return b ? clamp(b.lastProgressAt + PROGRESS_WINDOW_MS, d.soft, d.hard) : d.soft;
  }
  const key = writingKey(s);
  if (key && d.hard > d.soft && (s.drafts[key] ?? '').trim() && s.lastDraftAt > d.soft - DRAFT_ACTIVE_MS) return d.hard;
  return d.soft;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Moving between stages
// ---------------------------------------------------------------------------------------------------------------------------

const LINES = {
  prompt_ready: 'Framework time. You have 90 seconds to think about your structure. I will not interrupt, and your scratchpad is yours alone.',
  framework_write: 'Time to write. Put your framework down, then tell me where you would start.',
  direction: 'Thanks. Where would you start, and what would you want to understand first?',
  brainstorm_think: (topic: string) => `Brainstorm${topic ? `: ${topic}` : ''}. You have 30 seconds to think before you write.`,
  brainstorm_write: 'Write your ideas now. You have a minute and a half.',
  recommend_think: 'Time to bring it together. You have 30 seconds to think about your recommendation, using what you have worked through.',
  recommend_write: 'Write your recommendation now. You have a minute and a half.',
  wrap_up: 'Let us move to your recommendation using what you have so far.',
  to_brainstorm: 'Let us move on to brainstorming.',
};

/** The same lines without a stopwatch in them: a learning case has no time to give. */
const LEARNING_LINES: Partial<typeof LINES> = {
  prompt_ready: 'Framework time. Take as long as you like to think about your structure, and use your scratchpad. Choose "Ready to write" when you want to put it down.',
  brainstorm_think: (topic: string) => `Brainstorm${topic ? `: ${topic}` : ''}. Take a moment to think before you write, as long as you like.`,
  brainstorm_write: 'Write your ideas now. There is no rush.',
  recommend_think: 'Time to bring it together. Take as long as you like to think about your recommendation, using what you have worked through.',
  recommend_write: 'Write your recommendation now. There is no rush.',
};

const line = <K extends keyof typeof LINES>(s: SessionState, key: K): (typeof LINES)[K] => ((isUntimed(s) ? LEARNING_LINES[key] : undefined) ?? LINES[key]) as (typeof LINES)[K];

function logEnd(s: SessionState, at: number, by: StageLogEntry['endedBy']): void {
  const last = s.stageLog[s.stageLog.length - 1];
  if (last && last.endedAt === null) {
    last.endedAt = at;
    last.endedBy = by;
  }
}

function startStage(s: SessionState, stage: Stage, at: number): void {
  s.stage = stage;
  s.stageStartedAt = at;
  s.stageLog.push({ stage, startedAt: at, endedAt: null, endedBy: null });
  if (stage === 'framework_think') say(s, at, line(s, 'prompt_ready'), 'notice');
  else if (stage === 'framework_write') say(s, at, LINES.framework_write, 'notice');
  else if (stage === 'brainstorm_think') say(s, at, line(s, 'brainstorm_think')(s.plan.brainstormTopic), 'notice');
  else if (stage === 'brainstorm_write') say(s, at, line(s, 'brainstorm_write'), 'notice');
  else if (stage === 'recommend_think') say(s, at, line(s, 'recommend_think'), 'notice');
  else if (stage === 'recommend_write') say(s, at, line(s, 'recommend_write'), 'notice');
  else if (stage === 'exhibits') revealBeat(s, at);
}

/** Saves what is typed in the box of a writing stage as a response handed in by the clock, not by the member. */
function captureTimedOut(s: SessionState, at: number): void {
  const key = writingKey(s);
  if (!key) return;
  const text = clip(s.drafts[key] ?? '');
  if (text && !s.submissions.some((x) => x.kind === key)) s.submissions.push({ kind: key as SubmissionKind, text, at, timedOut: true });
}

function nextStage(s: SessionState, from: Stage): Stage {
  for (const next of ORDER.slice(stageIndex(from) + 1)) {
    if (next === 'exhibits' && s.plan.beats.length === 0) continue;
    if ((next === 'brainstorm_think' || next === 'brainstorm_write') && !s.plan.hasBrainstorm) continue;
    return next;
  }
  return 'done';
}

function finish(s: SessionState, at: number, reason: 'completed' | 'time_limit' | 'ended_early'): void {
  s.stage = 'done';
  s.endedAt = at;
  s.endReason = reason;
  s.stageStartedAt = at;
}

/** Ends the current stage and starts the next one (or finishes the case). */
function endStage(s: SessionState, at: number, by: StageLogEntry['endedBy']): void {
  const from = s.stage;
  if (from === 'framework_write' || from === 'brainstorm_write' || from === 'recommend_write') {
    if (by === 'timer' || by === 'limit') captureTimedOut(s, at);
  }
  if (from === 'exhibits') {
    const b = openBeat(s);
    if (b && (by === 'timer' || by === 'limit')) b.outcome = 'timed_out';
    if (by === 'timer') say(s, at, s.plan.hasBrainstorm ? LINES.to_brainstorm : LINES.wrap_up, 'notice');
  }
  logEnd(s, at, by);
  const next = nextStage(s, from);
  if (next === 'done') finish(s, at, 'completed');
  else startStage(s, next, at);
}

/**
 * Moves the session on to `now`: every stage whose time has run out ends in turn (each starting where the last one ended, so a member who
 * was away comes back to the right place), and at 30 minutes everything still open is saved and the case ends.
 */
export function settle(input: SessionState, now: number): SessionState {
  if (input.pausedAt != null) return input; // the clock is stopped: nothing runs out while the case is paused
  if (isUntimed(input)) return input; // learning mode has no clock: a stage ends only when the member (or Bucket, on the member's work) moves the case on
  const s = structuredClone(input);
  let guard = 0;
  while (s.stage !== 'done' && guard++ < 16) {
    const limit = hardEnd(s);
    const end = stageEndsAt(s);
    // A stage that ended on its own clock before the 30 minutes is not a timeout, even if the member was away past it.
    if (end < limit && now >= end) {
      endStage(s, end, 'timer');
      continue;
    }
    if (now >= limit) {
      const key = writingKey(s);
      if (key) captureTimedOut(s, limit);
      const b = openBeat(s);
      if (b) b.outcome = 'timed_out';
      logEnd(s, limit, 'limit');
      finish(s, limit, 'time_limit');
    }
    break;
  }
  if (!sameShape(input, s)) s.rev = input.rev + 1;
  return s;
}

const sameShape = (a: SessionState, b: SessionState): boolean =>
  a.stage === b.stage && a.stageLog.length === b.stageLog.length && a.messages.length === b.messages.length && a.endedAt === b.endedAt;

// ---------------------------------------------------------------------------------------------------------------------------
// What the member does
// ---------------------------------------------------------------------------------------------------------------------------

export type ActionResult = { ok: true; state: SessionState } | { ok: false; reason: string };

const refuse = (reason: string): ActionResult => ({ ok: false, reason });
const PAUSED = 'The case is paused. Continue when you are ready.';
const INTERVIEW = 'Interview mode has no pause and no early end. The clock runs until the case is over.';
const NO_CLOCK = 'Learning mode has no clock to pause. Take as long as you like, or end the case when you want feedback.';

function bump(s: SessionState): SessionState {
  s.rev += 1;
  return s;
}

/** Stops the clock. Nothing runs out, nothing can be written or asked, until the member continues (or ends the case). */
export function pause(settled: SessionState, now: number): ActionResult {
  if (settled.mode === 'interview') return refuse(INTERVIEW);
  if (isUntimed(settled)) return refuse(NO_CLOCK);
  if (settled.stage === 'done') return refuse('The case is over.');
  if (settled.pausedAt != null) return refuse('The case is already paused.');
  const s = structuredClone(settled);
  s.pausedAt = now;
  s.pauses = (s.pauses ?? 0) + 1;
  return { ok: true, state: bump(s) };
}

/** Moves every moment in the case on by `ms`, so that what was left on the clock when it was paused is what is left when it starts again. */
function shiftTimes(s: SessionState, ms: number): void {
  s.startedAt += ms;
  s.stageStartedAt += ms;
  if (s.lastDraftAt > 0) s.lastDraftAt += ms;
  for (const e of s.stageLog) {
    e.startedAt += ms;
    if (e.endedAt !== null) e.endedAt += ms;
  }
  for (const m of s.messages) m.at += ms;
  for (const x of s.submissions) x.at += ms;
  for (const b of s.beats) {
    b.revealedAt += ms;
    b.lastProgressAt += ms;
    b.lastUserAt += ms;
    if (b.lastNudgeAt > 0) b.lastNudgeAt += ms;
  }
}

/** Starts the clock again, with exactly the time that was left. */
export function continueCase(settled: SessionState, now: number): ActionResult {
  if (settled.pausedAt == null) return refuse('The case is not paused.');
  const s = structuredClone(settled);
  shiftTimes(s, Math.max(0, now - settled.pausedAt));
  s.pausedAt = null;
  return { ok: true, state: bump(s) };
}

/**
 * The member ends the case here (paused or not). What is in the box they were writing in is kept as an unfinished draft, whatever stages are
 * left are left, and the case goes to feedback like any other that ends.
 */
export function endEarly(settled: SessionState, now: number): ActionResult {
  if (settled.mode === 'interview') return refuse(INTERVIEW);
  if (settled.stage === 'done') return refuse('The case is already over.');
  const s = structuredClone(settled);
  const at = settled.pausedAt ?? now; // a paused case ends at the moment it was paused
  captureTimedOut(s, at);
  const b = openBeat(s);
  if (b) b.outcome = 'timed_out';
  logEnd(s, at, 'user');
  finish(s, at, 'ended_early');
  s.pausedAt = null;
  say(s, at, 'You ended the case here.', 'notice');
  return { ok: true, state: bump(s) };
}

/** "Ready": ends the prompt stage or a thinking stage early. The time saved stays in the case's flexible time. */
export function ready(settled: SessionState, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  if (!['prompt', 'framework_think', 'brainstorm_think', 'recommend_think'].includes(settled.stage)) return refuse('Nothing to move on from right now.');
  const s = structuredClone(settled);
  endStage(s, now, 'user');
  return { ok: true, state: bump(s) };
}

/** Hands in the response of a writing stage. The framework is followed by "where would you start?"; the other two move the case on. */
export function submit(settled: SessionState, text: string, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  const body = clip(text);
  if (!body) return refuse('Write something first.');
  const s = structuredClone(settled);
  if (s.stage === 'framework_write' && s.frameworkPhase === 'framework') {
    s.submissions.push({ kind: 'framework', text: body, at: now, timedOut: false });
    s.frameworkPhase = 'direction';
    delete s.drafts.framework;
    say(s, now, LINES.direction, 'text');
    return { ok: true, state: bump(s) };
  }
  if (s.stage === 'brainstorm_write' || s.stage === 'recommend_write') {
    const kind: SubmissionKind = s.stage === 'brainstorm_write' ? 'brainstorm' : 'recommendation';
    s.submissions.push({ kind, text: body, at: now, timedOut: false });
    delete s.drafts[kind];
    endStage(s, now, 'user');
    return { ok: true, state: bump(s) };
  }
  return refuse('There is nothing to hand in right now.');
}

/** The starting direction is settled (or time for it is up): on to the first exhibit. */
export function endFrameworkStage(settled: SessionState, now: number): SessionState {
  if (settled.stage !== 'framework_write') return settled;
  const s = structuredClone(settled);
  endStage(s, now, 'coach');
  return bump(s);
}

/** A chat message from the member: a clarifying question, their starting direction, or their reasoning on an exhibit. */
export function userSays(settled: SessionState, text: string, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  const body = clip(text);
  if (!body) return refuse('Write something first.');
  const s = structuredClone(settled);
  if (s.stage === 'prompt') {
    s.clarifyCount += 1;
    delete s.drafts.clarify;
  } else if (s.stage === 'framework_write' && s.frameworkPhase === 'direction') {
    const prior = s.submissions.find((x) => x.kind === 'direction');
    if (prior) prior.text = clip(`${prior.text}\n${body}`);
    else s.submissions.push({ kind: 'direction', text: body, at: now, timedOut: false });
    delete s.drafts.direction;
  } else if (s.stage === 'exhibits') {
    const b = openBeat(s);
    if (b) {
      b.userMessages += 1;
      b.asked = (b.asked ?? 0) + 1;
      b.lastUserAt = now;
    }
    delete s.drafts.exhibit;
  } else {
    return refuse('There is nothing to answer right now.');
  }
  say(s, now, body, 'text', undefined, 'user');
  return { ok: true, state: bump(s) };
}

/** The coach's reply, if the session is still where the member's message left it. */
export function coachSays(s0: SessionState, text: string, now: number, kind: Message['kind'] = 'text'): SessionState {
  const s = structuredClone(s0);
  say(s, now, text, kind);
  return bump(s);
}

export function saveDraft(settled: SessionState, key: DraftKey, text: string, now: number): SessionState {
  if (settled.pausedAt != null) return settled;
  const s = structuredClone(settled);
  const allowed: Record<DraftKey, boolean> = {
    clarify: s.stage === 'prompt',
    framework: s.stage === 'framework_write' && s.frameworkPhase === 'framework',
    direction: s.stage === 'framework_write' && s.frameworkPhase === 'direction',
    exhibit: s.stage === 'exhibits',
    brainstorm: s.stage === 'brainstorm_write',
    recommendation: s.stage === 'recommend_write',
  };
  if (!allowed[key]) return settled;
  const body = text.slice(0, MAX_RESPONSE_CHARS);
  if (body) s.drafts[key] = body;
  else delete s.drafts[key];
  s.lastDraftAt = now;
  return bump(s);
}

/** The private scratchpad of the framework thinking stage (kept apart from the framework that is handed in). */
export function saveScratchpad(settled: SessionState, text: string): SessionState {
  if (!['framework_think', 'framework_write'].includes(settled.stage) || settled.pausedAt != null) return settled;
  const s = structuredClone(settled);
  s.scratchpad = text.slice(0, MAX_RESPONSE_CHARS);
  return bump(s);
}

// ---------------------------------------------------------------------------------------------------------------------------
// The exhibit discussion
// ---------------------------------------------------------------------------------------------------------------------------

/** The time the next beat is worth: what is left of the planned discussion, shared out by how many beats remain. */
function beatBudget(s: SessionState, at: number): number {
  const d = deadlines(s, 'exhibits', s.stageStartedAt);
  const left = Math.max(1, s.plan.beats.length - s.beats.length);
  return Math.max(30 * SECOND, Math.floor((d.soft - at) / left));
}

function revealBeat(s: SessionState, at: number): boolean {
  const index = s.beats.length;
  const beat = s.plan.beats[index];
  if (!beat) return false;
  s.beats.push({ index, revealedAt: at, lastProgressAt: at, lastUserAt: at, lastNudgeAt: 0, budgetMs: beatBudget(s, at), hints: 0, userMessages: 0, asked: 0, outcome: 'open' });
  const first = index === 0;
  const text =
    beat.kind === 'exhibit'
      ? first
        ? 'Here is the first exhibit. Take a moment, then tell me what you notice.'
        : 'Here is the next exhibit. What do you notice?'
      : first
        ? 'Let us dig in. What would you analyse first, and how?'
        : 'Good. What would you look at next, and how?';
  say(s, at, text, 'exhibit', index);
  return true;
}

/** Closes the open exhibit (the member got there, or the coach moved on) and brings out the next one, or ends the discussion. */
export function nextBeat(settled: SessionState, now: number, how: 'independent' | 'coach_moved' | 'member_moved'): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b) b.outcome = how === 'coach_moved' ? 'coach_moved' : how === 'member_moved' ? 'member_moved' : b.hints > 0 ? 'hinted' : 'independent';
  if (!revealBeat(s, now)) {
    say(s, now, s.plan.hasBrainstorm ? LINES.to_brainstorm : LINES.wrap_up, 'notice');
    endStage(s, now, 'coach');
  }
  return bump(s);
}

/**
 * The member says they are done with this exhibit: on to the next one, or, after the last, on to the next section (the time saved carries over).
 * Bucket's job is to help them drive and cover the exhibit; this is the way out for a member who is stuck or has had enough.
 *
 * In practice and interview they have to have said something about it first, so a stray click can't skip an exhibit nobody looked at, and
 * because the member is being assessed on what they cover. Learning assesses nothing and has no clock, so the member alone decides when a
 * beat is over: a learner who does not know how to start one may move on without writing, which is the only way out of that beat short of
 * ending the case.
 */
export function moveOn(settled: SessionState, now: number): ActionResult {
  if (settled.pausedAt != null) return refuse(PAUSED);
  const b = settled.stage === 'exhibits' ? openBeat(settled) : undefined;
  if (!b) return refuse('There is nothing to move on from right now.');
  if (b.userMessages < 1 && !isUntimed(settled)) return refuse('Tell me what you make of this one first.');
  return { ok: true, state: nextBeat(settled, now, 'member_moved') };
}

/** What the member's last message showed: progress, partial progress, being stuck, or not enough to tell. */
export type Assessment = 'progress' | 'partial' | 'stuck' | 'unclear';

export function recordAssessment(settled: SessionState, assessment: Assessment, now: number): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b && (assessment === 'progress' || assessment === 'partial')) b.lastProgressAt = now;
  if (b && assessment === 'progress') b.asked = 0; // a clear step forward starts the count again
  return bump(s);
}

/**
 * The message being answered asked for data (or for the answer), not for help: it is taken back off the count that climbs the help ladder,
 * so asking costs nothing. Asking well is part of doing the case, in every mode (DECISIONS.md, "The interview rubric", section 2).
 */
export function recordDataRequest(settled: SessionState): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b) b.asked = Math.max(0, (b.asked ?? 0) - 1);
  return bump(s);
}

const behindSchedule = (b: BeatRecord, at: number): boolean => at > b.revealedAt + b.budgetMs;

/**
 * The help ladder, one row per mode: what the member's first, second, third ... message on an exhibit that is going nowhere is answered
 * with. The last entry of a row repeats for every message after it. This table is the whole of the difference in how much help a mode
 * gives (DECISIONS.md, "The interview rubric", section 1).
 *  - practice teaches as it goes: a process hint from the first stuck message, a sharper one next, then Bucket leads (it stops asking open
 *    questions and says plainly where to look), and then it moves the case on.
 *  - an interview redirects, it never rescues: the first stuck message gets nothing (a real interviewer lets you sit with it), help goes no
 *    further than a nudge, and there is no 'lead' rung at all. Being stuck costs the beat, which is what 'advance' is for.
 *  - learning has no clock and Bucket never moves a learner on: it keeps teaching, and the member says when they are done.
 */
const LADDER: Record<LiveMode, readonly NudgeLevel[]> = {
  practice: ['process_hint', 'directional_hint', 'lead', 'advance'],
  interview: ['none', 'process_hint', 'directional_hint', 'advance'],
  learning: ['process_hint', 'directional_hint', 'lead'],
};

/**
 * What help to give on the exhibit on the table. The member drives: nothing is said unless they write something.
 *  - 'message': they have written to Bucket. If it shows they are stuck, they climb their mode's rung of the ladder above; in a timed mode
 *    the last rung before moving on is skipped once the exhibit has already taken longer than it is worth, and after the top of the ladder
 *    the case moves on to the next exhibit.
 *  - 'timer': they have said nothing. The clock never speaks up on its own: how much they cover in the time is up to them, and when the
 *    exhibit time is used up the case moves on to the next part.
 */
export function nudgeLevel(s: SessionState, now: number, via: 'message' | 'timer' = 'message'): NudgeLevel {
  const b = openBeat(s);
  if (!b || s.stage !== 'exhibits' || via === 'timer') return 'none';
  // How far up the ladder this message is: by the hints already given, or by how many messages have gone by without getting anywhere
  // (the one being answered now is not counted yet, so the third message gets the third step).
  const rung = Math.max(b.hints, b.asked ?? 0);
  const ladder = LADDER[s.mode ?? 'practice'] ?? LADDER.practice;
  // The exhibit has already run past the time it is worth: the last rung of help before moving on is skipped. A mode whose ladder never
  // moves the member on (learning, which has no clock at all) has no such thing.
  if (ladder[ladder.length - 1] === 'advance' && rung >= ladder.length - 2 && behindSchedule(b, now)) return 'advance';
  return ladder[Math.min(rung, ladder.length - 1)];
}

/** Nothing wakes the screen up for a hint: they only come in reply to the member. */
export function nextNudgeAt(_s: SessionState, _now: number): number | null {
  return null;
}

/** Records that the coach gave a hint (level 1 or 2) on the open exhibit. */
export function recordHint(settled: SessionState, now: number): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b) {
    b.hints += 1;
    b.lastNudgeAt = now;
  }
  return bump(s);
}

/** The few numbers the feedback needs about the pacing. */
export function timeInStages(s: SessionState): { stage: Stage; seconds: number; endedBy: StageLogEntry['endedBy'] }[] {
  return s.stageLog.map((e) => ({ stage: e.stage, seconds: Math.round(((e.endedAt ?? s.endedAt ?? e.startedAt) - e.startedAt) / SECOND), endedBy: e.endedBy }));
}
