// Plays every live-eligible write-up through the real live case, from the prompt to the recommendation, and writes one report saying which
// cases reach the end and which stop in the middle. Nothing here decides anything about the case: the engine is `handleLive` from
// supabase/functions/_shared/liveCaseCoach.ts over the rules in liveCase.ts, exactly as the Edge Function runs them, on the in-memory deps
// the tests use (src/test/memoryLiveDeps.ts). The clock is driven through `deps.now()`, so a whole catalogue takes minutes and no real time.
//
//   npm run dryrun:live                                   # writes reports/live-case-dry-run.md and prints the summary
//   npm run dryrun:live -- --modes practice,interview     # a subset of modes
//   npm run dryrun:live -- --candidates brisk --cases 20  # a subset of candidates, and only the first N cases
//
// THE PRETENDING, AND WHAT IT CAN NOW REACH. In production the model decides what the engine acts on — `assessment`, `beat_complete`,
// `direction_clear`, `data_request`, and whether it declines the turn at all — and writes the words the member reads. Here a scripted
// candidate decides all of that instead, from nothing but which kind of turn was asked for and how many times that candidate has written
// on the beat (see CANDIDATES below), and the stub can write a reply in any of the shapes the engine's filters are built to catch
// (see REPLIES). The stub still never reads the case: the two shapes that need one are built by `playCase` and handed to it.
//
// So this says whether a case survives to the end, which rules fired on the way, and whether a reply of a given shape reached the member
// or was caught. What it still cannot say is whether Bucket's words are any good: nothing here writes English worth judging, and no
// scripted candidate reasons about the case. For that there is the real-model pilot, which costs money.
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
import { describeCommit, readSolutionFiles } from './liveCaseAudit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = 'private-data/solutions';
const DEFAULT_OUT = 'reports/live-case-dry-run.md';

/** The moment every case starts, so two runs can be diffed. */
export const START_AT = Date.parse('2026-11-16T09:00:00.000Z');
const LIB = 'dry-run-case';
const USER = 'dry-run-user';
/** Longer than any stage, so a draft typed "after thinking this long" lands at the last second the stage allows. */
const LATE_DRAFT_MS = 20 * 60 * 1000;
/** A run that needs more turns than this has gone wrong, whatever the engine says. */
const STEP_CAP = 400;
const SECOND = 1000;

export const MODES = ['practice', 'interview', 'learning'];
export const CANDIDATES = ['brisk', 'passive', 'offtrack', 'asker', 'plausible', 'coached', 'probing', 'blocked', 'circling', 'unfiltered', 'interrupted'];
export const BEAT_OUTCOMES = ['independent', 'hinted', 'coach_moved', 'member_moved', 'timed_out', 'open'];
export const RUNGS = ['none', 'process_hint', 'directional_hint', 'lead', 'advance'];
/** The shapes the stub can give a reply, in the order the summary prints them. See `REPLIES` for what each one is. */
export const REPLY_SHAPES = [
  'plain',
  'verdict',
  'bare_verdict',
  'verdict_question',
  'verdict_moves_on',
  'tell',
  'tell_only',
  'withholds',
  'narration',
  'moves_on',
  'held_figure',
  'private_note',
  'not_json',
  'empty',
];
/**
 * What became of a reply the stub wrote: the member read it word for word, read it with a filter's edit in it, read one of the
 * engine's own stand-in lines instead, or read nothing at all because the reply could not be used.
 */
export const REPLY_FATES = ['kept', 'edited', 'stand_in', 'dropped'];
/** An empty count of what became of one shape's replies. */
export const noReplies = () => ({ sent: 0, ...Object.fromEntries(REPLY_FATES.map((f) => [f, 0])) });

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
    heldResults: coach.heldResults,
    standIns: standInLines(coach),
    isInterviewerSideExhibit: liveCase.isInterviewerSideExhibit,
    nudgeLevel: liveCase.nudgeLevel,
    timeInStages: liveCase.timeInStages,
    PLANNED_MS: liveCase.PLANNED_MS,
    createMemoryLiveDeps: memory.createMemoryLiveDeps,
  };
}

/**
 * The lines the engine writes itself when it throws a reply away, taken from the engine rather than copied: when the member reads one
 * of these, a filter replaced what the model said. Not a judgement — a reply replaced at the right moment is the rule working.
 */
export const standInLines = (coach) => [coach.FALLBACK, coach.LEAD_FALLBACK, coach.MOVING_ON, coach.OVER_TO_YOU, coach.SHOW_DATA, coach.WORK_IS_YOURS, coach.WORK_IT_TOGETHER];

/** How a sentence of the interviewer's notes is found in the write-up, with no sentence ever carried out of this process. */
const SENTENCES = /(?<=[.!?])\s+|\s\/\s/;
/**
 * One sentence of the private notes for the stub to repeat word for word, which is what `leaks` is there to catch. It is taken from
 * the recommendation, which is private in every mode, and only when it is long enough for the rule to see (the rule ignores anything
 * under 40 characters) and short enough to survive the reply's own length cap. A case with no such sentence is counted as skipped.
 */
