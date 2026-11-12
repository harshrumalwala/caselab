// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  coachSays,
  deadlines,
  endFrameworkStage,
  hardEnd,
  LIMIT_MS,
  newSession,
  nextBeat,
  nextNudgeAt,
  nudgeLevel,
  openBeat,
  PLANNED_MS,
  ready,
  recordAssessment,
  recordHint,
  saveDraft,
  saveScratchpad,
  settle,
  stageEndsAt,
  submit,
  userSays,
  WRITING_GRACE_MS,
  type ActionResult,
  type CasePlan,
  type SessionState,
} from '../../supabase/functions/_shared/liveCase';

const T0 = Date.parse('2026-11-12T15:00:00Z');
const sec = (n: number) => n * 1000;
const at = (s: number) => T0 + sec(s);

const plan = (exhibits: number, brainstorm = true): CasePlan => ({
  beats: Array.from({ length: exhibits }, (_, index) => ({ kind: 'exhibit' as const, index })),
  hasBrainstorm: brainstorm,
  brainstormTopic: 'ways to grow',
});
const start = (p = plan(3)) => newSession(p, T0, 'Prompt text');
const ok = (r: ActionResult): SessionState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const stages = (s: SessionState) => s.stageLog.map((e) => e.stage);

/** Gets through the opening stages the quick way and returns the session on the first exhibit, `now` seconds in. */
function toExhibits(p: CasePlan, now: number): SessionState {
  let s = start(p);
  s = ok(ready(s, at(now)));
  s = ok(ready(s, at(now)));
  s = ok(submit(s, 'My framework', at(now)));
  s = ok(userSays(s, 'I would start with demand', at(now)));
  return endFrameworkStage(s, at(now));
}

describe('the plan from a case', () => {
  it('uses the exhibits as the main work, and finds a brainstorm among the steps', () => {
    const p = buildPlan({ exhibits: [{}, {}], steps: [{ title: 'Size demand' }, { title: 'Brainstorm: ways to grow' }] });
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 0 }, { kind: 'exhibit', index: 1 }]);
    expect(p.hasBrainstorm).toBe(true);
    expect(p.brainstormTopic).toBe('ways to grow');
  });

  it('works through the steps (without the brainstorm) when a case has no exhibits', () => {
    const p = buildPlan({ exhibits: [], steps: [{ title: 'Size demand' }, { title: 'Brainstorming ideas' }, { title: 'Check break-even' }] });
    expect(p.beats).toEqual([{ kind: 'step', index: 0 }, { kind: 'step', index: 2 }]);
    expect(p.hasBrainstorm).toBe(true);
  });

  it("keeps the interviewer's own tables off the screen: only the exhibits meant for the candidate come out", () => {
    const p = buildPlan({
      exhibits: [{ title: 'Exhibit 1: Sales by region' }, { title: 'Interviewer Guidance: Revenue' }, { title: 'Exhibit 2 - Solution' }, { title: 'Exhibit #2: Costs' }, { title: 'Calculation to be performed by candidate' }, { title: 'Sample Approach: Costs' }],
      steps: [{ title: 'Framework' }],
    });
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 0 }, { kind: 'exhibit', index: 3 }]);
  });

  it('works through the steps when every table is the interviewer\'s (as in a case whose only table is a guide)', () => {
    const p = buildPlan({ exhibits: [{ title: 'Interviewer Guidance: Revenue' }], steps: [{ title: 'Framework' }, { title: 'Pricing analysis' }, { title: 'Brainstorm: costs' }] });
    expect(p.beats).toEqual([{ kind: 'step', index: 1 }]); // the "Framework" step is not discussed again, and the brainstorm has its own stages
    expect(p.hasBrainstorm).toBe(true);
  });

  it('finds a brainstorm in a table of brainstorm ideas, and what it is about', () => {
    const p = buildPlan({ exhibits: [{ title: 'Exhibit 1: Sales' }, { title: 'Brainstorm #1: costs along the value chain' }], steps: [] });
    expect(p.hasBrainstorm).toBe(true);
    expect(p.brainstormTopic).toBe('costs along the value chain');
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 0 }]);
  });

  it('has no brainstorm when the case has none', () => {
    expect(buildPlan({ exhibits: [{}], steps: [{ title: 'Size demand' }] }).hasBrainstorm).toBe(false);
  });
});

