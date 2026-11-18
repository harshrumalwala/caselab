// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assessmentOf,
  brainstormTopic,
  buildPlan,
  CIRCLING_PARTIALS,
  gettingNowhere,
  partialRun,
  coachSays,
  continueCase,
  deadlines,
  endEarly,
  endFrameworkStage,
  hardEnd,
  isInterviewerSideExhibit,
  LIMIT_MS,
  madeAStep,
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
  recordDataRequest,
  recordHint,
  saveDraft,
  saveScratchpad,
  settle,
  stageEndsAt,
  stepTopic,
  submit,
  userSays,
  WRITING_GRACE_MS,
  type ActionResult,
  type Assessment,
  type CasePlan,
  type LiveMode,
  type NudgeLevel,
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
  it('works through the exhibits and the steps that have none, and finds a brainstorm among the steps', () => {
    const p = buildPlan({ exhibits: [{}, {}], steps: [{ title: 'Size demand' }, { title: 'Brainstorm: ways to grow' }] });
    expect(p.beats).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'exhibit', index: 1 },
      { kind: 'step', index: 0, topic: 'Size demand' },
      { kind: 'brainstorm', index: 1, topic: 'ways to grow' },
    ]);
    expect(p.hasBrainstorm).toBe(true);
    expect(p.brainstormTopic).toBe('ways to grow');
  });

  it('keeps the brainstorm where the book put it when a case has no exhibits', () => {
    const p = buildPlan({ exhibits: [], steps: [{ title: 'Size demand' }, { title: 'Brainstorming ideas' }, { title: 'Check break-even' }] });
    expect(p.beats).toEqual([{ kind: 'step', index: 0, topic: 'Size demand' }, { kind: 'brainstorm', index: 1, topic: 'ideas' }, { kind: 'step', index: 2, topic: 'Check break-even' }]);
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
    // The "Framework" step is not discussed again; the brainstorm keeps its place in the case and is answered in its own two stages.
    expect(p.beats).toEqual([{ kind: 'step', index: 1, topic: 'Pricing analysis' }, { kind: 'brainstorm', index: 2, topic: 'costs' }]);
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
    // The member gets the exhibit to look at, and the sizing step is theirs to work through: nothing in the write-up ties it to that exhibit.
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 0 }, { kind: 'step', index: 1, topic: 'Sizing the market' }]);
  });

  it('does not discuss a framework step again, whether it is called "Framework", "Framework for ...", "Framework: ..." or "Structure the problem", but keeps a step that has more in it', () => {
    const steps = ['Framework', 'Framework for revenue growth', 'Framework: what to weigh', 'Structure the problem', 'Framework and Exhibit 1', 'Pricing'].map((title) => ({ title }));
    expect(buildPlan({ exhibits: [], steps }).beats).toEqual([{ kind: 'step', index: 4, topic: 'Framework and Exhibit 1' }, { kind: 'step', index: 5, topic: 'Pricing' }]);
  });

  it('has no brainstorm when the case has none', () => {
    expect(buildPlan({ exhibits: [{}], steps: [{ title: 'Size demand' }] }).hasBrainstorm).toBe(false);
  });
});

/**
 * A case is worked through as the book wrote it: its exhibits, and the steps of its analysis that have no exhibit (issue #128). The two
 * lists are joined by the only link the write-ups hold — a step that names its exhibit — and neither list is ever reordered.
 */
