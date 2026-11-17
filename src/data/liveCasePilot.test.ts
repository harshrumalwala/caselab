// @vitest-environment node
//
// The pilot runner (scripts/liveCasePilot.mjs). It spends the owner's money against the deployed function, so everything that decides
// whether a call is made, what it cost and what goes in the transcript is a plain function tested here: no network, no database, no
// credentials, no private-data. The one piece that does talk over HTTP is driven through a fake `send`, so the whole path is exercised
// without a request.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MAX_STARTS_PER_DAY as COACH_MAX_PER_DAY, MAX_STARTS_PER_WEEK as COACH_MAX_PER_WEEK } from '../../supabase/functions/_shared/liveCaseCoach';
import type { LiveView, PublicExhibit } from '../../supabase/functions/_shared/liveCaseCoach';
import type { Message, Usage } from '../../supabase/functions/_shared/liveCase';
import {
  DEFAULT_CAP,
  EMPTY_USAGE,
  FINISH_RESERVE_FLOOR,
  MAX_STARTS_PER_DAY,
  MAX_STARTS_PER_WEEK,
  PRICES,
  TRANSCRIPT_WARNING,
  actionFor,
  capDecision,
  capFromArgv,
  catalogRow,
  chartSummary,
  credentialsFrom,
  diffView,
  filterCatalog,
  formatExhibit,
  formatSpend,
  formatTurn,
  largestTurnCost,
  main,
  makeSend,
  newTranscript,
  parseEnvFile,
  parseQueryRows,
  priceTurn,
  priceUsage,
  readCredentials,
  readScriptSteps,
  readSessionRows,
  readTranscripts,
  readUsage,
  reserveFor,
  runStep,
  sessionStateSql,
  sessionsSql,
  spendReport,
  startsLeft,
  stepFitsStage,
  stepFromArgv,
  transcriptName,
  usageDelta,
  usd,
  type PilotResponse,
  type SessionRow,
  type StepState,
  type Transcript,
  type TurnRecord,
} from '../../scripts/liveCasePilot.mjs';

const usage = (over: Partial<Usage> = {}): Usage => ({ ...EMPTY_USAGE, ...over });

const message = (over: Partial<Message> = {}): Message => ({ id: 1, at: 0, from: 'coach', stage: 'prompt', kind: 'text', text: 'Hello.', ...over });

const exhibit = (over: Partial<PublicExhibit> = {}): PublicExhibit => ({
  beat: 0,
  title: 'Exhibit 1: Revenue by region',
  caption: 'Figures in $M.',
  columns: ['Region', 'Revenue'],
  rows: [
    ['North', '40'],
    ['South', '45'],
  ],
  approx: false,
  chart: null,
  ...over,
});

const view = (over: Partial<LiveView> = {}): Partial<LiveView> => ({
  sessionId: 'f3b0a3d1-0000-4000-8000-000000000001',
  serverNow: 1_000_000,
  stage: 'exhibits',
  stageEndsAt: 1_240_000,
  endsAt: 2_200_000,
  frameworkPhase: 'framework',
  messages: [],
  exhibits: [],
  beatsShown: 1,
  beatsTotal: 3,
  status: 'active',
  endReason: null,
  mode: 'interview',
  ...over,
});

