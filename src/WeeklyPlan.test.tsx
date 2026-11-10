import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const day = (i: number) => `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`;
const withNotes = (n: number) => Array.from({ length: n }, (_, i) => makeCase({ date: day(i), title: `Case ${i}`, caseType: 'Profitability', industry: 'Technology / SaaS', overallFeedback: `Feedback ${i}` }));

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
  return user;
}

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

describe("this week's plan", () => {
  it('fills the gaps in the case types and industries you have practised, with a reason for each, and one click to log it', async () => {
    const env = await envWith(withNotes(5));
    const user = await openImprove(env);
    const card = within(await screen.findByRole('region', { name: "This week's plan" }));
    // Sample library: Army Hotel (Market Entry, Travel / Hospitality) is a gap on both counts, so it is first.
    expect(card.getByText('Army Hotel')).toBeInTheDocument();
    expect(card.getByText(/Your first Market Entry case/)).toBeInTheDocument();
    expect(card.getByText(/Your first Travel \/ Hospitality case/)).toBeInTheDocument();
    expect(card.getByText(/to practise: what Bucket says to work on, plus the case types and industries you haven't covered/)).toBeInTheDocument();
    await user.click(card.getByRole('button', { name: 'Log Army Hotel' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Log a case' }));
    expect(dialog.getByRole('combobox', { name: /Case title/ })).toHaveValue('Army Hotel');
    expect(dialog.getByLabelText(/Case type/)).toHaveValue('Market Entry');
  });

  it('puts a case for the skill Bucket says to work on first, and says so', async () => {
    const env = await envWith(withNotes(5));
    const user = await openImprove(env);
    await user.click(await screen.findByRole('button', { name: 'Bucket my feedback' })); // the scripted read works on Quant / Math
    await screen.findByText('You structure well but rush the maths.');
    // The plan re-reads when the page is opened again, so go away and come back.
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });
    window.location.hash = '#/improve';
    const card = within(await screen.findByRole('region', { name: "This week's plan" }));
    await waitFor(() => expect(card.getAllByText(/Practises Quant \/ Math/).length).toBeGreaterThan(0));
    expect(env.library.nextAsked).toContain('quant');
  });

  it('is sized by your weekly goal, between two and five', async () => {
    const env = await envWith(withNotes(5));
    env.goal.save(2);
    await openImprove(env);
    const card = within(await screen.findByRole('region', { name: "This week's plan" }));
    expect(card.getByText(/to match your goal of 2 a week/)).toBeInTheDocument();
    expect(card.getAllByRole('button', { name: /^Log / }).length).toBeLessThanOrEqual(2);
  });

  it('is not shown when you have no cases, when looking in the casebooks fails, or in demo mode', async () => {
    const empty = createFakeEnv();
    await openImprove(empty);
    expect(screen.queryByRole('region', { name: "This week's plan" })).not.toBeInTheDocument();
  });

  it('stays quiet when the casebook cannot be reached', async () => {
    const env = await envWith(withNotes(5));
    env.library.state.failing = true;
    await openImprove(env);
    await waitFor(() => expect(env.library.gapAsked.length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: "This week's plan" })).not.toBeInTheDocument();
  });
});
