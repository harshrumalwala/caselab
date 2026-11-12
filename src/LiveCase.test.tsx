import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const NOON = Date.parse('2026-11-12T17:00:00Z');

beforeEach(() => {
  // Only the clock the screen uses. Faking setTimeout too would stall Testing Library's own waiting.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: NOON });
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});
afterEach(() => {
  vi.useRealTimers();
});

/** Lets the drafts being typed reach the server: they are saved a second after typing stops, by the real clock. */
const saved = () => act(async () => void (await new Promise((r) => setTimeout(r, 1300))));

/** Moves the clock on the way time passes in a real browser: second by second, so the screen's own timers run. */
async function pass(seconds: number) {
  for (let i = 0; i < seconds; i++) await act(async () => void vi.advanceTimersByTime(1000));
}

async function openLive(env: FakeEnv) {
  window.location.hash = '#/live';
  const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Practise a case with Bucket' });
  return user;
}

async function startCase(env: FakeEnv) {
  const user = await openLive(env);
  await user.click(await screen.findByRole('button', { name: /Surprise me/ }));
  await screen.findByText(/Should a hotel chain open a new property/);
  return user;
}

const reply = (env: FakeEnv, fn: (kind: string) => Record<string, unknown>) => {
  env.live.control.reply = (kind) =>
    kind === 'feedback'
      ? {
          overall_rating: 3,
          overall_feedback: 'You found the main issue and kept going.',
          skills: [{ key: 'framework', rating: 4, feedback: 'Clear buckets.', evidence: 'Demand, supply and cost' }],
          went_well: 'A clear structure.',
          struggled: 'You ran short of time on the recommendation.',
          concepts: 'Seasonality',
          next_focus: 'State the implication of every exhibit.',
          improvement_area: 'quant',
          debrief: [{ stage: 'Framework', observed: 'Three clear buckets.', to_improve: 'Say your hypothesis.' }],
          unfinished: [],
        }
      : { assessment: 'progress', beat_complete: false, direction_clear: kind === 'direction', ...fn(kind) };
};