describe('the clock', () => {
  it('starts with the prompt, runs one continuous 30 minutes and adds up to 25:30 planned', () => {
    const s = start();
    expect(s.startedAt).toBe(T0);
    expect(hardEnd(s)).toBe(T0 + LIMIT_MS);
    expect(LIMIT_MS).toBe(sec(1800));
    expect(Object.values(PLANNED_MS).reduce((a, b) => a + b, 0)).toBe(sec(25 * 60 + 30));
    expect(s.stage).toBe('prompt');
    expect(stageEndsAt(s)).toBe(at(180));
    expect(s.messages[0]).toMatchObject({ from: 'coach', text: 'Prompt text' });
  });

  it('moves through the thinking stages by itself, never resetting the overall time', () => {
    let s = settle(start(), at(180));
    expect(s.stage).toBe('framework_think');
    expect(s.stageStartedAt).toBe(at(180));
    s = settle(s, at(270)); // 90 seconds of thinking, then the writing opens by itself
    expect(s.stage).toBe('framework_write');
    expect(hardEnd(s)).toBe(T0 + LIMIT_MS);
    expect(stageEndsAt(s)).toBe(at(450));
  });

  it('puts the member where they should be after being away, and records the stages passed', () => {
    const s = settle(start(), at(600));
    expect(stages(s)).toEqual(['prompt', 'framework_think', 'framework_write', 'exhibits']);
    expect(s.stage).toBe('exhibits');
    expect(s.beats).toHaveLength(1);
    expect(s.beats[0].revealedAt).toBe(at(450)); // revealed when the stage opened, not when they came back
  });

  it('ends the case at 30 minutes, saving what is typed as a draft captured at timeout', () => {
    let s = toExhibits(plan(1, false), 200);
    s = nextBeat(s, at(300), 'independent');
    expect(s.stage).toBe('recommend_think');
    s = settle(s, at(340));
    expect(s.stage).toBe('recommend_write');
    s = saveDraft(s, 'recommendation', 'Open the hotel only if', at(350));
    const done = settle(s, at(5000));
    expect(done.stage).toBe('done');
    expect(done.endReason).toBe('completed'); // the recommendation ran out of its own time well before 30 minutes
    expect(done.submissions.find((x) => x.kind === 'recommendation')).toMatchObject({ text: 'Open the hotel only if', timedOut: true });
  });

  it('enforces the 30-minute limit when the clock is the thing that runs out', () => {
    let s = settle(start(plan(1, false)), at(450));
    s = recordAssessment(s, 'progress', at(1650)); // still making progress, so the discussion runs on to its reserve
    expect(settle(s, at(1700)).stage).toBe('exhibits');
    s = settle(s, at(1715));
    expect(s.stage).toBe('recommend_think'); // the recommendation starts by 28:30 for a case with no brainstorm
    s = settle(s, at(1745));
    expect(s.stage).toBe('recommend_write');
    s = saveDraft(s, 'recommendation', 'Open the hotel only if', at(1760));
    const done = settle(s, at(1900));
    expect(done.stage).toBe('done');
    expect(done.endReason).toBe('time_limit');
    expect(done.endedAt).toBe(T0 + LIMIT_MS);
    expect(done.submissions.find((x) => x.kind === 'recommendation')).toMatchObject({ text: 'Open the hotel only if', timedOut: true });
  });

  it('refuses answers once the case is over', () => {
    const done = settle(start(), at(5000));
    expect(done.stage).toBe('done');
    expect(userSays(done, 'hello', at(5001)).ok).toBe(false);
    expect(submit(done, 'hello', at(5001)).ok).toBe(false);
    expect(ready(done, at(5001)).ok).toBe(false);
  });
});

