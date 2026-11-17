// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  computedCells,
  figuresIn,
  gradesTheirReading,
  handleLive,
  hasTell,
  interviewerVoice,
  isFullSolution,
  leaks,
  movingOnOnly,
  openingText,
  saysMovingOn,
  sharesSubstance,
  statesHeldResult,
  withoutSourceNarration,
  FALLBACK,
  LEAD_FALLBACK,
  MAX_FEEDBACK_ATTEMPTS,
  MAX_STARTS_PER_DAY,
  MOVING_ON,
  OVER_TO_YOU,
  SHOW_DATA,
  WORK_IS_YOURS,
  WORK_IT_TOGETHER,
  withoutVerdicts,
  parseFeedback,
  parseTurn,
  refusedTurn,
  readSolution,
  type LiveAction,
  type LiveDeps,
  type LiveResponse,
  type LiveView,
  type StoredSession,
  type TurnRequest,
} from '../../supabase/functions/_shared/liveCaseCoach';
import { assessmentOf, type SessionState } from '../../supabase/functions/_shared/liveCase';

const T0 = Date.parse('2026-11-12T15:00:00Z');
const sec = (n: number) => n * 1000;
const ME = 'user-me';
const LIB = 'case-1';

const EXHIBIT = (n: number) => ({
  title: `Exhibit ${n}: Occupancy by season`,
  caption: '',
  columns: ['Season', 'Occupancy'],
  rows: [['Peak', '95%'], ['Off-peak', `${30 + n}%`]],
  approx: false,
  howToRead: `Compare the seasons first SECRET-HOW${n}`,
  takeaways: [`Off-peak occupancy is the number that decides the case SECRET-TAKE${n}`],
  chart: null,
});

const SOLUTION = {
  confidence: 'high',
  prompt: 'Should a hotel chain open a new property near a military base?',
  facts: ['The base houses 20,000 soldiers.'],
  clarifyingQuestions: [{ question: 'Who pays for the rooms?', answer: 'The army pays a fixed per diem per soldier.', why: 'SECRET-WHY' }],
  hypothesis: { statement: 'Build only if off-peak occupancy clears break-even SECRET-HYPOTHESIS', basis: '' },
  structure: [{ heading: 'Demand', keyQuestion: 'Will they stay?', why: '', points: ['Soldiers on leave'] }],
  steps: [
    { title: 'Size peak demand', body: 'Peak fills the hotel for four months SECRET-STEP', calc: [], whatToNotice: 'The base is busy only part of the year', commonMiss: [], checkYourself: [] },
    { title: 'Brainstorm: ways to grow revenue', body: 'Ideas SECRET-BRAINSTORM', calc: [], whatToNotice: '', commonMiss: [], checkYourself: [] },
  ],
  exhibits: [EXHIBIT(1), EXHIBIT(2), { ...EXHIBIT(3), title: 'Interviewer Guidance: Revenue', rows: [['Basic', 'SECRET-GUIDE-70,000']], howToRead: '', takeaways: [] }],
  recommendation: 'Open the hotel only if off-peak occupancy clears the break-even SECRET-REC',
  recommendationDetail: { because: ['Because off-peak is below break-even SECRET-BECAUSE'], delivery: 'I would not open it yet SECRET-DELIVERY', commonMisses: [] },
  risks: ['Base closure'],
  nextSteps: ['Survey soldiers'],
};

const INFO = { name: 'Army Hotel', book: 'Booth MCG', caseType: 'Profitability', industry: 'Hospitality' };

const clock = { t: T0 };

interface World {
  deps: LiveDeps;
  db: Map<string, StoredSession>;
  asked: TurnRequest[];
  starts: number[];
  script: { reply: (kind: string, req: TurnRequest) => unknown | Promise<unknown> };
}

const kindOf = (req: TurnRequest): string => {
  if (req.system.includes('writing honest, specific feedback') || req.system.includes('writing learning notes')) return 'feedback';
  const last = req.messages[req.messages.length - 1].content;
  if (last.includes('asked a clarifying question')) return 'clarify';
  if (last.includes('handed in a framework')) return 'direction';
  if (last.includes('is working on the exhibit')) return 'exhibit';
  if (last.includes('ONE brief process-oriented hint')) return 'nudge_process';
  if (last.includes('still stuck after a hint')) return 'nudge_directional';
  if (last.includes('move on to the next piece')) return 'move_on';
  return 'unknown';
};

const turn = (message: string, over: Record<string, unknown> = {}) => ({ message, assessment: 'unclear', beat_complete: false, direction_clear: false, ...over });

function makeWorld(): World {
  const db = new Map<string, StoredSession>();
  const asked: TurnRequest[] = [];
  const starts: number[] = [];
  const script: World['script'] = {
    reply: (kind) => (kind === 'feedback' ? GOOD_FEEDBACK : turn(`Coach reply to ${kind}`, { assessment: 'progress' })),
  };
  const deps: LiveDeps = {
    now: () => clock.t,
    loadCase: async (id) => (id === LIB ? { info: INFO, solution: SOLUTION } : null),
    pickCase: async () => LIB,
    getSession: async (userId, id) => {
      const s = db.get(id);
      return s && s.userId === userId ? structuredClone(s) : null;
    },
    getActive: async (userId) => {
      const s = [...db.values()].find((x) => x.userId === userId && x.status === 'active');
      return s ? structuredClone(s) : null;
    },
    getLatest: async (userId) => {
      const s = [...db.values()].filter((x) => x.userId === userId).sort((a, b) => b.createdAt - a.createdAt)[0];
      return s ? structuredClone(s) : null;
    },
    createSession: async (s) => {
      db.set(s.id, structuredClone(s));
      starts.push(s.createdAt);
    },
    saveSession: async (s, expected) => {
      const cur = db.get(s.id);
      if (!cur || cur.version !== expected) return false;
      db.set(s.id, structuredClone(s));
      return true;
    },
    countStarts: async (_u, since) => starts.filter((t) => t >= since).length,
    ask: async (req) => {
      asked.push(structuredClone(req));
      const out = await script.reply(kindOf(req), req);
      return { text: typeof out === 'string' ? out : JSON.stringify(out), stopReason: 'end_turn' };
    },
  };
  return { deps, db, asked, starts, script };
}

let w: World;
beforeEach(() => {
  clock.t = T0;
  w = makeWorld();
});

const call = (action: LiveAction, userId = ME) => handleLive(userId, action, w.deps);
const view = (r: LiveResponse): LiveView => {
  if (r.status !== 'ok') throw new Error(`${r.status}: ${'message' in r ? r.message : ''}`);
  return r.view;
};
const begin = async () => view(await call({ type: 'start', libraryId: LIB }));
const at = (s: number) => {
  clock.t = T0 + sec(s);
};

/** Opening stages done quickly: returns the id of a session on its first exhibit. */
async function toExhibits(): Promise<string> {
  const v = await begin();
  const id = v.sessionId;
  await call({ type: 'ready', sessionId: id });
  await call({ type: 'ready', sessionId: id });
  await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' });
  w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
  const r = view(await call({ type: 'say', sessionId: id, text: 'I would start with demand' }));
  expect(r.stage).toBe('exhibits');
  w.asked.length = 0;
  return id;
}

const GOOD_FEEDBACK = {
  overall_rating: 3,
  overall_feedback: 'You gave a clear structure and found the main issue.',
  skills: [
    { key: 'framework', rating: 4, feedback: 'Clear buckets.', evidence: 'Demand, supply, cost' },
    { key: 'exhibits', rating: 3, feedback: 'Read the table correctly.', evidence: 'Off-peak is 40 percent' },
    { key: 'quant', rating: 5, feedback: 'Made up.', evidence: 'this quote was never written by the student' },
    { key: 'behavioral1', rating: 4, feedback: 'Cannot tell.', evidence: 'Demand, supply, cost' },
  ],
  went_well: 'Good structure.',
  struggled: 'Slow on the second exhibit.',
  concepts: 'Seasonality and break-even.',
  next_focus: 'Practise break-even quickly.',
  improvement_area: 'quant',
  debrief: [{ stage: 'Framework', observed: 'Three clear buckets.', to_improve: 'Add a hypothesis.' }],
  unfinished: ['Brainstorm'],
};

describe('starting a live case', () => {
  it('starts the clock with the prompt and what the interviewer says up front, and keeps the case name secret', async () => {
    const v = await begin();
    expect(v.stage).toBe('prompt');
    expect(v.messages[0].text).toContain('Should a hotel chain open a new property near a military base?');
    // Only the prompt, word for word. What the interviewer holds comes out when the student asks for it.
    expect(v.messages[0].text).not.toContain('The base houses 20,000 soldiers.');
    expect(v.startedAt).toBe(T0);
    expect(v.endsAt).toBe(T0 + sec(1860)); // 31 minutes: the case is sized to its three beats, two exhibits and a step with none (16 minutes of discussion plus 15 around it)
    expect(v.caseInfo).toBeNull(); // the name would spoil it
    expect(v.exhibits).toEqual([]);
    expect(w.asked).toHaveLength(0); // starting costs nothing
  });

  it('picks a case at random when none is chosen, and refuses a case without a write-up', async () => {
    expect(view(await call({ type: 'start' })).stage).toBe('prompt');
    w = makeWorld();
    const r = await call({ type: 'start', libraryId: 'no-such-case' });
    expect(r).toMatchObject({ status: 'refused' });
  });

  it('gives back the running case instead of starting a second one', async () => {
    const a = await begin();
    const b = await begin();
    expect(b.sessionId).toBe(a.sessionId);
    expect(w.db.size).toBe(1);
  });

  it('limits how many cases one person can start in a day', async () => {
    for (let i = 0; i < MAX_STARTS_PER_DAY; i++) {
      const v = await begin();
      at(2000 * (i + 1)); // the previous one is long over
      await call({ type: 'resume', sessionId: v.sessionId }); // settles it to done
    }
    const r = await call({ type: 'start', libraryId: LIB });
    expect(r).toMatchObject({ status: 'refused' });
    expect(JSON.stringify(r)).toContain('a day');
  });

  it('comes back to the running case after a refresh, with the time and drafts as they were', async () => {
    const v = await begin();
    at(30);
    await call({ type: 'draft', sessionId: v.sessionId, key: 'clarify', text: 'What about competi' });
    at(40);
    const back = view(await call({ type: 'resume' }));
    expect(back.sessionId).toBe(v.sessionId);
    expect(back.startedAt).toBe(T0);
    expect(back.drafts.clarify).toBe('What about competi');
    expect(back.serverNow).toBe(T0 + sec(40));
  });

  it('cannot be read or changed by anyone else', async () => {
    const v = await begin();
    expect(await call({ type: 'resume', sessionId: v.sessionId }, 'stranger')).toMatchObject({ status: 'refused' });
    expect(await call({ type: 'say', sessionId: v.sessionId, text: 'hi' }, 'stranger')).toMatchObject({ status: 'refused' });
    expect(await call({ type: 'ready', sessionId: v.sessionId }, 'stranger')).toMatchObject({ status: 'refused' });
  });
});

describe('what the member can see', () => {
  it('never carries the private notes, the answer, or exhibits that have not been shown, at any point', async () => {
    const id = await toExhibits();
    const early = view(await call({ type: 'resume', sessionId: id }));
    const json = JSON.stringify(early);
    for (const secret of ['SECRET', 'Because off-peak', 'break-even', 'Build only if']) expect(json, secret).not.toContain(secret);
    expect(early.exhibits).toHaveLength(1); // only the first exhibit is out
    expect(early.exhibits[0].rows).toEqual([['Peak', '95%'], ['Off-peak', '31%']]);
    expect(early.caseInfo).toBeNull();
    expect(json).not.toContain('Exhibit 2');
  });

  it('shows the case name and the solution only after the case is over', async () => {
    const v = await begin();
    at(5000);
    const done = view(await call({ type: 'resume', sessionId: v.sessionId }));
    expect(done.status).toBe('done');
    expect(done.caseInfo).toEqual({ ...INFO, libraryId: LIB }); // so the finished case can be logged against the library case
    expect(JSON.stringify(done)).not.toContain('SECRET');
  });
});

describe('what the model is told', () => {
  it('gets the prompt, the facts, the clarifying answers and the data the interviewer holds, but no exhibit and no conclusion, while the student asks questions', async () => {
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays for the rooms?' });
    const req = w.asked[0];
    const all = JSON.stringify(req);
    expect(all).toContain('The army pays a fixed per diem per soldier.');
    expect(all).toContain('SECRET-GUIDE-70,000'); // the interviewer's own table: its input figures can be asked for at this point too
    for (const secret of ['SECRET-HOW', 'SECRET-TAKE', 'SECRET-REC', 'SECRET-BECAUSE', 'SECRET-HYPOTHESIS', 'SECRET-STEP', 'SECRET-BRAINSTORM', 'SECRET-WHY', 'Exhibit 1', 'Off-peak', 'break-even']) {
      expect(all, secret).not.toContain(secret);
    }
    expect(req.system).toContain('Never give the answer');
  });

  it('gets the exhibit on the table (and notes on it) but never the next exhibit, the recommendation or the brainstorm', async () => {
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'Peak is 95 and off-peak is 31' });
    const all = JSON.stringify(w.asked[0]);
    expect(all).toContain('SECRET-HOW1');
    expect(all).toContain('SECRET-TAKE1');
    for (const secret of ['SECRET-HOW2', 'SECRET-TAKE2', 'SECRET-REC', 'SECRET-DELIVERY', 'SECRET-BECAUSE', 'SECRET-HYPOTHESIS', 'SECRET-BRAINSTORM', 'SECRET-STEP']) {
      expect(all, secret).not.toContain(secret);
    }
  });

  it('keeps its own instructions off the saved conversation, so the same prefix is sent each time', async () => {
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'First thought' });
    await call({ type: 'say', sessionId: id, text: 'Second thought' });
    const [a, b] = w.asked;
    const earlier = a.messages.slice(0, -1).map((m) => `${m.role}:${m.content}`).join('|');
    const sameUpTo = b.messages.slice(0, a.messages.length - 1).map((m) => `${m.role}:${m.content}`).join('|');
    expect(sameUpTo).toBe(earlier);
    expect(a.system).toBe(b.system);
  });
});