describe('the exhibits and the steps of one case, together', () => {
  const beats = (exhibits: { title: string }[], steps: string[]) => buildPlan({ exhibits, steps: steps.map((title) => ({ title })) }).beats;
  const E = (n: number) => ({ title: `Exhibit ${n}: the numbers` });

  it('puts each exhibit where the step that discusses it sits, and gives the steps with no exhibit a part of their own', () => {
    expect(
      beats([E(1), E(2)], ['Framework', 'Exhibit 1: the numbers', 'Close or invest: the ROIC test', 'Exhibit 2: the numbers', 'Pick the cheaper plant', 'Recommendation']),
    ).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'step', index: 2, topic: 'Close or invest: the ROIC test' },
      { kind: 'exhibit', index: 1 },
      { kind: 'step', index: 4, topic: 'Pick the cheaper plant' },
    ]);
  });

  it('works an exhibit the member never sees into nothing, but keeps the step that discusses it', () => {
    expect(beats([{ title: 'Interviewer guidance: the answer' }, E(2)], ['Exhibit 1: what the guidance holds', 'Exhibit 2: the numbers'])).toEqual([
      { kind: 'step', index: 0, topic: 'what the guidance holds' },
      { kind: 'exhibit', index: 1 },
    ]);
  });

  it('leaves a case with only exhibits, and a case with only steps, exactly as they were', () => {
    expect(beats([E(1), E(2), E(3)], [])).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'exhibit', index: 1 },
      { kind: 'exhibit', index: 2 },
    ]);
    expect(beats([], ['Framework', 'Size the market', 'Brainstorm: ways to grow', 'Check the break-even'])).toEqual([
      { kind: 'step', index: 1, topic: 'Size the market' },
      { kind: 'brainstorm', index: 2, topic: 'ways to grow' },
      { kind: 'step', index: 3, topic: 'Check the break-even' },
    ]);
  });

  it('hands the exhibits over first when nothing in the write-up ties a step to one, rather than guessing an order', () => {
    expect(beats([E(1), E(2)], ['Size the market', 'Check the break-even'])).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'exhibit', index: 1 },
      { kind: 'step', index: 0, topic: 'Size the market' },
      { kind: 'step', index: 1, topic: 'Check the break-even' },
    ]);
  });

  it('never works through an exhibit twice, however the step names it', () => {
    const named = ['Exhibit #1: the numbers', 'Financial analysis: Exhibit 1', 'The numbers (Exhibit 1)', 'Table 1: the numbers'];
    for (const title of named) expect(beats([E(1)], [title])).toEqual([{ kind: 'exhibit', index: 0 }]);
    // Two steps on one exhibit (read it, then what it means) are still that exhibit's one part.
    expect(beats([E(1)], ['Exhibit 1: read the numbers', 'Exhibit 1: what it means for the client'])).toEqual([{ kind: 'exhibit', index: 0 }]);
    // No label, but the step is about the same thing as the exhibit: still one part, because a part the member meets twice is worse.
    expect(beats([{ title: 'Cost structure of the client' }], ['Cost structure'])).toEqual([{ kind: 'exhibit', index: 0 }]);
  });

  it('leaves a step headed by the framework to the framework stages, and keeps one that only mentions a framework later', () => {
    const headed = ['Framework and hypothesis', 'Framework and the two parts of the case', 'Framework: what to weigh', 'Structure and prioritize', 'Clarifying questions and the goal', 'Framework and exhibits'];
    for (const title of headed) expect(beats([E(1)], [title]), title).toEqual([{ kind: 'exhibit', index: 0 }]);
    // Not headed by it, so there is work of its own in there: the member has handed in a framework, not revisited one.
    const kept = ['Revisiting the framework after Exhibit 2', 'Pick the framework', 'Hypothesis and framework', 'Profitability framework and the key issue'];
    for (const title of kept) expect(beats([E(1)], [title]), title).toEqual([{ kind: 'exhibit', index: 0 }, { kind: 'step', index: 0, topic: title }]);
    // Headed by it, but it goes on to name an exhibit: that exhibit's beat is the work, and it is not handed over twice.
    expect(beats([E(1)], ['Framework and Exhibit 1'])).toEqual([{ kind: 'exhibit', index: 0 }]);
    expect(beats([{ title: 'Interviewer guidance: the answer' }], ['Framework and Exhibit 1'])).toEqual([{ kind: 'step', index: 0, topic: 'Framework and Exhibit 1' }]);
  });

  it('reads the plural of the noun as a plural, not as the label "s"', () => {
    // "the exhibits" names no exhibit in particular, so the step is matched on what it is about, as a step with no label is.
    expect(beats([{ title: 'Exhibit 1: the regions' }], ['Read the exhibits and split the population'])).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'step', index: 0, topic: 'Read the exhibits and split the population' },
    ]);
    expect(beats([{ title: 'Exhibit A: the regions' }], ['Exhibit A: what the regions show'])).toEqual([{ kind: 'exhibit', index: 0 }]);
    expect(beats([{ title: 'Exhibit #B: costs' }], ['Exhibit #B: what the costs show'])).toEqual([{ kind: 'exhibit', index: 0 }]);
  });

  it('leaves the closing recommendation to its own stages, and keeps an analytical step that merely sounds like one', () => {
    const closing = ['Recommendation', 'Final recommendation', 'Recommendation and next steps', 'Synthesis', 'Conclusion to the CEO', 'Wrap-up', 'Summary for the CEO', 'Answer', 'Closing the case', 'Bringing it all together'];
    for (const title of closing) expect(beats([E(1)], [title])).toEqual([{ kind: 'exhibit', index: 0 }]);
    // Analysis that happens to use one of those words further along, which the member must still work through.
    const analysis = ['Close or invest: the ROIC test', 'Closing the payback gap', 'Answer the board question on capacity'];
    for (const title of analysis) {
      expect(beats([E(1)], [title])).toEqual([{ kind: 'exhibit', index: 0 }, { kind: 'step', index: 0, topic: title }]);
    }
  });

  it('grows the clock with what there is to work through, and never past 25 minutes in 40', () => {
    const planned = (exhibits: number, steps: string[]) => {
      const p = buildPlan({ exhibits: Array.from({ length: exhibits }, (_, i) => E(i + 1)), steps: steps.map((title) => ({ title })) });
      return [p.beats.length, (p.exhibitMs ?? 0) / 60_000, (p.limitMs ?? 0) / 60_000];
    };
    expect(planned(2, [])).toEqual([2, 12, 27]);
    expect(planned(2, ['Size the market'])).toEqual([3, 16, 31]); // the step the case used to drop is four minutes more
    expect(planned(3, ['Size the market', 'Check the break-even', 'Pick the plant'])).toEqual([6, 25, 40]);
    expect(planned(6, ['Size the market', 'Check the break-even', 'Pick the plant', 'Work the payback'])).toEqual([10, 25, 40]); // the ceiling holds
  });
});

/**
 * A part of the case that is talked through says what it is about before it asks for anything (issue #163). An exhibit names its own
 * subject on the table; a step of the analysis hands over nothing, so the engine opens it with the book's step title — and with
 * nothing else of the step, because the rest of it is the answer the member is there to reach.
 */