export function privateSentenceOf(solution) {
  if (!solution) return '';
  for (const block of [solution.recommendation ?? '', ...(solution.because ?? [])]) {
    for (const sentence of String(block).split(SENTENCES)) {
      const s = sentence.replace(/\s+/g, ' ').trim();
      if (s.length >= 80 && s.length <= 400) return s;
    }
  }
  return '';
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
// The exceptions are the few written to be read by a rule rather than counted: `plausible`, `gaveUp`, `stuck` and `step` are each
// shaped for one side of `madeAStep`, which is the floor the model's score is held to (issue #130).
const WRITES = {
  clarify: 'Can I check who the client is and what success would look like for them?',
  framework: 'Three buckets: the market, the economics and the ways to act on them.',
  direction: 'I would start with the economics, because that is where the problem is most likely to sit.',
  exhibit: 'Looking at this, the pattern I notice seems worth following up.',
  /** The one message written to be judged rather than counted: it sounds like an answer and names nothing (issue #130). */
  plausible: 'There is definitely something going on here and it feels like it matters for the client.',
  /** A whole message that is nothing but giving up, which `madeAStep` reads before anything else. */
  gaveUp: 'No idea.',
  /** A figure, and then saying in so many words that they do not know what to do with it, with no next move named. */
  stuck: 'The gap is about 12 percent and I am not sure what to do with that.',
  /** A real step forward: a figure, a comparison and the next move, so the model's 'progress' survives `assessmentOf`. */
  step: 'Revenue fell 12 percent while costs rose, so I would break the gap down by segment and check which one drives it.',
  /** Asking for data rather than being stuck on the part, which is what `data_request` says of a message. */
  dataAsk: 'Could you give me the cost per unit and the volumes for last year?',
  /** Asking outright for the answer: the message a real model declines (`stopReason: 'refusal'`). */
  answerPlease: 'Just tell me the answer to this one and I will move on.',
  /** Half an answer: something seen, nothing worked out, which is what 'partial' is for. */
  half: 'The northern shops look weaker to me, though I have not worked out by how much.',
  brainstorm: 'A few ideas, grouped into the ones that act on volume and the ones that act on price.',
  recommendation: 'My recommendation is the option the numbers support, with the main risk named and a next step.',
};

/**
 * THE SECOND PIECE OF PRETENDING: what a reply looks like. The stub used to write one fixed sentence, so every filter in `parseTurn`
 * was dead in every run — the harness could say a case survived and nothing at all about what the member read. These are the shapes
 * the filters are built to catch, one per rule, none of them good English and none of them meant to be:
 *
 *  - `verdict` / `bare_verdict` grade the member's reading, which an interview never does (`withoutVerdicts`), and
 *    `verdict_question` keeps the question on the end of one, while `verdict_moves_on` is a verdict that is also the move-on.
 *  - `tell` talks about the member in the third person and instructs them (`hasTell`); `tell_only` is nothing but that, so the whole
 *    reply has to be replaced, and `withholds` announces an answer being kept back, which has a line of its own.
 *  - `narration` puts the narrator's voice in front of a fact (`withoutSourceNarration`).
 *  - `moves_on` is a genuine move-on sentence, which the move-on rule keeps rather than replaces (`movingOnOnly`).
 *  - `held_figure` states a figure the book worked out in a table the member cannot see (`statesHeldResult`).
 *  - `private_note` repeats a sentence of the interviewer's notes word for word (`leaks`, `sharesSubstance`).
 *  - `not_json` and `empty` are the two ways a reply is no reply at all, which `parseTurn` answers with null.
 *
 * The last two of the readable ones need the case itself, so `playCase` builds them from the write-up it is playing and hands them to
 * the stub: the stub still reads nothing. A case that holds neither is counted as skipped rather than quietly sent something else.
 */
const REPLIES = {
  plain: () => 'Understood. Carry on.',
  verdict: () => 'You are exactly right, and that is the key insight here. What would you do with it next?',
  bare_verdict: () => 'That is exactly right.',
  verdict_question: () => 'You are exactly right — so what would you do with it next?',
  verdict_moves_on: () => 'That is exactly right, so let us move on to the next part.',
  tell: () => 'The candidate should start with the revenue side. What do you make of this part?',
  tell_only: () => 'The candidate should start with the revenue side.',
  withholds: () => 'I will not give you the answer to this one.',
  narration: () => 'according to the case, the two halves of the business are run apart. what stands out to you?',
  moves_on: () => 'Let us turn to the next part now.',
  held_figure: (ctx) => {
    const figure = ctx.heldFigure();
    ctx.figure = figure;
    return figure ? `The figure you are after is ${figure}. What would you do with it?` : null;
  },
  private_note: (ctx) => (ctx.privateSentence ? `${ctx.privateSentence} What would you do next?` : null),
  not_json: () => 'Bucket wandered off and wrote this instead of an answer.',
  empty: () => '',
};

/**
 * The candidates, and everything each of them pretends. `exhibit` is what the stub sends back for a turn on a beat, which is the only
 * place the model can end a beat; `beat` is what the candidate does next on the beat it is on, given how many times it has already written
 * there. A candidate with `acts: false` never writes and never presses a button, so only the clock can carry its case.
 *
 * `endsBeats` says whether this candidate can end a beat by itself, by completing it or by choosing "move on". One that cannot has no way
 * out of a beat in an untimed mode, where there is no clock and Bucket never moves a learner on: that is the design, so a run of theirs
 * that stops there is counted as open by design rather than as a case that broke.
 *
 * The first five are the original ones and are untouched, so their run lines can still be diffed against every earlier report. The six
 * after them exist for the shapes the engine branches on that nothing could produce before (issue #181): a hint that precedes progress,
 * a request for data, a turn the model declines, a 'partial' score, a reply worth filtering, and a case that is paused, drafted in and
 * ended early. Each new candidate carries only the extra fields it needs; everything else about them is read the same way as before.
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
  plausible: {
    what: 'writes messages that sound like progress and name nothing, and whose every message the model scores a clear step forward',
    acts: true,
    thinkMs: 30 * SECOND,
    clarifyQuestions: 2,
    directionClear: true,
    /**
     * The pilot's own failure (issue #130): the member sounds reasonable and is stuck, and the model calls every message a step
     * forward, so the rung counter is reset every time and the help ladder never engages. This is the one candidate whose messages
     * are written to be read rather than counted, because the engine now holds that score to what they wrote.
     */
    exhibit: { assessment: 'progress', beatComplete: false },
    writes: 'plausible',
    beatCap: OFFTRACK_BEAT_CAP,
    endsBeats: false,
    beat: (written) => (written < OFFTRACK_BEAT_CAP ? 'write' : 'nothing'),
  },
  coached: {
    what: 'is lost, takes the help, and then closes the part — the only one whose beats can come out hinted',
    acts: true,
    thinkMs: 20 * SECOND,
    clarifyQuestions: 1,
    directionClear: true,
    exhibit: { assessment: 'progress', beatComplete: false },
    /**
     * Gave up, then named a figure and said they did not know what to do with it, then wrote a real step forward and finished the
     * part on it. The model calls all three a step forward, which is the pilot's own failure (issue #130): the first two are held to
     * what was written and come back as 'unclear', so the help ladder engages, and the third is a step forward and survives.
     */
    says: (written) => (written === 0 ? 'gaveUp' : written === 1 ? 'stuck' : 'step'),
    exhibitTurn: (written) => ({ assessment: 'progress', beatComplete: written >= 2 }),
    endsBeats: true, // by completing every one of them, after the help
    beat: (written) => (written <= 2 ? 'write' : 'wait'),
  },
  probing: {
    what: 'asks for figures, which the model marks as a request for data, and then chooses "move on"',
    acts: true,
    thinkMs: 25 * SECOND,
    clarifyQuestions: 2,
    directionClear: true,
    exhibit: { assessment: 'unclear', beatComplete: false, dataRequest: true },
    says: () => 'dataAsk',
    endsBeats: true, // by choosing "move on"
    beat: (written) => (written < 3 ? 'write' : 'moveOn'),
  },
  blocked: {
    what: 'asks outright for the answer, so the model declines the turn, and declines to write the feedback at the end as well',
    acts: true,
    thinkMs: 25 * SECOND,
    clarifyQuestions: 1,
    directionClear: true,
    exhibit: { assessment: 'unclear', beatComplete: false },
    says: () => 'answerPlease',
    /**
     * The model itself declines the turn (`stopReason: 'refusal'`), which nothing could produce before. It declines the feedback
     * too, so the one run in every case where the member is told their feedback could not be written is a run we can see.
     */
    refuses: (kind) => kind === 'exhibit' || kind === 'feedback',
    endsBeats: true, // by choosing "move on": a declined turn never completes a beat
    beat: (written) => (written < 2 ? 'write' : 'moveOn'),
  },
  circling: {
    what: 'takes a long time over half-answers, which the model scores partial: the clock keeps moving and the help ladder does not reset',
    acts: true,
    /** Slow on purpose: a part that has had longer than it is worth is the one place `nudgeLevel` skips a rung of help. */
    thinkMs: 100 * SECOND,
    clarifyQuestions: 2,
    directionClear: true,
    exhibit: { assessment: 'partial', beatComplete: false },
    says: () => 'half',
    endsBeats: true, // by choosing "move on", which is the only way out of a beat in learning; in a timed mode the coach gets there
    // first, because the third half-answer in a row is a member circling (issue #184)
    beat: (written) => (written < 4 ? 'write' : 'moveOn'),
  },
  unfiltered: {
    what: 'writes ordinarily and is answered by a model that says things it should not, so every filter in parseTurn is made to run',
    acts: true,
    thinkMs: 25 * SECOND,
    clarifyQuestions: 2,
    /** Their starting direction settles only on the second asking, so both turns of the framework stage are answered by a shape. */
    directionClear: (asked) => asked > 0,
    exhibit: { assessment: 'unclear', beatComplete: false },
    /** The one candidate whose stub writes the shapes above instead of its one fixed sentence. */
    shapes: true,
    endsBeats: true, // by choosing "move on"
    beat: (written) => (written < 4 ? 'write' : 'moveOn'),
  },
  interrupted: {
    what: 'uses the scratchpad, types into the box and leaves it there, pauses in the middle and comes back, and ends the case early',
    acts: true,
    thinkMs: 60 * SECOND,
    clarifyQuestions: 1,
    directionClear: true,
    exhibit: { assessment: 'unclear', beatComplete: false },
    /** Saves a draft in every writing stage and lets the clock take it; writes in the scratchpad; pauses once in the discussion;
     * ends the case while writing the recommendation, where a mode that allows it keeps what is in the box; logs the case after. */
    drafts: true,
    pauses: true,
    endsEarly: true,
    logs: true,
    /** Presses "move on" before writing anything: the modes that assess the member refuse it, and learning lets them go. */
    jumpsFirst: true,
    endsBeats: true, // by choosing "move on"
    beat: (written) => (written < 1 ? 'write' : 'moveOn'),
  },
};

