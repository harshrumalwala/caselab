import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv, type FakeEnv } from './test/fakeBackend';

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

async function openLog(env: FakeEnv = createFakeEnv(), solved = 2) {
  for (let i = 0; i < solved; i += 1) await env.repo.insertCase(makeCase({ title: `Solved ${i + 1}`, date: '2026-09-0' + (i + 1) }));
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  window.location.hash = '#/log';
  await screen.findByRole('heading', { name: 'My Case Log' });
  return { user, env };
}

async function openInterviewed(env?: FakeEnv, solved = 2) {
  const ctx = await openLog(env, solved);
  await ctx.user.click(screen.getByRole('tab', { name: /Interviewed/ }));
  return ctx;
}

async function logOne(user: ReturnType<typeof userEvent.setup>, title: string, extra: Record<string, string> = {}) {
  await user.click(screen.getByRole('button', { name: 'Log a case you interviewed' }));
  const dialog = await screen.findByRole('dialog', { name: 'Log a case you interviewed' });
  await user.type(within(dialog).getByLabelText('Case title'), title);
  if (extra.partner) await user.type(within(dialog).getByLabelText('Who you interviewed'), extra.partner);
  if (extra.learned) await user.type(within(dialog).getByLabelText('What running it taught you'), extra.learned);
  await user.click(within(dialog).getByRole('button', { name: 'Save interviewed case' }));
  return dialog;
}

describe('cases you interviewed', () => {
  it('has its own tab with a note that they are private and not counted', async () => {
    await openInterviewed();
    expect(screen.getByRole('tab', { name: 'Interviewed (0)' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/private to you/);
    expect(screen.getByRole('note')).toHaveTextContent(/weekly goal/);
    expect(screen.getByText('No interviewed cases yet')).toBeInTheDocument();
  });

  it('logs one to the account, shows it, and leaves your solved cases and their count alone', async () => {
    const { user, env } = await openInterviewed();
    await logOne(user, 'Airline profit', { partner: 'Bob', learned: 'Let them finish the structure' });

    await waitFor(() => expect(env.interviewed.saved).toHaveLength(1));
    expect(env.interviewed.saved[0]).toMatchObject({ title: 'Airline profit', partner: 'Bob', learned: 'Let them finish the structure', caseType: 'Other' });
    const list = await screen.findByRole('list', { name: 'Interviewed cases' });
    expect(within(list).getByText('Airline profit')).toBeInTheDocument();
    expect(within(list).getByText(/with Bob/)).toBeInTheDocument();
    expect(within(list).getByText('Let them finish the structure')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Interviewed (1)' })).toBeInTheDocument();

    // Not one of the cases you solved, in the database or in what the app counts.
    expect((await env.repo.loadAll()).cases).toHaveLength(2);
    await user.click(screen.getByRole('tab', { name: 'My cases' }));
    expect(screen.getByText(/^2 cases/)).toBeInTheDocument();
    expect(screen.getByText(/1 interviewed, not counted/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Airline profit' })).not.toBeInTheDocument(); // not in the solved list
    expect(screen.getAllByRole('button', { name: 'Solved 1' }).length).toBeGreaterThan(0);
    window.location.hash = '#/dashboard';
    expect(await screen.findByText('cases practiced')).toBeInTheDocument();
    expect(screen.getByText('Total cases').closest('.sticker')).toHaveTextContent(/^Total cases2cases practiced/);
  });

  it('asks for a title and does not save without one', async () => {
    const { user, env } = await openInterviewed();
    await user.click(screen.getByRole('button', { name: 'Log a case you interviewed' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case you interviewed' });
    await user.click(within(dialog).getByRole('button', { name: 'Save interviewed case' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/title/);
    expect(env.interviewed.saved).toEqual([]);
  });

  it('keeps the form and says so when it cannot be saved', async () => {
    const { user, env } = await openInterviewed();
    env.interviewed.failing = true;
    const dialog = await logOne(user, 'Won\'t save');
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Case title')).toHaveValue("Won't save");
    expect(env.interviewed.failing).toBe(true);
    env.interviewed.failing = false;
    await user.click(within(dialog).getByRole('button', { name: 'Save interviewed case' }));
    await waitFor(() => expect(env.interviewed.saved).toHaveLength(1));
  });

  it('can be edited, searched and deleted after confirming', async () => {
    const { user, env } = await openInterviewed();
    await logOne(user, 'Airline profit');
    await user.click(screen.getByRole('button', { name: 'Log a case you interviewed' }));
    const second = await screen.findByRole('dialog', { name: 'Log a case you interviewed' });
    await user.type(within(second).getByLabelText('Case title'), 'Bank market entry');
    await user.click(within(second).getByRole('button', { name: 'Save interviewed case' }));
    await screen.findByText('Bank market entry');

    await user.type(screen.getByLabelText('Search interviewed cases'), 'bank');
    expect(screen.queryByText('Airline profit')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search interviewed cases'));

    await user.click(screen.getByRole('button', { name: 'Edit Airline profit' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit interviewed case' });
    const title = within(edit).getByLabelText('Case title');
    await user.clear(title);
    await user.type(title, 'Airline profitability');
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Airline profitability')).toBeInTheDocument();
    expect(env.interviewed.saved.map((c) => c.title).sort()).toEqual(['Airline profitability', 'Bank market entry']);

    await user.click(screen.getByRole('button', { name: 'Delete Bank market entry' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this interviewed case?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete case' }));
    await waitFor(() => expect(env.interviewed.saved.map((c) => c.title)).toEqual(['Airline profitability']));
    expect(screen.getByRole('tab', { name: 'Interviewed (1)' })).toBeInTheDocument();
  });

  it('is never written to the account while you are exploring demo data', async () => {
    const env = createFakeEnv();
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('button', { name: /Explore with demo data/ }));
    await screen.findByRole('region', { name: 'Your week' });
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });
    await user.click(screen.getByRole('tab', { name: /Interviewed/ }));
    await logOne(user, 'Demo interview');
    expect(await screen.findByRole('list', { name: 'Interviewed cases' })).toBeInTheDocument();
    expect(env.interviewed.saved).toEqual([]);
  });
});