describe('what a part with no exhibit says it is about', () => {
  const stepPlan = (...titles: string[]): CasePlan => buildPlan({ exhibits: [], steps: titles.map((title) => ({ title })) });
  const toParts = (p: CasePlan, mode: LiveMode = 'practice'): SessionState => {
    let s = newSession(p, T0, 'Prompt text', mode);
    s = ok(ready(s, at(5)));
    s = ok(ready(s, at(6)));
    s = ok(submit(s, 'My framework', at(7)));
    s = ok(userSays(s, 'I would start with demand', at(8)));
    return endFrameworkStage(s, at(9));
  };
  const said = (s: SessionState): string => s.messages.at(-1)!.text;

  it('opens the first part with its topic, and each later part with its own', () => {
    let s = toParts(stepPlan('Size peak demand', 'Check the break-even'));
    expect(said(s)).toBe('Let us dig in. First part: Size peak demand. What would you analyse first, and how?');
    s = nextBeat(s, at(200), 'independent');
    expect(said(s)).toBe('Good. Next part: Check the break-even. What would you look at, and how?');
  });

  it('says it the same way in every mode: the topic is the engine\'s to give, not the model\'s', () => {
    for (const mode of ['practice', 'interview', 'learning'] as const) {
      expect(said(toParts(stepPlan('Size peak demand'), mode)), mode).toBe('Let us dig in. First part: Size peak demand. What would you analyse first, and how?');
    }
  });

  it('keeps the question mark of a title the book wrote as a question, and adds the full stop to one it did not', () => {
    expect(said(toParts(stepPlan('Should the client invest?')))).toBe('Let us dig in. First part: Should the client invest? What would you analyse first, and how?');
    expect(said(toParts(stepPlan('Break-even volume')))).toBe('Let us dig in. First part: Break-even volume. What would you analyse first, and how?');
  });

  it('takes the book\'s numbering off, which says nothing about the part', () => {
    expect(stepTopic('Question 3B: the cost of the upgrade')).toBe('the cost of the upgrade');
    expect(stepTopic('Q2. How big are sales of the new model?')).toBe('How big are sales of the new model?');
    expect(stepTopic('Part B: the most Acme should pay')).toBe('the most Acme should pay');
    expect(stepTopic('Exhibit 1: market share and revenue')).toBe('market share and revenue');
    expect(stepTopic('Prompt #2, Question 1: the labour cut needed')).toBe('the labour cut needed');
    // The number comes off only when something separates it from the subject, so a title that is a phrase of its own keeps its words.
    expect(stepTopic('Question 4 and recommendation')).toBe('Question 4 and recommendation');
    expect(stepTopic('Parts and labour')).toBe('Parts and labour');
  });

  it('says nothing at all when the title is the answer rather than the question', () => {
    const answers = ['Why the suburban shops lag', 'Demand is driven by end users', 'Confirm the profit decline', 'Capabilities Megatron lacks', 'Why is Dolphin losing revenue?'];
    for (const title of answers) expect(stepTopic(title), title).toBe('');
    // ...and the part keeps the opening line that asks the question without naming it.
    let s = toParts(stepPlan('Why the suburban shops lag', 'Why revenue fell'));
    expect(said(s)).toBe('Let us dig in. What would you analyse first, and how?');
    s = nextBeat(s, at(200), 'independent');
    expect(said(s)).toBe('Good. What would you look at next, and how?');
  });

  it('says nothing when the book heads the step with the name of the interviewer\'s own table', () => {
    // Some books title a step after the table the interviewer works it from. The member never sees that table and is never told its
    // name (issue #95), so the topic goes and the part keeps the line that names nothing.
    const p = buildPlan({ exhibits: [{ title: 'Break-even analysis', caption: 'Interviewer guidance only.' }], steps: [{ title: 'Break-even analysis' }] });
    expect(p.beats).toEqual([{ kind: 'step', index: 0 }]);
    expect(said(toParts(p))).toBe('Let us dig in. What would you analyse first, and how?');
    // Part of the name is still the name: a topic inside a hidden title, or one that swallows it, goes the same way.
    expect(buildPlan({ exhibits: [{ title: 'Interviewer guidance: cost savings by region' }], steps: [{ title: 'Cost savings by region' }] }).beats).toEqual([{ kind: 'step', index: 0 }]);
    // An exhibit the member is handed names itself on the table, so a step titled after one is no secret (this one is that exhibit's part).
    expect(buildPlan({ exhibits: [{ title: 'Ticket revenue' }], steps: [{ title: 'Ticket revenue' }] }).beats).toEqual([{ kind: 'exhibit', index: 0 }]);
  });

  it('says nothing when the title is too thin or too long to be a subject', () => {
    expect(stepTopic('Q1:')).toBe('');
    expect(stepTopic(`The ${'very '.repeat(20)}long way round`)).toBe('');
  });

  it('carries the title and nothing else of the step: the working, the reading, the misses and the checks stay on the interviewer\'s side', () => {
    const step = {
      title: 'Size peak demand',
      body: 'Peak demand fills the hotel for four months.',
      calc: ['Rooms = 200 x 120 nights'],
      whatToNotice: 'The base is busy only part of the year.',
      commonMiss: ['Treating peak demand as year-round'],
      checkYourself: ['Did you separate peak from off-peak?'],
    };
    const p = buildPlan({ exhibits: [], steps: [step] });
    expect(p.beats).toEqual([{ kind: 'step', index: 0, topic: 'Size peak demand' }]);
    const opening = said(toParts(p));
    for (const secret of [step.body, ...step.calc, step.whatToNotice, ...step.commonMiss, ...step.checkYourself]) expect(opening).not.toContain(secret);
  });

  it('leaves a part that hands over an exhibit exactly as it was: the exhibit names itself on the table', () => {
    let s = toExhibits(plan(2), 100);
    expect(said(s)).toBe('Here is the first exhibit. Take a moment, then tell me what you notice.');
    s = nextBeat(s, at(200), 'independent');
    expect(said(s)).toBe('Here is the next exhibit. What do you notice?');
  });

  it('opens a part of a plan saved before a step carried a topic with the line that names nothing', () => {
    const old: CasePlan = { beats: [{ kind: 'step', index: 0 }], hasBrainstorm: false, brainstormTopic: '' };
    expect(said(toParts(old))).toBe('Let us dig in. What would you analyse first, and how?');
  });
});

/**
 * A brainstorm is a part of the case where the book put it (issue #133). The books often ask for the ideas before the exhibit that
 * shows which of them the client chose, and a case can ask for more than one.
 */
