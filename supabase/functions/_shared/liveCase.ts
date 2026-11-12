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
  brainstorm_write: 60 * SECOND,
  recommend_think: 30 * SECOND,
  recommend_write: 60 * SECOND,
};

/** How much longer a writing stage may run for someone still typing when its time is up. */
export const WRITING_GRACE_MS = 30 * SECOND;
/** Typing within this long counts as working, not as being stuck. */
export const DRAFT_ACTIVE_MS = 20 * SECOND;
/** The exhibit discussion may run past its planned 15 minutes only while the member keeps making progress within this long. */
export const PROGRESS_WINDOW_MS = 60 * SECOND;
/** The least time between two nudges. */
export const MIN_NUDGE_GAP_MS = 15 * SECOND;
/**
 * When the member says nothing and types nothing, the clock speaks up only after real silence, counted from the last thing they did (the
 * exhibit appearing, a message, typing): reading and thinking come first. A hint, a sharper hint, and then the next exhibit.
 */
export const SILENCE_FIRST_MS = 150 * SECOND;
export const SILENCE_SECOND_MS = 240 * SECOND;
export const SILENCE_MOVE_ON_MS = 330 * SECOND;
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
export type BeatOutcome = 'open' | 'independent' | 'hinted' | 'coach_moved' | 'timed_out';
export type NudgeLevel = 'none' | 'process_hint' | 'directional_hint' | 'advance';

/** One thing to work through in the main section: an exhibit, or (for a case without exhibits) a step of the book's analysis. */
export interface Beat {
  kind: 'exhibit' | 'step';
  index: number;
}

