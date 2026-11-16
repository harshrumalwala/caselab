// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleLive,
  isFullSolution,
  leaks,
  openingText,
  MAX_FEEDBACK_ATTEMPTS,
  MAX_STARTS_PER_DAY,
  parseFeedback,
  parseTurn,
  readSolution,
  type LiveAction,
  type LiveDeps,
  type LiveResponse,
  type LiveView,
  type StoredSession,
  type TurnRequest,
} from '../../supabase/functions/_shared/liveCaseCoach';
import type { SessionState } from '../../supabase/functions/_shared/liveCase';

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
    expect(v.endsAt).toBe(T0 + sec(1620)); // 27 minutes: the case is sized to its two exhibits (12 minutes of discussion plus 15 around it)
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
    expect(stored.plan.beats).toHaveLength(2);
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
    let v = view(await call({ type: 'resume', sessionId: id }));
    expect(v.stage).toBe('brainstorm_think');
    at(1700);
    v = view(await call({ type: 'resume', sessionId: id }));
    expect(v.stage).toBe('done');
    expect(v.endReason).toBe('completed');
    expect(await call({ type: 'say', sessionId: id, text: 'too late' })).toMatchObject({ status: 'refused' });
    expect(await call({ type: 'submit', sessionId: id, text: 'too late' })).toMatchObject({ status: 'refused' });
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
      expect(v.beatsTotal).toBe(2);
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
    expect(v.beatsTotal).toBe(1);
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
      table('Exhibit 3: Typical cost figures (offer after brainstorm)', ''),
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
    await call({ type: 'next', sessionId: id }); // after the last exhibit: on to the next section
    w.script.reply = (kind) => (kind === 'feedback' ? GOOD_FEEDBACK : turn('ok'));
    await call({ type: 'end', sessionId: id });
    await call({ type: 'finish', sessionId: id });
    expect(JSON.stringify(w.asked.at(-1))).toContain('the student chose to move on');
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
