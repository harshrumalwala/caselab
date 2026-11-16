// Plays every live-eligible write-up through the real live case, from the prompt to the recommendation, and writes one report saying which
// cases reach the end and which stop in the middle. Nothing here decides anything about the case: the engine is `handleLive` from
// supabase/functions/_shared/liveCaseCoach.ts over the rules in liveCase.ts, exactly as the Edge Function runs them, on the in-memory deps
// the tests use (src/test/memoryLiveDeps.ts). The clock is driven through `deps.now()`, so a whole catalogue takes minutes and no real time.
//
//   npm run dryrun:live                                   # writes reports/live-case-dry-run.md and prints the summary
//   npm run dryrun:live -- --modes practice,interview     # a subset of modes
//   npm run dryrun:live -- --candidates brisk --cases 20  # a subset of candidates, and only the first N cases
//
// THE ONE PIECE OF PRETENDING. In production the model decides three things the engine acts on: `assessment`, `beat_complete` and
// `direction_clear`. Here a scripted candidate decides them instead, from nothing but which kind of turn was asked for and how many times
// that candidate has written on the beat (see CANDIDATES below). The stub never reads the case, never writes English worth judging, and
// cannot tell you whether Bucket's words nudge or solve. It answers one question only: does the case survive to the end?
//
// The report holds case names, book names, modes, candidates, stages and counts only: never a prompt, a figure or a line of a solution, so
// it is safe to paste into an issue. Both the source write-ups and the default report directory are git-ignored.
//
// Needs Node 22.6+ (the engine is TypeScript; the script re-runs itself with type stripping when the Node it is started with has none).
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nameKey } from './librarySeed.mjs';
import { readSolutionFiles } from './liveCaseAudit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = 'private-data/solutions';
const DEFAULT_OUT = 'reports/live-case-dry-run.md';

/** The moment every case starts, so two runs can be diffed. */
export const START_AT = Date.parse('2026-11-16T09:00:00.000Z');
const LIB = 'dry-run-case';
const USER = 'dry-run-user';
/** A run that needs more turns than this has gone wrong, whatever the engine says. */
const STEP_CAP = 400;
const SECOND = 1000;

export const MODES = ['practice', 'interview', 'learning'];
export const CANDIDATES = ['brisk', 'passive', 'offtrack', 'asker'];
export const BEAT_OUTCOMES = ['independent', 'hinted', 'coach_moved', 'member_moved', 'timed_out', 'open'];
export const RUNGS = ['none', 'process_hint', 'directional_hint', 'lead', 'advance'];

/**
 * The real engine, loaded from the files production runs. The Edge Function's TypeScript is loaded by Node's type stripping; `main` makes
 * sure that is switched on before this runs. A test imports the same modules itself and passes them to `playCase`.
 */
