import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createQuestionStream, createRng, ROUND_SECONDS, type Question } from './domain/warmup';
import { Warmup } from './features/warmup/Warmup';
import { WARMUP_KEY } from './state/storageKeys';
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

function setup(seed = SEED) {
  const user = userEvent.setup();
  render(<Warmup seed={seed} />);
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  const start = () => user.click(screen.getByRole('button', { name: 'Start the sprint' }));
  const answerBox = () => screen.getByLabelText(/Your answer/);
  const submit = async (text: string) => {
    await user.clear(answerBox());
    if (text) await user.type(answerBox(), text);
    await user.click(screen.getByRole('button', { name: 'Check' }));
  };
  const stat = (label: string) => screen.getByText(label).closest('div.sticker')!.querySelector('p:last-child')!.textContent;
  return { user, tick, start, answerBox, submit, stat };
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

  it('after a miss, shows the answer and the quick way, breaks the streak, and waits for you', async () => {
    const next = questions();
    const { start, submit, stat, tick, user } = setup();
    await start();
    await submit(typeOf(next()));
    const second = next();
    await submit(WRONG);

    expect(screen.getByText(`The answer was ${second.display}.`)).toBeInTheDocument();
    expect(screen.getByText(/Here’s the quick way:/)).toBeInTheDocument();
    expect(screen.getByText(second.tip, { exact: false })).toBeInTheDocument();
    expect(stat('Streak')).toBe('0');
    expect(stat('Score')).toBe('12');
    expect(screen.queryByLabelText(/Your answer/)).not.toBeInTheDocument();

    // The clock does not run while you read the tip.
    const before = screen.getByRole('timer').textContent;
    tick(15_000);
    expect(screen.getByRole('timer')).toHaveTextContent(before!);

    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText(next().prompt)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your answer/)).toHaveFocus();
  });

  it('counts a skip as a miss and shows how to do it', async () => {
    const { start, user, stat } = setup();
    await start();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText(/Here’s the quick way:/)).toBeInTheDocument();
    expect(stat('Streak')).toBe('0');
  });

  it('asks you to type a number rather than counting text as a miss', async () => {
    const next = questions();
    const { start, submit, stat } = setup();
    await start();
    await submit('about thirty');
    expect(screen.getByRole('alert')).toHaveTextContent(/Type a number/);
    expect(screen.getByText(next().prompt)).toBeInTheDocument();
    expect(screen.queryByText(/Here’s the quick way:/)).not.toBeInTheDocument();
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

  it('is not part of the public site for visitors who are not signed in', async () => {
    window.location.hash = '#/warmup';
    render(<App backend={createFakeEnv({ signedIn: false }).backend} />);
    expect(await screen.findByRole('heading', { name: /Case smarter/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Warm-up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Warm-up' })).not.toBeInTheDocument();
  });
});