describe('the opening stages', () => {
  it('answers a clarifying question and saves the question and the answer', async () => {
    const v = await begin();
    w.script.reply = () => turn('The army pays a fixed per diem.', { assessment: 'progress' });
    const r = view(await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays?' }));
    expect(r.messages.slice(-2).map((m) => `${m.from}:${m.text}`)).toEqual(['user:Who pays?', 'coach:The army pays a fixed per diem.']);
    expect(r.clarifyCount).toBe(1);
  });

  it('keeps the member\'s message even when the model cannot reply, and says so', async () => {
    const v = await begin();
    w.script.reply = () => {
      throw new Error('network down');
    };
    const r = await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays?' });
    expect(r).toMatchObject({ status: 'failed' });
    const after = view(await call({ type: 'resume', sessionId: v.sessionId }));
    expect(after.messages.at(-1)).toMatchObject({ from: 'user', text: 'Who pays?' });
  });

  it('treats invalid or empty model output as a failure and not as a coach message', async () => {
    const v = await begin();
    w.script.reply = () => 'not json at all';
    expect(await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays?' })).toMatchObject({ status: 'failed' });
    w.script.reply = () => turn('   ');
    expect(await call({ type: 'say', sessionId: v.sessionId, text: 'And who else?' })).toMatchObject({ status: 'failed' });
  });

  it('moves from the prompt to framework thinking by itself after three minutes, and into writing after 90 seconds more', async () => {
    const v = await begin();
    at(185);
    expect(view(await call({ type: 'resume', sessionId: v.sessionId })).stage).toBe('framework_think');
    at(275);
    expect(view(await call({ type: 'resume', sessionId: v.sessionId })).stage).toBe('framework_write');
  });

  it('asks where they would start after the framework, replies once, and moves on to the first exhibit', async () => {
    const v = await begin();
    await call({ type: 'ready', sessionId: v.sessionId });
    await call({ type: 'ready', sessionId: v.sessionId });
    const afterFramework = view(await call({ type: 'submit', sessionId: v.sessionId, text: 'Demand, supply, cost' }));
    expect(afterFramework.frameworkPhase).toBe('direction');
    expect(afterFramework.messages.at(-1)?.text).toContain('Where would you start');

    w.script.reply = () => turn('Which part of demand would you size first?', { direction_clear: false });
    const first = view(await call({ type: 'say', sessionId: v.sessionId, text: 'Demand' }));
    expect(first.stage).toBe('framework_write'); // one focused follow-up
    w.script.reply = () => turn('Okay, let us look at some data.', { direction_clear: false });
    const second = view(await call({ type: 'say', sessionId: v.sessionId, text: 'Soldiers on leave' }));
    expect(second.stage).toBe('exhibits'); // no long framework-coaching conversation
    expect(second.exhibits).toHaveLength(1);
  });

  it('never accepts a write-up that is not a handed-in framework in the wrong stage', async () => {
    const v = await begin();
    expect(await call({ type: 'submit', sessionId: v.sessionId, text: 'My recommendation' })).toMatchObject({ status: 'refused' });
  });
});

describe('the exhibit discussion', () => {
  it('brings out the next exhibit when the member states the implication and next step', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('Good. Let us look at the next one.', { assessment: 'progress', beat_complete: true });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Off-peak is 31 percent so we lose money; I would check costs next' }));
    expect(r.exhibits.map((e) => e.title)).toEqual(['Exhibit 1: Occupancy by season', 'Exhibit 2: Occupancy by season']);
    expect(r.messages.at(-1)).toMatchObject({ kind: 'exhibit' });
    const stored = [...w.db.values()][0].state;
    expect(stored.beats.map((b) => b.outcome)).toEqual(['independent', 'open']);
  });

  it('lets a member who is working carry on without interruption', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('Keep going.', { assessment: 'progress' });
    for (let i = 0; i < 3; i++) {
      clock.t += sec(20);
      const r = view(await call({ type: 'say', sessionId: id, text: `Thought ${i}` }));
      expect(r.messages.filter((m) => m.kind === 'hint')).toHaveLength(0);
    }
  });

  it('does nothing at all when the member has been making progress', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('Good.', { assessment: 'progress' });
    clock.t += sec(40); // by the clock a hint is due, but what they wrote is progress
    const said = view(await call({ type: 'say', sessionId: id, text: 'Peak is 95 and off-peak is 31' }));
    expect(said.messages.filter((m) => m.kind === 'hint')).toHaveLength(0);
    const asked = w.asked.length;
    clock.t += sec(10);
    const r = view(await call({ type: 'nudge', sessionId: id }));
    expect(w.asked.length).toBe(asked);
    expect(r.messages.filter((m) => m.kind === 'hint')).toHaveLength(0);
  });

  it("gives the hint the clock allows only if the member's message shows they are stuck", async () => {
    const id = await toExhibits();
    clock.t += sec(40);
    w.script.reply = () => turn('Try comparing the two seasons.', { assessment: 'stuck' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'I am not sure what to do' }));
    expect(r.messages.at(-1)).toMatchObject({ kind: 'hint' });
    expect(JSON.stringify(w.asked.at(-1))).toContain('ONE brief process-oriented hint');
    expect([...w.db.values()][0].state.beats[0].hints).toBe(1);
  });

  it('shares the exhibit time out so that a case with more exhibits gets shorter exchanges', async () => {
    const id = await toExhibits();
    const stored = [...w.db.values()].find((s) => s.id === id)!.state;
    expect(stored.beats[0].budgetMs).toBeGreaterThan(0);
    // The two exhibits the member is given, the step of the analysis that has no exhibit of its own, and the brainstorm in its place.
    expect(stored.plan.beats).toEqual([
      { kind: 'exhibit', index: 0 },
      { kind: 'exhibit', index: 1 },
      { kind: 'step', index: 0, topic: 'Size peak demand' },
      { kind: 'brainstorm', index: 1, topic: 'ways to grow revenue' },
    ]);
  });
});

describe('late replies and replies that leak', () => {
  it('drops a reply that arrives after the case moved on, instead of reopening the earlier stage', async () => {
    const id = await toExhibits();
    // While the model is thinking, the discussion time runs out.
    w.script.reply = () => {
      at(1650);
      return turn('A very late reply', { assessment: 'progress' });
    };
    const r = view(await call({ type: 'say', sessionId: id, text: 'My view of the exhibit' }));
    expect(r.stage).not.toBe('exhibits');
    expect(r.messages.some((m) => m.text === 'A very late reply')).toBe(false);
    expect(r.messages.some((m) => m.text === 'My view of the exhibit')).toBe(true); // what they wrote is kept
  });

  it('replaces a coach message that repeats the private notes', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('Off-peak occupancy is the number that decides the case SECRET-TAKE1', { assessment: 'progress' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'What does it mean?' }));
    expect(r.messages.at(-1)?.text).not.toContain('SECRET');
    expect(r.messages.at(-1)?.text).toContain('stay with your reasoning');
  });

  it('spots a repeated sentence of the private notes and only that', () => {
    expect(leaks('As you can see, off-peak occupancy is the number that decides the case.', ['Off-peak occupancy is the number that decides the case.'])).toBe(true);
    expect(leaks('What would you compare first?', ['Off-peak occupancy is the number that decides the case.'])).toBe(false);
    expect(leaks('Short note', ['Short note'])).toBe(false); // too short to be a giveaway
  });

  it('replaces an answer given away while the student is only asking clarifying questions', async () => {
    const v = await begin();
    w.script.reply = () => turn('Open the hotel only if off-peak occupancy clears the break-even SECRET-REC', { assessment: 'progress' });
    const r = view(await call({ type: 'say', sessionId: v.sessionId, text: 'So what should we do?' }));
    expect(r.messages.at(-1)?.text).not.toContain('SECRET');
    expect(r.messages.at(-1)?.text).toContain('stay with your reasoning');
  });
});

describe('drafts, the scratchpad and the end of the case', () => {
  it('saves drafts and the scratchpad without calling the model', async () => {
    const v = await begin();
    await call({ type: 'ready', sessionId: v.sessionId });
    expect(await call({ type: 'scratch', sessionId: v.sessionId, text: 'rough: demand' })).toMatchObject({ status: 'saved' });
    at(200);
    await call({ type: 'ready', sessionId: v.sessionId }); // into writing
    await call({ type: 'draft', sessionId: v.sessionId, key: 'framework', text: 'Profit = rev' });
    const back = view(await call({ type: 'resume', sessionId: v.sessionId }));
    expect(back.scratchpad).toBe('rough: demand');
    expect(back.drafts.framework).toBe('Profit = rev');
    expect(w.asked).toHaveLength(0);
  });

  it('saves the typed draft as a timed-out response when the 30 minutes end, and refuses further answers', async () => {
    const id = await toExhibits();
    // run the discussion on to the closing stages
    w.script.reply = () => turn('Good', { assessment: 'progress', beat_complete: true });
    await call({ type: 'say', sessionId: id, text: 'First implication and next step' });
    await call({ type: 'say', sessionId: id, text: 'Second implication and next step' });
    await call({ type: 'say', sessionId: id, text: 'And how I would work the last part' });
    let v = view(await call({ type: 'resume', sessionId: id }));
    expect(v.stage).toBe('brainstorm_think');
    at(1700);
    v = view(await call({ type: 'resume', sessionId: id }));
    expect(v.stage).toBe('done');
    expect(v.endReason).toBe('completed');
    expect(await call({ type: 'say', sessionId: id, text: 'too late' })).toMatchObject({ status: 'refused' });
    expect(await call({ type: 'submit', sessionId: id, text: 'too late' })).toMatchObject({ status: 'refused' });
  });

  it('asks the brainstorm and nothing else: the book\'s own ideas never reach the member', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('Good', { assessment: 'progress', beat_complete: true });
    await call({ type: 'say', sessionId: id, text: 'First implication and next step' });
    await call({ type: 'say', sessionId: id, text: 'Second implication and next step' });
    await call({ type: 'say', sessionId: id, text: 'And how I would work the last part' });
    const v = view(await call({ type: 'resume', sessionId: id }));
    expect(v.stage).toBe('brainstorm_think');
    expect(v.messages.at(-1)?.text).toContain('Brainstorm: ways to grow revenue.'); // the question, from the book's own title
    expect(JSON.stringify(v)).not.toContain('SECRET-BRAINSTORM'); // and nothing the book holds under it
    const asked = JSON.stringify(w.asked);
    expect(asked).not.toContain('SECRET-BRAINSTORM'); // the model is not asked to write anything here either
  });

  it('marks a case as logged once', async () => {
    const v = await begin();
    await call({ type: 'logged', sessionId: v.sessionId, caseId: 'case-a' });
    const again = view(await call({ type: 'logged', sessionId: v.sessionId, caseId: 'case-b' }));
    expect(again.loggedCaseId).toBe('case-a');
  });
});

describe('the feedback', () => {
  async function finishedCase(): Promise<string> {
    const id = await toExhibits();
    w.script.reply = () => turn('Good', { assessment: 'progress' });
    await call({ type: 'say', sessionId: id, text: 'Off-peak is 40 percent so profit is under pressure' });
    at(5000);
    await call({ type: 'resume', sessionId: id });
    w.asked.length = 0;
    w.script.reply = () => GOOD_FEEDBACK;
    return id;
  }

  it('is not written while the case is still running', async () => {
    const v = await begin();
    expect(await call({ type: 'finish', sessionId: v.sessionId })).toMatchObject({ status: 'refused' });
    expect(w.asked).toHaveLength(0);
  });

  it('is written once, kept, and not paid for again when asked for twice', async () => {
    const id = await finishedCase();
    const first = view(await call({ type: 'finish', sessionId: id }));
    expect(first.feedback?.overall.feedback).toContain('clear structure');
    expect(w.asked).toHaveLength(1);
    const second = view(await call({ type: 'finish', sessionId: id }));
    expect(second.feedback).toEqual(first.feedback);
    expect(w.asked).toHaveLength(1);
  });

  it('is given what the student wrote, the pacing, and the solution as a yardstick, but never the scratchpad', async () => {
    const v = await begin();
    await call({ type: 'ready', sessionId: v.sessionId });
    await call({ type: 'scratch', sessionId: v.sessionId, text: 'MY PRIVATE JOTTINGS' });
    await call({ type: 'ready', sessionId: v.sessionId });
    await call({ type: 'submit', sessionId: v.sessionId, text: 'Demand, supply, cost' });
    at(5000);
    await call({ type: 'resume', sessionId: v.sessionId });
    await call({ type: 'finish', sessionId: v.sessionId });
    const request = JSON.stringify(w.asked.at(-1));
    expect(request).toContain('Demand, supply, cost');
    expect(request).toContain('SECRET-REC'); // the yardstick
    expect(request).not.toContain('MY PRIVATE JOTTINGS');
    expect(request).toContain('after the last stage');
  });

  it('keeps only ratings that rest on a quote the student really wrote, and never rates behavioral skills', async () => {
    const id = await finishedCase();
    const f = view(await call({ type: 'finish', sessionId: id })).feedback!;
    expect(f.skills.framework.rating).toBe(4); // "Demand, supply, cost" is what they handed in
    expect(f.skills.exhibits.rating).toBe(3); // "Off-peak is 40 percent" is what they wrote
    expect(f.skills.quant.rating).toBe(null); // an invented quote earns nothing
    expect(f.skills.quant.feedback).toBe('Made up.');
    expect(f.skills.behavioral1.rating).toBe(null); // a text case can't show it
    expect(f.overall.rating).toBe(3);
  });

  it('is still written when another save lands at the very same moment (the last draft is saved as the case ends)', async () => {
    const id = await finishedCase();
    const real = w.deps.saveSession;
    let collided = false;
    w.deps.saveSession = async (s, expected) => {
      if (!collided) {
        collided = true;
        const cur = w.db.get(s.id)!;
        w.db.set(s.id, { ...cur, version: cur.version + 1 }); // someone else saved first
        return false;
      }
      return real(s, expected);
    };
    const r = view(await call({ type: 'finish', sessionId: id }));
    expect(collided).toBe(true);
    expect(r.feedback).not.toBeNull();
    expect(w.asked).toHaveLength(1);
  });

  it('does not save, or change the version, for a draft that has no open box to go in', async () => {
    const v = await begin();
    const before = w.db.get(v.sessionId)!.version;
    expect(await call({ type: 'draft', sessionId: v.sessionId, key: 'recommendation', text: 'far too early' })).toMatchObject({ status: 'saved' });
    expect(w.db.get(v.sessionId)!.version).toBe(before);
  });

  it('fails clearly when the model returns nothing usable, allows a few tries, then stops', async () => {
    const id = await finishedCase();
    w.script.reply = () => 'nope';
    for (let i = 0; i < MAX_FEEDBACK_ATTEMPTS; i++) expect(await call({ type: 'finish', sessionId: id })).toMatchObject({ status: 'failed' });
    expect(await call({ type: 'finish', sessionId: id })).toMatchObject({ status: 'refused' });
    expect(w.asked).toHaveLength(MAX_FEEDBACK_ATTEMPTS);
    const back = view(await call({ type: 'resume', sessionId: id }));
    expect(back.messages.some((m) => m.from === 'user')).toBe(true); // the work is still there
  });
});

