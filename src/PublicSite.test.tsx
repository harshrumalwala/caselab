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
  publicProfile: true, burnedBooks: [], burnedCases: [],
  sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true, notes: true },
};
const CAROL: Profile = { userId: 'carol', displayName: 'Carol Chen', mbaClass: '', listed: true, publicProfile: false, burnedBooks: [], burnedCases: [], sharing: { ...NO_SHARING, cases: true } };

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

/** The only way in for someone without an account: the member's own profile link. */
async function openLink(env: FakeEnv, userId: string) {
  window.location.hash = `#/people/${userId}`;
  return open(env);
}

describe('the public front page', () => {
  it('sells the live case with Bucket: in the headline, in a section of its own lower down, in the top bar and in the closing call', async () => {
    const env = visitor();
    const { user } = await open(env);
    await screen.findByRole('heading', { name: /Case with Bucket/ });

    const tries = screen.getAllByRole('link', { name: /Try a live case, it.s free/ }); // the headline's button and the section's
    expect(tries).toHaveLength(2);
    tries.forEach((l) => expect(l).toHaveAttribute('href', '#/signup'));

    const section = screen.getByRole('region', { name: /Meet Bucket/ });
    expect(within(section).getByText(/20 to 40 minutes against the clock/)).toBeInTheDocument();
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

  it('has no member list, no search and nobody to browse', async () => {
    const env = visitor();
    await open(env);
    expect(await screen.findByRole('heading', { name: /Case with Bucket/ })).toBeInTheDocument();

    // Nothing to open the directory with, nothing to search with, and no "Cased recently".
    expect(screen.queryByRole('button', { name: 'Search all members' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search members by name')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cased recently' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Everyone' })).not.toBeInTheDocument();

    // No member's name reaches the page, public or not, and nothing was even asked for.
    expect(document.body.textContent).not.toMatch(/Bob Brown|Carol Chen/);
    expect(env.publicReader.calls).toEqual([]);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument(); // never an email address
  });

  it('says plainly what casing together means, without promising a public directory', async () => {
    const env = visitor();
    await open(env);
    const section = (await screen.findByRole('heading', { name: 'Find someone to case with' })).closest('section')!;
    expect(section).toHaveTextContent(/Inside CaseLab, members can look each other up by name/);
    expect(section).toHaveTextContent(/no list and no search/);
    expect(within(section).getByRole('link', { name: /Create an account to find people/ })).toHaveAttribute('href', '#/signup');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Cased recently|Search all members|Browse members/i);
    expect(text).toMatch(/No member list, no search and no email addresses out here/);
  });

  it('shows who cased the member and where the case came from, when they chose to share it', async () => {
    const env = visitor({
      shared: [
        row({ caseId: 'p1', title: 'Airline profitability', source: 'Booth casebook', partner: 'Sam Lee' }),
        row({ caseId: 'p2', title: 'Bank market entry', source: 'Case in Point' }),
      ],
    });
    await openLink(env, 'bob');
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

  it('names nobody, however many members have cased lately', async () => {
    const dated = (id: string, name: string, date: string): [Profile, SharedCase] => [
      { ...BOB, userId: id, displayName: name },
      row({ caseId: `c-${id}`, ownerId: id, title: `${name} case`, date }),
    ];
    const people = [
      dated('p1', 'Ana Ames', '2026-09-01'),
      dated('p2', 'Ben Boyd', '2026-10-20'),
      dated('p3', 'Cy Cole', '2026-10-05'),
    ];
    const env = visitor({ members: people.map(([p]) => p), shared: people.map(([, c]) => c) });
    await open(env);
    await screen.findByRole('heading', { name: /Case with Bucket/ });
    expect(document.body.textContent).not.toMatch(/Ana Ames|Ben Boyd|Cy Cole|Last cased/);
    expect(env.publicReader.calls).toEqual([]);
  });

  it('explains the tool in general terms, without singling out a class year or one school', async () => {
    const env = visitor();
    await open(env);
    await screen.findByRole('heading', { name: /Case with Bucket/ });
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Track your progress/);
    expect(text).not.toMatch(/first-year|second-year|1Y|2Y|Booth/i);
  });

  it('goes back to the front page from a profile, not to a list of members', async () => {
    const env = visitor();
    const { user } = await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByRole('button', { name: /All members/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /CaseLab/ }));
    expect(await screen.findByRole('heading', { name: /Case with Bucket/ })).toBeInTheDocument();
    expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument();
  });

  it("opens a member's profile from their link: shared cases only, never feedback or notes, with a prompt to join", async () => {
    const env = visitor();
    await openLink(env, 'bob');

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

  it('filters a member’s shared cases by name, casebook, industry and type', async () => {
    const env = visitor();
    const { user } = await openLink(env, 'bob');
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

  it("shows nothing about a member who hasn't turned their link on, even with their exact address", async () => {
    const env = visitor();
    await openLink(env, 'carol');
    expect(await screen.findByText("This member isn't available")).toBeInTheDocument();
    expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol members-only case')).not.toBeInTheDocument();
  });

  it('shows nothing for an address that belongs to nobody', async () => {
    const env = visitor();
    await openLink(env, 'nobody-at-all');
    expect(await screen.findByText("This member isn't available")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Bob Brown|Carol Chen/);
  });

  it('never asks for personal or member data, and only ever for the one member in the link', async () => {
    const env = visitor();
    await openLink(env, 'bob');
    await screen.findByText('Airline profitability');
    expect(env.calls).toEqual([]); // personal data repository untouched
    expect(env.community.calls).toEqual([]); // member side untouched
    expect([...new Set(env.publicReader.calls)].sort()).toEqual(['getPerson', 'getSharedCases']);
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

describe('turning your profile link on', () => {
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
    const toggle = within(dialog).getByRole('switch', { name: 'People with my link can see my profile' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    const confirm = await screen.findByRole('dialog', { name: 'Let people with your link see your profile?' });
    expect(confirm).toHaveTextContent(/not shown to visitors unless you turn on Open everything/i);
    expect(confirm).toHaveTextContent(/share this case in full/i); // warns what per-case settings mean
    expect(confirm).toHaveTextContent(/there is no public list or search/i); // and tells the truth about who can find you
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(mine(env)?.publicProfile).toBe(false); // cancelling changes nothing

    await user.click(toggle);
    await user.click(within(await screen.findByRole('dialog', { name: 'Let people with your link see your profile?' })).getByRole('button', { name: 'Turn my link on' }));
    await waitFor(() => expect(mine(env)?.publicProfile).toBe(true));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('switches off immediately, with no confirmation', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, publicProfile: true } });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('switch', { name: 'People with my link can see my profile' }));
    await waitFor(() => expect(mine(env)?.publicProfile).toBe(false));
  });

  it('is withdrawn when you stop appearing in People, and cannot be set while unlisted', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, publicProfile: true } });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('switch', { name: 'Appear in People search' }));
    await waitFor(() => expect(mine(env)).toMatchObject({ listed: false, publicProfile: false }));
    expect(within(dialog).getByRole('switch', { name: 'People with my link can see my profile' })).toBeDisabled();
  });

  it('previews exactly what visitors would see, separately from what members see', async () => {
    const mineShared: SharedCase[] = [
      row({ caseId: 'm1', ownerId: TEST_USER.userId, title: 'My airline case', overall: 5, feedback: { overall: 'MEMBERS-ONLY-TEXT' } }),
    ];
    const env = createFakeEnv({ profile: { ...MY_PROFILE, publicProfile: true, burnedBooks: [], burnedCases: [], sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true } }, shared: mineShared });
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

  it('tells you plainly that nobody without an account sees anything until you opt in', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, sharing: { ...NO_SHARING, cases: true } }, shared: [row({ caseId: 'm1', ownerId: TEST_USER.userId, title: 'My case' })] });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('tab', { name: 'Visitors without an account' }));
    expect(await within(dialog).findByText(/haven't turned your profile link on/i)).toBeInTheDocument();
    expect(within(dialog).queryByText('My case')).not.toBeInTheDocument();
  });
});

describe('profile setup and the audience', () => {
  it('starts with the profile link off, and saves it only if chosen', async () => {
    const env = createFakeEnv({ profile: null });
    const { user } = await open(env);
    await user.type(await screen.findByRole('textbox', { name: /^Your name/ }), 'Pat Public');
    const toggle = screen.getByRole('switch', { name: 'People with my link can see my profile' });
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
    await user.click(screen.getByRole('switch', { name: 'People with my link can see my profile' }));
    await user.click(screen.getByRole('checkbox', { name: /Let other members find me by name/ }));
    expect(screen.getByRole('switch', { name: 'People with my link can see my profile' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'People with my link can see my profile' })).toHaveAttribute('aria-checked', 'false');
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
    const { user } = await openLink(env, 'bob');
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
    await openLink(env, 'bob');
    await screen.findByText('Detailed airline case');
    expect(screen.queryByText('See more details')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('OPEN-OTHER-NOTES');
  });
});

describe('what to give this member next (a visitor has no log of their own)', () => {
  /** `n` cases of one kind, with distinct titles, all Bob's. */
  const lots = (n: number, over: Partial<SharedCase>): SharedCase[] =>
    Array.from({ length: n }, (_, i) => row({ caseId: `${over.caseType}-${over.industry}-${i}`, title: `${over.caseType} case ${i}`, ...over }));

  /** Five shared cases: three Profitability in tech, one Market Entry and one Market Sizing in financial services. */
  const FIVE: SharedCase[] = [
    ...lots(3, { caseType: 'Profitability', industry: 'Technology / SaaS', improvementArea: 'quant' }),
    ...lots(1, { caseType: 'Market Entry', industry: 'Financial Services' }),
    ...lots(1, { caseType: 'Market Sizing', industry: 'Financial Services' }),
  ];
  const section = async () => within(await screen.findByRole('region', { name: /What to give Bob next/ }));
  const chips = (where: ReturnType<typeof within>, lane: string, label: string) =>
    within(where.getByRole('group', { name: lane }))
      .queryAllByRole('list', { name: label })
      .flatMap((l) => within(l).getAllByRole('listitem').map((li) => li.textContent));

  it('names the case types and industries they have never shared, and the ones they have shared once', async () => {
    const env = visitor({ shared: FIVE });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.getByText(/From the 5 cases Bob shares: 3 case types and 2 industries so far/)).toBeInTheDocument();

    // The most asked-about types and industries come first, and only a few are named.
    expect(chips(give, 'Case types', 'Nothing shared yet')).toEqual(['Growth Strategy', 'Mergers and Acquisitions', 'Revenue', '+ 6 more']);
    expect(chips(give, 'Case types', 'Shared once')).toEqual(['Market Entry', 'Market Sizing']);
    expect(chips(give, 'Industries', 'Nothing shared yet')).toEqual([
      'Healthcare / Pharmaceuticals',
      'Consumer Products / Retail',
      'Energy / Utilities',
      '+ 7 more',
    ]);
    expect(chips(give, 'Industries', 'Shared once')).toEqual([]); // both of theirs have two cases
    expect(chips(give, 'Case types', 'Nothing shared yet')).not.toContain('Profitability');
  });

  it("quotes the member's own improvement focus as theirs, with the count behind it", async () => {
    const env = visitor({ shared: FIVE });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.getByText(/Bob's own focus: Quant \/ Math/)).toBeInTheDocument();
    expect(give.getByText(/tagged it as the main thing to improve on 3 of the 5 cases they share/)).toBeInTheDocument();
  });

  it('says nothing about a focus the member does not share', async () => {
    const env = visitor({ shared: FIVE.map((c) => ({ ...c, improvementArea: null })) });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.queryByText(/own focus/)).not.toBeInTheDocument();
    expect(give.getByRole('group', { name: 'Case types' })).toBeInTheDocument(); // the rest is still there
  });

  it('shows coverage only, and suggests nothing, when too few cases are shared to say anything', async () => {
    const env = visitor({ shared: FIVE.slice(0, 2) });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.getByText(/Only 2 cases shared so far, which is too few to read anything into what's missing/)).toBeInTheDocument();
    expect(within(give.getByRole('list', { name: 'Case types' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Profitability']);
    expect(within(give.getByRole('list', { name: 'Industries' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Technology / SaaS']);
    expect(give.queryByRole('list', { name: 'Nothing shared yet' })).not.toBeInTheDocument();
    expect(give.queryByRole('list', { name: 'Shared once' })).not.toBeInTheDocument();
  });

  it('does not appear at all for a member who shares no case history', async () => {
    const env = visitor({ members: [{ ...BOB, sharing: { ...NO_SHARING } }], shared: [] });
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByRole('region', { name: /What to give Bob next/ })).not.toBeInTheDocument();
    expect(screen.getByText('No shared cases')).toBeInTheDocument();
  });

  it('keeps unpracticed neutral: never a weakness, and never the catch-all "Other"', async () => {
    const env = visitor({ shared: [...FIVE, ...lots(1, { caseType: 'Other', industry: 'Other' })] });
    await openLink(env, 'bob');
    const give = await section();
    for (const lane of ['Case types', 'Industries']) {
      for (const label of ['Nothing shared yet', 'Shared once']) expect(chips(give, lane, label), `${lane} / ${label}`).not.toContain('Other');
    }
    expect(give.getByText(/exposure, not a verdict: a case type they haven't shared yet isn't a weakness/)).toBeInTheDocument();
    expect(give.queryByText(/gap|weakness in|behind|needs work/i)).not.toBeInTheDocument();
  });

  it('counts only shared practice cases: burned cases are not in the numbers', async () => {
    const burned = { burnedBooks: ['Cosentino'], burnedCases: [{ title: 'Piano tuners', book: '' }, { title: 'Airline profit', book: '' }] };
    const env = visitor({ members: [{ ...BOB, ...burned, sharing: { ...BOB.sharing, burned: true } }], shared: FIVE });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.getByText(/From the 5 cases Bob shares/)).toBeInTheDocument();
    expect(give.queryByText(/Piano tuners|Cosentino/)).not.toBeInTheDocument();
  });

  it('asks for nothing a visitor did not already ask for: no new read, and no model anywhere near it', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch');
    const env = visitor({ shared: FIVE });
    await openLink(env, 'bob');
    await section();
    expect([...new Set(env.publicReader.calls)].sort()).toEqual(['getPerson', 'getSharedCases']);
    expect(env.calls).toEqual([]); // personal data repository untouched
    expect(env.community.calls).toEqual([]); // member side untouched
    expect(fetched).not.toHaveBeenCalled();
    fetched.mockRestore();
  });
});

describe('the link is the only way in', () => {
  const LENA: Profile = { ...BOB, userId: 'lena', displayName: 'Lena Link' };
  const lenaCase = { ...row({ caseId: 'l1', title: 'Lena only-by-link case' }), ownerId: 'lena' };

  it('shows nothing about a member anywhere on the front page, however much they share', async () => {
    const env = visitor({ members: [BOB, LENA], shared: [...SHARED, lenaCase] });
    await open(env);
    await screen.findByRole('heading', { name: /Case with Bucket/ });
    expect(document.body.textContent).not.toMatch(/Lena Link|Bob Brown|only-by-link/);
    expect(env.publicReader.calls).toEqual([]);
  });

  it('opens their profile from the exact address, and only that member', async () => {
    const env = visitor({ members: [BOB, LENA], shared: [...SHARED, lenaCase] });
    await openLink(env, 'lena');
    expect(await screen.findByRole('heading', { name: 'Lena Link' })).toBeInTheDocument();
    expect(await screen.findByText('Lena only-by-link case')).toBeInTheDocument();
    expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument();
    expect(screen.queryByText('Airline profitability')).not.toBeInTheDocument();
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

  it('is one switch, with no choice of audience, and shows the link to copy while it is on', async () => {
    const env = createFakeEnv({ profile: publicMe });
    const { dialog } = await openProfile(env);
    expect((within(dialog).getByLabelText('Your profile address') as HTMLInputElement).value).toContain(`#/people/${TEST_USER.userId}`);
    expect(within(dialog).getByText(/The only way to cut it off is to turn this switch off/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Copy link/ })).toBeInTheDocument();

    // The old two-way choice is gone, and nothing promises a front page or a search.
    expect(within(dialog).queryByRole('radio', { name: /On the front page and in search/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: /Only people with my link/ })).not.toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/Cased recently|front page/i);
  });

  it('hides the link and its address again when the switch is turned off', async () => {
    const env = createFakeEnv({ profile: publicMe });
    const { user, dialog } = await openProfile(env);
    await user.click(within(dialog).getByRole('switch', { name: 'People with my link can see my profile' }));
    await waitFor(() => expect(mine(env)).toMatchObject({ publicProfile: false }));
    expect(within(dialog).queryByLabelText('Your profile address')).not.toBeInTheDocument();
  });

  it('shows no profile address at all while the switch is off', async () => {
    const env = createFakeEnv();
    const { dialog } = await openProfile(env);
    expect(within(dialog).queryByLabelText('Your profile address')).not.toBeInTheDocument();
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

describe('burned books and cases on a profile opened by link', () => {
  const BURNED = { burnedBooks: ['Cosentino'], burnedCases: [{ title: 'Airline profit', book: 'Case in Point' }, { title: 'Piano tuners', book: '' }] };

  it('shows visitors the burned books and cases of a member who opted in, grouped by book, as not counted', async () => {
    const env = visitor({ members: [{ ...BOB, ...BURNED, sharing: { ...BOB.sharing, burned: true } }] });
    const { user } = await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.getByText(/Has burned/)).toHaveTextContent('Has burned Cosentino and 2 cases');
    await user.click(screen.getByText('See the burned cases'));
    expect(within(screen.getByRole('list', { name: 'Burned cases from Case in Point' })).getByText('Airline profit')).toBeInTheDocument();
    expect(screen.getByText(/not counted in Bob's totals/)).toBeInTheDocument();
  });

  it('shows visitors nothing about them when the member has not opted in', async () => {
    const env = visitor({ members: [{ ...BOB, ...BURNED }] });
    await openLink(env, 'bob');
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
