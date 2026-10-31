import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, publicSharingSummary, sharedParts, sharingSummary, type Profile } from './domain/community';
import type { SharedInterviewed } from './domain/interviewed';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const bob = (interviewed: boolean, extra: Partial<Profile> = {}): Profile => ({
  userId: 'bob',
  displayName: 'Bob Brown',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: true,
  publicLinkOnly: false,
  burnedBooks: [],
  burnedCases: [],
  sharing: { ...NO_SHARING, interviewed },
  ...extra,
});

const BOBS: SharedInterviewed[] = [
  { date: '2026-10-20', title: 'Bank market entry', source: 'Wharton', caseType: 'Market Entry', industry: 'Financial Services' },
  { date: '2026-10-10', title: 'Airline profit', source: 'Darden 2019', caseType: 'Profitability', industry: 'Transportation / Logistics' },
];

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

async function openBob(env: FakeEnv) {
  window.location.hash = '#/people/bob';
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Bob Brown' });
  return user;
}

describe('showing members the cases you interviewed', () => {
  it('is its own switch, off by default, and independent of case history', () => {
    expect(NO_SHARING.interviewed).toBe(false);
    expect(sharedParts({ ...NO_SHARING, interviewed: true })).toEqual(['interviewed cases']);
    expect(sharingSummary({ ...NO_SHARING, cases: true, interviewed: true })).toBe('case history and interviewed cases');
  });

  it('never counts as something visitors without an account can see', () => {
    expect(publicSharingSummary({ ...NO_SHARING, cases: true, interviewed: true })).toBe('case history');
    expect(publicSharingSummary({ ...NO_SHARING, interviewed: true })).toBe('nothing yet');
  });

  it("shows a member's interviewed cases on their profile when they chose to, with the count", async () => {
    const env = createFakeEnv({ members: [bob(true)], interviewedBy: { bob: BOBS } });
    await openBob(env);
    expect(await screen.findByText('Has interviewed 2 cases')).toBeInTheDocument();
    const card = within(await screen.findByRole('region', { name: 'Interviewed cases' }));
    const list = card.getByRole('list', { name: 'Interviewed cases' });
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual(['Bank market entry', 'Airline profit']);
    expect(within(list).getByText(/Wharton/)).toBeInTheDocument();
    expect(within(list).getByText('Market Entry')).toBeInTheDocument();
  });

  it("shows nothing, and does not even ask, when they haven't switched it on", async () => {
    const env = createFakeEnv({ members: [bob(false)], interviewedBy: { bob: BOBS } });
    await openBob(env);
    expect(screen.queryByText(/Has interviewed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Interviewed cases' })).not.toBeInTheDocument();
    expect(env.community.calls).not.toContain('getInterviewed');
  });

  it('says nothing for a member who switched it on but has not interviewed anything yet', async () => {
    const env = createFakeEnv({ members: [bob(true)], interviewedBy: { bob: [] } });
    await openBob(env);
    expect(screen.queryByText(/Has interviewed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Interviewed cases' })).not.toBeInTheDocument();
  });

  it('puts an "interviewed cases" chip on their row in the member list', async () => {
    const env = createFakeEnv({ members: [bob(true)], interviewedBy: { bob: BOBS } });
    window.location.hash = '#/people';
    render(<App backend={env.backend} />);
    const row = await screen.findByRole('button', { name: /Bob Brown/ });
    expect(within(row).getByText('interviewed cases')).toBeInTheDocument();
  });

  it('is never fetched for a visitor without an account', async () => {
    const env = createFakeEnv({ signedIn: false, members: [bob(true)], interviewedBy: { bob: BOBS } });
    window.location.hash = '#/people/bob';
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByText(/Has interviewed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Interviewed cases' })).not.toBeInTheDocument();
    expect(env.publicReader.calls).not.toContain('getInterviewed');
  });
});

describe('your own switch', () => {
  it('is in Profile & privacy, off to start, and saved the moment you flip it', async () => {
    const env = createFakeEnv({ members: [bob(false)] });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    const sw = within(dialog).getByRole('switch', { name: 'Interviewed cases' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toBeEnabled(); // it doesn't need case history first
    expect(within(dialog).getByText(/Never who you interviewed/)).toBeInTheDocument();

    await user.click(sw);
    await waitFor(() => expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.sharing.interviewed).toBe(true));
  });
});