describe('reading what comes back', () => {
  const state = { messages: [{ from: 'user', text: 'Demand, supply, cost' }], submissions: [{ kind: 'framework', text: 'Profit is revenue minus cost', timedOut: false }] } as unknown as SessionState;

  it('accepts a rating that quotes the student, even with different spacing and capitals', () => {
    const f = parseFeedback(JSON.stringify({ ...GOOD_FEEDBACK, skills: [{ key: 'framework', rating: 4, feedback: 'x', evidence: 'profit is  revenue minus COST' }] }), state)!;
    expect(f.skills.framework).toMatchObject({ rating: 4 });
    expect(f.overall.rating).toBe(3);
  });

  it('drops out-of-range ratings and unknown skills, and gives no overall rating when nothing could be rated', () => {
    const f = parseFeedback(JSON.stringify({ ...GOOD_FEEDBACK, skills: [{ key: 'framework', rating: 9, feedback: 'x', evidence: 'Demand, supply, cost' }, { key: 'charisma', rating: 5, feedback: 'x', evidence: 'Demand, supply, cost' }] }), state)!;
    expect(f.skills.framework.rating).toBe(null);
    expect(Object.keys(f.skills)).not.toContain('charisma');
    expect(f.overall.rating).toBe(null);
  });

  it('rejects feedback with nothing in it, and turns that are not JSON', () => {
    expect(parseFeedback('{}', state)).toBeNull();
    expect(parseFeedback('oops', state)).toBeNull();
    expect(parseTurn('oops', [])).toBeNull();
  });

  it('reads the solution defensively, and needs a prompt', () => {
    expect(readSolution(null)).toBeNull();
    expect(readSolution({ prompt: '' })).toBeNull();
    const s = readSolution({ prompt: 'Q?', exhibits: [{ title: 'E', rows: [[1, 2]], columns: ['a', 'b'] }, 'junk'], steps: 'nope' })!;
    expect(s.exhibits).toHaveLength(1); // the junk entry is dropped
    expect(s.exhibits[0].rows).toEqual([['1', '2']]); // figures are kept, as text
    expect(s.steps).toEqual([]);
  });
});

describe('word for word, and full write-ups only', () => {
  const long = 'x'.repeat(313);

  it('keeps the prompt, the facts, the answers, the exhibit captions and every table cell exactly as written, including long ones', () => {
    const sol = readSolution({
      prompt: 'First paragraph, exactly as written.\r\n\r\nSecond paragraph with   odd  spacing kept tidy.',
      facts: ['Hilton $110, Hampton Inn $75, Days Inn $40.'],
      clarifyingQuestions: [{ question: 'Who is the hotel for?', answer: 'Soldiers in training and soldiers moving base.' }],
      exhibits: [{ title: 'Exhibit 1: Revenue', caption: 'c'.repeat(614), columns: ['Type', 'Rooms'], rows: [[long, 5], ...Array.from({ length: 60 }, (_, i) => [`row ${i}`, i])], approx: true }],
    })!;
    expect(sol.prompt).toBe('First paragraph, exactly as written.\n\nSecond paragraph with odd spacing kept tidy.');
    expect(sol.facts).toEqual(['Hilton $110, Hampton Inn $75, Days Inn $40.']);
    expect(sol.clarifying[0].answer).toBe('Soldiers in training and soldiers moving base.');
    expect(sol.exhibits[0].caption).toHaveLength(614); // not cut
    expect(sol.exhibits[0].rows[0]).toEqual([long, '5']); // a 313-character cell is whole, and figures stay figures
    expect(sol.exhibits[0].rows).toHaveLength(61); // every row of a 61-row exhibit
    expect(sol.exhibits[0].approx).toBe(true);
  });

  it('opens with the prompt exactly as written and nothing else of the case', () => {
    const sol = readSolution({ ...SOLUTION, prompt: 'A private equity firm may build a 400-room hotel inside an army base.' })!;
    const text = openingText(sol);
    expect(text.startsWith('A private equity firm may build a 400-room hotel inside an army base.')).toBe(true);
    expect(text).not.toContain('soldiers');
  });

  it('tells the model to give the facts exactly as written, and keeps the whole fact sheet away from the screen', async () => {
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'How many soldiers are on the base?' });
    const req = w.asked[0];
    expect(req.system).toContain('The base houses 20,000 soldiers.');
    expect(JSON.stringify(req.messages)).toContain('exactly as written');
    expect(JSON.stringify(view(await call({ type: 'resume', sessionId: v.sessionId })).messages)).not.toContain('Peak season runs four months');
  });

  it('counts a write-up as full only when it is marked complete and has a prompt, a recommendation and something to work through', () => {
    const full = { confidence: 'high', prompt: 'P', recommendation: 'R', steps: [{ title: 'S' }], exhibits: [] };
    expect(isFullSolution(full)).toBe(true);
    expect(isFullSolution({ ...full, steps: [], exhibits: [{ title: 'E' }] })).toBe(true);
    expect(isFullSolution({ ...full, confidence: 'partial' })).toBe(false);
    expect(isFullSolution({ ...full, confidence: undefined })).toBe(false);
    expect(isFullSolution({ ...full, prompt: '  ' })).toBe(false);
    expect(isFullSolution({ ...full, recommendation: '' })).toBe(false);
    expect(isFullSolution({ ...full, steps: [], exhibits: [] })).toBe(false);
    expect(isFullSolution(null)).toBe(false);
  });

  it('never starts a case whose write-up is only partial', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, confidence: 'partial' } } : real(id));
    expect(await call({ type: 'start', libraryId: LIB })).toMatchObject({ status: 'refused' });
    expect(w.db.size).toBe(0);
  });
});

describe("the interviewer's own tables", () => {
  it('are never shown to the member, and never counted as an exhibit', async () => {
    const id = await toExhibits();
    for (let i = 0; i < 2; i++) {
      w.script.reply = () => turn('Good.', { assessment: 'progress', beat_complete: true });
      const v = view(await call({ type: 'say', sessionId: id, text: `My view ${i}` }));
      expect(JSON.stringify(v)).not.toContain('SECRET-GUIDE');
      expect(JSON.stringify(v)).not.toContain('Interviewer Guidance');
      expect(v.beatsTotal).toBe(4); // the two exhibits meant for the candidate, the step that has no exhibit, and the brainstorm
    }
  });

  it('are given to the model as private reference while the exhibits are discussed, with a warning not to hand them over', async () => {
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'Peak is 95 and off-peak is 31' });
    const last = w.asked[0].messages.at(-1)!.content;
    expect(last).toContain('Interviewer reference tables (private');
    expect(last).toContain('SECRET-GUIDE-70,000');
    expect(last).toContain('never state a result, total, ratio or conclusion');
  });

  it('reach the model while the student is still asking clarifying questions, so a figure the case holds is never refused', async () => {
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'What does a room bring in?' });
    const sent = w.asked[0].messages.at(-1)!.content;
    expect(sent).toContain('There is no exhibit in front of the student yet');
    expect(sent).toContain('Interviewer reference tables (private');
    expect(sent).toContain('SECRET-GUIDE-70,000'); // the input figure is there to be read out
    expect(sent).toContain('give it instead of answering with a question');
    expect(sent).toContain('never state a result, total, ratio or conclusion'); // widening the reach does not widen what may be said
  });

  it('reach the model when the student says where they would start', async () => {
    const v = await begin();
    await call({ type: 'ready', sessionId: v.sessionId });
    await call({ type: 'ready', sessionId: v.sessionId });
    await call({ type: 'submit', sessionId: v.sessionId, text: 'Demand, supply, cost' });
    w.script.reply = () => turn('Let us look at some data.', { direction_clear: false });
    await call({ type: 'say', sessionId: v.sessionId, text: 'I would start with demand. What is revenue per room?' });
    const sent = w.asked.at(-1)!.messages.at(-1)!.content;
    expect(sent).toContain('handed in a framework'); // the direction turn
    expect(sent).toContain('There is no exhibit in front of the student yet');
    expect(sent).toContain('SECRET-GUIDE-70,000');
    expect(sent).toContain('give it instead of answering with a question');
  });

  it('are left out of the early stages when the case holds none', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [EXHIBIT(1), EXHIBIT(2)] } } : real(id));
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays for the rooms?' });
    expect(w.asked[0].messages.at(-1)!.content).not.toContain('<data>');
  });

  it('are carried into the early stages inside a budget, so a clarifying turn cannot grow without limit', async () => {
    const huge = {
      ...EXHIBIT(1),
      title: 'Interviewer Guidance: every room',
      columns: ['Room', 'Rate'],
      rows: Array.from({ length: 400 }, (_, i) => [`Room ${i}`, `$${100 + i} SECRET-ROW${i}`]),
      howToRead: '',
      takeaways: [],
    };
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [EXHIBIT(1), huge] } } : real(id));
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays for the rooms?' });
    const sent = w.asked[0].messages.at(-1)!.content;
    expect(sent).toContain('SECRET-ROW0'); // the start of the table is there
    expect(sent).not.toContain('SECRET-ROW399'); // the end of it is cut, with an ellipsis, instead of filling the prompt
    expect(sent).toContain('\n...');
    const tables = sent.slice(sent.indexOf('Interviewer Guidance: every room'));
    expect(tables.length).toBeLessThanOrEqual(2600);
  });
});

