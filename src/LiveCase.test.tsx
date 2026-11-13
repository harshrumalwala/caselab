import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

/** A long wait in one step (a break of hours), where `pass` would tick through it second by second. */
const skip = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

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

describe('finding the live case', () => {
  it('has a tab of its own in the navigation, right after the Dashboard, with Bucket for its icon', async () => {
    const env = createFakeEnv();
    window.location.hash = '#/dashboard';
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    const links = screen.getAllByRole('link', { name: 'Live Case' }); // the top bar and the phone bar
    expect(links.length).toBeGreaterThan(0);
    const order = within(screen.getAllByRole('navigation', { name: 'Primary' })[0]).getAllByRole('link').map((l) => l.getAttribute('aria-label'));
    expect(order.slice(0, 2)).toEqual(['Dashboard', 'Live Case']);
    expect(links.every((l) => l.getAttribute('aria-current') !== 'page')).toBe(true);
  });

  it('is the first thing on the Dashboard: a banner that opens the live case, whose tab then shows as current', async () => {
    const env = createFakeEnv();
    window.location.hash = '#/dashboard';
    const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
    render(<App backend={env.backend} />);
    const banner = await screen.findByRole('region', { name: 'Practise a whole case with Bucket' });
    expect(within(banner).getByText('35 minutes, typed')).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: /Start a live case/ }));
    await screen.findByRole('heading', { name: 'Practise a case with Bucket' });
    expect(screen.getAllByRole('link', { name: 'Live Case' }).some((l) => l.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('is not offered in demo mode, which has no account to run it on', async () => {
    const env = createFakeEnv();
    window.location.hash = '#/dashboard';
    const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
    render(<App backend={env.backend} />);
    await screen.findByRole('region', { name: 'Practise a whole case with Bucket' });
    await user.click(screen.getByRole('button', { name: 'Explore with demo data' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Practise a whole case with Bucket' })).not.toBeInTheDocument());
  });
});

describe('starting a live case', () => {
  it('is reached from Improvement Areas, explains the clock, and lists the lanes of cases that can be practised', async () => {
    const env = createFakeEnv();
    window.location.hash = '#/improve';
    const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('button', { name: 'Start a live case' }));
    await screen.findByRole('heading', { name: 'Practise a case with Bucket' });
    expect(screen.getByText(/The clock is 35 minutes/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Market Entry/ })).toBeInTheDocument(); // the lanes, not a list of every case
    expect(screen.getAllByRole('link', { name: 'Live Case' }).some((l) => l.getAttribute('aria-current') === 'page')).toBe(true); // it has its own tab now
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

describe('picking a case', () => {
  it('shows the lanes first, by case type or by industry, and a case only after a lane is chosen', async () => {
    const env = createFakeEnv();
    const user = await openLive(env);
    expect(await screen.findByRole('tab', { name: 'By case type', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Army Hotel/ })).not.toBeInTheDocument(); // not listed until a lane is chosen
    const lane = await screen.findByRole('button', { name: /Market Entry/ });
    expect(lane).toHaveTextContent('1 case');

    await user.click(lane);
    expect(await screen.findByRole('button', { name: /Army Hotel/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /All lanes/ }));
    expect(screen.queryByRole('button', { name: /Army Hotel/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'By industry' }));
    await user.click(await screen.findByRole('button', { name: /Travel \/ Hospitality/ }));
    await user.click(await screen.findByRole('button', { name: /Army Hotel/ }));
    await screen.findByText(/Should a hotel chain open a new property/);
  });

  it('searches across every lane, and says so when nothing matches', async () => {
    const env = createFakeEnv();
    const user = await openLive(env);
    await user.type(await screen.findByLabelText('Search cases'), 'army');
    expect(await screen.findByRole('button', { name: /Army Hotel/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search cases'));
    await user.type(screen.getByLabelText('Search cases'), 'zzzz');
    expect(await screen.findByText(/No case matches that/)).toBeInTheDocument();
  });

  it('starts a random case from the chosen lane', async () => {
    const env = createFakeEnv();
    const user = await openLive(env);
    await user.click(await screen.findByRole('button', { name: /Market Entry/ }));
    await user.click(await screen.findByRole('button', { name: /Surprise me in Market Entry/ }));
    await screen.findByText(/Should a hotel chain open a new property/);
  });

  it('has Bucket guiding from the first screen to the last', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    expect(screen.getByText(/I'm Bucket, your interviewer|Welcome in|Ask me anything/)).toBeInTheDocument(); // Bucket at the prompt
    await user.click(screen.getByRole('button', { name: 'Ready for framework' }));
    expect(await screen.findByText(/thinking time|Take your time with the structure/)).toBeInTheDocument(); // and while thinking
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

  it('logs the case only once, and opening the tab afterwards starts afresh instead of showing the last case', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await throughToTheEnd(env, user);
    await screen.findByText(/Saved to your case log/);
    expect((await env.repo.loadAll()).cases).toHaveLength(1);
    // Opening it again does not log it again, and does not bring back the finished case: it is in the log.
    cleanup();
    render(<App backend={env.backend} />);
    expect(await screen.findByRole('heading', { name: 'Practise a case with Bucket' })).toBeInTheDocument();
    expect(screen.queryByText(/Saved to your case log/)).not.toBeInTheDocument();
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

describe('the two modes', () => {
  const pickMode = (user: ReturnType<typeof userEvent.setup>, name: RegExp) => user.click(screen.getByRole('radio', { name }));

  it('starts in practice mode, where the case can be paused and ended', async () => {
    const env = createFakeEnv();
    const user = await openLive(env);
    expect(screen.getByRole('radio', { name: /Practice mode/ })).toBeChecked();
    await user.click(await screen.findByRole('button', { name: /Surprise me/ }));
    await screen.findByText(/Should a hotel chain open a new property/);
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End case' })).toBeInTheDocument();
  });

  it('has no pause and no end in interview mode, where the clock keeps running', async () => {
    const env = createFakeEnv();
    const user = await openLive(env);
    await pickMode(user, /Interview mode/);
    expect(screen.getByRole('radio', { name: /Interview mode/ })).toBeChecked();
    await user.click(await screen.findByRole('button', { name: /Surprise me/ }));
    await screen.findByText(/Should a hotel chain open a new property/);
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End case' })).not.toBeInTheDocument();
    expect(screen.getByText(/Interview mode: the clock does not stop/)).toBeInTheDocument();
    expect([...env.live.db.values()][0].state.mode).toBe('interview');
  });

  it('is enforced by the server too: interview mode refuses a pause or an early end', async () => {
    const env = createFakeEnv();
    const user = await openLive(env);
    await pickMode(user, /Interview mode/);
    await user.click(await screen.findByRole('button', { name: /Surprise me/ }));
    await screen.findByText(/Should a hotel chain open a new property/);
    const id = [...env.live.db.values()][0].id;
    await expect(env.live.pause(id)).rejects.toThrow(/Interview mode has no pause/);
    await expect(env.live.end(id)).rejects.toThrow(/no early end/);
  });
});

describe('pausing and ending', () => {
  it('pauses: the clock stands still and the work is hidden, and continuing gives back the time that was left', async () => {
    const env = createFakeEnv();
    await startCase(env);
    const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
    await pass(30);
    expect(screen.getByRole('timer', { name: 'Time left in the case' })).toHaveTextContent('34:30');
    await user.click(screen.getByRole('button', { name: /Pause/ }));
    await screen.findByText(/Paused\. The clock is stopped/);
    expect(screen.queryByText(/Should a hotel chain open a new property/)).not.toBeInTheDocument(); // no studying during a break
    const frozen = screen.getByRole('timer', { name: 'Time left in the case' }).textContent;
    await skip(600_000); // a ten-minute break
    expect(screen.getByRole('timer', { name: 'Time left in the case' })).toHaveTextContent(frozen!);

    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByText(/Should a hotel chain open a new property/);
    expect(screen.getByRole('timer', { name: 'Time left in the case' })).toHaveTextContent('34:30'); // not a second lost to the break
    await pass(10);
    expect(screen.getByRole('timer', { name: 'Time left in the case' })).toHaveTextContent('34:20');
  });

  it('is still paused after the page is opened again, and nothing runs out meanwhile', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await user.click(screen.getByRole('button', { name: /Pause/ }));
    await screen.findByText(/Paused\. The clock is stopped/);
    await skip(3 * 3600_000);
    cleanup();
    render(<App backend={env.backend} />);
    expect(await screen.findByText(/Paused\. The clock is stopped/)).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Time left in the case' })).toHaveTextContent('35:00');
  });

  it('ends a case that nothing was written in without asking for feedback or logging it', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await user.click(screen.getByRole('button', { name: 'End case' }));
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }));
    expect(await screen.findByText('You ended the case')).toBeInTheDocument();
    expect(await screen.findByText(/Nothing was written, so there is nothing to log/)).toBeInTheDocument();
    expect(env.live.asked).toHaveLength(0); // no model call for nothing
    expect((await env.repo.loadAll()).cases).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Practise another case' }));
    expect(await screen.findByRole('heading', { name: 'Practise a case with Bucket' })).toBeInTheDocument();
  });

  it('ends a case that was started: feedback on what was written, and it is logged as ended early', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    reply(env, () => ({ message: 'Good question.' }));
    await user.type(screen.getByLabelText('Ask a clarifying question'), 'Who pays for the rooms?');
    await user.click(screen.getByRole('button', { name: /Send/ }));
    await screen.findByText('Good question.');
    await user.click(screen.getByRole('button', { name: 'End case' }));
    await user.click(screen.getByRole('button', { name: 'Keep going' })); // the question is asked first
    expect(screen.getByRole('button', { name: 'End case' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End case' }));
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }));
    expect(await screen.findByText('You ended the case')).toBeInTheDocument();
    expect(await screen.findByText('You found the main issue and kept going.')).toBeInTheDocument();
    expect(await screen.findByText(/Saved to your case log/)).toBeInTheDocument();
    const { cases } = await env.repo.loadAll();
    expect(cases[0].otherNotes).toContain('Ended early, by choice.');
  });

  it('can be ended from the pause screen', async () => {
    const env = createFakeEnv();
    const user = await startCase(env);
    await user.click(screen.getByRole('button', { name: /Pause/ }));
    await screen.findByText(/Paused\. The clock is stopped/);
    await user.click(screen.getByRole('button', { name: 'End case' }));
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }));
    expect(await screen.findByText('You ended the case')).toBeInTheDocument();
  });
});

describe('Improvement Areas under My Case Log', () => {
  it('has no tab of its own: it is the second view of My Case Log, which stays the current tab', async () => {
    const env = createFakeEnv();
    window.location.hash = '#/improve';
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Improvement Areas' });
    const top = screen.getAllByRole('navigation', { name: 'Primary' });
    for (const nav of top) expect(within(nav).queryByRole('link', { name: 'Improvement Areas' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'My Case Log' }).every((l) => l.getAttribute('aria-current') === 'page')).toBe(true);
    const views = screen.getByRole('navigation', { name: 'Case log sections' });
    expect(within(views).getByRole('link', { name: 'Improvement Areas' })).toHaveAttribute('aria-current', 'page');
    expect(within(views).getByRole('link', { name: 'Cases' })).toHaveAttribute('href', '#/log');
  });

  it('is one click from the case log, and back', async () => {
    const env = createFakeEnv();
    window.location.hash = '#/log';
    const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'My Case Log' });
    await user.click(within(screen.getByRole('navigation', { name: 'Case log sections' })).getByRole('link', { name: 'Improvement Areas' }));
    await screen.findByRole('heading', { name: 'Improvement Areas' });
    await user.click(within(screen.getByRole('navigation', { name: 'Case log sections' })).getByRole('link', { name: 'Cases' }));
    await screen.findByRole('heading', { name: 'My Case Log' });
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