/**
 * The feedback the stub writes at the end. It judges nobody: the ratings are there so that the rule that keeps a rating only when it
 * quotes something the member wrote is made to run both ways — the first skill quotes the framework every acting candidate hands in,
 * the second quotes nothing of theirs, and the third is a behavioural one, which is never rated however well it is evidenced.
 */
const FEEDBACK = {
  overall_rating: 3,
  overall_feedback: 'A dry run: no one is being judged here.',
  skills: [
    { key: 'framework', rating: 3, feedback: 'The structure was handed in.', evidence: 'the market, the economics' },
    { key: 'quant', rating: 4, feedback: 'Nothing was worked out here.', evidence: 'a sentence the member never wrote' },
    { key: 'behavioral1', rating: 5, feedback: 'Nothing a dry run can say.', evidence: 'the market, the economics' },
    { key: 'not-a-skill', rating: 5, feedback: 'A key the engine does not know, which it drops.', evidence: 'the market, the economics' },
  ],
  went_well: 'The case ran.',
  struggled: 'Nothing a scripted candidate can be said to have struggled with.',
  concepts: '',
  next_focus: '',
  improvement_area: 'none',
  debrief: [{ stage: 'framework', observed: 'A framework was handed in.', to_improve: 'Say where you would start.' }],
  unfinished: [],
};

