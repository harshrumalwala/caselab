import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile } from './domain/community';
import { makeCase } from './test/builders';
import { createFakeEnv, type FakeEnv } from './test/fakeBackend';

const member = (userId: string, displayName: string, mbaClass = ''): Profile => ({
  userId, displayName, mbaClass, listed: true, publicProfile: false, burnedBooks: [], burnedCases: [], sharing: NO_SHARING,
});
const BOB = member('bob', 'Bob Brown', 'Class of 2027');
const DANA = member('dana', 'Dana Diaz');

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const options = (listId: string) => [...document.querySelectorAll<HTMLOptionElement>(`#${listId} option`)].map((o) => o.value);

async function openLogCase(env: FakeEnv) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  await user.click(screen.getByRole('button', { name: 'Log case' }));
  const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
  return { user, dialog };
}

describe('suggesting community members for "who cased you"', () => {
  it('lists members in the suggestions, with their class, and narrows them as you type', async () => {
    const env = createFakeEnv({ members: [BOB, DANA] });
    const { user, dialog } = await openLogCase(env);
    await waitFor(() => expect(options('partner-options')).toEqual(['Bob Brown', 'Dana Diaz']));
    expect(document.querySelector<HTMLOptionElement>('#partner-options option[value="Bob Brown"]')?.label).toBe('Class of 2027');

    await user.type(within(dialog).getByLabelText('Interviewer / practice partner'), 'dan');
    await waitFor(() => expect(options('partner-options')).toEqual(['Dana Diaz']));
  });

  it('still takes anyone else as plain text, and saves exactly what was typed', async () => {
    const env = createFakeEnv({ members: [BOB] });
    const { user, dialog } = await openLogCase(env);
    await user.type(within(dialog).getByLabelText(/Case title/), 'Airline profit');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Profitability');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Technology / SaaS');
    await user.type(within(dialog).getByLabelText('Interviewer / practice partner'), 'Zed Outsider');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await waitFor(async () => expect((await env.repo.loadAll()).cases[0]?.partner).toBe('Zed Outsider'));
  });

  it('puts the names you used before first, and does not repeat a member you already used', async () => {
    const env = createFakeEnv({ members: [BOB, DANA] });
    await env.repo.insertCase(makeCase({ date: '2026-09-01', partner: 'Bob Brown' }));
    await env.repo.insertCase(makeCase({ date: '2026-09-02', partner: 'Old Friend' }));
    await openLogCase(env);
    await waitFor(() => expect(options('partner-options')).toContain('Dana Diaz'));
    const names = options('partner-options');
    expect(names.filter((n) => n === 'Bob Brown')).toHaveLength(1);
    expect(names).toContain('Old Friend');
    expect(names.indexOf('Bob Brown')).toBeLessThan(names.indexOf('Dana Diaz'));
  });

  it('carries on without suggestions if the member search fails', async () => {
    const env = createFakeEnv({ members: [BOB] });
    env.community.failOn('searchPeople');
    const { user, dialog } = await openLogCase(env);
    await user.type(within(dialog).getByLabelText('Interviewer / practice partner'), 'Someone');
    expect(within(dialog).getByLabelText('Interviewer / practice partner')).toHaveValue('Someone');
    expect(options('partner-options')).toEqual([]);
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays away from real members in demo mode', async () => {
    const env = createFakeEnv({ members: [BOB] });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('button', { name: /Explore with demo data/ }));
    await screen.findByRole('region', { name: 'Your week' });
    env.community.calls.length = 0;
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    await screen.findByRole('dialog', { name: 'Log a case' });
    expect(env.community.calls).not.toContain('searchPeople');
    expect(options('partner-options')).not.toContain('Bob Brown');
  });
});

describe('suggesting community members for "who you interviewed"', () => {
  it('offers members in the Interviewed form too', async () => {
    const env = createFakeEnv({ members: [BOB, DANA] });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await env.repo.insertCase(makeCase({ date: '2026-09-01' }));
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });
    await user.click(screen.getByRole('tab', { name: /Interviewed/ }));
    await user.click(screen.getByRole('button', { name: 'Log a case you interviewed' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case you interviewed' });
    await waitFor(() => expect(options('int-partner-options')).toEqual(['Bob Brown', 'Dana Diaz']));
    await user.type(within(dialog).getByLabelText('Who you interviewed'), 'Not On CaseLab');
    expect(within(dialog).getByLabelText('Who you interviewed')).toHaveValue('Not On CaseLab');
  });
});