describe('the member drives', () => {
  it('gets a hint in reply to what they write when they are stuck: a process hint, then a sharper one, then the next exhibit once the exhibit has run long', async () => {
    const id = await toExhibits();
    const start = clock.t;
    w.script.reply = () => turn('A hint.', { assessment: 'stuck' });
    clock.t = start + sec(10);
    let r = view(await call({ type: 'say', sessionId: id, text: 'I am not sure' }));
    expect(r.messages.at(-1)).toMatchObject({ kind: 'hint' });
    clock.t = start + sec(40);
    r = view(await call({ type: 'say', sessionId: id, text: 'Still not sure' }));
    expect(JSON.stringify(w.asked.at(-1))).toContain('more specific directional hint');
    clock.t = start + sec(60);
    w.script.reply = () => turn('Look at off-peak against peak. Occupancy is 31% off-peak. What does that suggest?', { assessment: 'stuck' });
    r = view(await call({ type: 'say', sessionId: id, text: 'Hmm' }));
    expect(JSON.stringify(w.asked.at(-1))).toContain('stop asking open questions and lead them'); // the third message: no more open questions
    expect(r.messages.at(-1)).toMatchObject({ kind: 'hint', text: expect.stringContaining('Occupancy is 31% off-peak') });
    expect(r.exhibits).toHaveLength(1); // led, not moved on: they carry on with what they were given
    w.script.reply = () => turn('A hint.', { assessment: 'stuck' });
    clock.t = start + sec(600); // well past what this exhibit is worth, but still inside the discussion
    w.script.reply = () => turn('Good, that is the implication.', { assessment: 'progress' });
    expect(view(await call({ type: 'say', sessionId: id, text: 'Off-peak is only 31 percent, so I would test costs next' })).exhibits).toHaveLength(1); // a good answer is never cut off
    w.script.reply = () => turn('Let us move on to the next piece.', { assessment: 'stuck' });
    const stuck = view(await call({ type: 'say', sessionId: id, text: 'I really do not know' }));
    expect(stuck.exhibits).toHaveLength(2);
    expect([...w.db.values()][0].state.beats[0].outcome).toBe('coach_moved');
  });

  it('leads on the third message even when the earlier replies were not hints, and never answers a request for the exhibit with a question', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('What do you think?', { assessment: 'partial' });
    await call({ type: 'say', sessionId: id, text: 'Can you show me the exhibit?' });
    await call({ type: 'say', sessionId: id, text: 'Where is the data?' });
    expect(JSON.stringify(w.asked.at(-1))).not.toContain('stop asking open questions'); // the second message: not yet
    expect(JSON.stringify(w.asked.at(-1))).toContain('give it instead of answering with a question'); // a request for data is answered with the data
    w.script.reply = () => turn('Look at the seasons side by side. Peak is 82% full and off-peak is 31%. Which gap matters most?', { assessment: 'partial' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Please just show me' }));
    expect(JSON.stringify(w.asked.at(-1))).toContain('stop asking open questions and lead them');
    expect(r.messages.at(-1)).toMatchObject({ kind: 'hint', text: expect.stringContaining('Peak is 82% full') });
  });

  it('may hand over the facts when leading, but a lead that repeats the conclusion is replaced by one that still points somewhere', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('A hint.', { assessment: 'stuck' });
    await call({ type: 'say', sessionId: id, text: 'One' });
    await call({ type: 'say', sessionId: id, text: 'Two' });
    w.script.reply = () => turn('Off-peak occupancy is the number that decides the case SECRET-TAKE1', { assessment: 'stuck' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Three' }));
    expect(JSON.stringify(r.messages.at(-1))).not.toContain('SECRET-TAKE1');
    expect(r.messages.at(-1)).toMatchObject({ kind: 'hint', text: expect.stringContaining('biggest number') }); // not "what do you think?"
  });

  it('never gives a hint on its own, however long it is quiet', async () => {
    const id = await toExhibits();
    for (const t of [200, 600, 1000]) {
      clock.t = T0 + sec(t);
      expect(view(await call({ type: 'nudge', sessionId: id })).messages.filter((m) => m.kind === 'hint')).toHaveLength(0);
    }
    expect(w.asked).toHaveLength(0);
    expect(view(await call({ type: 'resume', sessionId: id })).nextNudgeAt).toBeNull();
  });
});

describe('interview mode: nudged, never rescued', () => {
  /** The opening stages done quickly in the chosen mode: the id of a session on its first exhibit. */
  async function toExhibitsIn(mode: 'practice' | 'interview', userId = ME): Promise<string> {
    const id = view(await call({ type: 'start', libraryId: LIB, mode }, userId)).sessionId;
    await call({ type: 'ready', sessionId: id }, userId);
    await call({ type: 'ready', sessionId: id }, userId);
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' }, userId);
    w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
    expect(view(await call({ type: 'say', sessionId: id, text: 'I would start with demand' }, userId)).stage).toBe('exhibits');
    w.asked.length = 0;
    return id;
  }
  /** What the model was last told to do. */
  const told = () => JSON.stringify(w.asked.at(-1));
  const everTold = () => w.asked.map((a) => JSON.stringify(a)).join('\n');
  const beat = (id: string) => w.db.get(id)!.state.beats[0];

  it('leaves a candidate who is getting on with it alone: the first message on an exhibit carries no hint directive, where practice offers one', async () => {
    const interview = await toExhibitsIn('interview');
    w.script.reply = () => turn('Noted. What would you do with that?', { assessment: 'progress' });
    await call({ type: 'say', sessionId: interview, text: 'Off-peak is 31 percent against 95 at peak' });
    expect(told()).not.toContain('has been stuck for a while');
    expect(told()).toContain('is working on the exhibit'); // the ordinary reply, and nothing more

    const practice = await toExhibitsIn('practice', 'user-two');
    await call({ type: 'say', sessionId: practice, text: 'Off-peak is 31 percent against 95 at peak' }, 'user-two');
    expect(told()).toContain('ONE brief process-oriented hint'); // unchanged: practice offers it from the first message
  });

  it('gives a stuck candidate nothing, then a process nudge, then a directional one, then the next exhibit, and never leads them', async () => {
    const id = await toExhibitsIn('interview');
    w.script.reply = () => turn('Keep going.', { assessment: 'stuck' });

    let r = view(await call({ type: 'say', sessionId: id, text: 'I am not sure' }));
    expect(told()).not.toContain('has been stuck for a while'); // a real interviewer lets them sit with it
    expect(r.messages.at(-1)!.kind).not.toBe('hint');
    expect(beat(id).hints).toBe(0);

    r = view(await call({ type: 'say', sessionId: id, text: 'Still not sure' }));
    expect(told()).toContain('ONE brief process-oriented hint');
    expect(r.messages.at(-1)!.kind).toBe('hint');

    r = view(await call({ type: 'say', sessionId: id, text: 'Hmm' }));
    expect(told()).toContain('more specific directional hint about where to look');

    r = view(await call({ type: 'say', sessionId: id, text: 'I really do not know' }));
    expect(told()).toContain('do NOT explain, solve or summarise'); // one neutral sentence, and on to the next piece
    expect(r.exhibits).toHaveLength(2);
    expect(beat(id).outcome).toBe('coach_moved');
    expect(everTold()).not.toContain('stop asking open questions'); // the rung that rescues is not in an interview at all
  });

  it('does not count a request for data against the member, in an interview or in practice', async () => {
    const id = await toExhibitsIn('interview');
    w.script.reply = () => turn('The army pays a fixed per diem per soldier.', { assessment: 'unclear', data_request: true });
    for (const text of ['What is the cost base?', 'And how many rooms?', 'What does the army pay?']) await call({ type: 'say', sessionId: id, text });
    expect(beat(id).asked).toBe(0); // three asks, and they are still on the first rung
    expect(beat(id).hints).toBe(0);
    expect(told()).not.toContain('has been stuck for a while');

    const practice = await toExhibitsIn('practice', 'user-two');
    w.script.reply = () => turn('The army pays a fixed per diem per soldier.', { assessment: 'unclear', data_request: true });
    for (const text of ['What is the cost base?', 'And how many rooms?']) await call({ type: 'say', sessionId: practice, text }, 'user-two');
    expect(w.db.get(practice)!.state.beats[0].asked).toBe(0);
    expect(told()).not.toContain('stop asking open questions');
    expect(told()).toContain('ONE brief process-oriented hint'); // practice still starts at the first rung, where it always did
  });

  it('reads the flag from the model, and treats a reply that does not send one as an ordinary message', () => {
    expect(parseTurn(JSON.stringify(turn('Here are the figures.', { data_request: true })), [])!.dataRequest).toBe(true);
    expect(parseTurn(JSON.stringify(turn('Keep going.')), [])!.dataRequest).toBe(false);
  });
});

describe("Bucket's voice: the three tells the pilot found (issue #131)", () => {
  // The wording is the real-model pilot's own, quoted in the issue, so the regression these guard against is the real one.
  const BOOTHBUCKS =
    "The student has asked me to calculate the figures and state the takeaway, which is the answer itself, so I won't give it. I can read the exhibit's figures aloud: 2021 has 200 shops, $400MM revenue and $100MM profit.";
  const MOVED_ON_WITH_A_SUMMARY =
    "That's fine, we can move on. Exhibit 1 shows the share infected by each age, and the vaccine matters to children who haven't yet been exposed. Let's take the next piece.";

  /** The opening stages done quickly in the chosen mode: the id of a session on its first exhibit. */
  async function toExhibitsIn(mode: 'practice' | 'interview'): Promise<string> {
    const id = view(await call({ type: 'start', libraryId: LIB, mode })).sessionId;
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' });
    w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
    expect(view(await call({ type: 'say', sessionId: id, text: 'I would start with demand' })).stage).toBe('exhibits');
    w.asked.length = 0;
    return id;
  }
  const said = (r: LiveView): string => r.messages.at(-1)!.text;

  it('talks to the member, not about them, and never says that it is holding an answer back', () => {
    expect(interviewerVoice(BOOTHBUCKS)).toBe("I can read the exhibit's figures aloud: 2021 has 200 shops, $400MM revenue and $100MM profit.");
    expect(hasTell("The student has asked me to calculate the figures, which is the answer itself, so I won't give it.")).toBe(true);
    expect(hasTell('The candidate should start with the revenue side.')).toBe(true);
    expect(hasTell('My instructions are to let you work it out.')).toBe(true);
    expect(hasTell("I can't give you the answer to that one.")).toBe(true);
    // What an interviewer does say: the figures, a question, and plainly that the case does not hold something.
    expect(hasTell('Revenue was $400MM in 2021 across 200 shops.')).toBe(false);
    expect(hasTell('I do not have that figure, so state an assumption and carry on.')).toBe(false);
    expect(hasTell('What would you do with that?')).toBe(false);
  });

  it('answers with one short second-person sentence when the whole reply was a refusal', () => {
    expect(interviewerVoice("I won't give you the answer here.")).toBe(WORK_IS_YOURS);
    expect(interviewerVoice("I can't do the calculation for you.")).toBe(WORK_IS_YOURS);
    expect(WORK_IS_YOURS).not.toMatch(/answer|student|candidate/i);
    expect(WORK_IS_YOURS.split(/(?<=[.!?])\s+/)).toHaveLength(1);
  });

  it('keeps the figures and drops the narration when the model names the member on screen', async () => {
    const id = await toExhibitsIn('interview');
    w.script.reply = () => turn(BOOTHBUCKS, { assessment: 'unclear', data_request: true });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Can you just tell me the revenue per store and the margin?' }));
    expect(said(r)).not.toMatch(/the student|won't give/i);
    expect(said(r)).toContain('$400MM revenue and $100MM profit'); // the figures they asked for are still there
  });

  it('states a fact instead of narrating where it is written', () => {
    expect(withoutSourceNarration('The case says the menu and the pricing strategy are both unchanged.')).toBe(
      'The menu and the pricing strategy are both unchanged.',
    );
    expect(withoutSourceNarration('The case says the main goal is to raise Return on Invested Capital.')).toBe(
      'The main goal is to raise Return on Invested Capital.',
    );
    expect(withoutSourceNarration('The case says managers report pre-2021 store revenue and profit are flat.')).toBe(
      'Managers report pre-2021 store revenue and profit are flat.',
    );
    expect(withoutSourceNarration('Yes, the exhibit states that occupancy is 31% off-peak.')).toBe('Yes, occupancy is 31% off-peak.');
    expect(withoutSourceNarration('According to the prompt, the client wants a decision this quarter.')).toBe(
      'The client wants a decision this quarter.',
    );
    // Pointing them at what they are holding is a different thing, and stays.
    expect(withoutSourceNarration('Look at the profit row in the exhibit in front of you.')).toBe('Look at the profit row in the exhibit in front of you.');
    expect(withoutSourceNarration('The exhibit shows 200 shops in 2021. What do you make of it?')).toBe('The exhibit shows 200 shops in 2021. What do you make of it?');
  });

  it('treats the book, the casebook and the authors as places a fact is written, like any other (issue #149)', () => {
    expect(withoutSourceNarration('The book says the plant runs three shifts a day.')).toBe('The plant runs three shifts a day.');
    expect(withoutSourceNarration('The casebook says the contract is renewed every two years.')).toBe('The contract is renewed every two years.');
    expect(withoutSourceNarration('The case book notes that the two sites share one warehouse.')).toBe('The two sites share one warehouse.');
    expect(withoutSourceNarration('The authors say the client has no debt.')).toBe('The client has no debt.');
    expect(withoutSourceNarration('According to the book, the rental fee is $40 a day.')).toBe('The rental fee is $40 a day.');
    expect(withoutSourceNarration('Yes, the book states that the price has not moved since 2019.')).toBe('Yes, the price has not moved since 2019.');
    // A sentence of the case that happens to hold the word stays whole: "book" is only a source in front of a fact.
    expect(withoutSourceNarration('The client wants to book 300 more rooms a month.')).toBe('The client wants to book 300 more rooms a month.');
  });

  it('cannot unsay a book the sentence is built around, which is why the fact itself has to be written without one (issue #149)', () => {
    // Measured on the write-ups: a fact that narrates ("the book says X") comes out as X; a fact where the book is the subject of the
    // sentence has no X to keep, so no filter saves it and the content is what changes. This pins the line between the two.
    expect(withoutSourceNarration('The book labels this a second-round case.')).toContain('The book labels this');
    expect(withoutSourceNarration("The book's reference figure is 4 million households.")).toContain("The book's reference figure");
  });

  it('takes the narration off what the member reads', async () => {
    const v = await begin();
    w.script.reply = () => turn('The case says the army pays a fixed per diem per soldier.', { assessment: 'progress', data_request: true });
    const r = view(await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays for the rooms?' }));
    expect(said(r)).toBe('The army pays a fixed per diem per soldier.');
  });

  it('answers a request for data without the book, when the model reads a fact out the way it is written (issue #149)', async () => {
    const v = await begin();
    w.script.reply = () => turn('The book says the army pays a fixed per diem per soldier.', { assessment: 'progress', data_request: true });
    const r = view(await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays for the rooms?' }));
    expect(said(r)).toBe('The army pays a fixed per diem per soldier.'); // the figure and the fact stay; the book does not reach the member
    expect(said(r)).not.toMatch(/\bbook\b|\bauthors?\b/i);
  });

  it('moves on and says nothing else, when the model summarises the exhibit it is leaving', async () => {
    const id = await toExhibitsIn('interview');
    w.script.reply = () => turn(MOVED_ON_WITH_A_SUMMARY, { assessment: 'stuck' });
    let r: LiveView | null = null;
    for (const text of ['I am not sure', 'Still not sure', 'Hmm', 'I really do not know']) r = view(await call({ type: 'say', sessionId: id, text }));
    expect(JSON.stringify(w.asked.at(-1))).toContain('do NOT explain, solve or summarise');
    // The summary of the beat they just failed does not come with the move-on (the next exhibit is the message after it).
    const movedOn = r!.messages.filter((m) => m.from !== 'user' && m.kind !== 'exhibit').at(-1)!;
    expect(movedOn.text).toBe("That's fine, we can move on.");
    expect(movedOn.text).not.toMatch(/vaccine|infected/i);
    expect(r!.exhibits).toHaveLength(2);
    expect(w.db.get(id)!.state.beats[0].outcome).toBe('coach_moved');
  });

  it('falls back to its own line when the move-on sentence itself carries the beat, word for word or not', () => {
    const notes = ['Off-peak occupancy is the number that decides the case.'];
    // Not a quote, so `leaks` does not see it; the substance is the same.
    expect(leaks('Off-peak occupancy decides this one, so let us move on.', notes)).toBe(false);
    expect(movingOnOnly('Off-peak occupancy decides this one, so let us move on.', notes)).toBe(MOVING_ON);
    expect(movingOnOnly('That is fine, we can move on.', notes)).toBe('That is fine, we can move on.');
    expect(sharesSubstance('What would you compare first?', notes)).toBe(false);
    expect(MOVING_ON.split(/(?<=[.!?])\s+/)).toHaveLength(1);
  });

  it('holds only the reply that really moves the case on to the move-on rule', () => {
    const summary = JSON.stringify(turn(MOVED_ON_WITH_A_SUMMARY, { assessment: 'stuck' }));
    expect(parseTurn(summary, [], FALLBACK, 700, 'advance')!.message).toBe("That's fine, we can move on.");
    // At the same rung: a question answered, and a beat finished, are ordinary replies and keep everything they said.
    expect(parseTurn(JSON.stringify(turn(MOVED_ON_WITH_A_SUMMARY, { assessment: 'stuck', data_request: true })), [], FALLBACK, 700, 'advance')!.message).toContain('Exhibit 1 shows');
    expect(parseTurn(JSON.stringify(turn(MOVED_ON_WITH_A_SUMMARY, { assessment: 'progress', beat_complete: true })), [], FALLBACK, 700, 'advance')!.message).toContain('Exhibit 1 shows');
    expect(parseTurn(summary, [], FALLBACK, 700)!.message).toContain('Exhibit 1 shows'); // and nothing changes at the rungs below
  });

  it('holds its own stand-in replies to the same three rules', () => {
    for (const line of [FALLBACK, LEAD_FALLBACK, MOVING_ON, WORK_IS_YOURS, OVER_TO_YOU, SHOW_DATA]) {
      expect(line.split(/(?<=[.!?])\s+/).some((s) => hasTell(s))).toBe(false);
      expect(withoutSourceNarration(line)).toBe(line);
      expect(interviewerVoice(line)).toBe(line);
      expect(withoutVerdicts(line), line).toBe(line); // and none of them is a verdict either (issue #130)
    }
  });

  it('tells the model the same three rules', async () => {
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays?' });
    const sent = JSON.stringify(w.asked.at(-1));
    expect(sent).toContain('Speak to the candidate, never about them');
    expect(sent).toContain('never where it is written');
  });
});

// Issue #156: the write-ups name the member too, because that is how an interviewer's note puts a condition on a fact — "given once
// the candidate asks for it: ...". Measured over the 872 write-ups by putting every fact and clarifying answer through the real
// filter: 286 of its sentences in 201 write-ups were dropped, 198 of them the whole of a fact or an answer, so a member who asked for
// one of those figures was handed the stand-in line instead. The sentences below are those measured shapes, in this fixture's own case.
describe('a fact that happens to mention the member still reaches them (issue #156)', () => {
  const CONDITION_FIRST = 'Only if the candidate asks: the base houses 20,000 soldiers, and 400 of them travel each week.';
  const HANDED_OVER = 'Running costs, given only once the candidate asks for them: $40,000 a month of fixed cost and $25 a room night.';
  const IN_BRACKETS = 'The nightly rate is $120 (given when the candidate asks about pricing).';
  const said = (r: LiveView): string => r.messages.at(-1)!.text;

  it('tells a fact that names them apart from Bucket talking about them', () => {
    // The member is in the condition on the fact, and the figures are the point of the sentence: it is read out as written.
    for (const fact of [CONDITION_FIRST, HANDED_OVER, IN_BRACKETS]) {
      expect(hasTell(fact), fact).toBe(false);
      expect(interviewerVoice(fact), fact).toBe(fact);
    }
    // Bucket's own talk about them is still dropped, whether or not there is a figure in it: its own voice in the same breath, an
    // instruction aimed at them, or nothing of the case in the sentence at all.
    for (const tell of [
      'The candidate has asked me for the per diem, so I will hold it back.',
      'The candidate should start with the revenue side.',
      'The candidate should see that off-peak occupancy of 31% is what decides this one.',
      'The candidate needs to work out the cost per room night of $25 first.',
      'The candidate is doing well on the cost side.',
      'Exhibit 1 is handed over once the candidate asks about occupancy.', // a pointer to the page is not a figure of the case
    ]) {
      expect(hasTell(tell), tell).toBe(true);
    }
  });

  it('reads the fact out to the member who asked for it, instead of the stand-in line', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, facts: [...SOLUTION.facts, HANDED_OVER] } } : real(id));
    const v = await begin();
    w.script.reply = () => turn(HANDED_OVER, { assessment: 'progress', data_request: true });
    const r = view(await call({ type: 'say', sessionId: v.sessionId, text: 'What are the running costs?' }));
    expect(said(r)).not.toBe(FALLBACK);
    expect(said(r)).toBe(HANDED_OVER); // the figures they asked for, word for word
  });

  it('still answers with the stand-in when the reply is only about the member', async () => {
    const v = await begin();
    w.script.reply = () => turn('The candidate should work this one out for themselves.', { assessment: 'unclear', data_request: true });
    const r = view(await call({ type: 'say', sessionId: v.sessionId, text: 'What are the running costs?' }));
    expect(said(r)).toBe(FALLBACK);
  });
});

describe('an interview does not tell them whether they are right (issue #130)', () => {
  // The replies are the real-model pilot's own, quoted in the issue, so what these guard against is the register it really had.
  const CONFIRMS = "You're right that profit is flat while revenue and store count climb, which is the core signal. What do you think is driving that?";
  const GOOD_TRACK = "You're on a good track by isolating the suburban group, and the per-shop split is exactly the right lens.";
  const INSTINCT = "Good instinct: you've linked the new stores to capital tied up without profit, which is the heart of the ROIC drop.";

  /** The opening stages done quickly in the chosen mode: the id of a session on its first exhibit. */
  async function toExhibitsIn(mode: 'practice' | 'interview' | 'learning', userId = ME): Promise<string> {
    const id = view(await call({ type: 'start', libraryId: LIB, mode }, userId)).sessionId;
    await call({ type: 'ready', sessionId: id }, userId);
    await call({ type: 'ready', sessionId: id }, userId);
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' }, userId);
    w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
    expect(view(await call({ type: 'say', sessionId: id, text: 'I would start with demand' }, userId)).stage).toBe('exhibits');
    w.asked.length = 0;
    return id;
  }
  const said = (r: LiveView): string => r.messages.at(-1)!.text;
  const told = () => JSON.stringify(w.asked.at(-1));

  it('knows a verdict on their reading from a fact, a question and an instruction', () => {
    for (const sentence of [
      "You're right that profit is flat while revenue and store count climb, which is the core signal.",
      "You're on a good track by isolating the suburban group.",
      "Good instinct: you've linked the new stores to capital tied up.",
      'The per-shop split is exactly the right lens.',
      'That is the key insight here.',
      "That's right.",
      'Not quite right — look again at the cost side.',
      "You've spotted the core pattern.",
    ]) {
      expect(gradesTheirReading(sentence), sentence).toBe(true);
    }
    // What an interviewer does say: facts, questions, where to look, and the app's own stand-in lines.
    for (const sentence of [
      'Off-peak occupancy is 31% and peak is 95%.',
      'What would you do with that?',
      'Okay, go on.',
      'Look at the profit row in the exhibit in front of you.',
      "That's the figure you asked for.",
      'The army pays a fixed per diem per soldier.',
      OVER_TO_YOU,
      FALLBACK,
      MOVING_ON,
      WORK_IS_YOURS,
    ]) {
      expect(gradesTheirReading(sentence), sentence).toBe(false);
    }
  });

  it('drops the verdict and keeps the question, even when they share a sentence', () => {
    expect(withoutVerdicts(CONFIRMS)).toBe('What do you think is driving that?');
    expect(withoutVerdicts(`${GOOD_TRACK} Which group would you look at first?`)).toBe('Which group would you look at first?');
    expect(withoutVerdicts("You're right — so what does that imply for the margin on each new dollar of sales?")).toBe(
      'So what does that imply for the margin on each new dollar of sales?',
    );
    expect(withoutVerdicts('Off-peak occupancy is 31%. What would you do with that?')).toBe('Off-peak occupancy is 31%. What would you do with that?');
    expect(withoutVerdicts(INSTINCT)).toBe('');
  });

  it('gives nothing at the rung that gives nothing, and the member still reads something', () => {
    expect(OVER_TO_YOU).not.toBe('');
    expect(OVER_TO_YOU).toMatch(/\?$/); // an acknowledgement and the question handed back
    for (const line of [OVER_TO_YOU]) {
      expect(line.split(/(?<=[.!?])\s+/).some((s) => hasTell(s))).toBe(false);
      expect(withoutSourceNarration(line)).toBe(line);
      expect(interviewerVoice(line)).toBe(line);
      expect(withoutVerdicts(line)).toBe(line);
    }
    const whole = JSON.stringify(turn(INSTINCT, { assessment: 'progress' }));
    expect(parseTurn(whole, [], FALLBACK, 700, 'none', [], { mode: 'interview', kind: 'exhibit' })!.message).toBe(OVER_TO_YOU);
    expect(parseTurn(whole, [], FALLBACK, 700, 'none', [], { mode: 'practice', kind: 'exhibit' })!.message).toBe(INSTINCT);
  });

  it('does not hand them a driver they have not raised, at the rung that gives nothing', () => {
    const notes = ['Off-peak occupancy is the number that decides the case.'];
    const reply = (text: string, memberText: string) =>
      parseTurn(JSON.stringify(turn(text, { assessment: 'unclear' })), notes, FALLBACK, 700, 'none', [], { mode: 'interview', kind: 'exhibit', memberText })!.message;
    // Three content words of the note's one sentence, none of them the member's: it is the interviewer's reading, not theirs.
    expect(reply('The occupancy number decides this one.', 'I am not sure where to start')).toBe(OVER_TO_YOU);
    // The same sentence once they have raised it themselves: it is their own ground, and the reply stands.
    expect(reply('The occupancy number decides this one.', 'I think the occupancy number is what decides it')).toBe('The occupancy number decides this one.');
    // ...and a plain question is never caught by this.
    expect(reply('What would you compare first?', 'I am not sure where to start')).toBe('What would you compare first?');
  });

  it('hands the question back to something the member can see, rather than to "that" (issue #163)', () => {
    // The rung that gives nothing can land on a part of the analysis, which puts no exhibit on the table for a pronoun to point at.
    // The part itself always has a referent: the engine opens every part by saying what it is.
    expect(OVER_TO_YOU).toContain('this part');
    expect(OVER_TO_YOU).not.toMatch(/\bof that\b/);
  });

  it('strips the verdict from what the member reads in an interview, and leaves practice alone', async () => {
    const interview = await toExhibitsIn('interview');
    w.script.reply = () => turn(CONFIRMS, { assessment: 'progress' });
    const r = view(await call({ type: 'say', sessionId: interview, text: 'Off-peak looks weak against peak' }));
    expect(said(r)).toBe('What do you think is driving that?');
    expect(said(r)).not.toMatch(/you're right|core signal/i);

    const practice = await toExhibitsIn('practice', 'user-two');
    w.script.reply = () => turn(CONFIRMS, { assessment: 'progress' });
    const p = view(await call({ type: 'say', sessionId: practice, text: 'Off-peak looks weak against peak' }, 'user-two'));
    expect(said(p)).toBe(CONFIRMS); // practice keeps its encouraging register, word for word
  });

  it('acknowledges the starting direction without a verdict on it, and still moves to the data', async () => {
    const id = view(await call({ type: 'start', libraryId: LIB, mode: 'interview' })).sessionId;
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' });
    w.script.reply = () => turn('Good instinct, that is exactly where I would start. Let us look at some data.', { direction_clear: true, assessment: 'progress' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'I would start with demand' }));
    expect(r.stage).toBe('exhibits');
    const reply = r.messages.filter((m) => m.from !== 'user' && m.kind !== 'exhibit').at(-1)!.text;
    expect(reply).toBe('Let us look at some data.');
    expect(reply).not.toMatch(/instinct|exactly/i);
    // ...and when the verdict was the whole of it, the member still reads a line that takes the case on.
    expect(
      parseTurn(JSON.stringify(turn('Good instinct, that is exactly the right place to start.', { direction_clear: true })), [], FALLBACK, 700, 'none', [], {
        mode: 'interview',
        kind: 'direction',
      })!.message,
    ).toBe(SHOW_DATA);
  });

  it('still answers a question about a fact in an interview', async () => {
    const id = await toExhibitsIn('interview');
    w.script.reply = () => turn('The army pays a fixed per diem per soldier. Off-peak occupancy is 31%.', { assessment: 'unclear', data_request: true });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Who pays for the rooms, and what is off-peak occupancy?' }));
    expect(said(r)).toBe('The army pays a fixed per diem per soldier. Off-peak occupancy is 31%.');
  });

  it('tells each mode what register it is in', async () => {
    const interview = await toExhibitsIn('interview');
    await call({ type: 'say', sessionId: interview, text: 'Off-peak looks weak' });
    expect(told()).toContain('never a verdict');
    expect(told()).toContain('tell them nothing about whether their reading is right');
    expect(told()).toContain('There is no help at this point in an interview'); // the first message on the beat
    expect(told()).not.toContain('you coach as you go');

    const practice = await toExhibitsIn('practice', 'user-two');
    await call({ type: 'say', sessionId: practice, text: 'Off-peak looks weak' }, 'user-two');
    expect(told()).toContain('you coach as you go');
    expect(told()).toContain('if they are on a good track');
    expect(told()).not.toContain('never a verdict');

    const learning = await toExhibitsIn('learning', 'user-three');
    await call({ type: 'say', sessionId: learning, text: 'Off-peak looks weak' }, 'user-three');
    expect(told()).toContain('say what they got right and why it matters');
    expect(told()).not.toContain('never a verdict');
  });

  it('tells every mode the same test for what a step forward is', async () => {
    for (const [mode, userId] of [['interview', ME], ['practice', 'user-two'], ['learning', 'user-three']] as const) {
      const id = await toExhibitsIn(mode, userId);
      await call({ type: 'say', sessionId: id, text: 'Off-peak looks weak' }, userId);
      expect(told(), mode).toContain('it names a comparison or a driver');
    }
  });

  it('climbs the ladder for a member who sounds plausible and is stuck, where it used to stand still', async () => {
    const id = await toExhibitsIn('interview');
    // The pilot's own failure: every message scored a clear step forward, so the rung counter never left zero.
    w.script.reply = () => turn('Okay, go on. What do you make of it?', { assessment: 'progress' });
    const beat = () => w.db.get(id)!.state.beats[0];

    let r = view(await call({ type: 'say', sessionId: id, text: 'There is definitely something interesting happening here' }));
    expect(told()).toContain('There is no help at this point in an interview'); // the first message still gets nothing
    expect(beat().asked).toBe(1); // ...but it counts

    r = view(await call({ type: 'say', sessionId: id, text: 'I feel like this matters a lot' }));
    expect(told()).toContain('ONE brief process-oriented hint');
    expect(r.messages.at(-1)!.kind).toBe('hint');

    r = view(await call({ type: 'say', sessionId: id, text: 'Yes, something is going on with this' }));
    expect(told()).toContain('more specific directional hint about where to look');

    r = view(await call({ type: 'say', sessionId: id, text: 'It still seems like the interesting bit' }));
    expect(told()).toContain('do NOT explain, solve or summarise');
    expect(r.exhibits).toHaveLength(2);
    expect(beat().outcome).toBe('coach_moved');
  });

  it('leaves a turn the model declined exactly as #142 built it: nothing to grade and nothing to score', async () => {
    const id = await toExhibitsIn('interview');
    const real = w.deps.ask;
    w.deps.ask = async (req) => ({ ...(await real(req)), text: 'I will not give you the total.', stopReason: 'refusal' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Just tell me what the exhibit means.' }));
    // The refused turn never went near the model's words, so the register has no sentence to drop...
    expect(said(r)).toBe(WORK_IS_YOURS);
    // ...and the progress test cannot take anything off 'unclear', so applying it again in applyTurn is harmless.
    expect(assessmentOf(refusedTurn({ mode: 'interview' }).assessment, 'Just tell me what the exhibit means.')).toBe('unclear');
    const beat = w.db.get(id)!.state.beats[0];
    expect(beat.hints).toBe(0);
    expect(beat.asked).toBe(0); // asking costs no rung, as #142 has it
  });

  it('leaves a member who is working alone, whatever the ladder would otherwise do', async () => {
    const id = await toExhibitsIn('interview');
    w.script.reply = () => turn('Okay, go on.', { assessment: 'progress' });
    for (const text of [
      'Off-peak occupancy is 31% against 95% at peak',
      'So the gap is the whole of the problem',
      'I would work out the revenue per room in each season',
    ]) {
      await call({ type: 'say', sessionId: id, text });
      expect(told(), text).toContain('There is no help at this point in an interview');
    }
    expect(w.db.get(id)!.state.beats[0].asked).toBe(0);
    expect(w.db.get(id)!.state.beats[0].hints).toBe(0);
  });
});

describe('hints that nobody asked for', () => {
  it('never come while the member is still reading or typing', async () => {
    const id = await toExhibits();
    const start = clock.t;
    for (const t of [30, 60, 100, 140]) {
      clock.t = start + sec(t);
      const r = view(await call({ type: 'nudge', sessionId: id }));
      expect(r.messages.filter((m) => m.kind === 'hint'), `at ${t}s`).toHaveLength(0);
    }
    expect(w.asked).toHaveLength(0);
    await call({ type: 'draft', sessionId: id, key: 'exhibit', text: 'Peak is 95 and off-peak is' });
    clock.t = start + sec(260); // long after the exhibit appeared, but they were typing 120 seconds ago
    expect(view(await call({ type: 'nudge', sessionId: id })).messages.filter((m) => m.kind === 'hint')).toHaveLength(0);
  });

});

describe("the interviewer's sheets, found by what they say", () => {
  const sheet = {
    title: 'Current Revenues and Costs (1 of 2): Revenues',
    caption: '',
    columns: ['Revenues', 'Information for Interviewee', 'Revenue Size (Keep Private)'],
    rows: [['Ticket Sales', 'Give blue font figures to interviewee', '$80,000,000']],
    approx: false,
    howToRead: '',
    takeaways: [],
    chart: null,
  };

  it('are not shown even when their title looks innocent', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [sheet, EXHIBIT(1)] } } : real(id));
    const id = await toExhibits();
    const v = view(await call({ type: 'resume', sessionId: id }));
    expect(JSON.stringify(v)).not.toContain('Keep Private');
    expect(JSON.stringify(v)).not.toContain('$80,000,000');
    expect(v.exhibits.map((e) => e.title)).toEqual(['Exhibit 1: Occupancy by season']);
    expect(v.beatsTotal).toBe(3); // the one exhibit the member is given, the step of the analysis that has none, and the brainstorm
  });

  it('are given to the model as private reference instead', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [sheet, EXHIBIT(1)] } } : real(id));
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'Peak is 95 and off-peak is 31' });
    expect(w.asked[0].messages.at(-1)!.content).toContain('Revenue Size (Keep Private)');
  });
});