/**
 * What `playCase` keeps for the stub between turns: how many times the member has written on the part in front of them, which shape
 * the last reply had and what it said (so the harness can see what the member was actually shown), and the two shapes that are built
 * from the case being played. Everything in it is written by the harness; the stub reads it and never the case.
 */
export const newStubContext = (over = {}) => ({
  written: 0,
  turns: 0,
  directions: 0,
  shape: 'plain',
  message: '',
  skipped: 0,
  refused: 0,
  dataRequests: 0,
  partials: 0,
  heldFigure: () => '',
  privateSentence: '',
  ...over,
});

/** The stubbed model: the candidate's decisions, in the shape the engine parses. It is told nothing about the case. */
export function stubModel(spec, ctx = newStubContext()) {
  const turn = (over) => ({ message: REPLIES.plain(), assessment: 'unclear', beat_complete: false, direction_clear: false, ...over });
  /**
   * The reply's words. For every candidate but one that is the fixed sentence; for `unfiltered` it is the next shape in the list, and
   * a shape this case holds nothing for (no held figure, no long enough private sentence) is skipped and counted.
   */
  const words = (base) => {
    ctx.shape = 'plain';
    if (!spec.shapes) {
      ctx.message = base.message;
      return base;
    }
    for (let i = 0; i < REPLY_SHAPES.length; i += 1) {
      const shape = REPLY_SHAPES[(ctx.turns + i) % REPLY_SHAPES.length];
      const text = REPLIES[shape](ctx);
      if (text === null) {
        ctx.skipped += 1;
        continue;
      }
      ctx.turns += i + 1;
      ctx.shape = shape;
      ctx.message = text;
      // Not a reply at all: the one the engine cannot parse, and the one with nothing in it.
      return shape === 'not_json' ? text : { ...base, message: text };
    }
    ctx.message = base.message;
    return base;
  };
  return (kind) => {
    if (kind === 'feedback') return FEEDBACK;
    if (kind === 'clarify') return words(turn({ assessment: 'progress' }));
    if (kind === 'direction') {
      // A candidate whose starting direction settles only on the second asking says so with a function rather than a flag.
      const clear = typeof spec.directionClear === 'function' ? spec.directionClear(ctx.directions) : spec.directionClear;
      ctx.directions += 1;
      return words(turn({ assessment: 'progress', direction_clear: clear }));
    }
    if (kind === 'exhibit') {
      const e = spec.exhibitTurn ? spec.exhibitTurn(ctx.written) : spec.exhibit;
      if (e.assessment === 'partial') ctx.partials += 1;
      if (e.dataRequest) ctx.dataRequests += 1;
      return words(turn({ assessment: e.assessment, beat_complete: e.beatComplete, ...(e.dataRequest ? { data_request: true } : {}) }));
    }
    // Only the three turn kinds above are ever asked for; anything else is answered as a stuck member, so nothing hangs.
    return words(turn({ assessment: 'stuck' }));
  };
}