export interface CasePlan {
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
const FRAMEWORK_STEP = /^\s*(framework|structure|structuring|clarifying questions?)\s*$/i;

/**
 * Some of a write-up's tables are the interviewer's own: guidance, solutions, a sample approach, "calculation to be performed by the candidate",
 * a list of brainstorm ideas. They are never shown to the member (they would give the case away); they are reference for Bucket only.
 */
const INTERVIEWER_SIDE = /interviewer|guidance|\bguide\b|solution|sample|approach|performed by|answer|brainstorm|expected|calculation|\bmath\b/i;
export const isInterviewerSide = (title: string): boolean => INTERVIEWER_SIDE.test(title);

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

export function buildPlan(solution: PlanSource): CasePlan {
  const brainstormStep = solution.steps.find((s) => BRAINSTORM.test(s.title));
  const brainstormTable = solution.exhibits.find((e) => BRAINSTORM.test(e.title ?? ''));
  // Only the exhibits meant for the candidate are brought out.
  const exhibitBeats: Beat[] = solution.exhibits.flatMap((e, index) => (isInterviewerSideExhibit(e) ? [] : [{ kind: 'exhibit' as const, index }]));
  // A case with no exhibits for the candidate is worked through the book's own steps instead (the brainstorm has its own stages).
  // (The framework is done in its own stages, so a step that is just the framework is not discussed again.)
  const stepBeats: Beat[] = solution.steps.flatMap((s, index) => (BRAINSTORM.test(s.title) || FRAMEWORK_STEP.test(s.title) ? [] : [{ kind: 'step' as const, index }]));
  return {
    beats: exhibitBeats.length > 0 ? exhibitBeats : stepBeats,
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

export interface SessionState {
  version: 1;
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
  endReason: 'completed' | 'time_limit' | null;
}

export const hardEnd = (s: SessionState): number => s.startedAt + LIMIT_MS;
const stageIndex = (stage: Stage): number => ORDER.indexOf(stage);
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
const clip = (t: string): string => t.replace(/\r\n/g, '\n').trim().slice(0, MAX_RESPONSE_CHARS);

export function newSession(plan: CasePlan, now: number, promptText: string): SessionState {
  const s: SessionState = {
    version: 1,
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
    total += PLANNED_MS[next];
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
    return { soft: Math.min(startAt + PLANNED_MS.exhibits, latest), hard: latest };
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
  brainstorm_write: 'Write your ideas now. You have one minute.',
  recommend_think: 'Time to bring it together. You have 30 seconds to think about your recommendation, using what you have worked through.',
  recommend_write: 'Write your recommendation now. You have one minute.',
  wrap_up: 'Let us move to your recommendation using what you have so far.',
  to_brainstorm: 'Let us move on to brainstorming.',
};

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
  if (stage === 'framework_think') say(s, at, LINES.prompt_ready, 'notice');
  else if (stage === 'framework_write') say(s, at, LINES.framework_write, 'notice');
  else if (stage === 'brainstorm_think') say(s, at, LINES.brainstorm_think(s.plan.brainstormTopic), 'notice');
  else if (stage === 'brainstorm_write') say(s, at, LINES.brainstorm_write, 'notice');
  else if (stage === 'recommend_think') say(s, at, LINES.recommend_think, 'notice');
  else if (stage === 'recommend_write') say(s, at, LINES.recommend_write, 'notice');
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

function finish(s: SessionState, at: number, reason: 'completed' | 'time_limit'): void {
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

function bump(s: SessionState): SessionState {
  s.rev += 1;
  return s;
}

/** "Ready": ends the prompt stage or a thinking stage early. The time saved stays in the case's flexible time. */
export function ready(settled: SessionState, now: number): ActionResult {
  if (!['prompt', 'framework_think', 'brainstorm_think', 'recommend_think'].includes(settled.stage)) return refuse('Nothing to move on from right now.');
  const s = structuredClone(settled);
  endStage(s, now, 'user');
  return { ok: true, state: bump(s) };
}

/** Hands in the response of a writing stage. The framework is followed by "where would you start?"; the other two move the case on. */
export function submit(settled: SessionState, text: string, now: number): ActionResult {
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
  if (!['framework_think', 'framework_write'].includes(settled.stage)) return settled;
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
  s.beats.push({ index, revealedAt: at, lastProgressAt: at, lastUserAt: at, lastNudgeAt: 0, budgetMs: beatBudget(s, at), hints: 0, userMessages: 0, outcome: 'open' });
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
export function nextBeat(settled: SessionState, now: number, how: 'independent' | 'coach_moved'): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b) b.outcome = how === 'coach_moved' ? 'coach_moved' : b.hints > 0 ? 'hinted' : 'independent';
  if (!revealBeat(s, now)) {
    say(s, now, s.plan.hasBrainstorm ? LINES.to_brainstorm : LINES.wrap_up, 'notice');
    endStage(s, now, 'coach');
  }
  return bump(s);
}

/** What the member's last message showed: progress, partial progress, being stuck, or not enough to tell. */
export type Assessment = 'progress' | 'partial' | 'stuck' | 'unclear';

export function recordAssessment(settled: SessionState, assessment: Assessment, now: number): SessionState {
  const s = structuredClone(settled);
  const b = openBeat(s);
  if (b && (assessment === 'progress' || assessment === 'partial')) b.lastProgressAt = now;
  return bump(s);
}

const unproductiveWindow = (b: BeatRecord, behind: boolean): number => clamp(b.budgetMs / 3, 45 * SECOND, 75 * SECOND) * (behind ? 0.5 : 1);

const behindSchedule = (b: BeatRecord, at: number): boolean => at > b.revealedAt + b.budgetMs;

function thresholdFor(b: BeatRecord, behind: boolean): number {
  const u = unproductiveWindow(b, behind);
  return b.hints === 0 ? u * 0.5 : b.hints === 1 ? u : u * 1.5;
}

/**
 * What the coach should do about an exhibit the member is not getting anywhere with, by the clock.
 *  - 'message': the member has just written to Bucket. The hint ladder follows how long it has been since their last real progress.
 *  - 'timer': the member has said nothing. Only real silence counts (see SILENCE_*), so nobody gets a hint while still reading or typing.
 */
export function nudgeLevel(s: SessionState, now: number, via: 'message' | 'timer' = 'message'): NudgeLevel {
  const b = openBeat(s);
  if (!b || s.stage !== 'exhibits') return 'none';
  if (via === 'timer') {
    if (b.lastNudgeAt && now - b.lastNudgeAt < MIN_NUDGE_GAP_MS) return 'none';
    return now - lastActivity(s, b) >= silenceNeeded(b) ? levelFor(b) : 'none';
  }
  if (s.drafts.exhibit?.trim() && now - s.lastDraftAt < DRAFT_ACTIVE_MS) return 'none';
  if (b.lastNudgeAt && now - b.lastNudgeAt < MIN_NUDGE_GAP_MS) return 'none';
  if (now - b.lastProgressAt < thresholdFor(b, behindSchedule(b, now))) return 'none';
  return levelFor(b);
}

const levelFor = (b: BeatRecord): NudgeLevel => (b.hints === 0 ? 'process_hint' : b.hints === 1 ? 'directional_hint' : 'advance');
const lastActivity = (s: SessionState, b: BeatRecord): number => Math.max(b.revealedAt, b.lastUserAt, s.lastDraftAt);
const silenceNeeded = (b: BeatRecord): number => (b.hints === 0 ? SILENCE_FIRST_MS : b.hints === 1 ? SILENCE_SECOND_MS : SILENCE_MOVE_ON_MS);

/** When the clock next speaks up if the member stays silent (for the app to wake up at), or null when no exhibit is open. */
export function nextNudgeAt(s: SessionState, now: number): number | null {
  const b = openBeat(s);
  if (!b || s.stage !== 'exhibits') return null;
  const gap = b.lastNudgeAt ? b.lastNudgeAt + MIN_NUDGE_GAP_MS : 0;
  return Math.max(lastActivity(s, b) + silenceNeeded(b), gap, now);
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
