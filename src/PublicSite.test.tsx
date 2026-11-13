import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile, type SharedCase } from './domain/community';
import { createFakeEnv, MY_PROFILE, TEST_PASSWORD, TEST_USER, type FakeEnv } from './test/fakeBackend';

const BOB: Profile = {
  userId: 'bob',
  displayName: 'Bob Brown',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: true, publicLinkOnly: false, burnedBooks: [], burnedCases: [],
  sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true, notes: true },
};
const CAROL: Profile = { userId: 'carol', displayName: 'Carol Chen', mbaClass: '', listed: true, publicProfile: false, publicLinkOnly: false, burnedBooks: [], burnedCases: [], sharing: { ...NO_SHARING, cases: true } };

const row = (over: Partial<SharedCase> & Pick<SharedCase, 'caseId' | 'title'>): SharedCase => ({
  ownerId: 'bob',
  date: '2026-10-01',
  source: '',
  partner: '',
  otherNotes: '',
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

/** The full member list stays closed until someone asks for it. */
const browse = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: 'Search all members' }));

/** Bob appears under "Cased recently" (he shares cases); open him from there. */
const bobRow = async () => (await screen.findAllByRole('button', { name: /Bob Brown/ }))[0];
/** The full member list, which only exists once "Search all members" has been clicked. */
const everyone = async () => within((await screen.findByRole('heading', { name: 'Everyone' })).parentElement!);