describe('the price of a turn', () => {
  it('prices a coach reply at the Haiku rates, every kind of token', () => {
    const cost = priceTurn(usage({ calls: 1, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 2000 }));
    // (1000 x 0.10 + 200 x 0.50 + 5000 x 0.01 + 2000 x 0.125) / 1M
    expect(cost.usd).toBeCloseTo(0.0005, 10);
    expect(cost.model).toBe('claude-haiku-5-5');
    expect(cost.overThreshold).toBe(false);
    expect(cost.approximate).toBe(true);
  });

  it('prices a finish turn at the Sonnet rates, because feedback is the one call it makes', () => {
    const delta = usage({ calls: 1, inputTokens: 20_000, outputTokens: 1500 });
    expect(priceTurn(delta, { finish: true }).usd).toBeCloseTo(0.055, 10); // 20,000 x $2 + 1,500 x $10 per million
    expect(priceTurn(delta, { finish: true }).model).toBe('claude-sonnet-5-5');
    // The same tokens as a coach reply cost a twentieth of that.
    expect(priceTurn(delta).usd).toBeCloseTo(0.00275, 10);
  });

  it('moves a turn over 100,000 prompt tokens to the higher Haiku tier', () => {
    const big = usage({ calls: 1, inputTokens: 150_000, outputTokens: 100 });
    const cost = priceTurn(big);
    expect(cost.overThreshold).toBe(true);
    expect(cost.tier).toBe(PRICES.haikuLong.tier);
    expect(cost.usd).toBeCloseTo(0.07525, 10);
    expect(priceTurn(usage({ calls: 1, inputTokens: 99_000, cacheReadTokens: 500 })).overThreshold).toBe(false);
  });

  it('counts cache reads towards the threshold and says when the tier cannot be attributed to one call', () => {
    const several = priceTurn(usage({ calls: 3, inputTokens: 60_000, cacheReadTokens: 60_000 }));
    expect(several.overThreshold).toBe(true);
    expect(several.tierCertain).toBe(false);
    expect(priceTurn(usage({ calls: 1, inputTokens: 120_000 })).tierCertain).toBe(true);
  });

  it('reads a usage record that is missing, partial or nonsense as zeros', () => {
    expect(readUsage(null)).toEqual(EMPTY_USAGE);
    expect(readUsage({ calls: 2, inputTokens: -5, outputTokens: 'x' })).toEqual(usage({ calls: 2 }));
    expect(priceUsage(null, PRICES.sonnet)).toBe(0);
  });

  it('never lets a delta go backwards', () => {
    expect(usageDelta(usage({ inputTokens: 100 }), usage({ inputTokens: 40 }))).toEqual(EMPTY_USAGE);
    expect(usageDelta(usage({ inputTokens: 100 }), usage({ inputTokens: 140, calls: 1 }))).toEqual(usage({ inputTokens: 40, calls: 1 }));
  });

  it('prints dollars to the cent, and to a fraction of one where that is the whole figure', () => {
    expect(usd(2)).toBe('$2.00');
    expect(usd(0.0005)).toBe('$0.0005');
  });
});

describe('the cap, checked before the call', () => {
  it('lets a reply through while the spend plus the reserve fits', () => {
    const decision = capDecision({ action: 'say', spentUsd: 1.9, largestTurnUsd: 0.03, cap: 2 });
    expect(decision.reserve).toBe(0.05); // the floor: the dearest turn so far was cheaper
    expect(decision.projected).toBeCloseTo(1.95, 10);
    expect(decision.allowed).toBe(true);
  });

  it('refuses the reply that would cross the cap, with the figures', () => {
    const decision = capDecision({ action: 'say', spentUsd: 1.98, largestTurnUsd: 0.04, cap: 2 });
    expect(decision.allowed).toBe(false);
    expect(decision.message).toContain('$1.98');
    expect(decision.message).toContain('$2.03');
    expect(decision.message).toContain('$2.00');
  });

  it('reserves more for a finish, because feedback is a Sonnet call over the whole transcript', () => {
    expect(reserveFor('finish', 0)).toBe(FINISH_RESERVE_FLOOR);
    expect(reserveFor('say', 0)).toBe(0.05);
    expect(capDecision({ action: 'finish', spentUsd: 1.8, cap: 2 }).allowed).toBe(false);
    expect(capDecision({ action: 'finish', spentUsd: 1.7, cap: 2 }).allowed).toBe(true);
  });

  it('reserves the dearest turn of the pilot so far when that is more than the floor', () => {
    const transcripts = [
      { turns: [{ cost: { usd: 0.4 } }, { cost: { usd: 0.11 } }] },
      { turns: [{ cost: { usd: 0.09 } }, { cost: null }] },
    ] as unknown as Transcript[];
    expect(largestTurnCost(transcripts)).toBe(0.4);
    expect(reserveFor('say', 0.4)).toBe(0.4);
    expect(capDecision({ action: 'say', spentUsd: 1.7, largestTurnUsd: 0.4, cap: 2 }).allowed).toBe(false);
  });

  it('reserves nothing for an action that calls no model', () => {
    for (const action of ['ready', 'submit', 'next', 'end']) {
      const decision = capDecision({ action, spentUsd: 99, cap: 2 });
      expect(decision.allowed).toBe(true);
      expect(decision.reserve).toBe(0);
    }
  });

  it('defaults to the owner\'s $2 and refuses a cap that is not an amount', () => {
    expect(DEFAULT_CAP).toBe(2);
    expect(capFromArgv([])).toBe(2);
    expect(capFromArgv(['--cap', '0.50'])).toBe(0.5);
    expect(() => capFromArgv(['--cap', 'lots'])).toThrow(/amount in dollars/);
  });
});

