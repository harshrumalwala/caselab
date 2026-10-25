import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile, type SharedCase } from './domain/community';
import { createFakeEnv, MY_PROFILE, TEST_PASSWORD, TEST_USER, type FakeEnv } from './test/fakeBackend';

const BOB: Profile = {
  userId: 'bob',
  displayName: 'Bob Brown',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: true,
  sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true, notes: true },
};
const CAROL: Profile = { userId: 'carol', displayName: 'Carol Chen', mbaClass: '', listed: true, publicProfile: false, sharing: { ...NO_SHARING, cases: true } };

const row = (over: Partial<SharedCase> & Pick<SharedCase, 'caseId' | 'title'>): SharedCase => ({
  ownerId: 'bob',
  date: '2026-10-01',
  source: '',
  partner: '',
  caseType: 'Profitability',
  industry: 'Technology / SaaS',
  overall: null,
  skillScores: null,
  feedback: null,
  improvementArea: null,
  notes: null,
  ...over,
});

const SHARED: SharedCase[] = [
  row({
    caseId: 'b1',
    title: 'Airline profitability',
    source: 'Booth casebook',
    industry: 'Transportation / Logistics',
    overall: 4,
    feedback: { overall: 'SECRET-FEEDBACK-FOR-MEMBERS' },
    notes: { concepts: 'SECRET-NOTES-FOR-MEMBERS' },
  }),
  row({ caseId: 'b2', title: 'Bank market entry', source: 'Case in Point', caseType: 'Market Entry', industry: 'Financial Services' }),
  row({ caseId: 'c1', ownerId: 'carol', title: 'Carol members-only case' }),
];

const visitor = (extra: Partial<Parameters<typeof createFakeEnv>[0]> = {}) =>
  createFakeEnv({ signedIn: false, members: [BOB, CAROL], shared: SHARED, ...extra });

async function open(env: FakeEnv) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  return { user };
}