describe('the brainstorm, in the book\'s own place', () => {
  const beats = (exhibits: { title: string }[], steps: string[]) => buildPlan({ exhibits, steps: steps.map((title) => ({ title })) }).beats;
  const E = (n: number) => ({ title: `Exhibit ${n}: the numbers` });

  it('reads the topic out of the book\'s title, numbering and all, so the member is asked a question', () => {
    const shapes: [string, string][] = [
      ['Brainstorm: ways to categorize the new shops', 'ways to categorize the new shops'],
      ['Brainstorm #1: Revenue factors', 'Revenue factors'],
      ['Brainstorm #2: Switching factors', 'Switching factors'],
      ['Brainstorm 2 - US versus Brazil', 'US versus Brazil'],
      ['Brainstorms: ideas to grow', 'ideas to grow'],
      ['Brainstorming (optional)', '(optional)'],
      ['Brainstorm ways to raise revenue', 'ways to raise revenue'],
      ['Brainstorm', ''],
      ['Brainstorm 3 ways to cut cost', '3 ways to cut cost'], // a number that is part of the question keeps its place
    ];
    for (const [title, topic] of shapes) expect(brainstormTopic(title), title).toBe(topic);
    // What the member reads, with the screen's own word in front of it.
    const p = buildPlan({ exhibits: [E(1)], steps: [{ title: 'Exhibit 1: the numbers' }, { title: 'Brainstorm #1: Revenue factors' }] });
    const s = toExhibits(p, 100);
    expect(nextBeat(s, at(200), 'independent').messages.at(-1)?.text).toContain('Brainstorm: Revenue factors.');
  });

  it('asks the brainstorm before the exhibit the book puts after it', () => {
    // Boothbucks Coffee (Booth MCG 2026-2027): the ideas are asked for before the exhibit that shows how the client groups the shops.
    expect(beats([E(1), E(2)], ['Framework', 'Exhibit 1: the numbers', 'Brainstorm: ways to categorize the new shops', 'Exhibit 2: the numbers', 'Close or invest'])).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'brainstorm', index: 2, topic: 'ways to categorize the new shops' },
      { kind: 'exhibit', index: 1 },
      { kind: 'step', index: 4, topic: 'Close or invest' },
    ]);
  });

  it('keeps every brainstorm a case has, in the book\'s order', () => {
    expect(beats([E(1), E(2)], ['Exhibit 1: the numbers', 'Brainstorm #1: Revenue factors', 'Exhibit 2: the numbers', 'Brainstorm #2: Switching factors'])).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'brainstorm', index: 1, topic: 'Revenue factors' },
      { kind: 'exhibit', index: 1 },
      { kind: 'brainstorm', index: 3, topic: 'Switching factors' },
    ]);
  });

  it('stops the discussion for the brainstorm and picks it up again afterwards', () => {
    const p = buildPlan({
      exhibits: [{ title: 'Exhibit 1: the numbers' }, { title: 'Exhibit 2: the numbers' }],
      steps: [{ title: 'Exhibit 1: the numbers' }, { title: 'Brainstorm: ways to categorize the new shops' }, { title: 'Exhibit 2: the numbers' }],
    });
    let s = toExhibits(p, 100);
    expect(s.messages.at(-1)?.text).toContain('first exhibit');
    s = nextBeat(s, at(200), 'independent'); // done with the first exhibit: the brainstorm is next, not the second exhibit
    expect(s.stage).toBe('brainstorm_think');
    expect(s.messages.at(-1)?.text).toContain('ways to categorize the new shops');
    expect(s.beats).toHaveLength(2);
    s = ok(ready(s, at(210)));
    s = ok(submit(s, 'By location, by size, by opening year', at(240)));
    // Back to the case: the second exhibit is handed over now, with the time the discussion had left.
    expect(s.stage).toBe('exhibits');
    expect(s.messages.at(-1)).toMatchObject({ kind: 'exhibit', beat: 2 });
    expect(s.beats.map((b) => b.index)).toEqual([0, 1, 2]);
    expect(s.submissions).toHaveLength(3); // framework, direction, brainstorm
    s = nextBeat(s, at(300), 'independent');
    expect(s.stage).toBe('recommend_think');
    expect(stages(s)).toEqual(['prompt', 'framework_think', 'framework_write', 'exhibits', 'brainstorm_think', 'brainstorm_write', 'exhibits', 'recommend_think']);
  });

  it('hands in both answers when a case asks for two brainstorms', () => {
    const p = buildPlan({
      exhibits: [{ title: 'Exhibit 1: the numbers' }],
      steps: [{ title: 'Exhibit 1: the numbers' }, { title: 'Brainstorm #1: Revenue factors' }, { title: 'Brainstorm #2: Switching factors' }],
    });
    let s = toExhibits(p, 100);
    s = nextBeat(s, at(200), 'independent');
    expect(s.stage).toBe('brainstorm_think');
    s = ok(ready(s, at(205)));
    s = ok(submit(s, 'Price, volume, mix', at(230)));
    // The second one follows the first: nothing of the case is left between them.
    expect(s.stage).toBe('brainstorm_think');
    expect(s.messages.at(-1)?.text).toContain('Brainstorm: Switching factors.');
    s = ok(ready(s, at(235)));
    s = ok(submit(s, 'Contract length, habit, switching cost', at(260)));
    expect(s.stage).toBe('recommend_think');
    expect(s.submissions.filter((x) => x.kind === 'brainstorm').map((x) => x.text)).toEqual(['Price, volume, mix', 'Contract length, habit, switching cost']);
  });

  it('keeps the time the closing stages need, with two brainstorms as with one', () => {
    const two = buildPlan({
      exhibits: [{ title: 'Exhibit 1: the numbers' }],
      steps: [{ title: 'Exhibit 1: the numbers' }, { title: 'Brainstorm #1: Revenue factors' }, { title: 'Brainstorm #2: Switching factors' }],
    });
    const s = newSession(two, T0, 'Prompt');
    const brainstorming = PLANNED_MS.brainstorm_think + PLANNED_MS.brainstorm_write;
    const needed = 2 * brainstorming + PLANNED_MS.recommend_think + PLANNED_MS.recommend_write;
    const d = deadlines(s, 'exhibits', T0 + 7.5 * 60_000);
    expect(hardEnd(s) - d.hard).toBe(needed); // both brainstorms and the recommendation are safe
    expect(d.hard).toBeGreaterThan(T0 + 7.5 * 60_000);
    // The second brainstorm comes out of the discussion, not out of the length of the case.
    const one = buildPlan({ exhibits: [{ title: 'Exhibit 1: the numbers' }], steps: [{ title: 'Exhibit 1: the numbers' }, { title: 'Brainstorm: ways to grow' }] });
    expect(two.limitMs).toBe(one.limitMs);
    expect(one.exhibitMs! - two.exhibitMs!).toBe(brainstorming);
    // Which keeps the same flexible time in a case with two as in a case with one.
    const planned = (p: CasePlan, n: number) =>
      PLANNED_MS.prompt + PLANNED_MS.framework_think + PLANNED_MS.framework_write + (p.exhibitMs ?? 0) + n * brainstorming + PLANNED_MS.recommend_think + PLANNED_MS.recommend_write;
    expect(two.limitMs! - planned(two, 2)).toBe(one.limitMs! - planned(one, 1));
  });

  it('still runs the brainstorm when the clock ends the discussion first, and lets the rest of it go', () => {
    const p = buildPlan({
      exhibits: [{ title: 'Exhibit 1: the numbers' }, { title: 'Exhibit 2: the numbers' }],
      steps: [{ title: 'Exhibit 1: the numbers' }, { title: 'Pick the cheaper plant' }, { title: 'Brainstorm: ways to grow' }, { title: 'Exhibit 2: the numbers' }],
    });
    let s = toExhibits(p, 100);
    s = settle(s, at(60 * 60)); // long gone: the clock takes the discussion and then everything else
    expect(stages(s)).toContain('brainstorm_think');
    expect(s.stage).toBe('done');
    // The plan is exhibit, step, brainstorm, exhibit: the first exhibit was reached, then the brainstorm the closing time was kept for.
    expect(p.beats.map((b) => b.kind)).toEqual(['exhibit', 'step', 'brainstorm', 'exhibit']);
    expect(s.beats.map((b) => b.index)).toEqual([0, 2]);
  });
});