describe('the credentials, from two git-ignored files', () => {
  const local = 'VITE_SUPABASE_URL=https://example.supabase.co\n# a comment\nVITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_123"\n';
  const e2e = 'export CASELAB_E2E_EMAIL_A=a@example.com\r\nCASELAB_E2E_PASSWORD_A=pw-a\nCASELAB_E2E_EMAIL_B=b@example.com\nCASELAB_E2E_PASSWORD_B=pw-b\n';

  it('parses keys, quotes, export prefixes, comments and CRLF', () => {
    expect(parseEnvFile('A=1\nexport B="two"\n\n# note\nC=three # trailing\nD=a=b\n')).toEqual({ A: '1', B: 'two', C: 'three', D: 'a=b' });
    expect(parseEnvFile(undefined)).toEqual({});
  });

  it('picks the account asked for', () => {
    expect(credentialsFrom(local, e2e, 'a')).toEqual({ account: 'a', url: 'https://example.supabase.co', key: 'sb_publishable_123', email: 'a@example.com', password: 'pw-a' });
    expect(credentialsFrom(local, e2e, 'b').email).toBe('b@example.com');
    expect(() => credentialsFrom(local, e2e, 'c')).toThrow(/Unknown account/);
  });

  it('names what is missing, and in which file, rather than failing at the first request', () => {
    expect(() => credentialsFrom('', e2e, 'a')).toThrow(/VITE_SUPABASE_URL in \.env\.local/);
    expect(() => credentialsFrom(local, '', 'b')).toThrow(/CASELAB_E2E_EMAIL_B in \.env\.e2e\.local/);
  });

  it('refuses a key that looks like a secret', () => {
    expect(() => credentialsFrom('VITE_SUPABASE_URL=https://x\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_secret_abc\n', e2e, 'a')).toThrow(/looks like a secret/);
    expect(() => credentialsFrom('VITE_SUPABASE_URL=https://x\nVITE_SUPABASE_PUBLISHABLE_KEY=service_role.abc\n', e2e, 'a')).toThrow(/looks like a secret/);
  });
});

describe('the script of steps', () => {
  it('reads the steps and expands a repeat', () => {
    const steps = readScriptSteps([{ do: 'ready' }, { do: 'say', text: '  Who is the client?  ' }, { do: 'next', repeat: 3 }]);
    expect(steps.map((s) => s.do)).toEqual(['ready', 'say', 'next', 'next', 'next']);
    expect(steps[1].text).toBe('Who is the client?');
    expect(steps[4].from).toBe(3); // all three came from the third step of the file
  });

  it('refuses anything it cannot run, before a single call is made', () => {
    expect(() => readScriptSteps({} as unknown)).toThrow(/JSON array of steps/);
    expect(() => readScriptSteps([])).toThrow(/no steps/);
    expect(() => readScriptSteps([{ do: 'logged' }])).toThrow(/is not one of/);
    expect(() => readScriptSteps([{ do: 'say' }])).toThrow(/needs "text"/);
    expect(() => readScriptSteps([{ do: 'next', text: 'hi' }])).toThrow(/takes no "text"/);
    expect(() => readScriptSteps([{ do: 'ready', repeat: 0 }])).toThrow(/whole number from 1 to 50/);
    expect(() => readScriptSteps([{ do: 'ready', wait: 10 }])).toThrow(/unknown field wait/);
    expect(() => readScriptSteps(['ready'])).toThrow(/step 1 is not an object/);
  });

  it('keeps the pilot away from logging a case', () => {
    expect(() => actionFor({ do: 'logged', from: 1 }, 's')).toThrow(/is not one of/);
    expect(actionFor({ do: 'say', text: 'hi', from: 1 }, 'sess')).toEqual({ type: 'say', sessionId: 'sess', text: 'hi' });
    expect(actionFor({ do: 'finish', from: 1 }, 'sess')).toEqual({ type: 'finish', sessionId: 'sess' });
  });

  it('says when a step does not belong where the case stands', () => {
    expect(stepFitsStage({ do: 'next', from: 1 }, view({ stage: 'exhibits' }))).toBeNull();
    expect(stepFitsStage({ do: 'next', from: 1 }, view({ stage: 'prompt' }))).toMatch(/belongs at exhibits/);
    expect(stepFitsStage({ do: 'say', from: 1 }, view({ stage: 'framework_write', frameworkPhase: 'framework' }))).toMatch(/takes "submit" here/);
    expect(stepFitsStage({ do: 'say', from: 1 }, view({ stage: 'framework_write', frameworkPhase: 'direction' }))).toBeNull();
    expect(stepFitsStage({ do: 'ready', stage: 'prompt', from: 1 }, view({ stage: 'exhibits' }))).toMatch(/expected stage prompt/);
  });

  it('reads one action from the turn flags, and only one', () => {
    expect(stepFromArgv(['--next'])).toEqual({ do: 'next', from: 1 });
    expect(stepFromArgv(['--say', 'hello'])).toEqual({ do: 'say', text: 'hello', from: 1 });
    expect(() => stepFromArgv([])).toThrow(/needs one of/);
    expect(() => stepFromArgv(['--next', '--finish'])).toThrow(/does one thing/);
    expect(() => stepFromArgv(['--say'])).toThrow(/needs the text/);
  });
});

