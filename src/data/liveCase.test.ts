// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  coachSays,
  continueCase,
  deadlines,
  endEarly,
  endFrameworkStage,
  hardEnd,
  LIMIT_MS,
  moveOn,
  newSession,
  nextBeat,
  nextNudgeAt,
  nudgeLevel,
  openBeat,
  pause,
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
const exhibits = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Exhibit ${i + 1}: Sales` }));
/** What a case with `n` things to work through is planned for: the exhibit stage and the whole case, in whole minutes. */
const minutes = (n: number): [number, number] => {
  const p = buildPlan({ exhibits: exhibits(n), steps: [] });
  return [(p.exhibitMs ?? 0) / 60_000, (p.limitMs ?? 0) / 60_000];
};

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

  it("hides a table by what it says even when its title is innocent: 'Information for Interviewee', 'Keep Private', 'the interviewer's math page'", () => {
    const p = buildPlan({
      exhibits: [
        { title: 'Current Revenues (1 of 2): Revenues', columns: ['Revenues', 'Information for Interviewee', 'Revenue Size (Keep Private)'], rows: [['Ticket Sales', 'x', '$80M']] },
        { title: 'Market sizes', caption: "From the interviewer's solution page." },
        { title: 'Costs', rows: [['Salaries', 'Give figures to the interviewee when asked']] },
        { title: 'Exhibit 3: Revenue by region', columns: ['Region', 'Private Pension', 'Private Label'], rows: [['US', '5', '6']] },
      ],
      steps: [],
    });
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 3 }]); // "Private Pension" and "Private Label" are just words in a real exhibit
  });

  it("hides the book's own working and answers, found in a caption or a cell, but not tables that only use ordinary words", () => {
    const p = buildPlan({
      exhibits: [
        { title: 'Part 5 - Warranty breakeven', caption: "Table on the book's solution page for step 5." },
        { title: 'Question 1A: Revenue ($M)', caption: "Book's working for the revenues the buyer would receive in 2017." },
        { title: 'Question 1', rows: [['Solve For (Answer $14M)', '']] },
        { title: 'Required additional capacity', caption: 'Part 2 solution table, in GW.' },
        { title: 'Exhibit 1: Market share', columns: ['Company', 'Share'], rows: [['NeoCare Solutions', '40%'], ['Guidance Counselor Co', '10%'], ['Working adults', '5%']], caption: 'Share of the market, by company.' },
      ],
      steps: [],
    });
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 4 }]);
  });

  it('finds a brainstorm in a table of brainstorm ideas, and what it is about', () => {
    const p = buildPlan({ exhibits: [{ title: 'Exhibit 1: Sales' }, { title: 'Brainstorm #1: costs along the value chain' }], steps: [] });
    expect(p.hasBrainstorm).toBe(true);
    expect(p.brainstormTopic).toBe('costs along the value chain');
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 0 }]);
  });

  it('shows an exhibit whose title merely says "solutions" (what the case is about), and keeps the book\'s own solutions to itself', () => {
    const p = buildPlan({
      exhibits: [{ title: 'Exhibit #1: Current solutions for retirees' }, { title: 'Market sizes (given if prompted)', caption: 'From the interviewer guidance for Exhibit 1.' }, { title: 'Solutions to Exhibit 1' }, { title: 'Solution: market size' }],
      steps: [{ title: 'Framework for revenue growth' }, { title: 'Sizing the market' }],
    });
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 0 }]); // the member does get an exhibit to look at
  });

  it('does not discuss a framework step again, whether it is called "Framework", "Framework for ...", "Framework: ..." or "Structure the problem", but keeps a step that has more in it', () => {
    const steps = ['Framework', 'Framework for revenue growth', 'Framework: what to weigh', 'Structure the problem', 'Framework and Exhibit 1', 'Pricing'].map((title) => ({ title }));
    expect(buildPlan({ exhibits: [], steps }).beats).toEqual([{ kind: 'step', index: 4 }, { kind: 'step', index: 5 }]);
  });

  it('has no brainstorm when the case has none', () => {
    expect(buildPlan({ exhibits: [{}], steps: [{ title: 'Size demand' }] }).hasBrainstorm).toBe(false);
  });
});

describe('the clock', () => {
  it('starts with the prompt, runs one continuous 30 minutes and adds up to 26:30 planned', () => {
    const s = start();
    expect(s.startedAt).toBe(T0);
    expect(hardEnd(s)).toBe(T0 + LIMIT_MS);
    expect(LIMIT_MS).toBe(sec(1800));
    expect(Object.values(PLANNED_MS).reduce((a, b) => a + b, 0)).toBe(sec(26 * 60 + 30)); // with 15 minutes for exhibits, the earlier plan
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
    s = recordAssessment(s, 'progress', at(1600)); // still making progress, so the discussion runs on towards its reserve
    expect(settle(s, at(1650)).stage).toBe('exhibits');
    s = settle(s, at(1665));
    expect(s.stage).toBe('recommend_think'); // the recommendation starts with 2:00 left for a case with no brainstorm
    s = settle(s, at(1695));
    expect(s.stage).toBe('recommend_write');
    s = saveDraft(s, 'recommendation', 'Open the hotel only if', at(1775)); // typing right up to the end
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
    expect(slowRoom).toBe(sec(900 + 210)); // the planned 15 minutes plus the flexible time that is left
    expect(fastRoom).toBeGreaterThan(slowRoom); // plus what was saved
  });

  it('never lets the discussion take the closing time: the recommendation starts 2:00 before the end, the brainstorm 4:00 before', () => {
    const withBrainstorm = deadlines(settle(start(plan(3, true)), at(450)), 'exhibits', at(450));
    const without = deadlines(settle(start(plan(3, false)), at(450)), 'exhibits', at(450));
    expect(withBrainstorm.hard).toBe(at(1560));
    expect(without.hard).toBe(at(1680));
  });

  it('keeps the closing time safe at every size of case, from no beats to twelve, with a brainstorm and without', () => {
    const opening = PLANNED_MS.prompt + PLANNED_MS.framework_think + PLANNED_MS.framework_write;
    const closing = PLANNED_MS.recommend_think + PLANNED_MS.recommend_write;
    const brainstorming = PLANNED_MS.brainstorm_think + PLANNED_MS.brainstorm_write;
    for (let n = 0; n <= 12; n += 1) {
      for (const hasBrainstorm of [false, true]) {
        const built = buildPlan({ exhibits: exhibits(n), steps: hasBrainstorm ? [{ title: 'Brainstorm: ways to grow' }] : [] });
        const p: CasePlan = { ...built, hasBrainstorm };
        const needed = closing + (hasBrainstorm ? brainstorming : 0);
        expect(p.beats).toHaveLength(n);
        // Everything the case is planned to do fits inside the limit, however much there is to work through.
        expect(p.limitMs).toBeGreaterThanOrEqual(opening + (p.exhibitMs ?? 0) + needed);
        const s = newSession(p, T0, 'Prompt');
        expect(hardEnd(s)).toBe(T0 + p.limitMs!);
        if (n === 0) continue; // no beats, no exhibit stage to protect the closing from
        const d = deadlines(s, 'exhibits', T0 + opening); // the discussion opening at its planned moment
        expect(hardEnd(s) - d.hard).toBe(needed); // the closing stages always get their whole time
        expect(d.hard).toBeGreaterThan(T0 + opening); // and the discussion still has time of its own
        expect(d.soft).toBeLessThanOrEqual(d.hard);
      }
    }
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

  it('never speaks up on its own: the member drives, and hints only answer what they write', () => {
    const s = inExhibits(3);
    const b = openBeat(s)!;
    for (const n of [30, 150, 600, 1200]) expect(nudgeLevel(s, b.revealedAt + sec(n), 'timer')).toBe('none');
    expect(nextNudgeAt(s, b.revealedAt)).toBeNull();
  });

  it('helps in reply to the member: a process hint, a sharper one, then on the third message it leads, and it moves on if they are still stuck', () => {
    let s = inExhibits(3);
    const b = openBeat(s)!;
    expect(nudgeLevel(s, b.revealedAt + sec(5))).toBe('process_hint');
    s = recordHint(s, b.revealedAt + sec(5));
    expect(nudgeLevel(s, b.revealedAt + sec(20))).toBe('directional_hint');
    s = recordHint(s, b.revealedAt + sec(20));
    expect(nudgeLevel(s, b.revealedAt + sec(30))).toBe('lead'); // no more open questions: Bucket says where to look
    s = recordHint(s, b.revealedAt + sec(30));
    expect(nudgeLevel(s, b.revealedAt + sec(40))).toBe('advance'); // still stuck after being led: on to the next piece, whatever the clock says
  });

  it('moves on at the third message if the exhibit has already taken longer than it is worth', () => {
    let s = inExhibits(3);
    const b = openBeat(s)!;
    s = recordHint(recordHint(s, b.revealedAt + sec(5)), b.revealedAt + sec(20));
    expect(nudgeLevel(s, b.revealedAt + openBeat(s)!.budgetMs + sec(1))).toBe('advance');
  });

  it('leads on the third message even when no hint was given, counting the messages that got nowhere, and starts again after a clear step forward', () => {
    let s = inExhibits(3);
    const t = openBeat(s)!.revealedAt;
    s = ok(userSays(s, 'Can I see the exhibit?', t + sec(5)));
    s = recordAssessment(s, 'partial', t + sec(5)); // a reply that was neither a hint nor progress
    expect(nudgeLevel(s, t + sec(10))).toBe('directional_hint');
    s = ok(userSays(s, 'Where is the data?', t + sec(10)));
    expect(nudgeLevel(s, t + sec(15))).toBe('lead'); // the third message, with no hints recorded at all
    s = recordAssessment(s, 'progress', t + sec(20)); // then they get somewhere
    expect(openBeat(s)!.asked).toBe(0);
    s = ok(userSays(s, 'So costs are rising faster than price', t + sec(25)));
    expect(nudgeLevel(s, t + sec(30))).toBe('directional_hint'); // the count started again
  });

  it('sizes the case by how much there is to work through: four minutes a beat on top of four to settle in, never past 25 in 40', () => {
    expect(minutes(1)).toEqual([8, 23]);
    expect(minutes(2)).toEqual([12, 27]);
    expect(minutes(4)).toEqual([20, 35]); // the commonest size is exactly what every case used to get
    expect(minutes(6)).toEqual([25, 40]); // the ceiling, which is what a busy case already had
    expect(minutes(10)).toEqual([25, 40]);
    expect(minutes(12)).toEqual([25, 40]);
    const long = buildPlan({ exhibits: exhibits(6), steps: [] });
    const s = settle(newSession(long, T0, 'Prompt'), at(450));
    expect(hardEnd(s)).toBe(T0 + 40 * 60_000);
    expect(deadlines(s, 'exhibits', s.stageStartedAt).soft - s.stageStartedAt).toBe(25 * 60_000);
    expect(stageEndsAt(s)).toBe(s.stageStartedAt + 25 * 60_000);
  });

  it('gives a case with one thing to work through a visibly shorter case than one with four, and no case more than before', () => {
    const [oneExhibit, oneLimit] = minutes(1);
    const [fourExhibit, fourLimit] = minutes(4);
    expect(oneExhibit).toBeLessThan(fourExhibit - 5);
    expect(oneLimit).toBeLessThan(fourLimit - 5);
    for (let n = 0; n <= 12; n += 1) {
      const [exhibitMinutes, limitMinutes] = minutes(n);
      expect(exhibitMinutes).toBeLessThanOrEqual(25); // today's longest exhibit stage
      expect(limitMinutes).toBeLessThanOrEqual(40); // today's longest case
      if (n > 0) expect(exhibitMinutes).toBeGreaterThanOrEqual(8);
    }
  });

  it('plans sanely for a case with nothing for the candidate to work through: no exhibit time, and the stage is skipped as before', () => {
    const p = buildPlan({ exhibits: [{ title: 'Interviewer Guidance: Revenue' }], steps: [{ title: 'Framework' }] });
    expect(p.beats).toEqual([]);
    expect([p.exhibitMs, p.limitMs]).toEqual([0, 15 * 60_000]); // only what the opening, the closing and the flexible time need
    const s = settle(newSession(p, T0, 'Prompt'), at(450));
    expect(stages(s)).toEqual(['prompt', 'framework_think', 'framework_write', 'recommend_think']);
    const done = settle(s, at(900));
    expect(done.stage).toBe('done');
    expect(done.endReason).toBe('completed'); // it reaches the recommendation and finishes, rather than running out
  });

  it('leaves a case that is already running alone: a saved plan keeps the clock it was given', () => {
    const before: CasePlan = { beats: [{ kind: 'exhibit', index: 0 }], hasBrainstorm: false, brainstormTopic: '' };
    const old = settle(newSession(before, T0, 'Prompt'), at(450)); // saved before plans carried times at all
    expect(hardEnd(old)).toBe(T0 + LIMIT_MS);
    expect(deadlines(old, 'exhibits', old.stageStartedAt).soft - old.stageStartedAt).toBe(PLANNED_MS.exhibits);
    const inFlight = settle(newSession({ ...before, exhibitMs: 20 * 60_000, limitMs: 35 * 60_000 }, T0, 'Prompt'), at(450));
    expect(hardEnd(inFlight)).toBe(T0 + 35 * 60_000); // a case started under the old rule runs to the end it was promised
    expect(deadlines(inFlight, 'exhibits', inFlight.stageStartedAt).soft - inFlight.stageStartedAt).toBe(20 * 60_000);
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

describe('pausing, continuing and ending early', () => {
  it('stops the clock: nothing runs out while paused, however long the break', () => {
    let s = start();
    s = ok(pause(s, at(60)));
    expect(s.pausedAt).toBe(at(60));
    const later = settle(s, at(60 + 3 * 3600)); // three hours on
    expect(later).toBe(s);
    expect(later.stage).toBe('prompt');
    expect(later.messages).toHaveLength(1);
  });

  it('starts it again with exactly the time that was left', () => {
    let s = start();
    s = ok(pause(s, at(60)));
    const left = hardEnd(s) - at(60);
    const leftInStage = stageEndsAt(s) - at(60);
    s = ok(continueCase(s, at(60 + 600))); // a ten-minute break
    expect(s.pausedAt).toBeNull();
    expect(hardEnd(s) - at(60 + 600)).toBe(left);
    expect(stageEndsAt(s) - at(60 + 600)).toBe(leftInStage);
    expect(settle(s, at(60 + 600 + 5)).stage).toBe('prompt'); // not a second lost to the break
    expect(settle(s, at(60 + 600) + leftInStage + 1).stage).toBe('framework_think'); // and it runs out when it should
  });

  it('keeps the exhibit timings in step too, so a break is not counted against the exhibit', () => {
    let s = toExhibits(plan(3), 200);
    const b = openBeat(s)!;
    const spent = at(230) - b.revealedAt;
    s = ok(pause(s, at(230)));
    s = ok(continueCase(s, at(230 + 900)));
    const after = openBeat(s)!;
    expect(at(230 + 900) - after.revealedAt).toBe(spent);
    expect(after.lastProgressAt).toBe(b.lastProgressAt + 900_000);
  });

  it('refuses everything but continuing or ending while paused', () => {
    let s = toExhibits(plan(3), 200);
    s = ok(pause(s, at(210)));
    expect(userSays(s, 'hello', at(220)).ok).toBe(false);
    expect(ready(s, at(220)).ok).toBe(false);
    expect(submit(s, 'text', at(220)).ok).toBe(false);
    expect(saveDraft(s, 'exhibit', 'typing', at(220))).toBe(s);
    expect(pause(s, at(220)).ok).toBe(false); // already paused
    expect(continueCase(start(), at(5)).ok).toBe(false); // nothing to continue
  });

  it('ends early: keeps the draft in the box, closes the open exhibit and goes to feedback', () => {
    let s = toExhibits(plan(3), 200);
    s = ok(userSays(s, 'Occupancy is low off-peak', at(210)));
    s = saveDraft(s, 'exhibit', 'Half a thought', at(215));
    const done = ok(endEarly(s, at(220)));
    expect(done.stage).toBe('done');
    expect(done.endReason).toBe('ended_early');
    expect(done.endedAt).toBe(at(220));
    expect(done.beats[0].outcome).toBe('timed_out');
    expect(done.messages.at(-1)?.text).toBe('You ended the case here.');
    expect(done.stageLog.at(-1)).toMatchObject({ stage: 'exhibits', endedBy: 'user' });
    expect(endEarly(done, at(230)).ok).toBe(false);
  });

  it('keeps what was typed in a writing stage as an unfinished draft', () => {
    let s = start();
    s = ok(ready(s, at(10)));
    s = ok(ready(s, at(20)));
    s = saveDraft(s, 'framework', 'Demand, supply, cost', at(30));
    const done = ok(endEarly(s, at(40)));
    expect(done.submissions).toEqual([expect.objectContaining({ kind: 'framework', text: 'Demand, supply, cost', timedOut: true })]);
  });

  it('ends a paused case at the moment it was paused', () => {
    let s = toExhibits(plan(3), 200);
    s = ok(pause(s, at(210)));
    const done = ok(endEarly(s, at(5000)));
    expect(done.endedAt).toBe(at(210));
    expect(done.pausedAt).toBeNull();
  });
});

describe('moving on from an exhibit', () => {
  it('waits until the member has said something about the exhibit, then brings out the next one', () => {
    let s = toExhibits(plan(3), 200);
    expect(moveOn(s, at(210)).ok).toBe(false); // nothing said yet: a stray click does not skip an exhibit
    s = ok(userSays(s, 'Off-peak is half of peak', at(220)));
    s = ok(moveOn(s, at(230)));
    expect(s.beats.map((b) => b.outcome)).toEqual(['member_moved', 'open']);
    expect(s.messages.at(-1)).toMatchObject({ kind: 'exhibit', beat: 1 });
    expect(moveOn(s, at(240)).ok).toBe(false); // and the next exhibit starts from nothing again
  });

  it('after the last exhibit goes on to the next section right away, so the time saved carries over', () => {
    let s = toExhibits(plan(1, true), 200);
    s = ok(userSays(s, 'Costs are the issue', at(260)));
    const early = ok(moveOn(s, at(300))); // five minutes into a twenty-minute discussion
    expect(early.stage).toBe('brainstorm_think');
    expect(early.stageStartedAt).toBe(at(300));
    expect(early.stageLog.find((e) => e.stage === 'exhibits')).toMatchObject({ endedAt: at(300), endedBy: 'coach' });

    const noBrainstorm = ok(moveOn(ok(userSays(toExhibits(plan(1, false), 200), 'Costs', at(260))), at(300)));
    expect(noBrainstorm.stage).toBe('recommend_think');
  });

  it('is refused outside the exhibit discussion and while paused', () => {
    expect(moveOn(start(), at(10)).ok).toBe(false);
    let s = toExhibits(plan(3), 200);
    s = ok(userSays(s, 'Costs', at(210)));
    expect(moveOn(ok(pause(s, at(215))), at(220)).ok).toBe(false);
  });
});

describe('learning mode: no clock', () => {
  const learning = (p = plan(3)) => newSession(p, T0, 'Prompt text', 'learning');
  const toLearningExhibits = (): SessionState => {
    let s = learning();
    s = ok(ready(s, at(5)));
    s = ok(ready(s, at(6)));
    s = ok(submit(s, 'My framework', at(7)));
    s = ok(userSays(s, 'I would start with demand', at(8)));
    return endFrameworkStage(s, at(9));
  };

  it('never runs out: a stage waits for the member however long they are away', () => {
    const s = learning();
    const much = at(3 * 3600); // three hours on, far past the 35-minute limit
    expect(settle(s, much)).toBe(s);
    const onExhibit = toLearningExhibits();
    expect(settle(onExhibit, much)).toBe(onExhibit);
    expect(onExhibit.stage).toBe('exhibits');
    expect(onExhibit.endedAt).toBeNull();
  });

  it('is moved on only by the member: they get through every stage with no time passing the limit', () => {
    let s = toLearningExhibits();
    s = ok(userSays(s, 'Costs first', at(7200)));
    s = ok(moveOn(s, at(7300)));
    s = ok(userSays(s, 'Then the second one', at(7400)));
    s = ok(moveOn(s, at(7500)));
    s = ok(userSays(s, 'And the last', at(7600)));
    s = ok(moveOn(s, at(7700)));
    expect(s.stage).toBe('brainstorm_think');
    s = ok(ready(s, at(9000)));
    s = ok(submit(s, 'Ideas', at(9100)));
    s = ok(ready(s, at(9200)));
    s = ok(submit(s, 'Recommendation', at(9300)));
    expect(s.stage).toBe('done');
    expect(s.endReason).toBe('completed');
  });

  it('has nothing to pause, and says so, but can be ended early', () => {
    const s = toLearningExhibits();
    const r = pause(s, at(100));
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('no clock') });
    const done = ok(endEarly(s, at(100)));
    expect(done.stage).toBe('done');
    expect(done.endReason).toBe('ended_early');
  });

  it('keeps stopwatch talk out of what Bucket says', () => {
    let s = toLearningExhibits();
    for (let i = 0; i < 3; i++) s = ok(moveOn(ok(userSays(s, `thought ${i}`, at(10 + i))), at(20 + i)));
    s = ok(ready(s, at(30)));
    s = ok(submit(s, 'Ideas', at(31)));
    s = ok(ready(s, at(32)));
    const said = learning().messages.concat(s.messages).filter((m) => m.from === 'coach').map((m) => m.text).join('\n');
    expect(said).not.toMatch(/\d+ seconds|minute and a half|90 seconds|30 seconds/);
    expect(said).toContain('no rush');
  });

  it('never moves a learner on, however long they are stuck: it keeps teaching', () => {
    let s = toLearningExhibits();
    const b = openBeat(s)!;
    s = { ...s, beats: [{ ...b, asked: 6, hints: 3 }] };
    expect(nudgeLevel(s, at(10_000))).toBe('lead');
    expect(nudgeLevel(s, at(10_000), 'timer')).toBe('none');
    // the same stuck student in practice mode is moved on once far behind
    const p = toExhibits(plan(3), 200);
    expect(nudgeLevel({ ...p, beats: [{ ...openBeat(p)!, asked: 6 }] }, at(10_000))).toBe('advance');
  });
});