describe('data the interviewer gives out when asked', () => {
  const sizes = {
    title: 'Market sizes (given if prompted)',
    caption: 'From the interviewer guidance for Exhibit 1.',
    columns: ['Product', 'Market size'],
    rows: [['Refinance', '$900B'], ['Reverse Mortgages', '$10B']],
    approx: false,
    howToRead: '',
    takeaways: [],
    chart: null,
  };

  it('is not shown as an exhibit, but Bucket is told to read all of it out, as an interviewer would, so the member is never stuck chatting', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [EXHIBIT(1), sizes] } } : real(id));
    const id = await toExhibits();
    const v = view(await call({ type: 'resume', sessionId: id }));
    expect(JSON.stringify(v)).not.toContain('$900B'); // never shown as a table
    expect(v.exhibits.map((e) => e.title)).toEqual(['Exhibit 1: Occupancy by season']);

    await call({ type: 'say', sessionId: id, text: 'What are the market sizes?' });
    const sent = w.asked.at(-1)!.messages.at(-1)!.content;
    expect(sent).toContain('Data you hold and read out when the student asks');
    expect(sent).toContain('$900B');
    expect(sent).toContain('$10B'); // all of it, not only what was asked for: the member works out the rest
    expect(sent).toContain('Read ALL of it out, every row and every figure'); // as an interviewer reads a table aloud, then asks what they make of it
    expect(sent).toContain('Never do the calculation for them'); // but never the results
    expect(sent).toContain('give it instead of answering with a question'); // a request for data is answered with the data
    expect(sent).not.toMatch(/never state a result[^]*Market sizes/); // it is not filed with the answers
  });

  it('is not offered when the table is the book\'s solution, even if it is called a sample', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [EXHIBIT(1), { ...sizes, title: 'Solution: market sizes (given if prompted)' }] } } : real(id));
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'What are the market sizes?' });
    expect(w.asked.at(-1)!.messages.at(-1)!.content).not.toContain('Data you hold and read out when the student asks');
  });

  it('is read out while the student is still asking clarifying questions, before any exhibit is on the table', async () => {
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [EXHIBIT(1), sizes] } } : real(id));
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'What are the market sizes?' });
    const sent = w.asked[0].messages.at(-1)!.content;
    expect(sent).toContain('asked a clarifying question'); // the clarify turn
    expect(sent).toContain('Data you hold and read out when the student asks');
    expect(sent).toContain('$900B');
    expect(sent).toContain('$10B');
    expect(sent).not.toContain('SECRET-HOW1'); // still no notes on an exhibit they have not been shown
  });

  it('tells the split apart from the wording the write-ups really use', () => {
    const table = (title: string, caption: string, rows = [['Refinance', '$900B']]) => ({ title, caption, columns: ['Product', 'Market size'], rows });
    const kinds = (exhibits: unknown[]) => {
      const s = readSolution({ ...SOLUTION, exhibits })!;
      return { onRequest: s.onRequest.map((e) => e.title), reference: s.reference.map((e) => e.title) };
    };
    // Handed over: the write-up says who gives it, to whom and when.
    expect(kinds([
      table('Market sizes (given if prompted)', 'From the interviewer guidance for Exhibit 1.'),
      table('Santa Monica office data', 'Information the interviewer provides once the candidate asks.'),
      table('Exhibit #1', 'To be provided to the interviewee as background information.'),
      table('Typical cost figures (offer after brainstorm)', ''),
      // "Guidance" is where half the write-ups file the data the interviewer hands over, so it is not on its own a sign of an answer.
      table('Interviewer guidance: spend and revenue', 'Given once the candidate asks for estimated spend.'),
    ]).onRequest).toHaveLength(5);
    // The book's own working or answer: private, whatever else the caption says about handing it over.
    expect(kinds([
      table('Interviewer Guidance: Revenue calculation', 'Given if prompted.'),
      table('Costs', 'What the interviewer provides, and what the candidate calculates.'),
      table('Remotes sold', 'Completed table the interviewer shares before the recommendation.'),
      table('Pricing Data', 'Not to be provided to the interviewee.'),
      table('Market size', 'The interviewer provides these.', [['Today', '=5M/4% = $125M']]), // the book's arithmetic, printed in a cell
      { ...table('Market size', 'The interviewer provides these.'), columns: ['Product', 'Market size (Keep Private)'] },
    ]).onRequest).toEqual([]);
    // The same cost figures under the book's own numbering are not classed at all any more: the member is shown the exhibit (issue #85).
    const numbered = kinds([table('Exhibit 3: Typical cost figures (offer after brainstorm)', '')]);
    expect(numbered).toEqual({ onRequest: [], reference: [] });
  });

  it('never reads out a row that is itself the answer to the open beat, from either kind of table', async () => {
    // "Profit per customer: $4.20" is an answer when the beat is to work out profit per customer, however input-shaped the row looks.
    const answerRow = ['Profit per customer', '$4.20'];
    const handed = { ...sizes, title: 'Cost figures (given if prompted)', columns: ['Line', 'Value'], rows: [['Cost per customer', '$1.80'], answerRow] };
    const working = { ...sizes, title: 'Interviewer Guidance: profit', caption: '', columns: ['Line', 'Value'], rows: [['Revenue per customer', '$6.00'], answerRow] };
    const real = w.deps.loadCase;
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, exhibits: [EXHIBIT(1), handed, working] } } : real(id));
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'What is the profit per customer?' });
    const sent = w.asked.at(-1)!.messages.at(-1)!.content;
    expect(sent).toContain('$1.80'); // the inputs beside it are still handed over, in full
    expect(sent).toContain('$6.00');
    // ...and the rule covers both kinds of table: the one handed over as data and the one kept as reference.
    expect(sent).toContain('except a row that is itself the figure they have been asked to work out right now');
    expect(sent).toContain('including a row that simply prints the figure the student has been asked to work out');
    expect(sent).toContain('that row is an answer, however input-shaped it looks');
  });
});