describe('starting a live case', () => {
  it('is reached from Improvement Areas, explains the 30 minutes, and lists the cases that can be practised', async () => {
    const env = createFakeEnv();
    window.location.hash = '#/improve';
    const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('button', { name: 'Start a live case' }));
    await screen.findByRole('heading', { name: 'Practise a case with Bucket' });
    expect(screen.getByText(/35-minute clock/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Army Hotel/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Improvement Areas' }).some((l) => l.getAttribute('aria-current') === 'page')).toBe(true); // still under Improvement Areas
  });

  it('starts the clock when the prompt first appears, and keeps the case name secret', async () => {
    const env = createFakeEnv();
    await startCase(env);
    expect(screen.getByRole('timer', { name: 'Time left in the case' })).toHaveTextContent('35:00');
    expect(screen.getByRole('timer', { name: 'Time left in this part' })).toHaveTextContent('3:00');
    expect(screen.queryByText(/The base houses 20,000 soldiers/)).not.toBeInTheDocument(); // the interviewer's facts come out only when asked
    expect(screen.queryByText('Army Hotel')).not.toBeInTheDocument();
    await pass(61);
    expect(screen.getByRole('timer', { name: 'Time left in the case' })).toHaveTextContent('33:59');
  });
});

describe('the opening stages', () => {
  it('lets the member ask questions, then move on early; thinking is protected, then writing opens by itself', async () => {
    const env = createFakeEnv();
    reply(env, () => ({ message: 'The army pays a fixed per diem.' }));
    const user = await startCase(env);

    await user.type(screen.getByLabelText('Ask a clarifying question'), 'Who pays for the rooms?');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    expect(await screen.findByText('The army pays a fixed per diem.')).toBeInTheDocument();
    expect(screen.getByText('1 question asked.', { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ready for framework' }));
    await screen.findByRole('heading', { name: 'Think about your structure' });
    // Protected thinking: nothing to answer, no coach in the way, only a private scratchpad.
    expect(screen.queryByLabelText('Ask a clarifying question')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Scratchpad/)).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Time left in this part' })).toHaveTextContent('1:30');

    await pass(91); // 90 seconds of thinking, then it opens by itself
    await screen.findByLabelText('Your framework');
    // the time saved on the prompt stage is still in the overall clock, which never reset
    const left = screen.getByRole('timer', { name: 'Time left in the case' }).textContent!;
    expect(Number(left.split(':')[0])).toBeGreaterThanOrEqual(32);
  });

  it('asks where they would start after the framework, then brings out the first exhibit', async () => {
    const env = createFakeEnv();
    reply(env, (kind) => ({ message: kind === 'direction' ? 'Good start. Let us look at some data.' : 'Okay.' }));
    const user = await startCase(env);
    await user.click(screen.getByRole('button', { name: 'Ready for framework' }));
    await user.click(await screen.findByRole('button', { name: 'Ready to write' }));
    await user.type(await screen.findByLabelText('Your framework'), 'Demand, supply and cost');
    await user.click(screen.getByRole('button', { name: 'Hand in framework' }));
    expect(await screen.findByText(/Where would you start, and what would you want to understand first/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Where would you start?'), 'Demand first, by season');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    expect(await screen.findByText('Exhibit 1: Occupancy by season')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Off-peak');
    expect(screen.getByText('Exhibit 1 of 1')).toBeInTheDocument();
  });

  it('keeps a half-written framework when time runs out, and moves on with it as an unfinished draft', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await user.click(screen.getByRole('button', { name: 'Ready for framework' }));
    await user.click(await screen.findByRole('button', { name: 'Ready to write' }));
    await user.type(await screen.findByLabelText('Your framework'), 'Profit is revenue minus cost');
    await saved(); // saved as it is typed, long before time is up
    await pass(185); // the three minutes are up
    await screen.findByText('Exhibit 1: Occupancy by season');
    const stored = [...env.live.db.values()][0].state;
    expect(stored.submissions[0]).toMatchObject({ kind: 'framework', text: 'Profit is revenue minus cost', timedOut: true });
  });
});

describe('the whole case', () => {
  async function throughToTheEnd(env: FakeEnv, user: ReturnType<typeof userEvent.setup>) {
    reply(env, (kind) => ({ message: 'Good.', beat_complete: kind === 'exhibit' }));
    await user.click(screen.getByRole('button', { name: 'Ready for framework' }));
    await user.click(await screen.findByRole('button', { name: 'Ready to write' }));
    await user.type(await screen.findByLabelText('Your framework'), 'Demand, supply and cost');
    await user.click(screen.getByRole('button', { name: 'Hand in framework' }));
    await user.type(await screen.findByLabelText('Where would you start?'), 'Demand by season');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    await user.type(await screen.findByLabelText('Your thinking'), 'Off-peak is 40 percent, so I would check costs next');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    // the last exhibit is done, so the recommendation is next (this case has no brainstorm)
    await user.click(await screen.findByRole('button', { name: 'Ready to write' }));
    await user.type(await screen.findByLabelText('Your recommendation'), 'Do not open yet; test off-peak demand first.');
    await user.click(screen.getByRole('button', { name: 'Hand in recommendation' }));
  }

  it('finishes with feedback grounded in what was written, and fills in the case log by itself', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await throughToTheEnd(env, user);

    await screen.findByRole('heading', { name: 'Army Hotel' });
    expect(await screen.findByText('You found the main issue and kept going.')).toBeInTheDocument();
    expect(screen.getByText(/You wrote: “Demand, supply and cost”/)).toBeInTheDocument();
    expect(await screen.findByText(/Saved to your case log/)).toBeInTheDocument();

    const { cases } = await env.repo.loadAll();
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      title: 'Army Hotel',
      partner: 'Bucket (AI coach)',
      overall: 3,
      wentWell: 'A clear structure.',
      improvementArea: 'quant',
    });
    expect(cases[0].libraryId).toBe('00000000-0000-4000-8000-000000000001');
    expect(cases[0].skills.framework).toMatchObject({ rating: 4, feedback: 'Clear buckets.' });
    expect(cases[0].skills.behavioral1.rating).toBeNull();
    expect(cases[0].otherNotes).toContain('drafted by the AI');
  });

  it('logs the case only once, even if the page is opened again', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await throughToTheEnd(env, user);
    await screen.findByText(/Saved to your case log/);
    expect((await env.repo.loadAll()).cases).toHaveLength(1);
    // Opening it again does not log it again.
    const again = render(<App backend={env.backend} />);
    await within(again.container).findAllByText(/Saved to your case log/);
    expect((await env.repo.loadAll()).cases).toHaveLength(1);
  });

  it('lets the member start another case after one is finished', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await throughToTheEnd(env, user);
    await user.click(await screen.findByRole('button', { name: 'Practise another case' }));
    expect(await screen.findByRole('heading', { name: 'Practise a case with Bucket' })).toBeInTheDocument();
  });
});

describe('refreshing and failing', () => {
  it('comes back to the running case with its time, conversation and draft', async () => {
    const env = createFakeEnv();
    reply(env, () => ({ message: 'Two large chains compete.' }));
    const user = await startCase(env);
    await user.type(screen.getByLabelText('Ask a clarifying question'), 'Who are the competitors?');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    await screen.findByText('Two large chains compete.');
    await user.type(screen.getByLabelText('Ask a clarifying question'), 'And what about prices');
    await saved(); // the draft is saved
    await pass(40);

    // a page refresh: everything on screen is forgotten, the case is not
    document.body.innerHTML = '';
    const again = render(<App backend={env.backend} />);
    await within(again.container).findByText('Two large chains compete.');
    expect(within(again.container).getByLabelText('Ask a clarifying question')).toHaveValue('And what about prices');
    const left = within(again.container).getByRole('timer', { name: 'Time left in the case' }).textContent!;
    expect(left).toBe('34:20'); // the 40 seconds that passed are gone: the clock kept running instead of starting again
  });

  it('says so when Bucket cannot reply, and keeps what was written', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    env.live.control.reply = () => {
      throw new Error('boom');
    };
    await user.type(screen.getByLabelText('Ask a clarifying question'), 'Who pays?');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bucket could not reply just now');
    expect(await screen.findByText('Who pays?')).toBeInTheDocument(); // still in the conversation
  });
});