describe('time saved and flexible time', () => {
  it('carries time saved by finishing early into the exhibit discussion', () => {
    const slow = settle(start(), at(450)); // used every planned second
    const fast = toExhibits(plan(3), 60); // got through the opening in one minute
    const slowRoom = deadlines(slow, 'exhibits', slow.stageStartedAt).hard - slow.stageStartedAt;
    const fastRoom = deadlines(fast, 'exhibits', fast.stageStartedAt).hard - fast.stageStartedAt;
    expect(slowRoom).toBe(sec(900 + 270)); // the planned 15 minutes plus the 4:30 of flexible time
    expect(fastRoom).toBeGreaterThan(slowRoom); // plus what was saved
  });

  it('never lets the discussion take the closing time: the recommendation starts by 28:30, the brainstorm by 27:00', () => {
    const withBrainstorm = deadlines(settle(start(plan(3, true)), at(450)), 'exhibits', at(450));
    const without = deadlines(settle(start(plan(3, false)), at(450)), 'exhibits', at(450));
    expect(withBrainstorm.hard).toBe(at(1620));
    expect(without.hard).toBe(at(1710));
  });

  it('skips the brainstorm cleanly when the case has none, going straight to the recommendation', () => {
    let s = toExhibits(plan(1, false), 100);
    s = nextBeat(s, at(200), 'independent');
    expect(s.stage).toBe('recommend_think');
    expect(stages(s)).not.toContain('brainstorm_think');
    expect(stages(s)).not.toContain('brainstorm_write');
  });

  it('goes brainstorm then recommendation when the case has a brainstorm', () => {
    let s = toExhibits(plan(1, true), 100);
    s = nextBeat(s, at(200), 'independent');
    expect(s.stage).toBe('brainstorm_think');
    expect(s.messages.filter((m) => m.stage === 'brainstorm_think')[0].text).toContain('ways to grow');
    s = settle(s, at(230));
    expect(s.stage).toBe('brainstorm_write');
    s = ok(submit(s, 'Ideas: pricing, new segments', at(250)));
    expect(s.stage).toBe('recommend_think');
    expect(s.submissions.find((x) => x.kind === 'brainstorm')).toMatchObject({ timedOut: false });
  });

  it('lets someone still typing finish a writing stage within the grace, but not beyond it', () => {
    let s = settle(start(), at(300));
    expect(s.stage).toBe('framework_write');
    s = saveDraft(s, 'framework', 'Profit = revenue - cost', at(445));
    expect(stageEndsAt(s)).toBe(at(450) + WRITING_GRACE_MS); // typing right up to the end: a little longer
    expect(settle(s, at(460)).stage).toBe('framework_write');
    const after = settle(s, at(481));
    expect(after.stage).toBe('exhibits');
    expect(after.submissions[0]).toMatchObject({ kind: 'framework', text: 'Profit = revenue - cost', timedOut: true });
  });

  it('gives nobody extra time if they stopped typing', () => {
    let s = settle(start(), at(300));
    s = saveDraft(s, 'framework', 'Profit', at(320));
    expect(stageEndsAt(s)).toBe(at(450));
  });
});