describe('which model, and what it cost', () => {
  it('sends the short replies to the cheap model and the feedback to the stronger one', async () => {
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'Peak is 95 and off-peak is 31' });
    expect(w.asked[0].model).toBe('coach');
    at(5000);
    await call({ type: 'resume', sessionId: id });
    w.script.reply = () => GOOD_FEEDBACK;
    await call({ type: 'finish', sessionId: id });
    expect(w.asked.at(-1)!.model).toBe('feedback');
  });

  it('keeps the tokens every model call used with the case, so the real cost can be read back', async () => {
    const real = w.deps.ask;
    w.deps.ask = async (req) => ({ ...(await real(req)), usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 400, cacheWriteTokens: 50 } });
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'Who pays for the rooms?' });
    await call({ type: 'say', sessionId: v.sessionId, text: 'And who else?' });
    expect(w.db.get(v.sessionId)!.state.usage).toEqual({ calls: 2, inputTokens: 2000, outputTokens: 200, cacheReadTokens: 800, cacheWriteTokens: 100 });
    at(5000);
    await call({ type: 'resume', sessionId: v.sessionId });
    w.script.reply = () => GOOD_FEEDBACK;
    await call({ type: 'finish', sessionId: v.sessionId });
    expect(w.db.get(v.sessionId)!.state.usage?.calls).toBe(3); // the feedback counts too
    expect(JSON.stringify(view(await call({ type: 'resume', sessionId: v.sessionId })))).not.toContain('inputTokens'); // and the member never sees it
  });
});


describe('modes, pausing and ending, in the handler', () => {
  it('starts in practice mode unless interview mode is asked for, and says which in the view', async () => {
    expect((await begin()).mode).toBe('practice');
    w.db.clear();
    const v = view(await call({ type: 'start', libraryId: LIB, mode: 'interview' }));
    expect(v.mode).toBe('interview');
    expect(v.pausedAt).toBeNull();
  });

  it('refuses a pause or an early end in interview mode, and leaves the case running', async () => {
    const v = view(await call({ type: 'start', libraryId: LIB, mode: 'interview' }));
    for (const type of ['pause', 'end'] as const) {
      const r = await call({ type, sessionId: v.sessionId });
      expect(r).toMatchObject({ status: 'refused', message: expect.stringContaining('Interview mode') });
    }
    expect(view(await call({ type: 'resume', sessionId: v.sessionId })).status).toBe('active');
  });

  it('treats a case saved before there were modes as practice', async () => {
    const v = await begin();
    const stored = w.db.get(v.sessionId)!;
    delete stored.state.mode;
    expect(view(await call({ type: 'pause', sessionId: v.sessionId })).pausedAt).not.toBeNull();
  });

  it('pauses and continues with the time that was left, and shows when it was paused', async () => {
    at(0);
    const v = await begin();
    at(100);
    const paused = view(await call({ type: 'pause', sessionId: v.sessionId }));
    expect(paused.pausedAt).toBe(T0 + sec(100));
    at(100 + 5000);
    const still = view(await call({ type: 'resume', sessionId: v.sessionId }));
    expect(still.pausedAt).toBe(T0 + sec(100));
    expect(still.stage).toBe('prompt');
    const back = view(await call({ type: 'continue', sessionId: v.sessionId }));
    expect(back.pausedAt).toBeNull();
    expect(back.endsAt - (T0 + sec(100 + 5000))).toBe(v.endsAt - (T0 + sec(100)));
  });

  it('turns away what is said, handed in or typed while paused', async () => {
    const v = await begin();
    await call({ type: 'pause', sessionId: v.sessionId });
    expect(await call({ type: 'say', sessionId: v.sessionId, text: 'hello' })).toMatchObject({ status: 'refused' });
    expect(await call({ type: 'ready', sessionId: v.sessionId })).toMatchObject({ status: 'refused' });
    await call({ type: 'draft', sessionId: v.sessionId, key: 'clarify', text: 'typing' });
    expect(w.db.get(v.sessionId)!.state.drafts.clarify).toBeUndefined();
  });

  it('drops a reply from the model that comes in while the case is paused', async () => {
    const id = await toExhibits();
    w.script.reply = async () => {
      await call({ type: 'pause', sessionId: id }); // paused while Bucket is still thinking
      return turn('A late reply.', { assessment: 'progress' });
    };
    await call({ type: 'say', sessionId: id, text: 'Off-peak is low' });
    const v = view(await call({ type: 'resume', sessionId: id }));
    expect(v.pausedAt).not.toBeNull();
    expect(JSON.stringify(v.messages)).not.toContain('A late reply.');
    expect(v.messages.at(-1)).toMatchObject({ from: 'user', text: 'Off-peak is low' });
  });

  it('ends early: the case is over for the feedback, with the reason', async () => {
    const id = await toExhibits();
    const done = view(await call({ type: 'end', sessionId: id }));
    expect(done).toMatchObject({ status: 'done', stage: 'done', endReason: 'ended_early' });
    w.asked.length = 0;
    w.script.reply = (kind) => (kind === 'feedback' ? GOOD_FEEDBACK : turn('ok'));
    const fed = view(await call({ type: 'finish', sessionId: id }));
    expect(fed.feedback).not.toBeNull();
    expect(JSON.stringify(w.asked.at(-1))).toContain('chose to end it early');
  });

  it('does not ask the model for feedback on a case that was ended before anything was written', async () => {
    const v = await begin();
    view(await call({ type: 'end', sessionId: v.sessionId }));
    w.asked.length = 0;
    const fed = view(await call({ type: 'finish', sessionId: v.sessionId }));
    expect(w.asked).toHaveLength(0);
    expect(fed.feedback?.overall.rating).toBeNull();
    expect(fed.feedback?.overall.feedback).toContain('before writing anything');
  });
});

describe('the member moves on from an exhibit', () => {
  it('is refused before they have said anything about it, then brings out the next exhibit', async () => {
    const id = await toExhibits();
    expect(await call({ type: 'next', sessionId: id })).toMatchObject({ status: 'refused', message: expect.stringContaining('what you make of this one first') });
    w.script.reply = () => turn('Go on.', { assessment: 'partial' });
    await call({ type: 'say', sessionId: id, text: 'Off-peak is 31 percent' });
    const v = view(await call({ type: 'next', sessionId: id }));
    expect(v.exhibits).toHaveLength(2);
    expect(v.messages.at(-1)).toMatchObject({ kind: 'exhibit' });
    expect(w.db.get(id)!.state.beats[0].outcome).toBe('member_moved');
  });

  it('says in the feedback request that the student chose to move on', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('Go on.', { assessment: 'partial' });
    await call({ type: 'say', sessionId: id, text: 'Off-peak is 31 percent' });
    await call({ type: 'next', sessionId: id });
    await call({ type: 'say', sessionId: id, text: 'Off-peak is 32 percent' });
    await call({ type: 'next', sessionId: id }); // after the last exhibit: on to the step that has no exhibit of its own
    w.script.reply = (kind) => (kind === 'feedback' ? GOOD_FEEDBACK : turn('ok'));
    await call({ type: 'end', sessionId: id });
    await call({ type: 'finish', sessionId: id });
    expect(JSON.stringify(w.asked.at(-1))).toContain('the student chose to move on');
  });
});

/**
 * A case runs its exhibits and the steps of the book's analysis that have none (issue #128). A step is put to the member in
 * conversation, and everything the book worked out about it stays on the interviewer's side, exactly as an exhibit's notes do.
 */