export async function loadEngine() {
  const coach = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/liveCaseCoach.ts')).href);
  const liveCase = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/liveCase.ts')).href);
  const memory = await import(pathToFileURL(join(ROOT, 'src/test/memoryLiveDeps.ts')).href);
  return {
    handleLive: coach.handleLive,
    isFullSolution: coach.isFullSolution,
    readSolution: coach.readSolution,
    isInterviewerSideExhibit: liveCase.isInterviewerSideExhibit,
    nudgeLevel: liveCase.nudgeLevel,
    timeInStages: liveCase.timeInStages,
    PLANNED_MS: liveCase.PLANNED_MS,
    createMemoryLiveDeps: memory.createMemoryLiveDeps,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The interviewer's own exhibits must never reach the member
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Whether anything of an interviewer-side exhibit reached the member in this run (issue #95). Two checks, over everything the run put in
 * front of them:
 *
 * 1. **Every exhibit handed over is asked the production rule itself.** Not "is its index in the plan" but `isInterviewerSideExhibit` on
 *    the very payload the member received, so a plan that handed over the wrong index, or a payload assembled some other way, is caught.
 * 2. **No interviewer-side exhibit is named to the member**: its title or its caption, written out whole in a message. Figures are a
 *    different question on purpose — the book's data is read out when the member asks for it (issue #83), and that is correct. It is the
 *    artefact, its title and its caption that must stay unseen.
 *
 * It names the title of what leaked and nothing else: no caption, no cell, no figure, so the report stays safe to paste into an issue.
 */
export function exhibitLeaks(delivered, texts, solution, isInterviewerSideExhibit) {
  const out = [];
  for (const e of delivered) {
    if (isInterviewerSideExhibit(e)) out.push(`shown as an exhibit: ${e.title || '(no title)'}`);
  }
  for (const h of [...solution.reference, ...solution.onRequest]) {
    const title = h.title.trim();
    const caption = h.caption.trim();
    if (title.length >= 8 && texts.some((t) => t.includes(title))) out.push(`its title was written to the member: ${title}`);
    if (caption.length >= 20 && texts.some((t) => t.includes(caption))) out.push(`its caption was written to the member: ${title || '(no title)'}`);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------------------------------------
// The scripted candidates
// ---------------------------------------------------------------------------------------------------------------------------

// Nothing the candidate writes says anything about the case: the engine only counts the messages and the stub only counts its own.
const WRITES = {
  clarify: 'Can I check who the client is and what success would look like for them?',
  framework: 'Three buckets: the market, the economics and the ways to act on them.',
  direction: 'I would start with the economics, because that is where the problem is most likely to sit.',
  exhibit: 'Looking at this, the pattern I notice seems worth following up.',
  brainstorm: 'A few ideas, grouped into the ones that act on volume and the ones that act on price.',
  recommendation: 'My recommendation is the option the numbers support, with the main risk named and a next step.',
};

/**
 * The four candidates, and everything each of them pretends. `exhibit` is what the stub sends back for a turn on a beat, which is the only
 * place the model can end a beat; `beat` is what the candidate does next on the beat it is on, given how many times it has already written
 * there. A candidate with `acts: false` never writes and never presses a button, so only the clock can carry its case.
 *
 * `endsBeats` says whether this candidate can end a beat by itself, by completing it or by choosing "move on". One that cannot has no way
 * out of a beat in an untimed mode, where there is no clock and Bucket never moves a learner on: that is the design, so a run of theirs
 * that stops there is counted as open by design rather than as a case that broke.
 */
const OFFTRACK_BEAT_CAP = 12;

export const CANDIDATE_SPECS = {
  brisk: {
    what: 'answers every beat well and moves on',
    acts: true,
    thinkMs: 20 * SECOND,
    clarifyQuestions: 2,
    directionClear: true,
    exhibit: { assessment: 'progress', beatComplete: true },
    endsBeats: true, // by completing every one of them
    beat: (written) => (written === 0 ? 'write' : 'wait'),
  },
  passive: {
    what: 'writes nothing at all and presses nothing, so the case is carried by the clock alone',
    acts: false,
    thinkMs: 0,
    clarifyQuestions: 0,
    directionClear: false,
    exhibit: { assessment: 'unclear', beatComplete: false },
    endsBeats: false,
    beat: () => 'nothing',
  },
  offtrack: {
    what: 'writes plausible but wrong-headed answers that never complete a beat, and never asks to move on',
    acts: true,
    thinkMs: 35 * SECOND,
    clarifyQuestions: 1,
    directionClear: false,
    exhibit: { assessment: 'stuck', beatComplete: false },
    /** The engine has no limit on this; the harness gives up so that a case that cannot end does not run for ever. */
    beatCap: OFFTRACK_BEAT_CAP,
    endsBeats: false,
    beat: (written) => (written < OFFTRACK_BEAT_CAP ? 'write' : 'nothing'),
  },
  asker: {
    what: 'asks for data instead of answering, then chooses "move on"',
    acts: true,
    thinkMs: 25 * SECOND,
    clarifyQuestions: 4,
    directionClear: true,
    exhibit: { assessment: 'unclear', beatComplete: false },
    endsBeats: true, // by choosing "move on"
    beat: (written) => (written < 2 ? 'write' : 'moveOn'),
  },
};

const FEEDBACK = {
  overall_rating: 0,
  overall_feedback: 'A dry run: no one is being judged here.',
  skills: [],
  went_well: 'The case ran.',
  struggled: 'Nothing a scripted candidate can be said to have struggled with.',
  concepts: '',
  next_focus: '',
  improvement_area: 'none',
  debrief: [],
  unfinished: [],
};

/** The stubbed model: the candidate's decisions, in the shape the engine parses. It is told nothing about the case. */
export function stubModel(spec) {
  const turn = (over) => ({ message: 'Understood. Carry on.', assessment: 'unclear', beat_complete: false, direction_clear: false, ...over });
  return (kind) => {
    if (kind === 'feedback') return FEEDBACK;
    if (kind === 'clarify') return turn({ assessment: 'progress' });
    if (kind === 'direction') return turn({ assessment: 'progress', direction_clear: spec.directionClear });
    if (kind === 'exhibit') return turn({ assessment: spec.exhibit.assessment, beat_complete: spec.exhibit.beatComplete });
    // The hint turns only come from the timer path, which never fires (nextNudgeAt is always null); answered anyway, so nothing hangs.
    return turn({ assessment: 'stuck' });
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// One case, one mode, one candidate
// ---------------------------------------------------------------------------------------------------------------------------

const sum = (values) => values.reduce((t, v) => t + v, 0);

/** How each stage went against the time it was planned for. */
function stageTimes(engine, state) {
  const planned = (stage) => (stage === 'exhibits' ? (state.plan.exhibitMs ?? engine.PLANNED_MS.exhibits) : (engine.PLANNED_MS[stage] ?? 0)) / SECOND;
  return engine.timeInStages(state).map((t) => ({ stage: t.stage, seconds: t.seconds, endedBy: t.endedBy, planned: planned(t.stage) }));
}

/**
 * Plays one write-up once. Every decision about the case is the engine's; this only decides when the member writes, what they press, and
 * how far the clock has moved, and then reads the saved session back.
 */
export async function playCase(raw, mode, candidate, engine, startAt = START_AT) {
  const spec = CANDIDATE_SPECS[candidate];
  const clock = { t: startAt };
  const info = { name: String(raw?.name ?? ''), book: String(raw?.book ?? ''), caseType: '', industry: '' };
  const { deps, db } = engine.createMemoryLiveDeps({
    userId: USER,
    cases: { [LIB]: { info, solution: raw } },
    now: () => clock.t,
    record: false,
    reply: stubModel(spec),
  });
  const timed = mode !== 'learning';

  const run = {
    mode,
    candidate,
    stage: 'prompt',
    endReason: null,
    stalled: false,
    /** How many times the candidate wrote on one beat before the harness gave up on it (0 when it never did). */
    exhausted: 0,
    cappedOut: false,
    threw: false,
    error: null,
    /** How many exhibits the member was actually handed, counted from what arrived rather than from the plan. */
    exhibitsShown: 0,
    /** Anything of an interviewer-side exhibit that reached the member. Must stay empty: see `exhibitLeaks`. */
    leaks: [],
    steps: 0,
    coachCalls: 0,
    refusals: [],
    rungs: [],
    unprompted: 0,
    reachedRecommendWrite: false,
    feedback: false,
    beatsTotal: 0,
    beats: [],
    stages: [],
    seconds: 0,
    limitSeconds: 0,
  };

  // Everything the member was ever handed, gathered as it arrives rather than read off the last view, so a run that throws is still
  // judged on what reached them before it did.
  const delivered = new Map();
  const heard = new Set();
  const record = (v) => {
    for (const e of v.exhibits ?? []) delivered.set(`${e.beat}|${e.title}`, e);
    for (const m of v.messages ?? []) if (m.from !== 'user') heard.add(m.text);
  };

  let view = null;
  try {
    const started = await engine.handleLive(USER, { type: 'start', libraryId: LIB, mode }, deps);
    if (started.status !== 'ok') {
      run.error = `the case would not start (${started.status}: ${'message' in started ? started.message : ''})`;
      return run;
    }
    view = started.view;
    record(view);
    const id = view.sessionId;

    const ask = async (action) => {
      const res = await engine.handleLive(USER, action, deps);
      run.steps += 1;
      if (res.status === 'ok') {
        view = res.view;
        record(view);
      } else if (res.status === 'refused' || res.status === 'failed') run.refusals.push(`${action.type}: ${res.message}`);
      return res;
    };

    // The clock moves only here. In a timed mode the member cannot act after their stage has run out; a learning case has no clock at all.
    const think = (ms) => {
      if (!timed) {
        clock.t += ms;
        return true;
      }
      const latest = view.stageEndsAt - SECOND;
      if (latest <= clock.t) return false;
      clock.t = Math.min(clock.t + ms, latest);
      return true;
    };

    let clarified = 0;
    let beatKey = -1;
    let writtenOnBeat = 0;

    const step = async () => {
      if (!spec.acts) return false;
      switch (view.stage) {
        case 'prompt':
          if (clarified < spec.clarifyQuestions) {
            if (!think(spec.thinkMs)) return false;
            clarified += 1;
            run.coachCalls += 1;
            await ask({ type: 'say', sessionId: id, text: WRITES.clarify });
            return true;
          }
          if (!think(2 * SECOND)) return false;
          await ask({ type: 'ready', sessionId: id });
          return true;
        case 'framework_think':
        case 'brainstorm_think':
        case 'recommend_think':
          if (!think(spec.thinkMs)) return false;
          await ask({ type: 'ready', sessionId: id });
          return true;
        case 'framework_write':
          if (!think(spec.thinkMs)) return false;
          if (view.frameworkPhase === 'framework') await ask({ type: 'submit', sessionId: id, text: WRITES.framework });
          else {
            run.coachCalls += 1;
            await ask({ type: 'say', sessionId: id, text: WRITES.direction });
          }
          return true;
        case 'brainstorm_write':
          if (!think(spec.thinkMs)) return false;
          await ask({ type: 'submit', sessionId: id, text: WRITES.brainstorm });
          return true;
        case 'recommend_write':
          if (!think(spec.thinkMs)) return false;
          await ask({ type: 'submit', sessionId: id, text: WRITES.recommendation });
          return true;
        case 'exhibits': {
          const choice = spec.beat(writtenOnBeat);
          if (choice === 'nothing' || choice === 'wait') {
            if (choice === 'nothing' && writtenOnBeat > 0) run.exhausted = writtenOnBeat;
            return false;
          }
          if (!think(spec.thinkMs)) return false;
          if (choice === 'moveOn') {
            const res = await ask({ type: 'next', sessionId: id });
            if (res.status !== 'ok') writtenOnBeat = 0; // refused: write again rather than press again
            return true;
          }
          // The rung this message will be answered at, from the engine's own rule, read exactly where the engine reads it.
          const state = db.get(id)?.state;
          if (state) run.rungs.push(engine.nudgeLevel(state, clock.t));
          writtenOnBeat += 1;
          run.coachCalls += 1;
          await ask({ type: 'say', sessionId: id, text: WRITES.exhibit });
          return true;
        }
        default:
          return false;
      }
    };

    let idle = 0;
    let last = '';
    while (view.stage !== 'done' && run.steps < STEP_CAP) {
      if (view.nextNudgeAt !== null) run.unprompted += 1;
      if (view.beatsShown !== beatKey) {
        beatKey = view.beatsShown;
        writtenOnBeat = 0;
      }
      const acted = await step();
      if (!acted) {
        if (!timed) {
          run.stalled = true; // nothing left for the member to do, and no clock to carry them
          break;
        }
        clock.t = Math.max(clock.t + SECOND, view.stageEndsAt + SECOND);
        await ask({ type: 'resume', sessionId: id });
      }
      const sig = `${view.stage}|${view.frameworkPhase}|${view.messages.length}|${view.beatsShown}|${view.status}`;
      if (sig === last) {
        idle += 1;
        if (idle >= 3) {
          run.stalled = true;
          break;
        }
      } else {
        idle = 0;
        last = sig;
      }
    }
    if (run.steps >= STEP_CAP) {
      run.stalled = true;
      run.cappedOut = true;
    }

    if (view.stage === 'done') {
      const r = await ask({ type: 'finish', sessionId: id });
      run.feedback = r.status === 'ok' && Boolean(r.view.feedback);
    }
  } catch (error) {
    run.threw = true;
    run.error = error instanceof Error ? `${error.message}` : String(error);
  }

  const solution = engine.readSolution(raw);
  run.exhibitsShown = delivered.size;
  if (solution) run.leaks = exhibitLeaks([...delivered.values()], [...heard], solution, engine.isInterviewerSideExhibit);

  const state = [...db.values()][0]?.state;
  if (state) {
    run.stage = state.stage;
    run.endReason = state.endReason;
    run.reachedRecommendWrite = state.stageLog.some((e) => e.stage === 'recommend_write');
    run.beatsTotal = state.plan.beats.length;
    run.beats = state.beats.map((b) => ({ outcome: b.outcome, hints: b.hints }));
    run.stages = stageTimes(engine, state);
    run.seconds = Math.round(((state.endedAt ?? clock.t) - state.startedAt) / SECOND);
    run.limitSeconds = Math.round((state.plan.limitMs ?? 30 * 60 * SECOND) / SECOND);
  }
  return run;
}

/** Why a run did not reach the end, in words that group: the same sentence means the same defect. */
export function failureCause(run) {
  if (run.leaks.length > 0) return 'an interviewer-side exhibit reached the member';
  if (run.threw) return `threw an exception at ${run.stage}: ${run.error}`;
  if (run.error) return run.error;
  if (run.cappedOut) return `still going at ${run.stage} after ${STEP_CAP} turns`;
  if (run.stalled) {
    if (run.mode !== 'learning') return `stalled at ${run.stage} (the clock stopped carrying the case)`;
    return run.exhausted > 0
      ? `stalled at ${run.stage} (learning mode has no clock, and nothing but the member's own "move on" ends a beat they never complete: ${run.exhausted} messages and the beat was still open)`
      : `stalled at ${run.stage} (learning mode has no clock, and a member who writes nothing is never carried on)`;
  }
  return `stopped at ${run.stage}`;
}

export const reachedEnd = (run) => run.stage === 'done' && !run.error && !run.stalled;

/**
 * A run that stopped where the engine means to stop: an untimed case, waiting on a member who neither completed a beat nor chose to move
 * on. Learning mode has no clock and Bucket never moves a learner on, so there is nothing left to carry them and nothing is broken. It is
 * counted and named, never hidden, but it is not a failure and does not fail the command: see the note in the summary.
 */
export const openByDesign = (run) =>
  run.leaks.length === 0 && !reachedEnd(run) && run.mode === 'learning' && run.stalled && !run.threw && !run.cappedOut && !run.error && CANDIDATE_SPECS[run.candidate]?.endsBeats === false;

/**
 * A run that broke: it did not reach the end and the engine did not mean to leave it there, or something of the interviewer's own
 * exhibits reached the member. This is what the command exits non-zero on. A leak fails whether or not the case finished: a case that
 * ran beautifully and showed the member the answer key is the worse of the two.
 */
export const failedTheBar = (run) => run.leaks.length > 0 || (!reachedEnd(run) && !openByDesign(run));

// ---------------------------------------------------------------------------------------------------------------------------
// Every case
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Plays every write-up that live practice offers, in every mode, against every candidate. Two write-ups of the same case name are folded the
 * way `scripts/buildLibrarySeed.mjs` does; a write-up live practice refuses (`isFullSolution`) is listed as skipped and never played.
 */
export async function playAll(entries, engine, options = {}) {
  const modes = options.modes ?? MODES;
  const candidates = options.candidates ?? CANDIDATES;
  const onCase = options.onCase;
  const seen = new Map();
  const folded = [];
  const skipped = [];
  const queue = [];
  for (const raw of entries) {
    const name = String(raw?.name ?? '');
    const key = nameKey(name);
    if (seen.has(key)) {
      folded.push({ name, keptName: seen.get(key) });
      continue;
    }
    seen.set(key, name);
    if (!engine.isFullSolution(raw)) skipped.push({ name, book: String(raw?.book ?? '') });
    else queue.push(raw);
  }
  queue.sort((a, b) => nameKey(String(a.name)).localeCompare(nameKey(String(b.name))) || String(a.book ?? '').localeCompare(String(b.book ?? '')));
  const chosen = options.limit ? queue.slice(0, options.limit) : queue;

  const cases = [];
  for (const raw of chosen) {
    const runs = [];
    for (const mode of modes) {
      for (const candidate of candidates) {
        runs.push(await playCase(raw, mode, candidate, engine));
      }
    }
    const one = { name: String(raw.name ?? ''), book: String(raw.book ?? ''), beats: runs[0]?.beatsTotal ?? 0, runs };
    cases.push(one);
    onCase?.(one, cases.length, chosen.length);
  }
  skipped.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
  return { cases, folded, skipped, read: entries.length, modes, candidates };
}

const tally = (values) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map());

/** The numbers the summary is made of, all counted over the runs that were actually played. */
export function summarise(result) {
  const runs = result.cases.flatMap((c) => c.runs);
  const done = runs.filter(reachedEnd);
  const failed = runs.filter(failedTheBar);
  const byDesign = runs.filter(openByDesign);
  const beats = runs.flatMap((r) => r.beats);
  const cells = new Map();
  for (const mode of result.modes) {
    for (const candidate of result.candidates) {
      const cell = runs.filter((r) => r.mode === mode && r.candidate === candidate);
      cells.set(`${mode}/${candidate}`, { of: cell.length, done: cell.filter(reachedEnd).length });
    }
  }
  const over = runs.flatMap((r) => r.stages.filter((s) => s.planned > 0 && s.seconds > s.planned).map((s) => s.stage));
  return {
    read: result.read,
    folded: result.folded.length,
    cases: result.cases.length,
    skipped: result.skipped.length,
    runs: runs.length,
    done: done.length,
    short: runs.length - done.length,
    failed: failed.length,
    byDesign: byDesign.length,
    threw: runs.filter((r) => r.error).length,
    stalled: runs.filter((r) => r.stalled).length,
    leaked: runs.filter((r) => r.leaks.length > 0).length,
    exhibitsDelivered: sum(runs.map((r) => r.exhibitsShown)),
    cells,
    endStates: tally(runs.map((r) => `${r.stage} / ${r.endReason ?? 'still running'}`)),
    causes: tally(failed.map(failureCause)),
    byDesignCauses: tally(byDesign.map(failureCause)),
    beatsPlanned: sum(runs.map((r) => r.beatsTotal)),
    beatsReached: beats.length,
    outcomes: tally(beats.map((b) => b.outcome)),
    everyBeat: runs.filter((r) => r.beatsTotal > 0 && r.beats.length === r.beatsTotal && r.beats.every((b) => b.outcome !== 'open')).length,
    withBeats: runs.filter((r) => r.beatsTotal > 0).length,
    rungs: tally(runs.map((r) => RUNGS[Math.max(0, ...r.rungs.map((x) => RUNGS.indexOf(x)))])),
    hints: sum(beats.map((b) => b.hints)),
    hinted: runs.filter((r) => sum(r.beats.map((b) => b.hints)) > 0).length,
    recommendReached: runs.filter((r) => r.reachedRecommendWrite).length,
    recommendInTime: runs.filter((r) => r.reachedRecommendWrite && r.endReason === 'completed').length,
    hitLimit: runs.filter((r) => r.endReason === 'time_limit').length,
    overPlan: tally(over),
    refusals: tally(runs.flatMap((r) => r.refusals.map((x) => x.replace(/\s+/g, ' ').trim()))),
    unprompted: sum(runs.map((r) => r.unprompted)),
    feedback: done.filter((r) => r.feedback).length,
    coachCalls: sum(runs.map((r) => r.coachCalls)),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------------------------------------

const pad = (label, value) => `  ${label.padEnd(50, ' ')}${String(value).padStart(7, ' ')}`;
const counted = (m, keys) => keys.map((k) => pad(`  ${k}`, m.get(k) ?? 0));
const sortedKeys = (m) => [...m.keys()].sort();

/** The block that is meant to be diffed between two runs and pasted into an issue: one fact per line, in a fixed order. */
export function formatSummary(s, result) {
  const cell = (key) => {
    const c = s.cells.get(key) ?? { of: 0, done: 0 };
    return pad(`  ${key}`, `${c.done} of ${c.of}`);
  };
  return [
    'Write-ups',
    pad('write-ups read', s.read),
    pad('folded as a duplicate name', s.folded),
    pad('live-eligible, played', s.cases),
    pad('not live-eligible, skipped', s.skipped),
    '',
    'The bar: no case breaks, and nothing of the interviewer\'s own exhibits reaches the member. A run',
    'FAILS when it does not reach stage done in a mode that has a clock, when it throws, when it stops',
    'anywhere the engine did not mean to leave it, or when an interviewer-side exhibit reached the',
    'member. The command exits non-zero on failures only.',
    pad('runs', s.runs),
    pad('reached the end', s.done),
    pad('did not reach the end', s.short),
    pad('  failed the bar', s.failed),
    pad('  open by design (see below)', s.byDesign),
    pad('threw an exception', s.threw),
    '',
    'What the member was handed. Every exhibit they received is asked the production rule itself',
    '(isInterviewerSideExhibit), and no interviewer-side exhibit may be named to them. Figures from',
    'the interviewer\'s tables are read out on request by design (issue #83) and are not counted here;',
    'the model is stubbed, so this says what the engine hands over, never what a real Bucket says.',
    pad('exhibits handed to the member', s.exhibitsDelivered),
    pad('runs where an interviewer-side exhibit reached them (must be 0)', s.leaked),
    '',
    'Reached the end, by mode and candidate',
    ...result.modes.flatMap((m) => result.candidates.map((c) => cell(`${m}/${c}`))),
    '',
    'Why a run failed the bar',
    ...(s.causes.size === 0 ? [pad('  nothing failed the bar', 0)] : counted(s.causes, sortedKeys(s.causes))),
    '',
    'Open by design: an untimed case waiting on a member who neither completed a beat nor moved on.',
    'Not a defect, and not counted as one. It is still a product question: a learner who stops',
    'engaging is never moved on, and only their own "move on" or "end case" gets them out.',
    ...(s.byDesignCauses.size === 0 ? [pad('  none', 0)] : counted(s.byDesignCauses, sortedKeys(s.byDesignCauses))),
    '',
    'End state (stage / endReason)',
    ...counted(s.endStates, sortedKeys(s.endStates)),
    '',
    'Beats',
    pad('beats in the plans', s.beatsPlanned),
    pad('beats the member reached', s.beatsReached),
    pad('runs that reached every beat of their case', `${s.everyBeat} of ${s.withBeats}`),
    'Beat outcomes',
    ...counted(s.outcomes, BEAT_OUTCOMES),
    '',
    'Help',
    pad('hints given', s.hints),
    pad('runs with at least one hint', s.hinted),
    'Highest nudge rung reached in a run',
    ...counted(s.rungs, RUNGS),
    pad('replies the clock asked for unprompted (must be 0)', s.unprompted),
    '',
    'The clock',
    pad('runs that reached the recommendation stage', s.recommendReached),
    pad('  and finished inside the case limit', s.recommendInTime),
    pad('runs that ran out of time', s.hitLimit),
    'Stages that ran over their planned time',
    ...(s.overPlan.size === 0 ? [pad('  none', 0)] : counted(s.overPlan, sortedKeys(s.overPlan))),
    '',
    'The engine refused the member',
    ...(s.refusals.size === 0 ? [pad('  nothing was refused', 0)] : counted(s.refusals, sortedKeys(s.refusals))),
    '',
    'Afterwards',
    pad('cases that ended with feedback written', s.feedback),
    pad('coach replies asked of the stub', s.coachCalls),
  ].join('\n');
}

const runLine = (r) => {
  const outcomes = BEAT_OUTCOMES.filter((o) => r.beats.some((b) => b.outcome === o)).map((o) => `${o} ${r.beats.filter((b) => b.outcome === o).length}`);
  const hints = sum(r.beats.map((b) => b.hints));
  const rung = RUNGS[Math.max(0, ...r.rungs.map((x) => RUNGS.indexOf(x)))];
  const parts = [
    `${r.mode}/${r.candidate}`.padEnd(22, ' '),
    `${r.stage}/${r.endReason ?? '-'}`.padEnd(22, ' '),
    `beats ${r.beats.length}/${r.beatsTotal}`.padEnd(12, ' '),
    (outcomes.join(', ') || 'none').padEnd(34, ' '),
    `hints ${hints}`.padEnd(9, ' '),
    `rung ${rung}`.padEnd(22, ' '),
    r.mode === 'learning' ? `${r.seconds}s (untimed)` : `${r.seconds}s of ${r.limitSeconds}s`,
  ];
  const notes = [
    r.reachedRecommendWrite ? '' : 'no recommendation stage',
    r.feedback ? '' : 'no feedback',
    r.error ? `THREW ${r.error}` : '',
    r.leaks.length > 0 ? `LEAKED ${r.leaks.join('; ')}` : '',
    r.stalled ? (openByDesign(r) ? 'OPEN BY DESIGN' : 'STALLED') : '',
  ].filter(Boolean);
  return `  ${parts.join(' ')}${notes.length > 0 ? `  [${notes.join('; ')}]` : ''}`;
};

function caseBlock(c) {
  return [`### ${c.name}${c.book ? ` — ${c.book}` : ''}`, `beats: ${c.beats}`, ...c.runs.map(runLine)].join('\n');
}

/** Every run that matches `pick`, as `{ case, run }`, gathered under the sentence that says why it stopped. */
function groupByCause(result, pick) {
  const grouped = new Map();
  for (const c of result.cases) {
    for (const r of c.runs.filter(pick)) {
      const cause = failureCause(r);
      if (!grouped.has(cause)) grouped.set(cause, []);
      grouped.get(cause).push({ c, r });
    }
  }
  return grouped;
}

const causeBlocks = (grouped, verb) =>
  [...grouped.entries()].flatMap(([cause, list]) => [
    `### ${cause} (${list.length})`,
    '',
    ...list.map((f) => `- ${f.c.name}${f.c.book ? ` — ${f.c.book}` : ''}: ${f.r.mode}/${f.r.candidate}, ${verb} ${f.r.stage}`),
    '',
  ]);

export function formatReport(result, { dir, files, at, seconds }) {
  const s = summarise(result);
  const failures = groupByCause(result, failedTheBar);
  const byDesign = groupByCause(result, openByDesign);
  const notCompleted = result.cases.flatMap((c) => c.runs.filter((r) => reachedEnd(r) && r.endReason !== 'completed').map((r) => ({ c, r })));
  return [
    '# Live-case dry run',
    '',
    `Run: ${at} (${seconds}s)`,
    `Source: ${dir} (${files} file(s))`,
    `Modes: ${result.modes.join(', ')}. Candidates: ${result.candidates.map((c) => `${c} (${CANDIDATE_SPECS[c].what})`).join('; ')}.`,
    `Exhibits handed to the member: ${s.exhibitsDelivered}. Runs where an interviewer-side exhibit reached them: ${s.leaked} (must be 0).`,
    'Engine: handleLive from supabase/functions/_shared/liveCaseCoach.ts over supabase/functions/_shared/liveCase.ts, on the in-memory deps',
    'in src/test/memoryLiveDeps.ts. No rule is reimplemented here.',
    'The model is stubbed: the candidate decides assessment, beat_complete and direction_clear from which turn was asked for and how many',
    'times it has written on the beat, and nothing else. The stub never reads the case, so this report says whether a case survives to the',
    'end, never whether Bucket\'s words are any good.',
    'Content: case names, book names, modes, stages and counts only. No prompt, figure or solution text is in this file.',
    '',
    '## Summary',
    '',
    '```',
    formatSummary(s, result),
    '```',
    '',
    `## Interviewer-side exhibits that reached the member (${s.leaked})`,
    '',
    'Every exhibit the member was handed is asked `isInterviewerSideExhibit` on the payload itself, and no interviewer-side exhibit may',
    'be named to them in a message. Figures are a different question on purpose: the interviewer reads out the data a member asks for',
    '(issue #83), and that is correct. Only titles are printed below, never a caption, a cell or a figure.',
    '',
    ...(s.leaked === 0
      ? ['None: in every mode, for every candidate, over the whole catalogue.', '']
      : [
          ...result.cases.flatMap((c) =>
            c.runs
              .filter((r) => r.leaks.length > 0)
              .map((r) => `- ${c.name}${c.book ? ` — ${c.book}` : ''}: ${r.mode}/${r.candidate} — ${r.leaks.join('; ')}`),
          ),
          '',
        ]),
    `## Cases that failed the bar (${s.failed})`,
    '',
    'A run fails when it does not reach stage done in a mode that has a clock, when it throws, when it stops anywhere the engine did',
    'not mean to leave it, or when an interviewer-side exhibit reached the member. The command exits non-zero when this list is not empty.',
    '',
    ...(s.failed === 0 ? ['None: every case reached stage done in every timed mode, for every candidate, and nothing of the interviewer\'s reached them.', ''] : causeBlocks(failures, 'stopped at')),
    `## Open by design (${s.byDesign})`,
    '',
    'An untimed case waiting on a member who neither completed a beat nor chose to move on. Learning mode has no clock and Bucket never',
    'moves a learner on, so there is nothing to carry them and nothing is broken; these are named, not counted as failures, and they do',
    'not fail the command. They are still worth a product decision: a learner who stops engaging is never moved on.',
    '',
    ...(s.byDesign === 0 ? ['None.', ''] : causeBlocks(byDesign, 'left at')),
    `## Reached the end, but not by completing it (${notCompleted.length})`,
    '',
    ...(notCompleted.length === 0 ? ['None.', ''] : [...notCompleted.map((f) => `- ${f.c.name}${f.c.book ? ` — ${f.c.book}` : ''}: ${f.r.mode}/${f.r.candidate}, ended ${f.r.endReason}`), '']),
    ...(result.skipped.length > 0
      ? [`## Not live-eligible, never played (${result.skipped.length})`, '', ...result.skipped.map((c) => `- ${c.name}${c.book ? ` — ${c.book}` : ''}`), '']
      : []),
    ...(result.folded.length > 0 ? ['## Folded duplicate names', '', ...result.folded.map((f) => `- ${f.name} (kept: ${f.keptName})`), ''] : []),
    `## Every case (${result.cases.length})`,
    '',
    ...result.cases.map(caseBlock).flatMap((block) => [block, '']),
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------------------------------------------------------

const option = (argv, name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const chooseList = (value, allowed, what) => {
  const list = value.split(',').map((x) => x.trim()).filter(Boolean);
  const bad = list.filter((x) => !allowed.includes(x));
  if (bad.length > 0) throw new Error(`Unknown ${what}: ${bad.join(', ')}. Choose from ${allowed.join(', ')}.`);
  return list;
};

async function main(argv) {
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/liveCaseDryRun.mjs [--dir private-data/solutions] [--out reports/live-case-dry-run.md]');
    console.log(`                                      [--modes ${MODES.join(',')}] [--candidates ${CANDIDATES.join(',')}] [--cases N]`);
    return 0;
  }
  const dir = option(argv, 'dir', DEFAULT_DIR);
  const out = option(argv, 'out', DEFAULT_OUT);
  const modes = chooseList(option(argv, 'modes', MODES.join(',')), MODES, 'mode');
  const candidates = chooseList(option(argv, 'candidates', CANDIDATES.join(',')), CANDIDATES, 'candidate');
  const limit = Number(option(argv, 'cases', '0')) || 0;

  const { files, entries, broken } = readSolutionFiles(dir);
  const engine = await loadEngine();
  const began = Date.now();
  let shown = 0;
  const result = await playAll(entries, engine, {
    modes,
    candidates,
    limit,
    onCase: (_one, i, total) => {
      if (i === total || i - shown >= 25) {
        shown = i;
        process.stderr.write(`\r  played ${i} of ${total} cases (${Math.round((Date.now() - began) / 1000)}s)   `);
      }
    },
  });
  process.stderr.write('\n');
  const seconds = Math.round((Date.now() - began) / 1000);
  const report = formatReport(result, { dir, files: files.length, at: new Date().toISOString(), seconds });
  const target = resolve(ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, report);
  const s = summarise(result);
  console.log(formatSummary(s, result));
  console.log(`\nWrote ${out} (${result.cases.length} cases, ${s.runs} runs, ${s.failed} that failed the bar, ${s.byDesign} open by design).`);
  if (broken.length > 0) {
    console.error(`\n${broken.length} write-up(s) could not be read:`);
    for (const b of broken) console.error(`  ${b}`);
    return 1;
  }
  return s.failed > 0 ? 1 : 0;
}

// Run only when this file is the command. The engine is TypeScript, so an older Node is restarted with type stripping switched on.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.features.typescript) {
    process.exitCode = await main(process.argv.slice(2));
  } else {
    const flags = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
    const run = spawnSync(process.execPath, [...flags, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
    if (run.error) throw new Error(`This script needs Node 22.6 or newer, which can read the TypeScript engine: ${run.error.message}`);
    process.exitCode = run.status ?? 1;
  }
}