describe('reading the sessions back', () => {
  it('takes the rows out of the CLI envelope', () => {
    const out = `Target: project caselab (abc) · production\n{\n  "boundary": "x",\n  "rows": [{ "id": "1" }],\n  "warning": "untrusted"\n}\n`;
    expect(parseQueryRows(out)).toEqual([{ id: '1' }]);
    expect(() => parseQueryRows('nothing here')).toThrow(/no JSON/);
    expect(() => parseQueryRows('{"_tag":"Error","error":{"code":"X","message":"not linked"}}')).toThrow(/not linked/);
  });

  it('only ever asks for the signed-in member\'s own rows, and refuses anything that is not an id', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(sessionsSql(id)).toContain(`user_id = '${id}'`);
    expect(sessionsSql(id)).toContain("state->'usage'");
    expect(sessionStateSql(id, id)).toContain('select state');
    expect(() => sessionsSql("' or true --")).toThrow(/is not a user id/);
    expect(() => sessionStateSql(id, 'nope')).toThrow(/is not a session id/);
  });

  it('counts the starts left against the deployed function\'s own limits', () => {
    expect(MAX_STARTS_PER_DAY).toBe(COACH_MAX_PER_DAY);
    expect(MAX_STARTS_PER_WEEK).toBe(COACH_MAX_PER_WEEK);
    const now = Date.parse('2026-11-17T12:00:00Z');
    const at = (hoursAgo: number) => ({ createdAt: now - hoursAgo * 60 * 60 * 1000 });
    const two = startsLeft([at(1), at(5), at(50)], now);
    expect(two).toMatchObject({ today: 2, week: 3, leftToday: 2, allowed: true });
    const four = startsLeft([at(1), at(2), at(3), at(4)], now);
    expect(four.allowed).toBe(false);
    expect(four.message).toContain('4 a day');
  });

  it('normalises the rows the CLI returns', () => {
    const rows = readSessionRows([
      { id: 'a', library_id: 'b', status: 'active', mode: 'interview', usage: { calls: 2, inputTokens: 10 }, created_at: '2026-11-17T12:00:00Z' },
    ]);
    expect(rows[0]).toMatchObject({ id: 'a', libraryId: 'b', status: 'active', mode: 'interview' });
    expect(rows[0].usage).toEqual(usage({ calls: 2, inputTokens: 10 }));
    expect(rows[0].createdAt).toBe(Date.parse('2026-11-17T12:00:00Z'));
  });
});