describe('the opening stages', () => {
  it('counts the clarifying questions, and lets the member move on early', () => {
    let s = start();
    s = ok(userSays(s, 'Who are the competitors?', at(20)));
    s = coachSays(s, 'Two large chains.', at(22));
    s = ok(userSays(s, 'What is the time frame?', at(40)));
    expect(s.clarifyCount).toBe(2);
    s = ok(ready(s, at(60)));
    expect(s.stage).toBe('framework_think');
    expect(s.stageLog[0]).toMatchObject({ stage: 'prompt', endedBy: 'user' });
  });

  it('keeps the scratchpad apart from the submitted framework', () => {
    let s = ok(ready(start(), at(30)));
    s = saveScratchpad(s, 'rough: demand / supply / cost');
    s = ok(ready(s, at(60)));
    s = ok(submit(s, 'Demand; supply; cost', at(100)));
    expect(s.scratchpad).toBe('rough: demand / supply / cost');
    expect(s.submissions[0].text).toBe('Demand; supply; cost');
  });

  it('asks where they would start after the framework, and keeps their direction', () => {
    let s = ok(ready(start(), at(5)));
    s = ok(ready(s, at(10)));
    s = ok(submit(s, 'Framework text', at(60)));
    expect(s.stage).toBe('framework_write');
    expect(s.frameworkPhase).toBe('direction');
    expect(s.messages.at(-1)?.text).toContain('Where would you start');
    s = ok(userSays(s, 'Start with demand', at(80)));
    expect(s.submissions.map((x) => x.kind)).toEqual(['framework', 'direction']);
  });

  it('refuses to hand in nothing, or to hand in out of turn', () => {
    const s = start();
    expect(submit(s, '   ', at(1)).ok).toBe(false);
    expect(submit(s, 'text', at(1)).ok).toBe(false);
    expect(ready(ok(ready(s, at(5))), at(6)).ok).toBe(true);
  });

  it('ignores a draft for a box that is not open', () => {
    const s = start();
    expect(saveDraft(s, 'recommendation', 'too early', at(5))).toBe(s);
  });
});