describe('the public front page', () => {
  it('sells the live case with Bucket: in the headline, in a section of its own lower down, in the top bar and in the closing call', async () => {
    const env = visitor();
    const { user } = await open(env);
    await screen.findByRole('heading', { name: /Case with Bucket/ });

    const tries = screen.getAllByRole('link', { name: /Try a live case, it.s free/ }); // the headline's button and the section's
    expect(tries).toHaveLength(2);
    tries.forEach((l) => expect(l).toHaveAttribute('href', '#/signup'));

    const section = screen.getByRole('region', { name: /Meet Bucket/ });
    expect(within(section).getByText(/35 minutes against the clock/)).toBeInTheDocument();
    expect(within(section).getByRole('list', { name: 'How a live case runs' })).toHaveTextContent('Exhibits');
    expect(within(section).getByRole('link', { name: /Try a live case/ })).toHaveAttribute('href', '#/signup');

    // The top bar and the headline's second button both go to the section.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await user.click(screen.getByRole('button', { name: 'Live case' }));
    await user.click(screen.getByRole('button', { name: /See how it works/ }));
    expect(scroll).toHaveBeenCalledTimes(2);

    expect(screen.getByRole('heading', { name: /Ready for your first case with Bucket/ })).toBeInTheDocument();
  });

  it('lets anyone browse members who chose to be public, without an account', async () => {
    const env = visitor();
    const { user } = await open(env);
    expect(await screen.findByRole('heading', { name: /Case with Bucket/ })).toBeInTheDocument();
    // The full list (and its search) isn't loaded until the visitor opts to look.
    await screen.findByRole('button', { name: 'Search all members' });
    expect(screen.queryByLabelText('Search members by name')).not.toBeInTheDocument();
    expect(env.publicReader.calls).not.toContain('searchPeople');

    // Bob has a visible case, so he is already showing as a recent caser: name, class and date, nothing about what he shares.
    const recent = (await screen.findByRole('heading', { name: 'Cased recently' })).parentElement!;
    expect(await within(recent).findByRole('button', { name: /Bob Brown/ })).toHaveTextContent('Class of 2027 · Last cased');
    expect(within(recent).getByRole('button', { name: /Bob Brown/ })).not.toHaveTextContent(/Shares|history|scores|feedback|notes/i);

    await browse(user);
    const list = await everyone();
    const bob = await list.findByRole('button', { name: /Bob Brown/ });
    expect(bob).toHaveTextContent('Class of 2027');
    expect(bob).not.toHaveTextContent(/Shares|history|scores|feedback|notes|cased/i);
    expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument(); // shares with members only
    expect(screen.queryByText(/@/)).not.toBeInTheDocument(); // never an email address
  });

  it('shows who cased the member and where the case came from, when they chose to share it', async () => {
    const env = visitor({
      shared: [
        row({ caseId: 'p1', title: 'Airline profitability', source: 'Booth casebook', partner: 'Sam Lee' }),
        row({ caseId: 'p2', title: 'Bank market entry', source: 'Case in Point' }),
      ],
    });
    const { user } = await open(env);
    await user.click(await bobRow());
    const shown = (await screen.findByText('Airline profitability')).closest('li')!;
    expect(shown).toHaveTextContent('Booth casebook');
    expect(shown).toHaveTextContent('Cased by Sam Lee');
    expect(screen.getByText('Bank market entry').closest('li')).not.toHaveTextContent(/Cased by/);
  });

  it('gives importing an Excel log its own prominent section, with the steps and a way to start', async () => {
    const env = visitor();
    await open(env);
    const section = (await screen.findByRole('heading', { name: 'Bring your whole case log with you' })).closest('section')!;
    expect(section).toHaveTextContent(/Switching from Excel\?/);
    expect(section).toHaveTextContent(/cases, ratings, feedback and Opportunity Areas lists all come across/);
    const steps = within(section).getByRole('list', { name: 'How importing works' });
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Create your free account'),
      expect.stringContaining('Choose your Excel file'),
      expect.stringContaining('Review, then import'),
    ]);
    expect(within(section).getByRole('link', { name: /Create account and import/ })).toHaveAttribute('href', '#/signup');
    // It is said once, in this section, not repeated in the hero above it.
    expect(screen.getAllByText(/Excel/i).filter((el) => !section.contains(el) && el.closest('section'))).toEqual([]);
  });

  it('shows the five members who cased most recently, newest first, before anyone searches', async () => {
    const dated = (id: string, name: string, date: string): [Profile, SharedCase] => [
      { ...BOB, userId: id, displayName: name },
      row({ caseId: `c-${id}`, ownerId: id, title: `${name} case`, date }),
    ];
    const people = [
      dated('p1', 'Ana Ames', '2026-09-01'),
      dated('p2', 'Ben Boyd', '2026-10-20'),
      dated('p3', 'Cy Cole', '2026-10-05'),
      dated('p4', 'Di Dunn', '2026-10-12'),
      dated('p5', 'Ed Egan', '2026-08-15'),
      dated('p6', 'Flo Fry', '2026-10-18'),
    ];
    const nothingShared: Profile = { ...BOB, userId: 'p7', displayName: 'Gus Gray' }; // public, but no visible case
    const env = visitor({ members: [...people.map(([p]) => p), nothingShared], shared: people.map(([, c]) => c) });
    await open(env);
    const heading = await screen.findByRole('heading', { name: 'Cased recently' });
    const list = heading.parentElement!;
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(5));
    const names = within(list).getAllByRole('button').map((b) => b.textContent);
    expect(names.map((n) => n!.replace(/^[A-Z]/, '').split('Class')[0])).toEqual(['Ben Boyd', 'Flo Fry', 'Di Dunn', 'Cy Cole', 'Ana Ames']);
    expect(names[0]).toContain('Last cased');
    expect(within(list).queryByText(/Ed Egan|Gus Gray/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Carol/);
  });

  it('shows nothing under "Cased recently" when no one has a visible case yet', async () => {
    const env = visitor({ shared: [] });
    await open(env);
    await screen.findByRole('button', { name: 'Search all members' });
    await waitFor(() => expect(env.publicReader.calls).toContain('recentPeople'));
    expect(screen.queryByRole('heading', { name: 'Cased recently' })).not.toBeInTheDocument();
  });

  it('explains the tool in general terms, without singling out a class year or one school', async () => {
    const env = visitor();
    await open(env);
    await screen.findByRole('heading', { name: /Case with Bucket/ });
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Track your progress/);
    expect(text).not.toMatch(/first-year|second-year|1Y|2Y|Booth/i);
  });

  it('keeps the list open when you come back from a profile', async () => {
    const env = visitor();
    const { user } = await open(env);
    await browse(user);
    await user.click(await bobRow());
    await user.click(await screen.findByRole('button', { name: /All members/ }));
    expect(await screen.findByRole('heading', { name: 'Everyone' })).toBeInTheDocument(); // still open, no second click needed
  });

  it('searches members by name', async () => {
    const env = visitor({ members: [BOB, { ...BOB, userId: 'dana', displayName: 'Dana Diaz' }] });
    const { user } = await open(env);
    await browse(user);
    const list = await everyone();
    await list.findByRole('button', { name: /Bob Brown/ });
    await user.type(screen.getByLabelText('Search members by name'), 'dan');
    await waitFor(() => expect(list.queryByText('Bob Brown')).not.toBeInTheDocument());
    expect(list.getByRole('button', { name: /Dana Diaz/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search members by name'));
    await user.type(screen.getByLabelText('Search members by name'), 'zzz');
    expect(await screen.findByText('No members found')).toBeInTheDocument();
  });

  it("opens a public member's profile: shared cases only, never feedback or notes, with a prompt to join", async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await bobRow());

    const heading = await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(heading.parentElement).toHaveTextContent('Class of 2027');
    expect(await screen.findByText('Airline profitability')).toBeInTheDocument();
    expect(screen.getByText('Bank market entry')).toBeInTheDocument();
    expect(screen.queryByText('Carol members-only case')).not.toBeInTheDocument();

    // Bob has not opened everything: his text isn't even offered to a visitor, though he shares it with members.
    expect(document.body.textContent).not.toContain('SECRET-FEEDBACK-FOR-MEMBERS');
    expect(document.body.textContent).not.toContain('SECRET-NOTES-FOR-MEMBERS');
    expect(screen.queryByText('See more details')).not.toBeInTheDocument();
    expect(screen.getByText('Written feedback and notes are not shared')).toBeInTheDocument();

    // Pairing needs your own cases, so visitors get an invitation instead of "Find a case for them".
    expect(screen.queryByRole('tab', { name: /Find a case for them/ })).not.toBeInTheDocument();
    expect(screen.getByText('Casing Bob?')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create an account' }).length).toBeGreaterThan(0);
  });

  it('filters a public member’s shared cases by name, casebook, industry and type', async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await bobRow());
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
    await browse(user);
    await user.click(await bobRow());
    await screen.findByText('Airline profitability');
    expect(env.calls).toEqual([]); // personal data repository untouched
    expect(env.community.calls).toEqual([]); // member side untouched
    expect(env.publicReader.calls).toEqual(expect.arrayContaining(['recentPeople', 'searchPeople', 'getPerson', 'getSharedCases']));
  });

  it('keeps sign-in and sign-up one click away, and a way back', async () => {
    const env = visitor();
    const { user } = await open(env);
    await user.click(await screen.findByRole('link', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back to CaseLab/ }));
    expect(await screen.findByRole('heading', { name: /Case with Bucket/  })).toBeInTheDocument();
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
    expect(confirm).toHaveTextContent(/not shown to visitors unless you turn on Open everything/i);
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
    const env = createFakeEnv({ profile: { ...MY_PROFILE, publicProfile: true, publicLinkOnly: false, burnedBooks: [], burnedCases: [], sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true } }, shared: mineShared });
    const { user, dialog } = await openProfile(env);

    // Members tab (default) can include written feedback.
    expect(await within(dialog).findByText('My airline case')).toBeInTheDocument();
    expect(within(dialog).getByText('See more details')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Visitors without an account' }));
    await waitFor(() => expect(env.community.calls).toContain('getPublicView'));
    expect(await within(dialog).findByText('My airline case')).toBeInTheDocument();
    expect(within(dialog).queryByText('See more details')).not.toBeInTheDocument();
    expect(dialog.textContent).not.toContain('MEMBERS-ONLY-TEXT');
    expect(within(dialog).getByText(/don't see written feedback, learning notes or other notes unless you turn on Open everything/i)).toBeInTheDocument();
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

describe('seeing more detail on a case', () => {
  const OPEN: Profile = { ...BOB, sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true, notes: true, details: true } };
  const DETAILED = row({
    caseId: 'd1',
    title: 'Detailed airline case',
    overall: 4,
    feedback: { overall: 'OPEN-FEEDBACK', skills: { framework: 'OPEN-FRAMEWORK-NOTE' } },
    notes: { wentWell: 'OPEN-WENT-WELL', concepts: 'OPEN-CONCEPTS' },
    otherNotes: 'OPEN-OTHER-NOTES',
  });
  const PLAIN = row({ caseId: 'd2', title: 'Plain bank case', overall: 3 });

  it('offers "See more details" on a case when the member opened everything, and shows feedback and notes there', async () => {
    const env = visitor({ members: [OPEN], shared: [DETAILED, PLAIN].map((r) => ({ ...r, ownerId: 'bob' })) });
    const { user } = await open(env);
    await user.click(await bobRow());
    await screen.findByText('Detailed airline case');

    // The standard card is what visitors see first; the detail is one click further.
    expect(screen.getAllByText('See more details')).toHaveLength(1); // only the case that has any
    await user.click(screen.getByText('See more details'));
    const card = screen.getByText('Detailed airline case').closest('li')!;
    for (const text of ['OPEN-FEEDBACK', 'OPEN-FRAMEWORK-NOTE', 'OPEN-WENT-WELL', 'OPEN-CONCEPTS', 'OPEN-OTHER-NOTES']) {
      expect(card).toHaveTextContent(text);
    }
    expect(screen.getByText('Plain bank case').closest('li')).not.toHaveTextContent('Other notes');
  });

  it('offers nothing extra when the member has not opened everything', async () => {
    const env = visitor({ shared: [{ ...DETAILED, ownerId: 'bob' }] });
    const { user } = await open(env);
    await user.click(await bobRow());
    await screen.findByText('Detailed airline case');
    expect(screen.queryByText('See more details')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('OPEN-OTHER-NOTES');
  });
});

describe('link only', () => {
  const LENA: Profile = { ...BOB, userId: 'lena', displayName: 'Lena Link', publicLinkOnly: true };
  const lenaCase = { ...row({ caseId: 'l1', title: 'Lena only-by-link case' }), ownerId: 'lena' };

  it('keeps the member off the front page and out of search', async () => {
    const env = visitor({ members: [BOB, LENA], shared: [...SHARED, lenaCase] });
    const { user } = await open(env);
    await screen.findByRole('heading', { name: 'Cased recently' });
    expect(screen.queryByText('Lena Link')).not.toBeInTheDocument(); // not under "Cased recently"
    await browse(user);
    await (await everyone()).findByRole('button', { name: /Bob Brown/ });
    expect(screen.queryByText('Lena Link')).not.toBeInTheDocument(); // not in the full list
    await user.type(screen.getByLabelText('Search members by name'), 'lena');
    expect(await screen.findByText('No members found')).toBeInTheDocument(); // not found by name
  });

  it('still opens their profile from the exact address', async () => {
    const env = visitor({ members: [BOB, LENA], shared: [...SHARED, lenaCase] });
    window.location.hash = '#/people/lena';
    await open(env);
    expect(await screen.findByRole('heading', { name: 'Lena Link' })).toBeInTheDocument();
    expect(await screen.findByText('Lena only-by-link case')).toBeInTheDocument();
  });
});

describe('choosing who finds you, and how much they see', () => {
  const openProfile = async (env: FakeEnv) => {
    const { user } = await open(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    return { user, dialog };
  };
  const mine = (env: FakeEnv) => env.community.profiles.find((p) => p.userId === TEST_USER.userId)!;
  const publicMe: Profile = { ...MY_PROFILE, publicProfile: true, sharing: { ...NO_SHARING, cases: true } };

  it('offers the front-page or link-only choice once visible, saves it, and shows a link to copy', async () => {
    const env = createFakeEnv({ profile: publicMe });
    const { user, dialog } = await openProfile(env);
    expect(within(dialog).getByRole('radio', { name: /On the front page and in search/ })).toBeChecked();
    expect((within(dialog).getByLabelText('Your profile address') as HTMLInputElement).value).toContain(`#/people/${TEST_USER.userId}`);

    await user.click(within(dialog).getByRole('radio', { name: /Only people with my link/ }));
    await waitFor(() => expect(mine(env).publicLinkOnly).toBe(true));
    expect(within(dialog).getByText(/The only way to cut it off is to turn visibility off here/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: /On the front page and in search/ }));
    await waitFor(() => expect(mine(env).publicLinkOnly).toBe(false));
  });

  it('clears link only when visibility without an account is switched off', async () => {
    const env = createFakeEnv({ profile: { ...publicMe, publicLinkOnly: true } });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('switch', { name: 'Visible without an account' }));
    await waitFor(() => expect(mine(env)).toMatchObject({ publicProfile: false, publicLinkOnly: false }));
    expect(within(dialog).queryByRole('radio', { name: /Only people with my link/ })).not.toBeInTheDocument();
  });

  it('offers no where-to-find-me choice while not visible without an account', async () => {
    const env = createFakeEnv();
    const { dialog } = await openProfile(env);
    expect(within(dialog).queryByRole('radio', { name: /Only people with my link/ })).not.toBeInTheDocument();
  });

  it('opens everything: the single detail switches show as included, and visitors are warned first', async () => {
    const env = createFakeEnv({ profile: publicMe });
    const { user, dialog } = await openProfile(env);
    const everything = within(dialog).getByRole('switch', { name: 'Open everything' });
    expect(everything).toHaveAttribute('aria-checked', 'false');

    await user.click(everything);
    const confirm = await screen.findByRole('dialog', { name: 'Open everything to visitors too?' });
    expect(confirm).toHaveTextContent(/scores, written feedback, learning notes and other notes/);
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(mine(env).sharing.details).toBe(false); // cancelling changes nothing

    await user.click(everything);
    const again = await screen.findByRole('dialog', { name: 'Open everything to visitors too?' });
    await user.click(within(again).getByRole('button', { name: 'Open everything' }));
    await waitFor(() => expect(mine(env).sharing.details).toBe(true));
    for (const name of ['Written feedback', 'Learning notes', 'Overall scores']) {
      const included = within(dialog).getByRole('switch', { name });
      expect(included).toHaveAttribute('aria-checked', 'true');
      expect(included).toBeDisabled();
    }
  });

  it('opens everything without a warning when not visible without an account', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, sharing: { ...NO_SHARING, cases: true } } });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('switch', { name: 'Open everything' }));
    await waitFor(() => expect(mine(env).sharing.details).toBe(true));
    expect(screen.queryByRole('dialog', { name: 'Open everything to visitors too?' })).not.toBeInTheDocument();
  });
});

