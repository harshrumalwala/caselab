import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { addDays, startOfWeek, toISODate } from './domain/dates';
import { makeCase } from './test/builders';
import { createFakeEnv, type FakeEnv } from './test/fakeBackend';

const today = toISODate(new Date());
const lastWeek = toISODate(addDays(startOfWeek(new Date()), -3)); // a day in the previous Monday-to-Sunday week

async function open(env: FakeEnv) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return user;
}

async function envWith(cases: ReturnType<typeof makeCase>[], goal: number | null = null) {
  const env = createFakeEnv();
  for (const c of cases) await env.repo.insertCase(c);
  if (goal !== null) await env.goal.save(goal);
  return env;
}

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('the weekly goal on the dashboard', () => {
  it('offers to set one, saves it to the account, and shows progress against it', async () => {
    const env = await envWith([makeCase({ date: today })]);
    const user = await open(env);
    const strip = within(await screen.findByRole('region', { name: 'Your week' }));

    await user.click(await strip.findByRole('button', { name: 'Set a weekly goal' }));
    await user.click(strip.getByRole('button', { name: '3' }));

    await waitFor(() => expect(env.goal.saved).toBe(3));
    expect(await strip.findByText(/1 of 3 this week\. 2 to go\./)).toBeInTheDocument();
    expect(strip.getByRole('img', { name: '1 of 3 cases this week' })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: 'Change weekly goal' })).toBeInTheDocument();
  });

  it('loads the goal you saved before, and counts the weeks in a row that reached it', async () => {
    const env = await envWith([makeCase({ date: today }), makeCase({ date: today }), makeCase({ date: lastWeek }), makeCase({ date: lastWeek })], 2);
    await open(env);
    const strip = within(await screen.findByRole('region', { name: 'Your week' }));
    expect(await strip.findByText(/Goal hit: 2 of 2/)).toBeInTheDocument();
    expect(strip.getByText('2 weeks in a row on target')).toBeInTheDocument();
  });

  it('does not break the run for a week that is still going', async () => {
    const env = await envWith([makeCase({ date: today }), makeCase({ date: lastWeek }), makeCase({ date: lastWeek }), makeCase({ date: lastWeek })], 3);
    await open(env);
    const strip = within(await screen.findByRole('region', { name: 'Your week' }));
    expect(await strip.findByText(/1 of 3 this week/)).toBeInTheDocument();
    expect(strip.getByText('1 week on target')).toBeInTheDocument();
  });

  it('removes the goal when you choose No goal', async () => {
    const env = await envWith([makeCase({ date: today })], 3);
    const user = await open(env);
    const strip = within(await screen.findByRole('region', { name: 'Your week' }));
    await user.click(await strip.findByRole('button', { name: 'Change weekly goal' }));
    await user.click(strip.getByRole('button', { name: 'No goal' }));
    await waitFor(() => expect(env.goal.saved).toBeNull());
    expect(await strip.findByRole('button', { name: 'Set a weekly goal' })).toBeInTheDocument();
    expect(strip.queryByText(/this week\. \d to go/)).not.toBeInTheDocument();
  });

  it('says so and keeps the old goal when it cannot be saved', async () => {
    const env = await envWith([makeCase({ date: today })], 2);
    const user = await open(env);
    const strip = within(await screen.findByRole('region', { name: 'Your week' }));
    await strip.findByText(/1 of 2 this week/);
    env.goal.failing = true;
    await user.click(strip.getByRole('button', { name: 'Change weekly goal' }));
    await user.click(strip.getByRole('button', { name: '5' }));
    expect(await screen.findByText("Couldn't save your goal")).toBeInTheDocument();
    expect(env.goal.saved).toBe(2);
    expect(strip.getByText(/1 of 2 this week/)).toBeInTheDocument();
  });

  it('never writes to the account while you are exploring demo data', async () => {
    const env = createFakeEnv();
    const user = await open(env);
    await user.click(await screen.findByRole('button', { name: /Explore with demo data/ }));
    const strip = within(await screen.findByRole('region', { name: 'Your week' }));
    await user.click(await strip.findByRole('button', { name: 'Set a weekly goal' }));
    await user.click(strip.getByRole('button', { name: '4' }));
    expect(await strip.findByRole('button', { name: 'Change weekly goal' })).toBeInTheDocument();
    expect(env.goal.saved).toBeNull();
  });
});

describe('the weekly goal when you log a case', () => {
  it('cheers when the case you just saved reaches the goal', async () => {
    const env = await envWith([makeCase({ date: today })], 2);
    const user = await open(env);
    await screen.findByText(/1 of 2 this week/);

    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), 'Second one');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Profitability');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Technology / SaaS');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));

    expect(await within(dialog).findByText(/Weekly goal hit: 2 of 2/)).toBeInTheDocument();
  });

  it('shows how many are left when it has not reached the goal yet', async () => {
    const env = await envWith([], 3);
    const user = await open(env);
    await user.click(screen.getByRole('button', { name: 'Log your first case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), 'First one');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Revenue');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Insurance');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    expect(await within(dialog).findByText(/Weekly goal: 1 of 3\. 2 to go\./)).toBeInTheDocument();
  });
});