describe('the exhibit discussion', () => {
  const inExhibits = (n = 3) => toExhibits(plan(n), 100);

  it('brings out the first exhibit, then the next when the member gets there', () => {
    let s = inExhibits();
    expect(s.beats).toHaveLength(1);
    expect(s.messages.at(-1)).toMatchObject({ kind: 'exhibit', beat: 0 });
    s = nextBeat(s, at(200), 'independent');
    expect(s.beats.map((b) => b.outcome)).toEqual(['independent', 'open']);
    expect(s.messages.at(-1)).toMatchObject({ kind: 'exhibit', beat: 1 });
  });

  it('records whether they got there alone, needed a hint, or were moved on', () => {
    let s = inExhibits(4);
    s = nextBeat(s, at(150), 'independent');
    s = recordHint(s, at(200));
    s = nextBeat(s, at(210), 'independent');
    s = nextBeat(s, at(300), 'coach_moved');
    expect(s.beats.map((b) => b.outcome)).toEqual(['independent', 'hinted', 'coach_moved', 'open']);
  });

  it('shares the time out by how many exhibits there are, so more exhibits means shorter exchanges', () => {
    const few = toExhibits(plan(2), 100).beats[0].budgetMs;
    const many = toExhibits(plan(8), 100).beats[0].budgetMs;
    expect(many).toBeLessThan(few);
  });

  it('does nothing while the member is working, then gives a process hint, a directional hint, and moves on', () => {
    let s = inExhibits(3);
    const b = openBeat(s)!;
    const u = (n: number) => b.revealedAt + sec(n);
    expect(nudgeLevel(s, u(10))).toBe('none');
    expect(nudgeLevel(s, u(38))).toBe('process_hint');
    s = recordHint(s, u(38));
    expect(nudgeLevel(s, u(45))).toBe('none'); // not again at once
    expect(nudgeLevel(s, u(80))).toBe('directional_hint');
    s = recordHint(s, u(80));
    expect(nudgeLevel(s, u(100))).toBe('none');
    expect(nudgeLevel(s, u(120))).toBe('advance'); // about two minutes without progress: the case moves on
  });

  it('counts progress, so a member who keeps making progress is not nudged', () => {
    let s = inExhibits(3);
    const b = openBeat(s)!;
    s = recordAssessment(s, 'progress', b.revealedAt + sec(50));
    expect(nudgeLevel(s, b.revealedAt + sec(60))).toBe('none');
    s = recordAssessment(s, 'stuck', b.revealedAt + sec(100));
    expect(openBeat(s)!.lastProgressAt).toBe(b.revealedAt + sec(50)); // being stuck is not progress
  });

  it('does not mistake active typing for being stuck', () => {
    let s = inExhibits(3);
    const b = openBeat(s)!;
    s = saveDraft(s, 'exhibit', 'revenue is 40 so margin is', b.revealedAt + sec(55));
    expect(nudgeLevel(s, b.revealedAt + sec(60))).toBe('none');
    expect(nudgeLevel(s, b.revealedAt + sec(80))).not.toBe('none'); // stopped typing for 25 seconds
  });

  it('is quicker to help once behind schedule', () => {
    const s = inExhibits(6);
    const b = openBeat(s)!;
    const onTimeWait = nextNudgeAt(s, b.revealedAt)! - b.revealedAt;
    const behind = structuredClone(s);
    behind.beats[0].revealedAt = b.revealedAt - b.budgetMs - sec(10); // it has already taken longer than it is worth
    behind.beats[0].lastProgressAt = b.revealedAt;
    const behindWait = nextNudgeAt(behind, b.revealedAt)! - b.revealedAt;
    expect(behindWait).toBeLessThan(onTimeWait);
  });

  it('tells the app when to wake up for the next nudge, never in the past', () => {
    const s = inExhibits(3);
    const b = openBeat(s)!;
    const wake = nextNudgeAt(s, b.revealedAt + sec(1))!;
    expect(wake).toBeGreaterThan(b.revealedAt);
    expect(nudgeLevel(s, wake)).not.toBe('none');
    expect(nextNudgeAt(s, wake + sec(1000))).toBeGreaterThanOrEqual(wake + sec(1000));
    expect(nextNudgeAt(start(), T0)).toBeNull();
  });

  it('ends the discussion at its planned time, or later only while the member keeps making progress, and never past the closing reserve', () => {
    let s = inExhibits(3);
    const { soft, hard } = deadlines(s, 'exhibits', s.stageStartedAt);
    expect(stageEndsAt(s)).toBe(soft); // no recent progress: the planned end
    s = recordAssessment(s, 'progress', soft - sec(10));
    expect(stageEndsAt(s)).toBeGreaterThan(soft);
    expect(stageEndsAt(s)).toBeLessThanOrEqual(hard);
    s = recordAssessment(s, 'progress', hard);
    expect(stageEndsAt(s)).toBe(hard);
    const after = settle(s, hard + sec(1));
    expect(after.stage).toBe('brainstorm_think'); // the case has a brainstorm
    expect(after.stageStartedAt).toBe(hard);
    expect(hard).toBeLessThanOrEqual(at(1620));
  });

  it('handles a case with no exhibits at all by skipping that stage', () => {
    let s = start(plan(0, false));
    s = ok(ready(s, at(5)));
    s = ok(ready(s, at(10)));
    s = ok(submit(s, 'Framework', at(20)));
    s = endFrameworkStage(s, at(25));
    expect(s.stage).toBe('recommend_think');
  });
});

describe('late replies and refresh', () => {
  it('changes the revision with every change, so a late reply from the model is recognised as late', () => {
    const s0 = start();
    const s1 = ok(userSays(s0, 'A question?', at(10)));
    expect(s1.rev).toBeGreaterThan(s0.rev);
    const moved = settle(s1, at(200)); // the stage moved on while the model was thinking
    expect(moved.rev).toBeGreaterThan(s1.rev);
    expect(settle(moved, at(201)).rev).toBe(moved.rev); // nothing changed, so nothing bumped
  });

  it('is a plain value that survives being saved and reloaded', () => {
    let s = toExhibits(plan(3), 100);
    s = saveDraft(s, 'exhibit', 'half a thought', at(120));
    const reloaded = JSON.parse(JSON.stringify(s)) as SessionState;
    expect(settle(reloaded, at(130))).toEqual(settle(s, at(130)));
    expect(reloaded.drafts.exhibit).toBe('half a thought');
  });
});