/** Which turns this candidate's model declines outright, which the engine answers in character (issue #142). */
export function stubStopReason(spec, ctx = newStubContext()) {
  return (kind) => {
    if (!spec.refuses || !spec.refuses(kind)) return 'end_turn';
    ctx.refused += 1;
    // The model's own words never reach the member — the engine writes the line for this moment — so there is no shape to judge.
    ctx.shape = null;
    ctx.message = '';
    return 'refusal';
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
  const solution = engine.readSolution(raw);
  const ctx = newStubContext({
    // The two shapes that need the case, built here and handed over, so the stub itself still reads nothing of it. A figure the book
    // worked out in a table the member cannot see, read at the moment of the reply because what is held changes as the case goes.
    heldFigure: () => {
      const state = [...db.values()][0]?.state;
      return solution && state ? (engine.heldResults(solution, state)[0] ?? '') : '';
    },
    privateSentence: privateSentenceOf(solution),
  });
  const { deps, db } = engine.createMemoryLiveDeps({
    userId: USER,
    cases: { [LIB]: { info, solution: raw } },
    now: () => clock.t,
    record: false,
    reply: stubModel(spec, ctx),
    stopReason: stubStopReason(spec, ctx),
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
    /** The brainstorms the case plans, the ones the member was asked, and the ones they handed in (issue #133). */
    brainstorms: { planned: 0, asked: 0, answered: 0 },
    /** Shape of reply the stub wrote, to what became of it: `{ sent, kept, edited, stand_in, dropped }`. */
    replies: {},
    /** What the stub put the engine through, counted by the stub itself (issue #181). */
    stub: { refused: 0, dataRequests: 0, partials: 0, skipped: 0 },
    /** Replies that carried the book's own worked figure, or a sentence of the interviewer's notes, as far as the member. Must be 0. */
    answerReached: 0,
    /** What was handed in without the member pressing anything: the drafts the clock (or their own "end case") kept. */
    timedOutDrafts: 0,
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

    /**
     * A message to Bucket, and what the member read back. The stub says which shape it wrote and what it said; the engine's own
     * stand-in lines say when a reply was thrown away whole. Four fates: the member read it word for word, read an edited version of
     * it, read one of the engine's own lines instead, or read nothing because the turn failed. The words themselves are never kept.
     */
    const say = async (text) => {
      const had = view.messages.length;
      run.coachCalls += 1;
      const res = await ask({ type: 'say', sessionId: id, text });
      const reply = (res.status === 'ok' ? view.messages.slice(had) : []).find((m) => m.from !== 'user');
      if (ctx.shape) {
        const fate = !reply ? 'dropped' : reply.text === ctx.message ? 'kept' : engine.standIns.includes(reply.text) ? 'stand_in' : 'edited';
        const seen = (run.replies[ctx.shape] ??= noReplies());
        seen.sent += 1;
        seen[fate] += 1;
        // The two shapes that carry the answer are asked a harder question than "was it changed": is any of it still there? An
        // edited reply that kept the sentence, or the figure inside a longer line, would be the answer handed over all the same.
        const answer = ctx.shape === 'private_note' ? ctx.privateSentence : ctx.shape === 'held_figure' ? ctx.figure : '';
        if (answer && reply && reply.text.includes(answer)) run.answerReached += 1;
      }
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
    /** The writing stages this candidate has already typed into, so a draft is saved once and then left where it is. */
    const drafted = new Set();
    let paused = false;
    /** Whether the member has already tried to leave the part in front of them without writing anything. */
    let jumped = false;
    let ended = false;

    /**
     * Types into the box of a writing stage without handing anything in, once per stage. In a timed mode the candidate then leaves it
     * there and the clock takes it (`captureTimedOut`); an untimed case has no clock to take it, so it is handed in on the next turn.
     * Returns false when there is nothing to type here or it has been typed already.
     */
    const draft = async (key) => {
      if (!spec.drafts || drafted.has(key)) return false;
      drafted.add(key);
      // Typed at the last moment the clock allows, which is also the one that puts the writing grace to work: a stage whose time is
      // up runs on a little for someone who is still typing.
      if (!think(timed ? LATE_DRAFT_MS : spec.thinkMs)) return false;
      await ask({ type: 'draft', sessionId: id, key, text: WRITES[key] });
      return true;
    };

    const step = async () => {
      if (!spec.acts) return false;
      switch (view.stage) {
        case 'prompt':
          if (await draft('clarify')) return true;
          if (clarified < spec.clarifyQuestions) {
            if (!think(spec.thinkMs)) return false;
            clarified += 1;
            await say(WRITES.clarify);
            return true;
          }
          if (!think(2 * SECOND)) return false;
          await ask({ type: 'ready', sessionId: id });
          return true;
        case 'framework_think':
          // The thinking stage's own box, which is the member's alone and never handed in or seen by the model.
          if (spec.drafts && !drafted.has('scratchpad')) {
            drafted.add('scratchpad');
            await ask({ type: 'scratch', sessionId: id, text: 'Revenue, cost, market. Start with the economics.' });
            return true;
          }
        // falls through to the other thinking stages
        case 'brainstorm_think':
        case 'recommend_think':
          if (!think(spec.thinkMs)) return false;
          await ask({ type: 'ready', sessionId: id });
          return true;
        case 'framework_write': {
          const key = view.frameworkPhase === 'framework' ? 'framework' : 'direction';
          if (await draft(key)) return true;
          // Typed and left there: in a timed mode the clock takes the draft, and an untimed case hands it in instead.
          if (spec.drafts && timed) return false;
          if (!think(spec.thinkMs)) return false;
          if (view.frameworkPhase === 'framework') await ask({ type: 'submit', sessionId: id, text: WRITES.framework });
          else await say(WRITES.direction);
          return true;
        }
        case 'brainstorm_write':
          if (await draft('brainstorm')) return true;
          if (spec.drafts && timed) return false;
          if (!think(spec.thinkMs)) return false;
          await ask({ type: 'submit', sessionId: id, text: WRITES.brainstorm });
          return true;
        case 'recommend_write':
          if (await draft('recommendation')) return true;
          // The member stops the case here, with what they have typed kept as the unfinished draft it is. Interview mode has no early
          // end, so there the refusal is recorded and the clock finishes the case instead.
          if (spec.endsEarly && !ended) {
            ended = true;
            const over = await ask({ type: 'end', sessionId: id });
            if (over.status === 'ok') return true;
          }
          if (spec.drafts && timed) return false;
          if (!think(spec.thinkMs)) return false;
          await ask({ type: 'submit', sessionId: id, text: WRITES.recommendation });
          return true;
        case 'exhibits': {
          // Stops the clock in the middle of the discussion and starts it again, so what was left on it is what is left when they
          // come back (`shiftTimes`), with the beats, the stage log and what is typed in the box all moved on with it. The member
          // keeps typing while the case is paused, which nothing is allowed to save.
          if (spec.pauses && !paused) {
            paused = true;
            const held = await ask({ type: 'pause', sessionId: id });
            if (held.status === 'ok') {
              await ask({ type: 'draft', sessionId: id, key: 'exhibit', text: 'Typed while the case was paused.' });
              clock.t += 30 * SECOND;
              await ask({ type: 'continue', sessionId: id });
            }
            return true;
          }
          // "Move on" before a word has been written here: refused where the member is being assessed on what they cover, and
          // allowed in learning, where the member alone decides when a part is over.
          if (spec.jumpsFirst && !jumped) {
            jumped = true;
            if (!think(spec.thinkMs)) return false;
            await ask({ type: 'next', sessionId: id });
            return true;
          }
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
          // What the stub decides can depend on how many times the member has written here: a hint comes before the step that closes
          // the part, which is the one order no candidate could play before (issue #181).
          ctx.written = writtenOnBeat;
          writtenOnBeat += 1;
          await say(WRITES[spec.says ? spec.says(ctx.written) : (spec.writes ?? 'exhibit')]);
          return true;
        }
        default:
          return false;
      }
    };

    let idle = 0;
    let last = '';
    while (view.stage !== 'done' && run.steps < STEP_CAP) {
      // Help is never unprompted (DECISIONS.md, section 1). There is no longer a request that asks for it (issue #188), so what is
      // left to watch is the engine's own answer: the clock alone must never produce a rung of help.
      const quiet = db.get(id)?.state;
      if (quiet && engine.nudgeLevel(quiet, clock.t, 'timer') !== 'none') run.unprompted += 1;
      if (view.beatsShown !== beatKey) {
        beatKey = view.beatsShown;
        writtenOnBeat = 0;
        jumped = false;
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
      // Logging the case afterwards is the last thing the screen can do with a finished session.
      if (spec.logs && run.feedback) await ask({ type: 'logged', sessionId: id, caseId: 'dry-run-logged-case' });
    }
  } catch (error) {
    run.threw = true;
    run.error = error instanceof Error ? `${error.message}` : String(error);
  }

  run.exhibitsShown = delivered.size;
  if (solution) run.leaks = exhibitLeaks([...delivered.values()], [...heard], solution, engine.isInterviewerSideExhibit);
  run.stub = { refused: ctx.refused, dataRequests: ctx.dataRequests, partials: ctx.partials, skipped: ctx.skipped };

  const state = [...db.values()][0]?.state;
  if (state) {
    run.stage = state.stage;
    run.endReason = state.endReason;
    run.reachedRecommendWrite = state.stageLog.some((e) => e.stage === 'recommend_write');
    // The parts of the discussion. A brainstorm is a part of the case too (issue #133), but it is answered in its own two stages and
    // has no outcome worth reporting here, so it is counted on its own line below.
    const isBrainstorm = (i) => state.plan.beats[i]?.kind === 'brainstorm';
    run.beatsTotal = state.plan.beats.filter((b) => b.kind !== 'brainstorm').length;
    run.beats = state.beats.filter((b) => !isBrainstorm(b.index)).map((b) => ({ outcome: b.outcome, hints: b.hints }));
    run.brainstorms = {
      planned: state.plan.beats.filter((b) => b.kind === 'brainstorm').length,
      asked: state.beats.filter((b) => isBrainstorm(b.index)).length,
      answered: state.submissions.filter((x) => x.kind === 'brainstorm').length,
    };
    run.timedOutDrafts = state.submissions.filter((x) => x.timedOut).length;
    run.stages = stageTimes(engine, state);
    run.seconds = Math.round(((state.endedAt ?? clock.t) - state.startedAt) / SECOND);
    run.limitSeconds = Math.round((state.plan.limitMs ?? 30 * 60 * SECOND) / SECOND);
  }
  return run;
}

/** Why a run did not reach the end, in words that group: the same sentence means the same defect. */
export function failureCause(run) {
  if (run.leaks.length > 0) return 'an interviewer-side exhibit reached the member';
  if (run.answerReached > 0) return "a reply carried the book's own answer to the member";
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
  run.leaks.length === 0 &&
  run.answerReached === 0 && !reachedEnd(run) && run.mode === 'learning' && run.stalled && !run.threw && !run.cappedOut && !run.error && CANDIDATE_SPECS[run.candidate]?.endsBeats === false;

/**
 * A run that broke: it did not reach the end and the engine did not mean to leave it there, or the member was shown something of the
 * interviewer's own — an exhibit of theirs, or a reply that carried the book's own answer (a worked figure they cannot see, or a
 * sentence of the private notes). This is what the command exits non-zero on. Either kind of leak fails whether or not the case
 * finished: a case that ran beautifully and handed the member the answer is the worse of the two.
 */
export const failedTheBar = (run) => run.leaks.length > 0 || run.answerReached > 0 || (!reachedEnd(run) && !openByDesign(run));

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
  // A learning case has no clock, so a stage of one cannot run over: the planned times are not applied to it at all.
  const over = runs.flatMap((r) => (r.mode === 'learning' ? [] : r.stages.filter((s) => s.planned > 0 && s.seconds > s.planned).map((s) => s.stage)));
  // What the stub wrote, and what the member read back, by shape.
  const shapes = new Map();
  for (const r of runs) {
    for (const [shape, seen] of Object.entries(r.replies)) {
      const t = shapes.get(shape) ?? noReplies();
      for (const k of Object.keys(t)) t[k] += seen[k] ?? 0;
      shapes.set(shape, t);
    }
  }
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
    brainstormsPlanned: sum(runs.map((r) => r.brainstorms.planned)),
    brainstormsAsked: sum(runs.map((r) => r.brainstorms.asked)),
    brainstormsAnswered: sum(runs.map((r) => r.brainstorms.answered)),
    everyBrainstorm: runs.filter((r) => r.brainstorms.planned > 0 && r.brainstorms.asked === r.brainstorms.planned).length,
    withBrainstorms: runs.filter((r) => r.brainstorms.planned > 0).length,
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
    shapes,
    shapesSkipped: sum(runs.map((r) => r.stub.skipped)),
    declined: sum(runs.map((r) => r.stub.refused)),
    dataRequests: sum(runs.map((r) => r.stub.dataRequests)),
    partials: sum(runs.map((r) => r.stub.partials)),
    timedOutDrafts: sum(runs.map((r) => r.timedOutDrafts)),
    /** A reply that carried one of the book's own worked figures, or a sentence of the interviewer's notes, as far as the member. */
    toldTheAnswer: sum(runs.map((r) => r.answerReached)),
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
  const shape = (name) => {
    const c = s.shapes.get(name) ?? noReplies();
    const part = (label, n) => `${String(n).padStart(8, ' ')} ${label}`;
    return `    ${name.padEnd(17, ' ')}${part('sent', c.sent)}${part('kept', c.kept)}${part('edited', c.edited)}${part('stand-in', c.stand_in)}${part('dropped', c.dropped)}`;
  };
  return [
    'Write-ups',
    pad('write-ups read', s.read),
    pad('folded as a duplicate name', s.folded),
    pad('live-eligible, played', s.cases),
    pad('not live-eligible, skipped', s.skipped),
    '',
    'The bar: no case breaks, and nothing of the interviewer\'s own reaches the member. A run FAILS when it',
    'does not reach stage done in a mode that has a clock, when it throws, when it stops anywhere the engine',
    'did not mean to leave it, when an interviewer-side exhibit reached the member, or when a reply carried',
    'the book\'s own answer to them. The command exits non-zero on failures only.',
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
    'Brainstorms (a part of the case with two stages of its own, not a beat of the discussion)',
    pad('  brainstorms in the plans', s.brainstormsPlanned),
    pad('  brainstorms the member was asked', s.brainstormsAsked),
    pad('  brainstorms the member handed in', s.brainstormsAnswered),
    pad('  runs asked every brainstorm of their case', `${s.everyBrainstorm} of ${s.withBrainstorms}`),
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
    'Stages that ran over the time the plan drew for them (the timed modes: a learning case has no clock). Two of the',
    'engine\'s own rules do this on purpose: a writing stage runs on for someone still typing, and the discussion keeps',
    'going while the member is getting somewhere. Neither takes a minute from the closing stages.',
    ...(s.overPlan.size === 0 ? [pad('  none', 0)] : counted(s.overPlan, sortedKeys(s.overPlan))),
    '',
    'What the model said, and what the member read back. Each shape is a reply one of the engine\'s filters is built to',
    'catch; the stub writes them so the filters can be seen running. A reply is kept word for word, edited by a filter,',
    'replaced by one of the engine\'s own lines, or dropped because it could not be used at all. Only the `unfiltered`',
    'candidate writes anything but `plain`, and a shape built from the case is skipped where the case holds nothing for it.',
    ...REPLY_SHAPES.map(shape),
    pad('shapes the case held nothing for, skipped', s.shapesSkipped),
    pad('turns the model declined outright (stopReason refusal)', s.declined),
    pad('replies that answered a request for data', s.dataRequests),
    pad('turns the model scored partial', s.partials),
    pad('answers kept from the box by the clock or an early end', s.timedOutDrafts),
    pad('replies that carried a held figure or a private note whole (must be 0)', s.toldTheAnswer),
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

export function formatReport(result, { dir, files, at, seconds, commit = 'unknown' }) {
  const s = summarise(result);
  const failures = groupByCause(result, failedTheBar);
  const byDesign = groupByCause(result, openByDesign);
  const notCompleted = result.cases.flatMap((c) => c.runs.filter((r) => reachedEnd(r) && r.endReason !== 'completed').map((r) => ({ c, r })));
  return [
    '# Live-case dry run',
    '',
    // The sha rides on the Run: line on purpose: two runs are diffed with this one line excluded, and one exclusion covers both.
    `Run: ${at} (${seconds}s) — commit ${commit}`,
    `Source: ${dir} (${files} file(s))`,
    `Modes: ${result.modes.join(', ')}. Candidates: ${result.candidates.map((c) => `${c} (${CANDIDATE_SPECS[c].what})`).join('; ')}.`,
    `Exhibits handed to the member: ${s.exhibitsDelivered}. Runs where an interviewer-side exhibit reached them: ${s.leaked} (must be 0).`,
    'Engine: handleLive from supabase/functions/_shared/liveCaseCoach.ts over supabase/functions/_shared/liveCase.ts, on the in-memory deps',
    'in src/test/memoryLiveDeps.ts. No rule is reimplemented here.',
    'The model is stubbed: the candidate decides assessment, beat_complete, direction_clear, data_request and whether the model declines',
    'the turn, from which turn was asked for and how many times it has written on the beat, and nothing else; the reply itself is one of a',
    'fixed set of shapes, written to be caught by the engine\'s filters rather than to be read. The stub never reads the case, so this',
    'report says whether a case survives to the end and which rules fired on the way, never whether Bucket\'s words are any good.',
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
    'not mean to leave it, when an interviewer-side exhibit reached the member, or when a reply carried the book\'s own answer to them.',
    'The command exits non-zero when this list is not empty.',
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
  const report = formatReport(result, { dir, files: files.length, at: new Date().toISOString(), seconds, commit: describeCommit() });
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
