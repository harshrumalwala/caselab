import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const day = (i: number) => `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`;
const withNotes = (n: number) => Array.from({ length: n }, (_, i) => makeCase({ date: day(i), title: `Case ${i}`, overallFeedback: `Feedback ${i}` }));

async function envWith(cases: ReturnType<typeof makeCase>[]): Promise<FakeEnv> {
  const env = createFakeEnv();
  for (const c of cases) await env.repo.insertCase(c);
  return env;
}

async function openImprove(env: FakeEnv) {
  window.location.hash = '#/improve';
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Improvement Areas' });
  return { user, card: within(await screen.findByRole('region', { name: 'Bucket' })) };
}

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

describe('Bucket, the coach', () => {
  it('leads with what you get, says in one line that it is private and what it uses, and does nothing until you ask', async () => {
    const env = await envWith(withNotes(5));
    const { card } = await openImprove(env);
    expect(card.getByText(/Sorts the feedback you've written into what you're good at and what to fix next/)).toBeInTheDocument();
    expect(card.getByText(/Private to you\. Bucket uses only the feedback and notes you wrote, never titles or partner names, and only when you ask/)).toBeInTheDocument();
    // It is Bucket, tagged AI, and does not name the technology behind it.
    expect(card.getByRole('heading', { name: 'Bucket' })).toBeInTheDocument();
    expect(card.getByText('AI')).toBeInTheDocument();
    expect(card.queryByText(/Claude|Anthropic/)).not.toBeInTheDocument();
    expect(env.insights.calls).toEqual([]);
  });

  it('needs written feedback on a few cases first, and says how many you have', async () => {
    const env = await envWith([...withNotes(2), makeCase({ date: day(9) }), makeCase({ date: day(10) })]);
    const { card } = await openImprove(env);
    expect(card.getByText(/at least 3 cases/)).toHaveTextContent('You have 2 so far');
    expect(card.getByRole('button', { name: 'Bucket my feedback' })).toBeDisabled();
  });

  it('reads on a click and shows the summary, where you are strong, and what to work on with the skill and a next step', async () => {
    const env = await envWith(withNotes(5));
    const { user, card } = await openImprove(env);
    await user.click(card.getByRole('button', { name: 'Bucket my feedback' }));
    expect(await card.findByText('You structure well but rush the maths.')).toBeInTheDocument();
    const strong = within(card.getByRole('region', { name: 'Where you are strong' }));
    expect(strong.getByText('Clear structure')).toBeInTheDocument();
    const work = within(card.getByRole('region', { name: 'What to work on' }));
    expect(work.getByText('Quant under pressure')).toBeInTheDocument();
    expect(work.getByText('Quant / Math')).toBeInTheDocument(); // the skill it belongs to
    expect(work.getByText(/Do two timed mental-maths drills/)).toBeInTheDocument();
    expect(card.getByText(/Updated .* from 5 cases \(most recent\)/)).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Re-bucket my feedback' })).toBeEnabled();
  });

  it('reads whichever set of cases you chose: the latest ten or all of them', async () => {
    const env = await envWith(withNotes(12));
    const { user, card } = await openImprove(env);
    expect(card.getByRole('radio', { name: 'Last 10 cases' })).toHaveAttribute('aria-checked', 'true');
    await user.click(card.getByRole('radio', { name: 'All cases (latest 30)' }));
    await user.click(card.getByRole('button', { name: 'Bucket my feedback' }));
    await card.findByText('You structure well but rush the maths.');
    expect(env.insights.calls).toEqual(['all']);
  });

  it('shows your last read when you come back, without asking for another, and notes cases changed since', async () => {
    const env = await envWith([...withNotes(4), makeCase({ date: day(20), overallFeedback: 'A later one', updatedAt: '2099-01-01T00:00:00.000Z' })]);
    await env.insights.analyze('all'); // an earlier read, already stored
    env.insights.calls.length = 0;
    const { card } = await openImprove(env);
    expect(await card.findByText('You structure well but rush the maths.')).toBeInTheDocument();
    expect(card.getByRole('radio', { name: 'All cases (latest 30)' })).toHaveAttribute('aria-checked', 'true'); // the scope it covered
    expect(card.getByText(/logged or changed cases since: ask again to include them/)).toBeInTheDocument();
    expect(env.insights.calls).toEqual([]);
  });

  it('explains each way a read can not happen, and keeps the earlier read on screen', async () => {
    const env = await envWith(withNotes(5));
    const { user, card } = await openImprove(env);
    await user.click(card.getByRole('button', { name: 'Bucket my feedback' }));
    await card.findByText('You structure well but rush the maths.');

    const tries: [unknown, RegExp][] = [
      [{ status: 'too_soon', retryInSeconds: 200 }, /Bucket just sorted your notes\. Try again in 4 minutes/],
      [{ status: 'failed' }, /Bucket couldn't sort that just now\. Nothing was changed/],
      [{ status: 'unavailable' }, /Bucket isn't available yet/],
      [{ status: 'not_enough', caseCount: 1, needed: 3 }, /Bucket needs written feedback on at least 3 cases, and only 1 has any yet/],
    ];
    for (const [next, message] of tries) {
      env.insights.state.next = next as never;
      await user.click(card.getByRole('button', { name: 'Re-bucket my feedback' }));
      expect(await card.findByText(message)).toBeInTheDocument();
      expect(card.getByText('You structure well but rush the maths.')).toBeInTheDocument();
    }
  });

  it('says so when the coach could not be reached', async () => {
    const env = await envWith(withNotes(5));
    const { user, card } = await openImprove(env);
    env.insights.state.failing = true;
    await user.click(card.getByRole('button', { name: 'Bucket my feedback' }));
    expect(await card.findByText(/Couldn't reach Bucket/)).toBeInTheDocument();
    await waitFor(() => expect(card.getByRole('button', { name: 'Bucket my feedback' })).toBeEnabled());
  });

  it('is not shown with no cases, nor for sample data in demo mode', async () => {
    window.location.hash = '#/improve';
    render(<App backend={(await envWith([])).backend} />);
    await screen.findByRole('heading', { name: 'Improvement Areas' });
    expect(screen.queryByRole('region', { name: 'Bucket' })).not.toBeInTheDocument();
  });

  it('is not shown in demo mode, where there is no account to read from or store to', async () => {
    const env = createFakeEnv();
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('button', { name: /Explore with demo data/ }));
    await screen.findByRole('region', { name: 'Your week' });
    window.location.hash = '#/improve';
    await screen.findByRole('heading', { name: 'Improvement Areas' });
    expect(screen.queryByRole('region', { name: 'Bucket' })).not.toBeInTheDocument();
    expect(env.insights.calls).toEqual([]);
  });
});
