import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createQuestionStream, createRng, ROUND_SECONDS, type Question } from './domain/warmup';
import { Warmup } from './features/warmup/Warmup';
import { createMemoryWarmup } from './data/warmupBest';
import { WARMUP_KEY, warmupKeyFor } from './state/storageKeys';
import { WarmupSyncContext, type WarmupSync } from './state/warmupSync';
import { createFakeEnv } from './test/fakeBackend';

const SEED = 7;

/** The questions the screen will ask in its first round, if you answer every one right (the first round adds 1 to the seed). */
function questions(seed = SEED) {
  const stream = createQuestionStream(createRng(seed + 1));
  let correct = 0;
  return () => stream.next(correct++);
}

const typeOf = (q: Question) => String(q.answer / q.scale);
const WRONG = '123456789';

beforeEach(() => {
  // Only the clock the screen uses. Faking setTimeout too would stall Testing Library's own waiting.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  window.location.hash = '';
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(seed = SEED, sync: WarmupSync | null = null) {
  const user = userEvent.setup();
  const view = render(
    <WarmupSyncContext.Provider value={sync}>
      <Warmup seed={seed} />
    </WarmupSyncContext.Provider>,
  );
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  const start = () => user.click(screen.getByRole('button', { name: 'Start the sprint' }));
  const answerBox = () => screen.getByLabelText(/Your answer/);
  const submit = async (text: string) => {
    await user.clear(answerBox());
    if (text) await user.type(answerBox(), text);
    await user.click(screen.getByRole('button', { name: 'Check' }));
  };
  const stat = (label: string) => screen.getByText(label).closest('div.sticker')!.querySelector('p:last-child')!.textContent;
  return { user, view, tick, start, answerBox, submit, stat };
}

describe('Warm-up: before you start', () => {
  it('explains the sprint, says it is optional and local, and starts with no best', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Warm-up' })).toBeInTheDocument();
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
    expect(screen.getByText(/within 5% counts/)).toBeInTheDocument();
    expect(screen.getByText(/kept on this device only/)).toBeInTheDocument();
    expect(screen.getByText('No best yet. Yours to set.')).toBeInTheDocument();
  });

  it('shows the best you set earlier, read from this device', () => {
    window.localStorage.setItem(WARMUP_KEY, JSON.stringify({ score: 142, streak: 9 }));
    setup();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.queryByText('No best yet. Yours to set.')).not.toBeInTheDocument();
  });

  it('ignores a damaged record instead of breaking', () => {
    window.localStorage.setItem(WARMUP_KEY, '{not json');
    setup();
    expect(screen.getByText('No best yet. Yours to set.')).toBeInTheDocument();
  });
});