describe('the public front page', () => {
  it('lets anyone browse members who chose to be public, without an account', async () => {
    const env = visitor();
    await open(env);
    expect(await screen.findByRole('heading', { name: 'Find a case partner' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Bob Brown/ })).toBeInTheDocument();
    expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument(); // shares with members only
    expect(screen.queryByText(/@/)).not.toBeInTheDocument(); // never an email address
    // Only what a visitor can actually see is advertised: no mention of feedback or notes.
    const bob = screen.getByRole('button', { name: /Bob Brown/ });
    expect(bob).toHaveTextContent('Shares case history and overall scores');
    expect(bob).not.toHaveTextContent(/feedback|notes/i);
  });

  it('shows who cased the member and where the case came from, when they chose to share it', async () => {
    const env = visitor({
      shared: [
        row({ caseId: 'p1', title: 'Airline profitability', source: 'Booth casebook', partner: 'Sam Lee' }),
        row({ caseId: 'p2', title: 'Bank market entry', source: 'Case in Point' }),
      ],
    });
    const { user } = await open(env);
    await user.click(await screen.findByRole('button', { name: /Bob Brown/ }));
    const shown = (await screen.findByText('Airline profitability')).closest('li')!;
    expect(shown).toHaveTextContent('Booth casebook');
    expect(shown).toHaveTextContent('Cased by Sam Lee');
    expect(screen.getByText('Bank market entry').closest('li')).not.toHaveTextContent(/Cased by/);
  });

  it('searches members by name', async () => {
    const env = visitor({ members: [BOB, { ...BOB, userId: 'dana', displayName: 'Dana Diaz' }] });
    const { user } = await open(env);
    await screen.findByRole('button', { name: /Bob Brown/ });
    await user.type(screen.getByLabelText('Search members by name'), 'dan');
    await waitFor(() => expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Dana Diaz/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search members by name'));
    await user.type(screen.getByLabelText('Search members by name'), 'zzz');
    expect(await screen.findByText('No members found')).toBeInTheDocument();
  });

  it("opens a public member's profile: shared cases only, never feedback or notes, with a prompt to join", async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await screen.findByRole('button', { name: /Bob Brown/ }));

    const heading = await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(heading.parentElement).toHaveTextContent('Class of 2027');
    expect(await screen.findByText('Airline profitability')).toBeInTheDocument();
    expect(screen.getByText('Bank market entry')).toBeInTheDocument();
    expect(screen.queryByText('Carol members-only case')).not.toBeInTheDocument();

    // Free text is members-only: it isn't even offered to a visitor, though Bob shares it with members.
    expect(document.body.textContent).not.toContain('SECRET-FEEDBACK-FOR-MEMBERS');
    expect(document.body.textContent).not.toContain('SECRET-NOTES-FOR-MEMBERS');
    expect(screen.queryByText('Feedback and notes')).not.toBeInTheDocument();
    expect(screen.getByText('Written feedback and notes are members-only')).toBeInTheDocument();

    // Pairing needs your own cases, so visitors get an invitation instead of "Find a case for them".
    expect(screen.queryByRole('tab', { name: /Find a case for them/ })).not.toBeInTheDocument();
    expect(screen.getByText('Casing Bob?')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create an account' }).length).toBeGreaterThan(0);
  });

  it('filters a public member’s shared cases by name, casebook, industry and type', async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await screen.findByRole('button', { name: /Bob Brown/ }));
    await screen.findByText('Airline profitability');

    await user.type(screen.getByLabelText('Search cases'), 'point'); // casebook
    expect(screen.queryByText('Airline profitability')).not.toBeInTheDocument();
    expect(screen.getByText('Bank market entry')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search cases'));
    await user.selectOptions(screen.getByLabelText('Filter by industry'), 'Transportation / Logistics');
    expect(screen.getByText('Airline profitability')).toBeInTheDocument();
    expect(screen.queryByText('Bank market entry')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by industry'), 'all');
    await user.selectOptions(screen.getByLabelText('Filter by case type'), 'Market Entry');
    expect(screen.getByText('Bank market entry')).toBeInTheDocument();
    expect(screen.queryByText('Airline profitability')).not.toBeInTheDocument();
  });

  it("shows nothing about a member who isn't public, even with their direct link", async () => {
    const env = visitor();
    window.location.hash = '#/people/carol';
    await open(env);
    expect(await screen.findByText("This member isn't available")).toBeInTheDocument();
    expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol members-only case')).not.toBeInTheDocument();
  });

  it('never asks for personal or member data', async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await screen.findByRole('button', { name: /Bob Brown/ }));
    await screen.findByText('Airline profitability');
    expect(env.calls).toEqual([]); // personal data repository untouched
    expect(env.community.calls).toEqual([]); // member side untouched
    expect(env.publicReader.calls).toEqual(expect.arrayContaining(['searchPeople', 'getPerson', 'getSharedCases']));
  });

  it('keeps sign-in and sign-up one click away, and a way back', async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await screen.findByRole('link', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back to People/ }));
    expect(await screen.findByRole('heading', { name: 'Find a case partner' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signing in from the front page takes you to your dashboard', async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await screen.findByRole('link', { name: 'Sign in' }));
    await user.type(await screen.findByLabelText('Email'), TEST_USER.email);
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/dashboard');
  });
});