describe('burned books and cases on a public profile', () => {
  const BURNED = { burnedBooks: ['Cosentino'], burnedCases: [{ title: 'Airline profit', book: 'Case in Point' }, { title: 'Piano tuners', book: '' }] };

  it('shows visitors the burned books and cases of a member who opted in, grouped by book, as not counted', async () => {
    const env = visitor({ members: [{ ...BOB, ...BURNED, sharing: { ...BOB.sharing, burned: true } }] });
    const { user } = await open(env);
    await user.click(await bobRow());
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.getByText(/Has burned/)).toHaveTextContent('Has burned Cosentino and 2 cases');
    await user.click(screen.getByText('See the burned cases'));
    expect(within(screen.getByRole('list', { name: 'Burned cases from Case in Point' })).getByText('Airline profit')).toBeInTheDocument();
    expect(screen.getByText(/not counted in Bob's totals/)).toBeInTheDocument();
  });

  it('shows visitors nothing about them when the member has not opted in', async () => {
    const env = visitor({ members: [{ ...BOB, ...BURNED }] });
    const { user } = await open(env);
    await user.click(await bobRow());
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByText(/Has burned/)).not.toBeInTheDocument();
    expect(screen.queryByText('See the burned cases')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Cosentino');
  });
});

describe('choosing whether visitors see what you have burned', () => {
  const openProfile = async (env: FakeEnv) => {
    const { user } = await open(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    return { user, dialog };
  };
  const mine = (env: FakeEnv) => env.community.profiles.find((p) => p.userId === TEST_USER.userId)!;
  const burnedMe: Profile = {
    ...MY_PROFILE,
    publicProfile: true,
    burnedBooks: ['Cosentino'],
    burnedCases: [{ title: 'Airline profit', book: '' }],
    sharing: { ...NO_SHARING, cases: true },
  };

  it('has a switch, off by default, that saves like the others', async () => {
    const env = createFakeEnv({ profile: burnedMe });
    const { user, dialog } = await openProfile(env);
    const toggle = within(dialog).getByRole('switch', { name: 'Show burned books and cases to visitors' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(mine(env).sharing.burned).toBe(true));
    await user.click(within(dialog).getByRole('switch', { name: 'Show burned books and cases to visitors' }));
    await waitFor(() => expect(mine(env).sharing.burned).toBe(false));
  });

  it('previews them for members always, and for visitors only once switched on', async () => {
    const env = createFakeEnv({ profile: burnedMe });
    const { user, dialog } = await openProfile(env);
    const preview = within(within(dialog).getByRole('region', { name: /What others see/ }));

    // Members tab (default): always there.
    expect(await preview.findByText(/Has burned/)).toHaveTextContent('Has burned Cosentino and 1 case');

    await user.click(within(dialog).getByRole('tab', { name: 'Visitors without an account' }));
    expect(preview.queryByText(/Has burned/)).not.toBeInTheDocument(); // switch is off

    await user.click(within(dialog).getByRole('switch', { name: 'Show burned books and cases to visitors' }));
    await waitFor(() => expect(preview.getByText(/Has burned/)).toBeInTheDocument());
    expect(preview.getByText(/Has burned/)).toHaveTextContent('Has burned Cosentino and 1 case');
  });
});