describe('Warm-up: playing', () => {
  it('asks a question with 60 seconds on the clock, a score of 0 and no streak', async () => {
    const { start, stat, answerBox } = setup();
    await start();
    expect(screen.getByText(questions()().prompt)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent(`${ROUND_SECONDS}s`);
    expect(stat('Score')).toBe('0');
    expect(stat('Streak')).toBe('0');
    expect(answerBox()).toHaveFocus();
  });

  it('scores a right answer, builds the streak and moves to the next question', async () => {
    const next = questions();
    const { start, submit, stat } = setup();
    await start();
    const first = next();
    await submit(typeOf(first));
    expect(stat('Score')).toBe('12');
    expect(stat('Streak')).toBe('1');
    expect(screen.getByRole('status')).toHaveTextContent('+12 points');

    const second = next();
    expect(screen.getByText(second.prompt)).toBeInTheDocument();
    await submit(typeOf(second));
    expect(stat('Score')).toBe('26');
    expect(stat('Streak')).toBe('2');
  });

  it('accepts an estimate within 5% and rejects one outside it', async () => {
    const next = questions();
    const { start, submit, stat } = setup();
    await start();
    const first = next();
    await submit(String((first.answer / first.scale) * 1.04));
    expect(stat('Streak')).toBe('1');
    const second = next();
    await submit(String((second.answer / second.scale) * 1.2));
    expect(stat('Streak')).toBe('0');
  });

  it('after a miss, breaks the streak and moves straight on: no tip, no pause, the clock keeps running', async () => {
    const next = questions();
    const { start, submit, stat, tick } = setup();
    await start();
    await submit(typeOf(next()));
    const second = next();
    await submit(WRONG);

    expect(screen.getByRole('status')).toHaveTextContent('Missed. On to the next.');
    expect(stat('Streak')).toBe('0');
    expect(stat('Score')).toBe('12');
    // The next question is already up, and nothing about the one you missed is shown mid-round.
    expect(screen.getByText(next().prompt)).toBeInTheDocument();
    expect(screen.queryByText(second.tip, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(/Quick way/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next question' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Your answer/)).toHaveFocus();

    const before = Number(screen.getByRole('timer').textContent!.replace('s', ''));
    tick(5_000);
    expect(screen.getByRole('timer')).toHaveTextContent(`${before - 5}s`);
  });

  it('counts a skip as a miss and moves on', async () => {
    const next = questions();
    const { start, user, stat } = setup();
    await start();
    next();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByRole('status')).toHaveTextContent('Skipped. On to the next.');
    expect(screen.getByText(next().prompt)).toBeInTheDocument();
    expect(stat('Streak')).toBe('0');
  });

  it('asks you to type a number rather than counting text as a miss', async () => {
    const next = questions();
    const { start, submit, stat } = setup();
    await start();
    await submit('about thirty');
    expect(screen.getByRole('alert')).toHaveTextContent(/Type a number/);
    expect(screen.getByText(next().prompt)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toHaveTextContent('');
    expect(stat('Streak')).toBe('0');
  });

  it('counts the seconds down while you think', async () => {
    const { start, tick } = setup();
    await start();
    tick(10_000);
    expect(screen.getByRole('timer')).toHaveTextContent('50s');
  });
});

describe('Warm-up: the end of a round', () => {
  async function playRound(correct: number, setupArgs?: ReturnType<typeof setup>, nextQ = questions()) {
    const s = setupArgs ?? setup();
    await s.start();
    for (let i = 0; i < correct; i++) await s.submit(typeOf(nextQ()));
    s.tick(ROUND_SECONDS * 1000);
    return s;
  }

  it('shows the score, a line to smile at, and saves a new best on this device', async () => {
    await playRound(3);
    expect(screen.getByRole('heading', { name: /42 points/ })).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '3 right, 0 missed, longest streak 3.')).toBeInTheDocument();
    expect(screen.getByText('New best!')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(WARMUP_KEY)!)).toEqual({ score: 42, streak: 3 });
    expect(screen.getByText(/Best so far:/)).toHaveTextContent('42 points, streak of 3');
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute('href', '#/dashboard');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('reviews every miss and skip at the end, with what you said, the answer and the quick way', async () => {
    const next = questions();
    const s = setup();
    await s.start();
    await s.submit(typeOf(next())); // right
    const missed = next();
    await s.submit(WRONG); // wrong
    const skipped = next();
    await s.user.click(screen.getByRole('button', { name: 'Skip' }));
    s.tick(ROUND_SECONDS * 1000);

    expect(screen.getByRole('heading', { name: /Review your misses \(2\)/ })).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(missed.prompt);
    expect(items[0]).toHaveTextContent(`You said ${WRONG}.`);
    expect(items[0]).toHaveTextContent(`Answer: ${missed.display}.`);
    expect(items[0]).toHaveTextContent(`Quick way: ${missed.tip}`);
    expect(items[1]).toHaveTextContent(skipped.prompt);
    expect(items[1]).toHaveTextContent('You skipped it.');
    expect(items[1]).toHaveTextContent(`Answer: ${skipped.display}.`);
    expect(screen.queryByText(/clean sheet/)).not.toBeInTheDocument();
  });

  it('has nothing to review after a clean round, and the review is gone after going again', async () => {
    const s = await playRound(2);
    expect(screen.getByText(/clean sheet/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Review your misses/ })).not.toBeInTheDocument();

    await s.user.click(screen.getByRole('button', { name: 'Go again' }));
    await s.submit(WRONG);
    s.tick(ROUND_SECONDS * 1000);
    expect(screen.getByRole('heading', { name: /Review your misses \(1\)/ })).toBeInTheDocument();
    await s.user.click(screen.getByRole('button', { name: 'Go again' }));
    expect(screen.queryByRole('heading', { name: /Review your misses/ })).not.toBeInTheDocument();
  });

  it('has no review, and no clean sheet, when nothing was answered', async () => {
    await playRound(0);
    expect(screen.queryByRole('heading', { name: /Review your misses/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/clean sheet/)).not.toBeInTheDocument();
  });

  it('keeps an older, better record and does not say "new best"', async () => {
    window.localStorage.setItem(WARMUP_KEY, JSON.stringify({ score: 500, streak: 20 }));
    await playRound(2);
    expect(screen.queryByText('New best!')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(WARMUP_KEY)!)).toEqual({ score: 500, streak: 20 });
    expect(screen.getByText(/Best so far:/)).toHaveTextContent('500 points, streak of 20');
  });

  it('does not save a zero as a record', async () => {
    await playRound(0);
    expect(screen.getByRole('heading', { name: /0 points/ })).toBeInTheDocument();
    expect(screen.queryByText('New best!')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(WARMUP_KEY)).toBeNull();
  });

  it('lets you go again with a clean slate, and a new question', async () => {
    const s = await playRound(2);
    await s.user.click(screen.getByRole('button', { name: 'Go again' }));
    expect(screen.getByRole('timer')).toHaveTextContent(`${ROUND_SECONDS}s`);
    expect(s.stat('Score')).toBe('0');
    expect(s.stat('Streak')).toBe('0');
    expect(screen.getByLabelText(/Your answer/)).toBeInTheDocument();
  });

  it('keeps the best across a reload, but only on this device: nothing leaves the browser', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await playRound(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.keys(window.localStorage)).toEqual([WARMUP_KEY]);
  });
});

describe('Warm-up record on your account', () => {
  const ME = 'user-1';
  const account = (saved = { score: 0, streak: 0 }) => {
    const repository = createMemoryWarmup(saved);
    return { repository, sync: { repository, userId: ME } satisfies WarmupSync };
  };
  const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  const local = (key = warmupKeyFor(ME)) => JSON.parse(window.localStorage.getItem(key) ?? 'null');

  it('shows the record saved on your account, and keeps a copy on this device', async () => {
    const { sync } = account({ score: 142, streak: 9 });
    setup(SEED, sync);
    await flush();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(local()).toEqual({ score: 142, streak: 9 });
    expect(screen.getByText(/saved with your account/)).toBeInTheDocument();
    expect(screen.queryByText(/this device only/)).not.toBeInTheDocument();
  });

  it('saves a new best to your account when a round ends, and never lowers it afterwards', async () => {
    const { repository, sync } = account();
    const s = setup(SEED, sync);
    await flush();
    await s.start();
    const next = questions();
    for (let i = 0; i < 3; i++) await s.submit(typeOf(next()));
    s.tick(ROUND_SECONDS * 1000);
    await flush();
    expect(screen.getByText('New best!')).toBeInTheDocument();
    expect(repository.saved).toEqual({ score: 42, streak: 3 });
    expect(local()).toEqual({ score: 42, streak: 3 });

    // A weaker second round leaves the record where it was.
    await s.user.click(screen.getByRole('button', { name: 'Go again' }));
    s.tick(ROUND_SECONDS * 1000);
    await flush();
    expect(screen.queryByText('New best!')).not.toBeInTheDocument();
    expect(repository.saved).toEqual({ score: 42, streak: 3 });
  });

  it('sends up a better record this device already had, and takes the better of each', async () => {
    window.localStorage.setItem(warmupKeyFor(ME), JSON.stringify({ score: 300, streak: 4 }));
    const { repository, sync } = account({ score: 100, streak: 12 });
    setup(SEED, sync);
    await flush();
    expect(repository.saved).toEqual({ score: 300, streak: 12 });
    expect(screen.getByText(/Best:/)).toHaveTextContent('300 points, streak of 12');
  });

  it('moves a record from before accounts onto the first member who signs in, and not onto the next', async () => {
    window.localStorage.setItem(WARMUP_KEY, JSON.stringify({ score: 77, streak: 5 }));
    const first = account();
    const firstScreen = setup(SEED, first.sync);
    await flush();
    expect(first.repository.saved).toEqual({ score: 77, streak: 5 });
    expect(window.localStorage.getItem(WARMUP_KEY)).toBeNull();

    // Someone else signs in on the same browser: they start from their own record.
    firstScreen.view.unmount();
    const second = account();
    setup(SEED, { repository: second.repository, userId: 'user-2' });
    await flush();
    expect(screen.getByText('No best yet. Yours to set.')).toBeInTheDocument();
    expect(second.repository.saved).toEqual({ score: 0, streak: 0 });
  });

  it('keeps playing and keeps your record on this device when the account cannot be reached, then sends it up on the next visit', async () => {
    const { repository, sync } = account({ score: 50, streak: 2 });
    repository.failing = true;
    window.localStorage.setItem(warmupKeyFor(ME), JSON.stringify({ score: 50, streak: 2 }));
    const s = setup(SEED, sync);
    await flush();
    expect(screen.getByText('50')).toBeInTheDocument(); // from the copy on this device
    await s.start();
    const next = questions();
    for (let i = 0; i < 3; i++) await s.submit(typeOf(next()));
    s.tick(ROUND_SECONDS * 1000);
    await flush();
    expect(screen.getByRole('heading', { name: /42 points/ })).toBeInTheDocument();
    expect(repository.saved).toEqual({ score: 50, streak: 2 });
    expect(local()).toEqual({ score: 50, streak: 3 }); // streak of 3 beat the old 2, kept here

    // Back online, the next visit sends it up.
    s.view.unmount();
    repository.failing = false;
    setup(SEED, sync);
    await flush();
    expect(repository.saved).toEqual({ score: 50, streak: 3 });
  });
});

describe('Warm-up in the app', () => {
  // The app and its fake backend resolve with real promises; fake timers would stall them.
  beforeEach(() => vi.useRealTimers());

  it('is in the navigation for signed-in members and opens from #/warmup', async () => {
    window.location.hash = '#/warmup';
    render(<App backend={createFakeEnv().backend} />);
    expect(await screen.findByRole('heading', { name: 'Warm-up' })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Warm-up' }); // top bar and phone bar
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '#/warmup');
      expect(link).toHaveAttribute('aria-current', 'page');
    }
    expect(within(screen.getAllByRole('navigation', { name: 'Primary' })[0]).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it("loads the member's record from their account", async () => {
    const env = createFakeEnv();
    await env.warmup.record({ score: 88, streak: 6 });
    window.location.hash = '#/warmup';
    render(<App backend={env.backend} />);
    expect(await screen.findByText('88')).toBeInTheDocument();
  });

  it('leaves the account alone in demo mode: the record stays on this device', async () => {
    const env = createFakeEnv();
    const load = vi.spyOn(env.warmup, 'load');
    const record = vi.spyOn(env.warmup, 'record');
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    expect(await screen.findByText(/Demo mode\./)).toBeInTheDocument();
    window.location.hash = '#/warmup';
    expect(await screen.findByRole('heading', { name: 'Warm-up' })).toBeInTheDocument();
    expect(await screen.findByText('No best yet. Yours to set.')).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('is not part of the public site for visitors who are not signed in', async () => {
    window.location.hash = '#/warmup';
    render(<App backend={createFakeEnv({ signedIn: false }).backend} />);
    expect(await screen.findByRole('heading', { name: /Case smarter/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Warm-up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Warm-up' })).not.toBeInTheDocument();
  });
});