describe('what was spent', () => {
  const session = (over: Partial<SessionRow> = {}): SessionRow => ({
    id: 'sess-1',
    libraryId: 'lib-1',
    status: 'done',
    mode: 'interview',
    usage: usage({ calls: 3, inputTokens: 1000, outputTokens: 100 }),
    createdAt: 0,
    ...over,
  });

  const transcript = (over: Partial<Transcript> = {}): Transcript =>
    ({
      ...newTranscript({ account: 'a', userId: 'u', sessionId: 'sess-1', libraryId: 'lib-1', caseName: 'Sample Co.', book: 'Booth MCG 2026-2027', mode: 'interview', cap: 2, startedAt: 0 }),
      ...over,
    }) as Transcript;

  it('prices a session turn by turn, and says what no transcript accounts for', () => {
    const turns = [
      { cost: { usd: 0.0005 }, usage: { delta: usage({ calls: 1, inputTokens: 500, outputTokens: 50 }) } },
    ] as unknown as TurnRecord[];
    const report = spendReport([session()], [transcript({ turns })]);
    expect(report.sessions[0].attributedUsd).toBeCloseTo(0.0005, 10);
    // The two calls no turn recorded: 500 input + 50 output at the coach's rates.
    expect(report.sessions[0].unattributed).toEqual(usage({ calls: 2, inputTokens: 500, outputTokens: 50 }));
    expect(report.sessions[0].unattributedUsd).toBeCloseTo(0.000075, 12);
    expect(report.totalUsd).toBeCloseTo(0.000575, 12);
    expect(report.sessions[0].caseName).toBe('Sample Co.');
  });

  it('prices a session with no transcript at the coach rates and says so', () => {
    const report = spendReport([session()], []);
    expect(report.sessions[0].hasTranscript).toBe(false);
    expect(report.sessions[0].usd).toBeCloseTo(report.unattributedUsd, 12);
    const printed = formatSpend(report, { cap: 2 });
    expect(printed).toContain('priced at coach (Haiku) rates');
    expect(printed).toContain('cache-write rates');
    expect(printed).toContain('claude-sonnet-5-5');
    expect(printed).toContain('of the $2.00 cap');
  });
});

describe('what a turn prints and records', () => {
  it('prints an exhibit whole, with the chart named rather than dumped', () => {
    const printed = formatExhibit(
      exhibit({
        approx: true,
        rows: [
          ['North', '40'],
          ['South', '45'],
          ['East', '12'],
        ],
        chart: { kind: 'bar', series: [{ name: 'Revenue', values: [40, 45, 12] }], panels: [] },
      }),
    );
    expect(printed).toContain('Exhibit 1: Revenue by region');
    expect(printed).toContain('Figures in $M.');
    expect(printed).toContain('Region | Revenue');
    expect(printed).toContain('East | 12');
    expect(printed).toContain('approx');
    expect(printed).toContain('chart: bar — series: Revenue');
    expect(printed).not.toContain('values');
  });

  it('summarises a chart by kind, series and panels', () => {
    expect(chartSummary(null)).toBe('none');
    expect(chartSummary({ kind: 'stack', series: [{ name: 'A' }, {}], panels: [{ kind: 'line', series: [{ name: 'B' }] }] })).toBe(
      'stack — series: A, (unnamed) — 1 panel: line (B)',
    );
  });

  it('prints only what arrived since the last turn, with who said it and what kind it was', () => {
    const before = view({ messages: [message({ id: 1 })], exhibits: [exhibit()] });
    const after = view({
      messages: [message({ id: 1 }), message({ id: 2, kind: 'hint', text: 'What does the trend say?' })],
      exhibits: [exhibit(), exhibit({ beat: 1, title: 'Exhibit 2: Costs' })],
    });
    const diff = diffView(before, after);
    expect(diff.messages.map((m) => m.id)).toEqual([2]);
    expect(diff.exhibits.map((e) => e.title)).toEqual(['Exhibit 2: Costs']);
    const printed = formatTurn({
      n: 4,
      step: { do: 'say', text: 'The north is bigger.' },
      response: { status: 'ok', view: after } as PilotResponse,
      diff,
      cost: priceTurn(usage({ calls: 1, inputTokens: 1000 })),
      spentUsd: 0.42,
      cap: 2,
    });
    expect(printed).toContain('turn 4 · say');
    expect(printed).toContain('[coach · hint] What does the trend say?');
    expect(printed).toContain('Exhibit 2: Costs');
    expect(printed).toContain('stage exhibits · beats 1/3');
    expect(printed).toContain('stage clock 4m 00s');
    expect(printed).toContain('case clock 20m 00s');
    expect(printed).toContain('mode interview');
    expect(printed).toContain('of the $2.00 cap · approximate');
  });

  it('prints the refusal when the function refuses', () => {
    const printed = formatTurn({
      n: 2,
      step: { do: 'next' },
      response: { status: 'refused', message: 'There is nothing to move on from.', view: view() } as PilotResponse,
      diff: { messages: [], exhibits: [] },
      cost: null,
      spentUsd: 0.1,
      cap: 2,
    });
    expect(printed).toContain('refused: There is nothing to move on from.');
  });

  it('names a transcript after the account, the case and the moment, and warns about the book content', () => {
    const name = transcriptName({ account: 'a', caseName: 'Phighting Phillies', mode: 'interview', startedAt: Date.parse('2026-11-17T12:30:00Z') });
    expect(name).toBe('a-phighting-phillies-interview-2026-11-17T12-30-00-000Z.json');
    expect(newTranscript({ account: 'a', userId: 'u', sessionId: 's', libraryId: 'l', caseName: 'c', book: 'b', mode: 'interview', cap: 2, startedAt: 0 }).warning).toBe(TRANSCRIPT_WARNING);
    expect(TRANSCRIPT_WARNING).toMatch(/Never paste it/);
  });
});