describe('a part of the case that hands over no exhibit', () => {
  const STEP = {
    title: 'Close or invest: the ROIC test',
    body: 'The marketing offer costs five hundred thousand a store SECRET-BODY',
    calc: ['The uplift is measured against the gain over closing, not the whole offer SECRET-CALC'],
    whatToNotice: 'The build cost is sunk and has no place in the return test SECRET-NOTICE',
    commonMiss: ['Dividing the uplift by the whole offer instead of the gain over closing SECRET-MISS'],
    checkYourself: ['Did you test the marketing option against the hurdle rate before answering SECRET-CHECK'],
  };
  const withStep = { ...SOLUTION, steps: [...SOLUTION.steps, STEP] };

  /** Walks the case to its last part, the one with no exhibit. */
  async function toTheStep(): Promise<string> {
    w.deps.loadCase = async (lib) => (lib === LIB ? { info: INFO, solution: withStep } : null);
    const id = await toExhibits();
    w.script.reply = () => turn('Go on.', { assessment: 'partial' });
    for (let i = 0; i < 3; i += 1) {
      await call({ type: 'say', sessionId: id, text: `Reading number ${i}` });
      await call({ type: 'next', sessionId: id });
    }
    // The book puts its brainstorm before this part, so the case stops for it and picks the discussion up again afterwards (issue #133).
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'submit', sessionId: id, text: 'More rooms, more events, better pricing' });
    const v = view(await call({ type: 'resume', sessionId: id }));
    expect(v.stage).toBe('exhibits');
    expect(v.beatsTotal).toBe(5); // two exhibits, the sizing step, the brainstorm and this one
    expect(v.beatsShown).toBe(5);
    expect(v.exhibits).toHaveLength(2); // nothing new is handed over: this part is talked through
    w.asked.length = 0;
    return id;
  }

  it('gives the model the topic to steer by, and the member nothing of it', async () => {
    const id = await toTheStep();
    await call({ type: 'say', sessionId: id, text: 'I would compare the options' });
    const sent = JSON.stringify(w.asked.at(-1));
    expect(sent).toContain('There is no exhibit here');
    expect(sent).toContain('SECRET-CALC'); // the book's working, for the coach to judge by
    expect(sent).toContain('SECRET-NOTICE');
    expect(sent).toContain('SECRET-MISS');
    expect(sent).not.toContain('SECRET-CHECK'); // the questions the book hands the candidate afterwards are never sent at all
    const seen = JSON.stringify(view(await call({ type: 'resume', sessionId: id })));
    for (const secret of ['SECRET-BODY', 'SECRET-CALC', 'SECRET-NOTICE', 'SECRET-MISS', 'SECRET-CHECK']) expect(seen, secret).not.toContain(secret);
  });

  it('replaces a reply that repeats the step\'s own notes, line by line', async () => {
    const id = await toTheStep();
    for (const note of [STEP.body, STEP.calc[0], STEP.whatToNotice, STEP.commonMiss[0], STEP.checkYourself[0]]) {
      w.script.reply = () => turn(`Here is the thing. ${note}`, { assessment: 'progress' });
      // A step forward every time, so the member stays on this part and at the rung where nothing is being handed to them.
      const r = view(await call({ type: 'say', sessionId: id, text: 'I would compare the two options on margin per unit' }));
      expect(r.messages.at(-1)?.text, note).not.toContain('SECRET');
      expect(r.messages.at(-1)?.text).toContain('stay with your reasoning');
    }
  });
});

describe('learning mode, in the handler', () => {
  const startLearning = async () => view(await call({ type: 'start', libraryId: LIB, mode: 'learning' }));

  /** A learning case on its first exhibit. */
  async function learnToExhibits(): Promise<string> {
    const id = (await startLearning()).sessionId;
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' });
    w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
    await call({ type: 'say', sessionId: id, text: 'I would start with demand' });
    w.asked.length = 0;
    return id;
  }

  it('starts when asked for, says so in the view, and never runs out of time', async () => {
    const v = await startLearning();
    expect(v.mode).toBe('learning');
    at(5 * 3600);
    const later = view(await call({ type: 'resume', sessionId: v.sessionId }));
    expect(later.stage).toBe('prompt');
    expect(later.status).toBe('active');
  });

  it('has no pause, but ends early and still gets feedback', async () => {
    const v = await startLearning();
    expect(await call({ type: 'pause', sessionId: v.sessionId })).toMatchObject({ status: 'refused', message: expect.stringContaining('no clock') });
    w.script.reply = () => turn('Fine.', { assessment: 'progress' });
    await call({ type: 'say', sessionId: v.sessionId, text: 'Demand, supply, cost' });
    const ended = view(await call({ type: 'end', sessionId: v.sessionId }));
    expect(ended.status).toBe('done');
    w.script.reply = () => GOOD_FEEDBACK;
    const done = view(await call({ type: 'finish', sessionId: v.sessionId }));
    expect(done.feedback).not.toBeNull();
  });

  it('is coached as a teacher: no clock, nothing scored, and the exhibit notes are there to teach from', async () => {
    const id = await learnToExhibits();
    w.script.reply = () => turn('x'.repeat(900), { assessment: 'partial' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Peak is 95 and off-peak is 31' }));
    const req = w.asked[0];
    expect(req.system).toContain('there is no clock');
    expect(req.system).not.toContain('Never give the answer');
    expect(JSON.stringify(req)).toContain('SECRET-TAKE1'); // the book's reading, for teaching
    expect(JSON.stringify(req)).toContain('Use them to teach');
    expect(JSON.stringify(req)).not.toContain('SECRET-REC'); // the answer to the whole case stays out
    expect(r.messages.at(-1)!.text).toHaveLength(900); // a teaching reply may be longer than an interviewer's
  });

  it('keeps an interviewer reply short, as before', async () => {
    const id = await toExhibits();
    w.script.reply = () => turn('x'.repeat(900), { assessment: 'partial' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Peak is 95 and off-peak is 31' }));
    expect(r.messages.at(-1)!.text.length).toBeLessThanOrEqual(700);
  });

  it('never moves a stuck learner on by itself', async () => {
    const id = await learnToExhibits();
    w.script.reply = () => turn('Let me show you where to look.', { assessment: 'stuck' });
    for (let i = 0; i < 6; i++) await call({ type: 'say', sessionId: id, text: `still not sure ${i}` });
    at(4 * 3600);
    const r = view(await call({ type: 'resume', sessionId: id }));
    expect(r.stage).toBe('exhibits');
    expect(r.beatsShown).toBe(1);
  });

  it('writes the feedback as a lesson, with no ratings, whatever the model sends', async () => {
    const v = await startLearning();
    w.script.reply = () => turn('Fine.', { assessment: 'progress' });
    await call({ type: 'say', sessionId: v.sessionId, text: 'Demand, supply, cost' });
    await call({ type: 'end', sessionId: v.sessionId });
    w.script.reply = () => GOOD_FEEDBACK; // asks for ratings anyway
    const done = view(await call({ type: 'finish', sessionId: v.sessionId }));
    const request = w.asked.at(-1)!;
    expect(request.system).toContain('This is for learning, not for grading');
    expect(JSON.stringify(request)).toContain('the case had no clock');
    expect(done.feedback!.overall.rating).toBeNull();
    for (const s of Object.values(done.feedback!.skills)) expect(s.rating).toBeNull();
    expect(done.feedback!.skills.framework.feedback).toBe('Clear buckets.'); // the notes stay
    expect(done.feedback!.wentWell).toBe('Good structure.');
  });
});

describe('a figure the book has already worked out (issue #129)', () => {
  // Both tables below are the shapes the real-model pilot leaked from, with our own numbers in them: a hidden guidance sheet whose last
  // column is the product of the two beside it, and a hidden working sheet that prints its own arithmetic in the cell.
  const table = (over: Record<string, unknown>) => ({ title: '', caption: '', columns: [], rows: [], approx: false, howToRead: '', takeaways: [], chart: null, ...over });

  const ATTENDANCE = table({
    title: 'Exhibit 1: Attendance and ticket price',
    columns: ['Year', 'Attendance (millions)', 'Average ticket price'],
    rows: [['2024', '60', '$70'], ['2025', '65', '$75']],
    howToRead: 'Compare the two years SECRET-HOW-TAM',
    takeaways: ['The market is growing SECRET-TAKE-TAM'],
  });
  const TAM = table({
    title: 'Interviewer guidance for Exhibit 1: market size',
    columns: ['Year', 'Attendance', 'Ticket price', 'Market revenue'],
    rows: [['2024', '60,000,000', '$70', '$4.2B'], ['2025', '65,000,000', '$75', '$4.875B'], ['Total', '', '', '$9.075B']],
  });
  const UNITS = table({
    title: 'Exhibit 2: Units sold',
    columns: ['Product', '2016', '2017'],
    rows: [['Televisions', '24,000', '36,000'], ['Radios', '54,000', '66,000']],
    howToRead: 'Totals across the chain SECRET-HOW-UNITS',
    takeaways: ['Radios carry the volume SECRET-TAKE-UNITS'],
  });
  const WORKING = table({
    title: 'Exhibit 2: Solution, quantity per store',
    columns: ['Product', '2016', '2017'],
    rows: [['Televisions', '24,000/120 = 200', '36,000/120 = 300'], ['Radios', '54,000/120 = 450', '66,000/120 = 550']],
  });
  /** The cost base of issue #83: three input rows, none of them worked out from anything. */
  const COSTS = table({
    title: 'Interviewer guidance: the cost base',
    columns: ['Line', 'Amount'],
    rows: [['Capex', '$200M'], ['Fixed costs', '$150M'], ['Variable costs', '$130M']],
  });

  const caseOf = (exhibits: unknown[], facts: string[] = SOLUTION.facts) => {
    w.deps.loadCase = async (id) => (id === LIB ? { info: INFO, solution: { ...SOLUTION, facts, exhibits } } : null);
  };
  const said = (r: LiveView): string => r.messages.at(-1)!.text;

  it('tells the model the test to apply, and that a worked-out figure is never volunteered', async () => {
    caseOf([ATTENDANCE, TAM]);
    const v = await begin();
    await call({ type: 'say', sessionId: v.sessionId, text: 'Do we have attendance and ticket price over time?' });
    const sent = w.asked[0].messages.at(-1)!.content;
    expect(sent).toContain('could they have produced this figure themselves from what they already hold');
    expect(sent).toContain('it is theirs to produce, whoever wrote it down');
    expect(sent).toContain('a figure is not data just because it is printed on your sheet');
    expect(sent).toContain('Never volunteer one either: not unasked, not before any exhibit is on the table');
    expect(sent).toContain('not inside a refusal');
  });

  it('marks the figures the book worked out and leaves every input unmarked', async () => {
    caseOf([ATTENDANCE, TAM]);
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'What is the market worth?' });
    const sent = w.asked.at(-1)!.messages.at(-1)!.content;
    // The product of the two columns beside it is marked; the two figures it is made of are not.
    expect(sent).toContain('2024 | 60,000,000 | $70 | $4.2B [computed]');
    expect(sent).toContain('2025 | 65,000,000 | $75 | $4.875B [computed]');
    expect(sent).toContain('Total |  |  | $9.075B [computed]'); // the column's own sum, too
    expect(sent).toContain('A figure marked [computed] is one the book worked out from other figures in the case');
    expect(sent).toContain('it is never read out, never stated, never confirmed and never slipped into the end of a sentence');
  });

  it("marks a cell that shows its own arithmetic, and says when a whole table is the book's working", async () => {
    caseOf([UNITS, WORKING], ['The chain has 120 stores.']);
    const id = await toExhibits();
    await call({ type: 'say', sessionId: id, text: 'What is the quantity per store?' });
    const sent = w.asked.at(-1)!.messages.at(-1)!.content;
    expect(sent).toContain('24,000/120 = 200 [computed]');
    expect(sent).toContain('66,000/120 = 550 [computed]');
    expect(sent).toContain("all of it is the book's own working: there is no input in this one to read out");
  });

  it('leaves the cost base alone and still reads it out in full (#83)', async () => {
    caseOf([ATTENDANCE, COSTS]);
    const id = await toExhibits();
    w.script.reply = () => turn('Capex is $200M, fixed costs are $150M and variable costs are $130M. What would you do with those?', { data_request: true });
    const r = view(await call({ type: 'say', sessionId: id, text: 'What is the cost base?' }));
    const sent = w.asked.at(-1)!.messages.at(-1)!.content;
    expect(sent).not.toContain('[computed]'); // nothing in it was worked out from anything
    expect(said(r)).toContain('$200M'); // ...so the reply reaches the member whole
    expect(said(r)).toContain('$150M');
    expect(said(r)).toContain('$130M');
  });

  it('replaces a reply that volunteers a figure the book worked out, however it is written', async () => {
    caseOf([ATTENDANCE, TAM]);
    const id = await toExhibits();
    w.script.reply = () =>
      turn('In 2024 attendance is 60 million with an average ticket price of $70, which gives a market revenue of $4.2 billion.', { data_request: true });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Do we have attendance and ticket price?' }));
    expect(said(r)).toBe(FALLBACK);
    expect(said(r)).not.toContain('4.2');
  });

  it('lets the same reply through when it stops at the inputs', async () => {
    caseOf([ATTENDANCE, TAM]);
    const id = await toExhibits();
    w.script.reply = () => turn('In 2024 attendance is 60 million and the average ticket price is $70. What would you take from that?', { data_request: true });
    const r = view(await call({ type: 'say', sessionId: id, text: 'Do we have attendance and ticket price?' }));
    expect(said(r)).toContain('60 million');
    expect(said(r)).toContain('$70');
  });

  it('catches the figure handed over inside an otherwise correct refusal', async () => {
    caseOf([UNITS, WORKING], ['The chain has 120 stores.']);
    const id = await toExhibits();
    w.script.reply = () =>
      turn('I cannot hand over the totals, since that is the step you need to take. The quantities per store are 200 televisions and 450 radios.', {
        data_request: true,
      });
    const r = view(await call({ type: 'say', sessionId: id, text: 'What is the quantity per store?' }));
    expect(said(r)).toBe(FALLBACK);
    expect(said(r)).not.toContain('200');
  });

  it('never holds back a fact in the case or a figure in the exhibit in front of them', async () => {
    caseOf([ATTENDANCE, TAM]);
    const id = await toExhibits();
    w.script.reply = () => turn('The base houses 20,000 soldiers, and attendance in 2025 is 65 million at $75 a ticket.', { data_request: true });
    const r = view(await call({ type: 'say', sessionId: id, text: 'How many soldiers, and what is attendance in 2025?' }));
    expect(said(r)).toContain('20,000 soldiers');
    expect(said(r)).toContain('65 million');
    expect(said(r)).toContain('$75');
  });

  it('teaches the same figure in learning mode, where the answer is the lesson', async () => {
    caseOf([ATTENDANCE, TAM]);
    const id = view(await call({ type: 'start', libraryId: LIB, mode: 'learning' })).sessionId;
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' });
    w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
    await call({ type: 'say', sessionId: id, text: 'I would start with demand' });
    w.script.reply = () => turn('You multiply the two: 60 million tickets at $70 comes to $4.2 billion. Try 2025 the same way.', { assessment: 'partial' });
    const r = view(await call({ type: 'say', sessionId: id, text: 'I think I multiply them. Is that right?' }));
    expect(said(r)).toContain('$4.2 billion');
  });

  it('reads a figure however it is written, and never calls a year or a small number a result', () => {
    expect(figuresIn('$8 billion').map((f) => f.value)).toEqual([8e9]);
    expect(figuresIn('$8B')[0].value).toBe(8e9);
    expect(figuresIn('8,000,000,000')[0].value).toBe(8e9);
    expect(figuresIn('$7.2 M')[0].value).toBe(7.2e6);
    expect(figuresIn('15% of 24,000')).toEqual([{ value: 15, percent: true }, { value: 24000, percent: false }]);
    expect(figuresIn('5 months and 3 metres').map((f) => f.value)).toEqual([5, 3]); // "m" is a million only when it is the whole word
    expect(statesHeldResult('that comes to $8 billion', [String(8e9)])).toBe(true);
    expect(statesHeldResult('that comes to $9 billion', [String(8e9)])).toBe(false);
    expect(statesHeldResult('anything at all', [])).toBe(false);
  });

  it('marks what follows from the table and nothing else', () => {
    const marks = (rows: string[][]) => computedCells({ rows }).map((r) => r.map((f) => (f ? 'C' : '.')).join(''));
    // The product of the two figures beside it, and the sum down the column: both are results.
    expect(marks([['2024', '60,000,000', '$70', '$4.2B'], ['2025', '65,000,000', '$75', '$4.875B'], ['Total', '', '', '$9.075B']])).toEqual([
      '...C',
      '...C',
      '...C',
    ]);
    // A year is never a result, and nor is a figure small enough to meet another by accident.
    expect(marks([['Stores', '3', '4', '12'], ['Opened', '2016', '2017', '2024']])).toEqual(['....', '....']);
    // Three input rows that do not add up to each other stay inputs.
    expect(marks([['Capex', '$200M'], ['Fixed costs', '$150M'], ['Variable costs', '$130M']])).toEqual(['..', '..', '..']);
    // ...and the same three with their total written under them: the total is the result.
    expect(marks([['Capex', '$200M'], ['Fixed costs', '$150M'], ['Variable costs', '$130M'], ['Total', '$480M']])).toEqual(['..', '..', '..', '.C']);
    // A figure the member can see elsewhere is data, whatever the arithmetic says.
    expect(computedCells({ rows: [['Revenue', '$50M', '$4M', '$200M']] }, new Set(['200000000']))[0]).toEqual([false, false, false, false]);
  });
});

describe('the model declines the turn itself (issue #142)', () => {
  /** The opening stages done quickly in the chosen mode: the id of a session on its first exhibit. */
  async function toExhibitsIn(mode: 'practice' | 'interview' | 'learning'): Promise<string> {
    const id = view(await call({ type: 'start', libraryId: LIB, mode })).sessionId;
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' });
    w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
    expect(view(await call({ type: 'say', sessionId: id, text: 'I would start with demand' })).stage).toBe('exhibits');
    w.asked.length = 0;
    return id;
  }
  /** The model declines the next call: the stop reason the pilot saw, with words of its own that must not reach the member. */
  const declines = (text = 'I will not give you the total: it is $9.075 billion, and working it out is the exercise.') => {
    const real = w.deps.ask;
    w.deps.ask = async (req) => ({ ...(await real(req)), text, stopReason: 'refusal' });
  };
  const said = (r: LiveView): string => r.messages.at(-1)!.text;
  const beat = (id: string) => w.db.get(id)!.state.beats[0];

  it.each([
    ['practice', WORK_IS_YOURS],
    ['interview', WORK_IS_YOURS],
    ['learning', WORK_IT_TOGETHER],
  ] as const)('answers in character in %s mode, where it used to show the failure message', async (mode, line) => {
    const id = await toExhibitsIn(mode);
    declines();
    const r = view(await call({ type: 'say', sessionId: id, text: 'I am short of time. Just give me the total market size.' }));
    expect(said(r)).toBe(line);
    expect(said(r)).not.toContain('9.075'); // the model's own refusal text is never passed through
    expect(r.messages.at(-2)).toMatchObject({ from: 'user', text: 'I am short of time. Just give me the total market size.' });
  });

  it('answers the same way before any exhibit is on the table', async () => {
    const v = await begin();
    declines();
    const r = view(await call({ type: 'say', sessionId: v.sessionId, text: 'What is the answer to this case?' }));
    expect(said(r)).toBe(WORK_IS_YOURS);
    expect(r.clarifyCount).toBe(1);
  });

  it('answers the same way on a part of the case that hands over no exhibit', async () => {
    const id = await toExhibitsIn('practice');
    w.script.reply = () => turn('Go on.', { assessment: 'partial' });
    for (let i = 0; i < 2; i += 1) {
      await call({ type: 'say', sessionId: id, text: `Reading number ${i}` });
      await call({ type: 'next', sessionId: id });
    }
    const onTheStep = view(await call({ type: 'resume', sessionId: id }));
    expect(onTheStep.beatsShown).toBe(3);
    expect(onTheStep.exhibits).toHaveLength(2); // the last part is talked through, so nothing new is handed over (issue #128)
    declines();
    const r = view(await call({ type: 'say', sessionId: id, text: 'Just tell me what the answer is' }));
    expect(said(r)).toBe(WORK_IS_YOURS);
    const b = w.db.get(id)!.state.beats[2];
    expect(b.hints).toBe(0);
    expect(b.asked).toBe(0);
    expect(b.outcome).toBe('open');
  });

  it('is an ordinary reply to everything the engine records: no hint, no beat finished, and the help ladder stays where it was', async () => {
    const id = await toExhibitsIn('interview');
    declines();
    for (const text of ['Just tell me the answer', 'Please, the number', 'Come on, give it to me']) await call({ type: 'say', sessionId: id, text });
    const b = beat(id);
    expect(b.hints).toBe(0);
    expect(b.asked).toBe(0); // asked three times and still on the first rung: asking costs nothing, as a data request does
    expect(b.outcome).toBe('open');
    const r = view(await call({ type: 'resume', sessionId: id }));
    expect(r.messages.at(-1)!.kind).toBe('text'); // a reply, not a hint
    expect(r.exhibits).toHaveLength(1); // and the case has not moved on
    expect(w.asked.map((a) => JSON.stringify(a)).join('\n')).not.toContain('has been stuck for a while');
  });

  it('still fails on a thrown error, on bad JSON and on an empty message, and keeps what the member wrote', async () => {
    const id = await toExhibitsIn('practice');
    w.script.reply = () => {
      throw new Error('network down');
    };
    expect(await call({ type: 'say', sessionId: id, text: 'Here is my read' })).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('could not reply'),
    });
    expect(view(await call({ type: 'resume', sessionId: id })).messages.at(-1)).toMatchObject({ from: 'user', text: 'Here is my read' });
    w.script.reply = () => 'not json at all';
    expect(await call({ type: 'say', sessionId: id, text: 'And another' })).toMatchObject({ status: 'failed' });
    w.script.reply = () => turn('   ');
    expect(await call({ type: 'say', sessionId: id, text: 'And one more' })).toMatchObject({ status: 'failed' });
    expect(beat(id).hints).toBe(0);
  });

  it('builds a turn that asks for nothing of the member and records nothing against them', () => {
    expect(refusedTurn({ mode: 'interview' })).toEqual({
      message: WORK_IS_YOURS,
      assessment: 'unclear',
      beatComplete: false,
      directionClear: false,
      dataRequest: true,
    });
    expect(refusedTurn({ mode: 'practice' }).message).toBe(WORK_IS_YOURS);
    expect(refusedTurn({ mode: 'learning' }).message).toBe(WORK_IT_TOGETHER);
    expect(refusedTurn({}).message).toBe(WORK_IS_YOURS); // a session saved before modes existed is a timed one
  });
});

