import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, publicSharingSummary, sharedParts, type Profile } from './domain/community';
import { progressFor } from './domain/progress';
import { makeCase } from './test/builders';
import { createFakeEnv, MY_PROFILE, TEST_USER, type FakeEnv } from './test/fakeBackend';

const bob = (extra: Partial<Profile> = {}): Profile => ({
  userId: 'bob',
  displayName: 'Bob Brown',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: true,
  burnedBooks: [],
  burnedCases: [],
  sharing: { ...NO_SHARING, level: true },
  level: 9,
  ...extra,
});

const mine = (env: FakeEnv) => env.community.profiles.find((p) => p.userId === TEST_USER.userId)!;
const day = (i: number) => `2026-09-${String(i).padStart(2, '0')}`;
const manyCases = (n: number) => Array.from({ length: n }, (_, i) => makeCase({ date: day(1 + (i % 28)), title: `Case ${i}`, caseType: i % 2 ? 'Revenue' : 'Profitability', overall: 4, concepts: 'x', improvementArea: 'quant' }));

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
  window.localStorage.setItem(`caselab:v1:level:${TEST_USER.userId}`, '99'); // nothing to celebrate: these tests are about sharing
});

describe('the level switch', () => {
  it('is its own switch, off by default, and never something visitors without an account can see', () => {
    expect(NO_SHARING.level).toBe(false);
    expect(sharedParts({ ...NO_SHARING, level: true })).toEqual(['level']);
    expect(publicSharingSummary({ ...NO_SHARING, cases: true, level: true })).toBe('case history');
  });

  it('is in Profile & privacy, off to start, works without case history, and is saved the moment you flip it', async () => {
    const env = createFakeEnv();
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    const sw = within(dialog).getByRole('switch', { name: 'Level' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toBeEnabled();
    expect(within(dialog).getByText(/never your XP, cases, scores, medals or stickers/)).toBeInTheDocument();
    await user.click(sw);
    await waitFor(() => expect(mine(env).sharing.level).toBe(true));
  });
});

describe('keeping your shown level in step with your cases', () => {
  const withSharing = (on: boolean): Profile => ({ ...MY_PROFILE, sharing: { ...NO_SHARING, level: on } });

  it('writes the level you have once you share it, and not before', async () => {
    const cases = manyCases(12);
    const env = createFakeEnv({ profile: withSharing(true) });
    for (const c of cases) await env.repo.insertCase(c);
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await waitFor(() => expect(mine(env).level).toBe(progressFor(cases).level));
    expect(env.community.calls).toContain('saveSharedLevel');
  });

  it('writes nothing when you do not share it', async () => {
    const env = createFakeEnv({ profile: withSharing(false) });
    for (const c of manyCases(12)) await env.repo.insertCase(c);
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(env.community.calls).not.toContain('saveSharedLevel');
    expect(mine(env).level ?? null).toBeNull();
  });

  it('never writes a level made from sample data in demo mode', async () => {
    const env = createFakeEnv({ profile: withSharing(true) });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('button', { name: /Explore with demo data/ }));
    await screen.findByRole('region', { name: 'Your week' });
    // Only your real level (1, with no cases yet) was ever written, never the sample data's.
    expect(mine(env).level).toBe(1);
  });

  it('follows your level when it changes: saving your first case takes you from level 1 to level 2', async () => {
    const env = createFakeEnv({ profile: withSharing(true) });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await waitFor(() => expect(mine(env).level).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), 'My case');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Profitability');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Technology / SaaS');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await within(dialog).findByText('Case saved');
    await waitFor(() => expect(mine(env).level).toBe(2));
  });

  it('clears the shown level when you switch sharing off, as the database insists', async () => {
    const env = createFakeEnv({ profile: { ...withSharing(true), level: 6 } });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    await user.click(within(dialog).getByRole('switch', { name: 'Level' }));
    await waitFor(() => expect(mine(env).sharing.level).toBe(false));
    expect(mine(env).level).toBeNull();
  });

  it('refuses a level while you are not sharing, like the database does', async () => {
    const env = createFakeEnv({ profile: withSharing(false) });
    await expect(env.community.saveSharedLevel(5)).rejects.toMatchObject({ message: expect.stringMatching(/profiles_level_needs_sharing/) });
  });
});

describe('seeing other members\' levels', () => {
  it('shows "Lv 9 · Associate" on their row in the member list and on their profile, only if they share it', async () => {
    const env = createFakeEnv({ members: [bob(), bob({ userId: 'cy', displayName: 'Cy Chen', sharing: NO_SHARING, level: 12 })] });
    window.location.hash = '#/people';
    render(<App backend={env.backend} />);
    const bobRow = await screen.findByRole('button', { name: /Bob Brown/ });
    expect(within(bobRow).getByLabelText('Level 9, Associate')).toHaveTextContent('Lv 9 · Associate');
    const cyRow = await screen.findByRole('button', { name: /Cy Chen/ });
    expect(within(cyRow).queryByLabelText(/^Level \d/)).not.toBeInTheDocument(); // not shared, so a stray level is ignored
    expect(within(bobRow).queryByText('level')).not.toBeInTheDocument(); // the badge is enough: no extra chip
  });

  it('shows it on their profile page too', async () => {
    const env = createFakeEnv({ members: [bob()] });
    window.location.hash = '#/people/bob';
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.getByLabelText('Level 9, Associate')).toBeInTheDocument();
  });

  it('never shows it to a visitor without an account', async () => {
    const env = createFakeEnv({ signedIn: false, members: [bob()] });
    window.location.hash = '#/people/bob';
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByLabelText(/^Level \d/)).not.toBeInTheDocument();
  });
});