describe('one step against the function', () => {
  const sessionId = 'f3b0a3d1-0000-4000-8000-000000000001';

  const state = (over: Partial<StepState> = {}): StepState => ({
    sessionId,
    view: view({ messages: [message({ id: 1 })] }),
    usage: usage({ calls: 1, inputTokens: 100 }),
    spentUsd: 0.1,
    largestTurnUsd: 0.02,
    cap: 2,
    n: 3,
    ...over,
  });

  const okResponse = (over: Partial<LiveView> = {}): PilotResponse => ({
    status: 'ok',
    view: view({ messages: [message({ id: 1 }), message({ id: 2, text: 'Good. What next?' })], exhibits: [exhibit()], ...over }),
  });

  it('sends the action, records what arrived and prices the turn from the usage read back', async () => {
    const send = vi.fn(async () => okResponse());
    const readSpend = vi.fn(async () => ({ usage: usage({ calls: 2, inputTokens: 1100, outputTokens: 200 }), totalUsd: 0.2 }));
    const result = await runStep({ do: 'say', text: 'The north is bigger.', from: 1 }, state(), { send, readSpend });

    expect(send).toHaveBeenCalledWith({ type: 'say', sessionId, text: 'The north is bigger.' });
    expect(result.stopped).toBeNull();
    expect(result.record?.newMessages.map((m) => m.id)).toEqual([2]);
    expect(result.record?.newExhibits[0].rows).toEqual([
      ['North', '40'],
      ['South', '45'],
    ]);
    expect(result.record?.usage.delta).toEqual(usage({ calls: 1, inputTokens: 1000, outputTokens: 200 }));
    expect(result.cost?.usd).toBeCloseTo(0.0002, 10); // 1000 x $0.10 + 200 x $0.50 per million
    expect(result.state.spentUsd).toBe(0.2);
    expect(result.state.n).toBe(4);
    expect(result.state.largestTurnUsd).toBe(0.02); // this turn was cheaper than the dearest so far
  });

  it('never makes the call that would cross the cap', async () => {
    const send = vi.fn(async () => okResponse());
    const readSpend = vi.fn(async () => ({ usage: EMPTY_USAGE, totalUsd: 0 }));
    const result = await runStep({ do: 'say', text: 'hello', from: 1 }, state({ spentUsd: 1.99 }), { send, readSpend });

    expect(send).not.toHaveBeenCalled();
    expect(readSpend).not.toHaveBeenCalled();
    expect(result.stopped).toBe('cap');
    expect(result.why).toContain('Stopped before the call');
    expect(result.record).toBeUndefined();
  });

  it('prices a finish at the feedback model', async () => {
    const send = vi.fn(async () => okResponse({ stage: 'done', status: 'done' }));
    const readSpend = vi.fn(async () => ({ usage: usage({ calls: 2, inputTokens: 20_100, outputTokens: 1500 }), totalUsd: 0.3 }));
    const result = await runStep({ do: 'finish', from: 1 }, state(), { send, readSpend });
    expect(result.cost?.model).toBe('claude-sonnet-5-5');
    expect(result.cost?.usd).toBeCloseTo(0.055, 10);
    expect(result.state.largestTurnUsd).toBeCloseTo(0.055, 10);
  });

  it('reads no usage for an action that calls no model, and still records the turn', async () => {
    const send = vi.fn(async () => okResponse());
    const readSpend = vi.fn(async () => ({ usage: EMPTY_USAGE, totalUsd: 0 }));
    const result = await runStep({ do: 'next', from: 1 }, state(), { send, readSpend });
    expect(readSpend).not.toHaveBeenCalled();
    expect(result.record?.cost).toBeNull();
    expect(result.state.spentUsd).toBe(0.1);
  });

  it('stops on a refusal instead of carrying on', async () => {
    const send = vi.fn(async (): Promise<PilotResponse> => ({ status: 'refused', message: 'There is nothing to answer right now.', view: view() }));
    const readSpend = vi.fn(async () => ({ usage: usage({ calls: 1, inputTokens: 100 }), totalUsd: 0.1 }));
    const result = await runStep({ do: 'say', text: 'hello', from: 2 }, state(), { send, readSpend });
    expect(result.stopped).toBe('refused');
    expect(result.why).toContain('step 2');
    expect(result.record?.status).toBe('refused');
    expect(result.record?.message).toBe('There is nothing to answer right now.');
  });

  it('stops an unattended run when the step does not belong where the case stands', async () => {
    const send = vi.fn(async () => okResponse());
    const readSpend = vi.fn(async () => ({ usage: EMPTY_USAGE, totalUsd: 0 }));
    const result = await runStep({ do: 'submit', text: 'my framework', from: 5 }, state({ strict: true }), { send, readSpend });
    expect(send).not.toHaveBeenCalled();
    expect(result.stopped).toBe('stage');
    expect(result.why).toContain('step 5');
    // Driven by hand the same step is taken, with the mismatch reported.
    const byHand = await runStep({ do: 'submit', text: 'my framework', from: 5 }, state(), { send, readSpend });
    expect(send).toHaveBeenCalled();
    expect(byHand.misfit).toMatch(/belongs at/);
  });
});

