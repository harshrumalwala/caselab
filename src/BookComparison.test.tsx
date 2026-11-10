import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv, SAMPLE_LIBRARY, TEST_USER, type FakeEnv } from './test/fakeBackend';

const HOTEL = SAMPLE_LIBRARY[0];

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

async function openCase(title: string, env: FakeEnv) {
  window.location.hash = '#/log';
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'My Case Log' });
  await user.click((await screen.findAllByText(title))[0]);
  const drawer = within(await screen.findByRole('dialog', { name: title }));
  return { user, drawer };
}

async function envWith(over: Parameters<typeof makeCase>[0]) {
  const env = createFakeEnv();
  await env.repo.insertCase(makeCase({ date: '2026-09-01', ...over }));
  return env;
}

describe('compare with the book', () => {
  it('is offered on a case linked to a casebook case that has your feedback, and does nothing until you ask', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id, overallFeedback: 'Good structure, rushed the maths.' });
    const { drawer } = await openCase('Army Hotel', env);
    const section = within(drawer.getByRole('region', { name: 'Compare with the book' }));
    expect(section.getByRole('button', { name: 'Compare with the book' })).toBeEnabled();
    expect(section.getByText(/Private to you/)).toBeInTheDocument();
    expect(env.insights.comparisons).toEqual([]);
  });

  it('shows what you covered, what a strong answer also covers and one thing to try, and keeps it', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id, overallFeedback: 'Good structure, rushed the maths.' });
    const { user, drawer } = await openCase('Army Hotel', env);
    const section = within(drawer.getByRole('region', { name: 'Compare with the book' }));
    await user.click(section.getByRole('button', { name: 'Compare with the book' }));
    expect(await section.findByText('You got the structure right but missed the break-even check.')).toBeInTheDocument();
    expect(section.getByText('A clear, MECE structure')).toBeInTheDocument();
    expect(section.getByText('Checking the break-even point before recommending')).toBeInTheDocument();
    expect(section.getByText(/Say the break-even number out loud/)).toBeInTheDocument();
    expect(env.insights.comparisons).toEqual([expect.any(String)]);
    expect(section.getByRole('button', { name: 'Compare again' })).toBeEnabled();
  });

  it('shows a stored comparison straight away, without asking again', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id, overallFeedback: 'Good structure.' });
    const [c] = (await env.repo.loadAll()).cases;
    await env.insights.compareCase(c.id);
    env.insights.comparisons.length = 0;
    const { drawer } = await openCase('Army Hotel', env);
    expect(await drawer.findByText('You got the structure right but missed the break-even check.')).toBeInTheDocument();
    expect(env.insights.comparisons).toEqual([]);
  });

  it('is not shown for a case with no link, no writing, or in demo mode', async () => {
    const unlinked = await envWith({ title: 'My own case', overallFeedback: 'Notes' });
    const a = await openCase('My own case', unlinked);
    expect(a.drawer.queryByRole('region', { name: 'Compare with the book' })).not.toBeInTheDocument();
  });

  it('is not shown for a linked case with nothing written', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
    const { drawer } = await openCase('Army Hotel', env);
    expect(drawer.queryByRole('region', { name: 'Compare with the book' })).not.toBeInTheDocument();
  });

  it('says plainly when the casebook case has not been read yet, or it was just compared, or it fails', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id, overallFeedback: 'Good structure.' });
    const { user, drawer } = await openCase('Army Hotel', env);
    const section = within(drawer.getByRole('region', { name: 'Compare with the book' }));
    env.insights.state.nextComparison = { status: 'no_notes' };
    await user.click(section.getByRole('button', { name: 'Compare with the book' }));
    expect(await section.findByText(/hasn't read this casebook case yet/)).toBeInTheDocument();
    env.insights.state.nextComparison = { status: 'too_soon', retryInSeconds: 100 };
    await user.click(section.getByRole('button', { name: 'Compare with the book' }));
    expect(await section.findByText(/Try again in 2 minutes/)).toBeInTheDocument();
    env.insights.state.nextComparison = null;
    env.insights.state.failing = true;
    await user.click(section.getByRole('button', { name: 'Compare with the book' }));
    expect(await section.findByText(/Couldn't reach Bucket/)).toBeInTheDocument();
    await waitFor(() => expect(section.getByRole('button', { name: 'Compare with the book' })).toBeEnabled());
  });
});
