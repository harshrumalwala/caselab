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

async function envWith(...cases: ReturnType<typeof makeCase>[]): Promise<FakeEnv> {
  const env = createFakeEnv();
  for (const c of cases) await env.repo.insertCase(c);
  return env;
}

async function openLog(env: FakeEnv) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  window.location.hash = '#/log';
  await screen.findByRole('heading', { name: 'My Case Log' });
  return user;
}

const sure = () => makeCase({ title: 'army hotel', source: 'Booth casebook', caseType: 'Profitability', industry: 'Energy / Utilities', date: '2026-09-01' });
const maybe = () => makeCase({ title: 'Hawaiian Smoothies', source: '', caseType: 'Profitability', industry: 'Energy / Utilities', date: '2026-09-02' });
const saved = async (env: FakeEnv) => (await env.repo.loadAll()).cases;
const byTitle = (cases: Awaited<ReturnType<typeof saved>>, id: string) => cases.find((c) => c.id === id)!;

describe('cases that look like casebook cases', () => {
  it('offers a review when some of your cases match the casebooks, and not when none do', async () => {
    await openLog(await envWith(sure(), maybe(), makeCase({ title: 'Something else', date: '2026-09-03' })));
    expect(await screen.findByText('2 of your cases look like casebook cases.')).toBeInTheDocument();
  });

  it('says nothing when none of your cases look like casebook cases', async () => {
    await openLog(await envWith(makeCase({ title: 'Something else', date: '2026-09-03' })));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/look like casebook cases|looks like a casebook case/)).not.toBeInTheDocument();
  });

  it('says nothing when looking fails', async () => {
    const env = await envWith(sure());
    env.library.state.failing = true;
    await openLog(env);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/looks like a casebook case/)).not.toBeInTheDocument();
  });

  it('starts with the sure matches ticked and the maybes unticked, and says why a match is only a maybe', async () => {
    const user = await openLog(await envWith(sure(), maybe()));
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Match your cases to the casebooks' }));
    expect(dialog.getByRole('checkbox', { name: 'army hotel: update' })).toBeChecked();
    expect(dialog.getByRole('checkbox', { name: 'Hawaiian Smoothies: update' })).not.toBeChecked();
    expect(dialog.getByText('Not sure')).toBeInTheDocument();
    expect(dialog.getByText(/You didn't say which book it was from/)).toBeInTheDocument();
    expect(dialog.getByText('Update 1 case')).toBeInTheDocument();
  });

  it('shows what updating would change, case by case', async () => {
    const user = await openLog(await envWith(sure()));
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Match your cases to the casebooks' }));
    const item = within(dialog.getByRole('list', { name: 'Cases to match' }));
    expect(item.getByText(/army hotel/, { selector: 'span' })).toBeInTheDocument();
    expect(item.getByText(/Booth casebook/)).toBeInTheDocument();
    expect(item.getByText(/Profitability/)).toBeInTheDocument();
    expect(item.getByText(/Market Entry/)).toBeInTheDocument();
  });

  it('updates the title, book, case type and industry of the ticked cases and links them, and leaves the unticked one alone', async () => {
    const a = sure();
    const b = maybe();
    const env = await envWith(a, b);
    const user = await openLog(env);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Match your cases to the casebooks' }));
    await user.click(dialog.getByRole('button', { name: 'Update 1 case' }));
    await waitFor(async () => expect(byTitle(await saved(env), a.id).libraryId).toBe(HOTEL.id));
    const after = await saved(env);
    expect(byTitle(after, a.id)).toMatchObject({ title: 'Army Hotel', source: 'Booth MCG 2026-2027', caseType: 'Market Entry', industry: 'Travel / Hospitality' });
    expect(byTitle(after, b.id)).toMatchObject({ title: 'Hawaiian Smoothies', source: '', caseType: 'Profitability', industry: 'Energy / Utilities' });
    expect(byTitle(after, b.id).libraryId ?? null).toBeNull();
  });

  it('can just link the cases, keeping your own wording', async () => {
    const a = sure();
    const env = await envWith(a);
    const user = await openLog(env);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Match your cases to the casebooks' }));
    await user.click(dialog.getByRole('radio', { name: /Just link them/ }));
    expect(dialog.getByText('Link 1 case')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Link 1 case' }));
    await waitFor(async () => expect(byTitle(await saved(env), a.id).libraryId).toBe(HOTEL.id));
    expect(byTitle(await saved(env), a.id)).toMatchObject({ title: 'army hotel', source: 'Booth casebook', caseType: 'Profitability', industry: 'Energy / Utilities' });
  });

  it('lets you choose a maybe too, and changes nothing if you cancel', async () => {
    const b = maybe();
    const env = await envWith(sure(), b);
    const user = await openLog(env);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Match your cases to the casebooks' }));
    await user.click(dialog.getByRole('checkbox', { name: 'Hawaiian Smoothies: update' }));
    expect(dialog.getByText('Update 2 cases')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Match your cases to the casebooks' })).not.toBeInTheDocument());
    expect((await saved(env)).every((c) => !c.libraryId)).toBe(true);
  });

  it('goes away once the cases are matched, and does not come back', async () => {
    const env = await envWith(sure());
    const user = await openLog(env);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Match your cases to the casebooks' })).getByRole('button', { name: 'Update 1 case' }));
    await waitFor(() => expect(screen.queryByText(/looks like a casebook case/)).not.toBeInTheDocument());
  });

  it('lists a case you linked yourself only while it differs from the book', async () => {
    const env = await envWith(makeCase({ title: 'Army Hotel', source: 'Booth MCG 2026-2027', caseType: 'Market Entry', industry: 'Travel / Hospitality', libraryId: HOTEL.id, date: '2026-09-01' }));
    await openLog(env);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/looks like a casebook case/)).not.toBeInTheDocument();
  });
});