/**
 * Real titles and captions from the library (issue #85). A word like "calculation" or "expected" is one the books use on both sides of the
 * table, so on its own it must not take a numbered book exhibit away from the member; everything else is hidden as before.
 */
describe("a soft word in the title of an exhibit the book numbers for the candidate", () => {
  const shown: [string, Parameters<typeof isInterviewerSideExhibit>[0]][] = [
    ['Born for Beauty (Fuqua 2025-26), hidden by "math"', { title: 'Exhibit #3: Product options / math exercise', caption: 'Read aloud to the candidate without showing the figures.' }],
    ['Kellogg Klogs (Kellogg 2024), hidden by "expected"', { title: 'Exhibit D – Expected Claims Per Years of Warranty' }],
    ['Pur and Kleen Water Company (Fuqua 2018), hidden by "brainstorm"', { title: 'Exhibit 3: Typical Canterbury cost figures (offer after brainstorm)' }],
    ['Toto Foundation (Stern 2023-24), hidden by "calculation"', { title: 'Exhibit 3: Annual Cost Calculation' }],
    ['Fringe Science (Fuqua 2019), hidden by "expected"', { title: 'Exhibit #3: Expected market share by formulary status', caption: 'Small table printed beside the Exhibit #3 chart.' }],
    ['Vibrants (Stern 2018), hidden by "sample" and "answer"', { title: 'Exhibit #2 - Sample Focus Group Answers', caption: 'Would you purchase a store-brand version of Vibrants over the brand name?' }],
    ['Refinery in the Country of Georgia (Fuqua 2017), hidden by "expected"', { title: 'Exhibit 2: Expected Output from Georgian Crude Oil' }],
    ['Athelas Insurance (Ross 2016), hidden by "approach"', { title: 'Exhibit 1: Apollo Hospital – Valuation analysis (Approach 1 – Cash Flows)', caption: 'Apollo Hospital Inc. – Free Cash flows (2015). Discount Rate 10%, Growth Rate 0%.' }],
    ['Athelas Insurance (Ross 2016), its second table, hidden by "approach"', { title: 'Exhibit 1: Apollo Hospital – Valuation analysis (Approach 2 – Multiples)', caption: 'Recent hospital acquisitions.' }],
  ];
  for (const [name, exhibit] of shown) {
    it(`shows ${name}`, () => {
      expect(isInterviewerSideExhibit(exhibit)).toBe(false);
    });
  }

  const hidden: [string, Parameters<typeof isInterviewerSideExhibit>[0]][] = [
    // The book's working for a numbered exhibit, not the exhibit: the number runs straight into the word, or the word is all the title says.
    ['WolverineHomes (Ross 2024): the book\'s working for Exhibit 1, answer and all', { title: 'Exhibit 1 calculation (Baseline and High Impact)', rows: [['Total Loss in 5 Years (960K * 5)', '$4,800,000']] }],
    ['Donatella Co. (Ross 2024): the book\'s working for Exhibit 1', { title: 'Exhibit 1 Math' }],
    ['MBS Co. (Darden 2019): the book\'s two ways of doing Exhibit 3', { title: 'Exhibit 3 (math detail): Method 2' }],
    ['Cheesy Situation (Ross 2019): the answers to Exhibit 1', { title: 'Exhibit 1: Answers' }],
    ['eNP & Co (Ross 2013): an answer key', { title: 'Exhibit 1: Answer key to question 2' }],
    ['After School Programming (Kellogg 2018): an answer to a question', { title: 'ANSWER: Question 3/ Exhibit 2', caption: 'Math Solutions (2).' }],
    // A numbered exhibit with a hard marker as well, or with a caption, heading or cell that gives it away.
    ["Entertainment Co. (Darden 2023-24): an answer table on the book's solution page", { title: "Exhibit 2 answer table (interviewer's solution page)" }],
    ['Hybrid Work Model (Stern 2023-24): a calculation guide marked for the interviewer', { title: 'Exhibit 2: Calculation Guide (INTERVIEWER ONLY) - Square Footage' }],
    ["Elena's Electronics (Booth MCG 2026-27): the book's solution to Exhibit 2", { title: 'Exhibit 2: Solution, Option 1 (quantity per store)' }],
    ['North-South Pharma Co. (Darden 2018): a caption that says not to show it', { title: 'Exhibit 1', caption: 'Interviewer should not show this to the student; let them ask for the cost information, then provide it verbally.' }],
    ['Malaria Remedy (Ross 2024): the interviewer\'s own conversion of Exhibit 1', { title: 'Exhibit 1 converted to USD', caption: "Interviewer's conversion: 1 USD = 20 Ghanaian cedi." }],
    ['a numbered exhibit whose cells carry the answer', { title: 'Exhibit 4: Expected margin', rows: [['Margin', '(Answer $14M)']] }],
    ['a numbered exhibit whose columns are the interviewer\'s', { title: 'Exhibit 5: Expected revenue', columns: ['Revenues', 'Revenue Size (Keep Private)'] }],
  ];
  for (const [name, exhibit] of hidden) {
    it(`still hides ${name}`, () => {
      expect(isInterviewerSideExhibit(exhibit)).toBe(true);
    });
  }

  it("leaves a title that is not the book's numbering of an exhibit hidden, as before", () => {
    const titles = ['Sample Approach: Costs', 'Calculation to be performed by candidate', 'Answer: Profit per Customer, Step 1', 'Math working for Part 2', 'Calculations', 'Brainstorm #1: costs along the value chain', 'Expected profit per customer over ten years'];
    expect(titles.filter((title) => !isInterviewerSideExhibit({ title }))).toEqual([]);
  });

  it('gives the member the beat back: a case whose second exhibit was hidden by a soft word now has two', () => {
    const p = buildPlan({
      exhibits: [{ title: 'Exhibit #1 - Pricing Considerations' }, { title: 'Exhibit #2 - Sample Focus Group Answers' }],
      steps: [{ title: 'Framework' }, { title: 'Exhibit 1: pricing and margins' }, { title: 'Exhibit 2: focus group' }],
    });
    expect(p.beats).toEqual([{ kind: 'exhibit', index: 0 }, { kind: 'exhibit', index: 1 }]);
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
        expect(p.beats).toHaveLength(n + (hasBrainstorm ? 1 : 0)); // the brainstorm is a part of the case too, with two stages of its own
        expect(p.beats.filter((b) => b.kind !== 'brainstorm')).toHaveLength(n);
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

  // What a part of the discussion is worth, and what it is worth it for (issue #164). The budget is only ever what `behindSchedule`
  // measures a part against, so none of this moves a stage end or the length of a case.
  /** A case with three things to work through: 16:00 of discussion inside 31:00, and no brainstorm. */
  const threeParts = () => buildPlan({ exhibits: exhibits(3), steps: [] });
  /** Two messages on the part that got nowhere, so the next one is at the rung before 'advance'. */
  const stuckTwice = (s: SessionState, t: number): SessionState => recordHint(recordHint(s, t), t);

  it('shares out the time the discussion really has: the part brought out as the plan runs out is worth the flexible time, not the 30-second floor', () => {
    const s = toExhibits(threeParts(), 450);
    const { soft, hard } = deadlines(s, 'exhibits', s.stageStartedAt);
    expect(hard - soft).toBe(sec(330)); // the flexible time a case with no brainstorm has
    const last = openBeat(nextBeat(nextBeat(s, soft - sec(60), 'coach_moved'), soft, 'coach_moved'))!;
    expect(last.revealedAt).toBe(soft);
    expect(last.budgetMs).toBe(sec(330)); // what is left to the discussion's latest end, shared by the one part still to come
  });

  it('does not call a part behind schedule the moment it is born in the flexible time: it is led before it is moved on', () => {
    let s = toExhibits(threeParts(), 450);
    const { soft } = deadlines(s, 'exhibits', s.stageStartedAt);
    s = nextBeat(nextBeat(s, soft - sec(60), 'coach_moved'), soft + sec(30), 'coach_moved');
    const t = openBeat(s)!.revealedAt;
    s = stuckTwice(s, t + sec(20));
    expect(openBeat(s)!.budgetMs).toBe(sec(300));
    expect(nudgeLevel(s, t + sec(40))).toBe('lead'); // the rung where Bucket says where to look, 40 seconds in
    expect(nudgeLevel(s, t + sec(301))).toBe('advance'); // and the skip still fires on a part that has really overrun
  });

  it('keeps a brainstorm its own time: a case with one has 3:30 of flexible time to share out rather than 5:30', () => {
    const s = toExhibits(buildPlan({ exhibits: exhibits(3), steps: [{ title: 'Brainstorm: ways to grow' }] }), 450);
    const { soft, hard } = deadlines(s, 'exhibits', s.stageStartedAt);
    expect(hard - soft).toBe(sec(210));
    const last = openBeat(nextBeat(nextBeat(s, soft - sec(60), 'coach_moved'), soft, 'coach_moved'))!;
    expect(last.budgetMs).toBe(sec(210)); // the brainstorm's two minutes are not in it, and nor is the recommendation's
  });

  it('a break changes nothing a part is worth: a pause moves every moment of the case on, and the budget arithmetic with it', () => {
    const p = threeParts();
    const away = sec(300);
    let s = toExhibits(p, 450);
    const first = openBeat(s)!;
    s = ok(pause(s, at(600)));
    s = ok(continueCase(s, at(600) + away));
    expect(openBeat(s)!.budgetMs).toBe(first.budgetMs);
    expect(openBeat(s)!.revealedAt).toBe(first.revealedAt + away);
    // The part brought out after the break is worth exactly what it would have been without one, and sits at the same rung.
    const after = nextBeat(s, at(900) + away, 'coach_moved');
    const control = nextBeat(toExhibits(p, 450), at(900), 'coach_moved');
    expect(openBeat(after)!.budgetMs).toBe(openBeat(control)!.budgetMs);
    expect(nudgeLevel(stuckTwice(after, at(930) + away), at(950) + away)).toBe(nudgeLevel(stuckTwice(control, at(930)), at(950)));
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

  it('does not count a message that asked for data: asking well is part of the case and costs no rung', () => {
    let s = inExhibits(3);
    const t = openBeat(s)!.revealedAt;
    s = ok(userSays(s, 'Can I see the cost base?', t + sec(5)));
    s = recordAssessment(s, 'unclear', t + sec(5));
    s = recordDataRequest(s); // the model says that message asked for data, so it is taken back off the count
    expect(openBeat(s)!.asked).toBe(0);
    expect(nudgeLevel(s, t + sec(10))).toBe('process_hint'); // still the first rung: the same as if they had not asked
    s = ok(userSays(s, 'And the volumes?', t + sec(15)));
    s = recordDataRequest(s);
    expect(nudgeLevel(s, t + sec(20))).toBe('process_hint');
    s = ok(userSays(s, 'I am not sure what to do with that', t + sec(25)));
    expect(nudgeLevel(s, t + sec(30))).toBe('directional_hint'); // only the message that did not ask for anything moved them up
    expect(recordDataRequest(inExhibits(3)).beats[0].asked).toBe(0); // never below zero
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

  it('runs the brainstorm of a case that was already going when the plan learned where to put one', () => {
    // A session saved before issue #133: the plan says the case has a brainstorm but holds no part for it, so it runs where it always did.
    const before: CasePlan = { beats: [{ kind: 'exhibit', index: 0 }], hasBrainstorm: true, brainstormTopic: 'ways to grow', exhibitMs: 8 * 60_000, limitMs: 23 * 60_000 };
    let s = toExhibits(before, 450);
    s = nextBeat(s, at(500), 'independent');
    expect(s.stage).toBe('brainstorm_think');
    expect(s.messages.at(-1)?.text).toContain('Brainstorm: ways to grow.');
    s = ok(ready(s, at(510)));
    s = ok(submit(s, 'Pricing, new segments', at(540)));
    expect(s.stage).toBe('recommend_think'); // and only once
    expect(stages(s).filter((x) => x === 'brainstorm_think')).toHaveLength(1);
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

  /** A session on its first exhibit in the given mode, got there the quick way, with nothing said about the exhibit. */
  const silentOnExhibit = (mode: LiveMode): SessionState => {
    let s = newSession(plan(3), T0, 'Prompt text', mode);
    s = ok(ready(s, at(100)));
    s = ok(ready(s, at(100)));
    s = ok(submit(s, 'My framework', at(100)));
    s = ok(userSays(s, 'I would start with demand', at(100)));
    return endFrameworkStage(s, at(100));
  };

  it('asks the member to say something first in practice and in interview, where they are being assessed', () => {
    for (const mode of ['practice', 'interview'] as const) {
      const r = moveOn(silentOnExhibit(mode), at(200));
      expect(r, mode).toMatchObject({ ok: false, reason: 'Tell me what you make of this one first.' });
    }
  });

  it('lets a learner who has written nothing move on: in learning the member alone decides when a beat is over', () => {
    const s = ok(moveOn(silentOnExhibit('learning'), at(200)));
    expect(s.beats.map((b) => b.outcome)).toEqual(['member_moved', 'open']); // the same outcome as any other member-moved beat
    expect(s.messages.at(-1)).toMatchObject({ kind: 'exhibit', beat: 1 });
    expect(ok(moveOn(s, at(210))).beats.map((b) => b.outcome)).toEqual(['member_moved', 'member_moved', 'open']);
  });

  it('still refuses a learner outside the exhibit discussion and holds the rest of the rules', () => {
    expect(moveOn(newSession(plan(3), T0, 'Prompt text', 'learning'), at(10)).ok).toBe(false);
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

describe('the help ladder, mode by mode', () => {
  /** A session on its first exhibit in the given mode, got there the quick way. */
  const onExhibit = (mode: LiveMode): SessionState => {
    let s = newSession(plan(3), T0, 'Prompt text', mode);
    s = ok(ready(s, at(100)));
    s = ok(ready(s, at(100)));
    s = ok(submit(s, 'My framework', at(100)));
    s = ok(userSays(s, 'I would start with demand', at(100)));
    return endFrameworkStage(s, at(100));
  };

  /** What the member's 1st, 2nd, 3rd ... message on a beat that is going nowhere is answered with, while the beat is still inside its time. */
  const rungs = (mode: LiveMode, count = 6): NudgeLevel[] => {
    const s = onExhibit(mode);
    const b = openBeat(s)!;
    return Array.from({ length: count }, (_, asked) => nudgeLevel({ ...s, beats: [{ ...b, asked }] }, b.revealedAt + sec(30)));
  };

  it('teaches in practice: a process hint from the first message, then a sharper one, then Bucket leads, then it moves on', () => {
    expect(rungs('practice')).toEqual(['process_hint', 'directional_hint', 'lead', 'advance', 'advance', 'advance']);
  });

  it('starts one rung later in an interview, and never leads: the first message gets nothing and being stuck costs the beat', () => {
    expect(rungs('interview')).toEqual(['none', 'process_hint', 'directional_hint', 'advance', 'advance', 'advance']);
    expect(rungs('interview', 12)).not.toContain('lead');
  });

  it('keeps teaching in learning mode and never moves the member on', () => {
    expect(rungs('learning')).toEqual(['process_hint', 'directional_hint', 'lead', 'lead', 'lead', 'lead']);
  });

  it('counts the hints given as well as the messages that got nowhere, in every mode', () => {
    for (const [mode, expected] of [['practice', 'lead'], ['interview', 'directional_hint'], ['learning', 'lead']] as const) {
      const s = onExhibit(mode);
      const b = openBeat(s)!;
      expect(nudgeLevel({ ...s, beats: [{ ...b, hints: 2, asked: 0 }] }, b.revealedAt + sec(30)), mode).toBe(expected);
    }
  });

  it('skips the last rung of help once a timed exhibit has run past what it is worth, in practice and in an interview alike', () => {
    for (const mode of ['practice', 'interview'] as const) {
      const s = onExhibit(mode);
      const b = openBeat(s)!;
      const late = b.revealedAt + b.budgetMs + sec(1);
      expect(nudgeLevel({ ...s, beats: [{ ...b, asked: 2 }] }, late), mode).toBe('advance');
      expect(nudgeLevel({ ...s, beats: [{ ...b, asked: 1 }] }, late), mode).toBe(mode === 'practice' ? 'directional_hint' : 'process_hint');
    }
    // learning has no clock, so there is no such thing as behind schedule and nothing ever moves the learner on
    const l = onExhibit('learning');
    const lb = openBeat(l)!;
    expect(nudgeLevel({ ...l, beats: [{ ...lb, asked: 5 }] }, lb.revealedAt + lb.budgetMs + sec(10_000))).toBe('lead');
  });

  it('says nothing to the clock, in any mode: help only ever answers something the member wrote', () => {
    for (const mode of ['practice', 'interview', 'learning'] as const) {
      const s = onExhibit(mode);
      const b = openBeat(s)!;
      for (const asked of [0, 1, 2, 5]) expect(nudgeLevel({ ...s, beats: [{ ...b, asked }] }, b.revealedAt + sec(600), 'timer'), mode).toBe('none');
    }
  });

  it('treats a case saved before there were modes as practice', () => {
    const s = onExhibit('practice');
    const b = openBeat(s)!;
    const old: SessionState = { ...s, mode: undefined, beats: [{ ...b, asked: 2 }] };
    expect(nudgeLevel(old, b.revealedAt + sec(30))).toBe('lead');
  });

  // The ladder is entered by `asked`, and `asked` is reset by a message the model scored as a step forward. The real-model pilot found
  // that score given to messages that said nothing, so the counter never climbed for the member who most needed it (issue #130).
  describe('what counts as a step forward', () => {
    it('counts a message that names a figure, a comparison or the next move', () => {
      for (const text of [
        'Off-peak occupancy is 31% against 95% at peak',
        'The suburban shops look worse than the urban ones',
        'Profit is flat while revenue grows, so the new shops must be the drag',
        'I would work out the profit per shop for each group',
        "Let's check the cost side next",
        'I am not sure if this is right, but the margin per customer is the thing to compare',
      ]) {
        expect(madeAStep(text), text).toBe(true);
      }
    });

    it('does not count a message that names none of them, however reasonable it sounds', () => {
      for (const text of [
        'Looking at this, the pattern I notice seems worth following up',
        'There is definitely something interesting happening here',
        'Okay, I see',
        'I do not know',
        'No idea',
        'Hmm',
      ]) {
        expect(madeAStep(text), text).toBe(false);
      }
    });

    it('does not count a reading the member says plainly they cannot use, and does count one they can', () => {
      // The pilot's own first message: it reads the exhibit, and then says they do not know what to do with it.
      expect(madeAStep("Revenue is going up a lot and profit is just sitting there. I'm not really sure what to do with that.")).toBe(false);
      expect(madeAStep('Revenue is up and profit is flat, so I would look at the cost per shop')).toBe(true);
    });

    it('only ever takes a score away, and only the top one', () => {
      expect(assessmentOf('progress', 'Looking at this, the pattern seems worth following up')).toBe('unclear');
      expect(assessmentOf('progress', 'Off-peak occupancy is 31% against 95% at peak')).toBe('progress');
      for (const claimed of ['partial', 'stuck', 'unclear'] as const) expect(assessmentOf(claimed, 'Anything at all')).toBe(claimed);
    });

    it('keeps the rung counter climbing when every message is scored a step forward', () => {
      // Six messages that say nothing, each one scored 'progress' by the model: before, the counter was reset six times.
      let s = onExhibit('interview');
      for (let i = 0; i < 3; i++) {
        s = ok(userSays(s, 'There is definitely something interesting happening here', at(10)));
        s = recordAssessment(s, assessmentOf('progress', 'There is definitely something interesting happening here'), at(10));
        s = coachSays(s, 'Okay, go on.', at(10));
      }
      expect(openBeat(s)!.asked).toBe(3);
      expect(nudgeLevel(s, openBeat(s)!.revealedAt + sec(30))).toBe('advance');
      // ...and a message that does say something still starts the count again.
      s = ok(userSays(s, 'Off-peak occupancy is 31% against 95% at peak', at(10)));
      s = recordAssessment(s, assessmentOf('progress', 'Off-peak occupancy is 31% against 95% at peak'), at(10));
      expect(openBeat(s)!.asked).toBe(0);
      expect(nudgeLevel(s, openBeat(s)!.revealedAt + sec(30))).toBe('none');
    });
  });
});

// Issue #184: 'partial' is the model's judgement of one message, made fresh each turn with no memory of how many times it has already
// been given. The real-model pilot of 2026-11-18 found what that costs: six competent-sounding but wrong messages on one part came
// back 'partial' six times, `asked` climbed past the top of the ladder, and no rung of it could fire.
describe('nearly there, or going round in circles (issue #184)', () => {
  const onExhibit = (mode: LiveMode = 'interview'): SessionState => {
    let s = newSession(plan(3), T0, 'Prompt text', mode);
    s = ok(ready(s, at(100)));
    s = ok(ready(s, at(100)));
    s = ok(submit(s, 'My framework', at(100)));
    s = ok(userSays(s, 'I would start with demand', at(100)));
    return endFrameworkStage(s, at(100));
  };
  /** One more message from the member, scored by the model, and what the engine makes of it. */
  const message = (s: SessionState, assessment: Assessment, t: number): { state: SessionState; nowhere: boolean } => {
    const next = ok(userSays(s, 'Something about the exhibit', at(t)));
    const nowhere = gettingNowhere(assessment, partialRun(next));
    return { state: recordAssessment(next, assessment, at(t)), nowhere };
  };

  it('holds a member who is stuck or who said nothing to tell from, from their very first message', () => {
    for (const assessment of ['stuck', 'unclear'] as const) for (const run of [0, 1, 2, 9]) expect(gettingNowhere(assessment, run), assessment).toBe(true);
  });

  it('never says it of a clear step forward, however many messages have gone by', () => {
    for (const run of [0, 1, 2, 9]) expect(gettingNowhere('progress', run)).toBe(false);
  });

  it('leaves the first two half-answers alone and calls the third one circling', () => {
    expect(CIRCLING_PARTIALS).toBe(3);
    expect([0, 1, 2, 3, 9].map((run) => gettingNowhere('partial', run))).toEqual([false, false, true, true, true]);
  });

  it('counts the run of half-answers on the beat, and a clear step forward sets it back to nothing', () => {
    let s = onExhibit();
    for (const [i, expected] of [false, false, true, true].entries()) {
      const r = message(s, 'partial', 200 + i * 10);
      expect(r.nowhere, `message ${i + 1}`).toBe(expected);
      s = r.state;
    }
    expect(openBeat(s)!.partials).toBe(4);
    s = message(s, 'progress', 300).state;
    expect(openBeat(s)!.partials).toBe(0);
    expect(openBeat(s)!.asked).toBe(0);
  });

  it('leaves a half-answer between two real steps exactly where it was: one of them is nearly there, not circling', () => {
    let s = onExhibit();
    for (const [i, assessment] of (['progress', 'partial', 'progress', 'partial'] as const).entries()) {
      const r = message(s, assessment, 200 + i * 10);
      expect(r.nowhere, assessment).toBe(false);
      s = r.state;
    }
    expect(openBeat(s)!.partials).toBe(1);
  });

  it('does not count a message that asked for data: asking costs no part of the run either', () => {
    let s = onExhibit();
    for (let i = 0; i < 4; i++) {
      s = ok(userSays(s, 'What is the cost base?', at(200 + i * 10)));
      s = recordDataRequest(recordAssessment(s, 'partial', at(200 + i * 10)));
    }
    expect(openBeat(s)!.partials).toBe(0);
    expect(openBeat(s)!.asked).toBe(0);
    expect(gettingNowhere('partial', partialRun(s))).toBe(false);
    expect(recordDataRequest(onExhibit()).beats[0].partials).toBe(0); // never below zero
  });

  it('starts the count from nothing in a case saved before it was kept', () => {
    const s = onExhibit();
    const b = openBeat(s)!;
    const old: SessionState = { ...s, beats: [{ ...b, partials: undefined }] };
    expect(partialRun(old)).toBe(0);
    expect(gettingNowhere('partial', partialRun(old))).toBe(false);
    expect(openBeat(recordAssessment(old, 'partial', at(200)))!.partials).toBe(1);
  });
});