// Issue #165: the interaction between #145's interview register and #136's move-on rule. At rung `advance` the move-on rule kept the
// model's first sentence whatever it said; the interview branch then stripped it as a verdict, the reply went empty, and the guard
// that stands in for an empty reply — which was not rung-aware — handed the member `OVER_TO_YOU` while `applyTurn` moved the case on.
// The three inputs below are the reproductions recorded in the issue, run through the real `parseTurn`.
describe('a move-on says the case is moving on, in every mode (issue #165)', () => {
  const VERDICT_THEN_MOVE = "You're right that the margin is the issue. Let us move on to the next piece.";
  const VERDICT_THEN_LATER = 'Good instinct. We will come back to that; let us move on.';
  const JUST_THE_MOVE = 'Let us move on to the next piece.';
  /** A turn the engine reads as the move-on: the rung that advances, no question answered and no beat finished. */
  const movingTurn = (text: string) => JSON.stringify(turn(text, { assessment: 'stuck' }));
  const atAdvance = (text: string, mode: 'practice' | 'interview' | 'learning', kind: 'exhibit' | 'direction' = 'exhibit') =>
    parseTurn(movingTurn(text), [], FALLBACK, 700, 'advance', [], { mode, kind })!.message;

  /** The opening stages done quickly in the chosen mode: the id of a session on its first exhibit. */
  async function toExhibitsIn(mode: 'practice' | 'interview' | 'learning'): Promise<string> {
    const id = view(await call({ type: 'start', libraryId: LIB, mode })).sessionId;
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'ready', sessionId: id });
    await call({ type: 'submit', sessionId: id, text: 'Demand, supply, cost' });
    w.script.reply = () => turn('Good start, let us look at the data.', { direction_clear: true, assessment: 'progress' });
    expect(view(await call({ type: 'say', sessionId: id, text: 'I would start with demand' })).stage).toBe('exhibits');
    w.asked.length = 0;
    return id;
  }

  it('turns the three reproductions into a line that moves the case on', () => {
    // Was `OVER_TO_YOU` — "stay with it" on the very turn the part is taken away.
    expect(atAdvance(VERDICT_THEN_MOVE, 'interview')).toBe(MOVING_ON);
    expect(atAdvance(VERDICT_THEN_LATER, 'interview')).toBe(MOVING_ON);
    // ...and the reply that was already right is untouched.
    expect(atAdvance(JUST_THE_MOVE, 'interview')).toBe(JUST_THE_MOVE);
    for (const text of [VERDICT_THEN_MOVE, VERDICT_THEN_LATER, JUST_THE_MOVE]) {
      expect(atAdvance(text, 'interview'), text).not.toBe(OVER_TO_YOU);
      expect(atAdvance(text, 'interview'), text).not.toBe('');
      expect(saysMovingOn(atAdvance(text, 'interview')), text).toBe(true);
    }
  });

  it('never leaves the member with a bare verdict in practice', () => {
    // #136 as written kept the first sentence whatever it said, so this reached the member with no move-on in it at all.
    expect(atAdvance(VERDICT_THEN_MOVE, 'practice')).toBe(MOVING_ON);
    expect(atAdvance(VERDICT_THEN_LATER, 'practice')).toBe(MOVING_ON);
    expect(atAdvance(JUST_THE_MOVE, 'practice')).toBe(JUST_THE_MOVE);
    // Learning mode goes the same way, and so does the turn that hands the direction over (which never reaches this rung in
    // production — `nudgeLevel` is `none` outside the exhibits stage — but the rule is the rule wherever it is asked).
    expect(atAdvance(VERDICT_THEN_MOVE, 'learning')).toBe(MOVING_ON);
    expect(atAdvance(VERDICT_THEN_MOVE, 'interview', 'direction')).toBe(MOVING_ON);
  });

  it('knows a sentence that moves the case on from one that does not', () => {
    for (const sentence of [
      'Let us move on to the next piece.',
      "That's fine, we can move on.",
      'Good — on to the next exhibit.',
      'Let us park that and keep moving.',
      'We will come back to that later.',
      'Let us leave that there.',
      'Time to take the next part.',
    ]) {
      expect(saysMovingOn(sentence), sentence).toBe(true);
    }
    for (const sentence of [
      "You're right that the margin is the issue.",
      'Good instinct.',
      'What would you do with that?',
      'Off-peak occupancy is 31% and peak is 95%.',
      OVER_TO_YOU,
      FALLBACK,
    ]) {
      expect(saysMovingOn(sentence), sentence).toBe(false);
    }
    expect(saysMovingOn(MOVING_ON)).toBe(true); // our own line is one, so the substitution satisfies the rule it enforces
  });

  it('still says nothing about the part it is leaving (issue #131)', () => {
    const notes = ['Off-peak occupancy is the number that decides the case.'];
    const message = (text: string, mode: 'practice' | 'interview') =>
      parseTurn(movingTurn(text), notes, FALLBACK, 700, 'advance', [], { mode, kind: 'exhibit' })!.message;
    // A move-on carrying the beat's substance is still replaced, exactly as #136 left it.
    expect(message('Off-peak occupancy decides this one, so let us move on.', 'practice')).toBe(MOVING_ON);
    expect(message('Off-peak occupancy decides this one, so let us move on.', 'interview')).toBe(MOVING_ON);
    expect(movingOnOnly('Off-peak occupancy decides this one, so let us move on.', notes)).toBe(MOVING_ON);
    for (const mode of ['practice', 'interview'] as const) expect(message(VERDICT_THEN_MOVE, mode)).not.toMatch(/margin|occupancy/i);
  });

  it('tells the member the case is moving on, and then moves it on', async () => {
    const id = await toExhibitsIn('interview');
    w.script.reply = () => turn(VERDICT_THEN_MOVE, { assessment: 'stuck' });
    let r: LiveView | null = null;
    for (const text of ['I am not sure', 'Still not sure', 'Hmm', 'I really do not know']) r = view(await call({ type: 'say', sessionId: id, text }));
    const movedOn = r!.messages.filter((m) => m.from !== 'user' && m.kind !== 'exhibit').at(-1)!;
    expect(movedOn.text).toBe(MOVING_ON);
    expect(movedOn.text).not.toBe(OVER_TO_YOU); // the member is not asked to stay with the part being taken away
    expect(movedOn.text).not.toMatch(/margin/i);
    expect(r!.exhibits).toHaveLength(2); // ...and the next part is on the table
    expect(w.db.get(id)!.state.beats[0].outcome).toBe('coach_moved');
  });
});