describe('the call itself', () => {
  it('posts the action to the live-case function and hands back what it answered', async () => {
    const invoke = vi.fn(async () => ({ data: { status: 'ok', view: view() }, error: null }));
    const send = makeSend({ functions: { invoke } });
    const answer = await send({ type: 'ready', sessionId: 'sess' });
    expect(invoke).toHaveBeenCalledWith('live-case', { body: { type: 'ready', sessionId: 'sess' } });
    expect(answer.status).toBe('ok');
  });

  it('says what went wrong when the function errors, body and all', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { text: async () => 'not signed in' } } }));
    const send = makeSend({ functions: { invoke } });
    await expect(send({ type: 'ready', sessionId: 'sess' })).rejects.toThrow(/non-2xx status code — not signed in/);
  });

  it('says plainly that the credentials are missing instead of crashing', () => {
    expect(() => readCredentials('a', join(tmpdir(), 'caselab-pilot-no-such-folder'))).toThrow(/VITE_SUPABASE_URL in \.env\.local/);
  });

  it('asks for nothing at all to print its help, and refuses a command it does not have', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main([])).toBe(1);
    expect(out.mock.calls[0][0]).toContain('THIS SPENDS REAL MONEY');
    expect(await main(['nonsense'])).toBe(1);
    expect(err.mock.calls[0][0]).toContain('Unknown command');
    expect(readTranscripts(join(tmpdir(), 'caselab-pilot-no-such-folder'))).toEqual([]);
    expect(largestTurnCost([])).toBe(0);
  });

  it('reads the catalogue rows the database returns', () => {
    const rows = [
      catalogRow({ id: '1', name: 'Sample Co.', book: 'Booth MCG 2026-2027', school: 'Booth', year: 2026, case_type: 'Profitability', industry: 'Retail', cochair_pick: true, done: false }),
      catalogRow({ id: '2', name: 'Other Co.', book: 'Fuqua 2025-26', year: 2025 }),
    ];
    expect(filterCatalog(rows, 'booth mcg').map((r) => r.id)).toEqual(['1']);
    expect(filterCatalog(rows, '').length).toBe(2);
    expect(rows[1]).toMatchObject({ caseType: '', industry: '', done: false });
  });
});