describe('choosing to be visible without an account', () => {
  const openProfile = async (env: FakeEnv) => {
    const { user } = await open(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    return { user, dialog };
  };
  const mine = (env: FakeEnv) => env.community.profiles.find((p) => p.userId === TEST_USER.userId);

  it('is off by default and needs a confirmation to switch on', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openProfile(env);
    const toggle = within(dialog).getByRole('switch', { name: 'Visible without an account' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    const confirm = await screen.findByRole('dialog', { name: 'Show your profile to anyone?' });
    expect(confirm).toHaveTextContent(/never shown to visitors/i);
    expect(confirm).toHaveTextContent(/share this case in full/i); // warns what per-case settings mean
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(mine(env)?.publicProfile).toBe(false); // cancelling changes nothing

    await user.click(toggle);
    await user.click(within(await screen.findByRole('dialog', { name: 'Show your profile to anyone?' })).getByRole('button', { name: 'Make it visible' }));
    await waitFor(() => expect(mine(env)?.publicProfile).toBe(true));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('switches off immediately, with no confirmation', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, publicProfile: true } });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('switch', { name: 'Visible without an account' }));
    await waitFor(() => expect(mine(env)?.publicProfile).toBe(false));
  });

  it('is withdrawn when you stop appearing in People, and cannot be set while unlisted', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, publicProfile: true } });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('switch', { name: 'Appear in People search' }));
    await waitFor(() => expect(mine(env)).toMatchObject({ listed: false, publicProfile: false }));
    expect(within(dialog).getByRole('switch', { name: 'Visible without an account' })).toBeDisabled();
  });

  it('previews exactly what visitors would see, separately from what members see', async () => {
    const mineShared: SharedCase[] = [
      row({ caseId: 'm1', ownerId: TEST_USER.userId, title: 'My airline case', overall: 5, feedback: { overall: 'MEMBERS-ONLY-TEXT' } }),
    ];
    const env = createFakeEnv({ profile: { ...MY_PROFILE, publicProfile: true, sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true } }, shared: mineShared });
    const { user, dialog } = await openProfile(env);

    // Members tab (default) can include written feedback.
    expect(await within(dialog).findByText('My airline case')).toBeInTheDocument();
    expect(within(dialog).getByText('Feedback and notes')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Visitors without an account' }));
    await waitFor(() => expect(env.community.calls).toContain('getPublicView'));
    expect(await within(dialog).findByText('My airline case')).toBeInTheDocument();
    expect(within(dialog).queryByText('Feedback and notes')).not.toBeInTheDocument();
    expect(dialog.textContent).not.toContain('MEMBERS-ONLY-TEXT');
    expect(within(dialog).getByText(/never see written feedback or learning notes/i)).toBeInTheDocument();
  });

  it('tells you plainly that visitors see nothing until you opt in', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, sharing: { ...NO_SHARING, cases: true } }, shared: [row({ caseId: 'm1', ownerId: TEST_USER.userId, title: 'My case' })] });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('tab', { name: 'Visitors without an account' }));
    expect(await within(dialog).findByText(/haven't turned on visibility without an account/i)).toBeInTheDocument();
    expect(within(dialog).queryByText('My case')).not.toBeInTheDocument();
  });
});

describe('profile setup and the audience', () => {
  it('starts with "visitors" off, and saves it only if chosen', async () => {
    const env = createFakeEnv({ profile: null });
    const { user } = await open(env);
    await user.type(await screen.findByRole('textbox', { name: /^Your name/ }), 'Pat Public');
    const toggle = screen.getByRole('switch', { name: 'Visible without an account' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Start casing' }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(env.community.profiles.find((p) => p.displayName === 'Pat Public')).toMatchObject({ listed: true, publicProfile: true });
  });

  it('can not be chosen while not appearing in People', async () => {
    const env = createFakeEnv({ profile: null });
    const { user } = await open(env);
    await user.type(await screen.findByRole('textbox', { name: /^Your name/ }), 'Quiet Quinn');
    await user.click(screen.getByRole('switch', { name: 'Visible without an account' }));
    await user.click(screen.getByRole('checkbox', { name: /Let other members find me by name/ }));
    expect(screen.getByRole('switch', { name: 'Visible without an account' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Visible without an account' })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'Start casing' }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(env.community.profiles.find((p) => p.displayName === 'Quiet Quinn')).toMatchObject({ listed: false, publicProfile: false });
  });
});
