import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(section).toHaveTextContent(/own link is the way in/);
    expect(within(section).getByRole('link', { name: /Create an account to find people/ })).toHaveAttribute('href', '#/signup');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Cased recently|Search all members|Browse members/i);

    const privacy = screen.getByRole('heading', { name: 'How privacy works' }).closest('section')!;
    expect(privacy).toHaveTextContent(/profile opens for the people they gave their link to/);

    // The copy says what the product is, not what it stopped being: a visitor has never seen a directory, so nothing here may
    // describe the way in as the absence of one, or read like a changelog.
    for (const part of [section, privacy]) {
      expect(part.textContent ?? '').not.toMatch(/no list|no search|no member list|nothing to browse|nobody to browse|no longer|used to/i);
    }
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

describe('the live case band a visitor meets on a profile', () => {
  const band = () => screen.getByRole('region', { name: 'Practise a whole case with Bucket' });

  it('says what a live case is and offers an account, without a word about the member whose page it is', async () => {
    const env = visitor();
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });

    expect(band()).toHaveTextContent(/Bucket plays the interviewer on a real casebook case/);
    expect(band()).toHaveTextContent(/23 to 40 minutes/);
    expect(within(band()).getByRole('link', { name: /Create an account/ })).toHaveAttribute('href', '#/signup');

    // The same band on every profile: it carries nothing of the member, and the page still opens as theirs.
    expect(band().textContent).not.toMatch(/Bob|Class of 2027|Airline profitability/);
    const after = screen.getByRole('heading', { name: 'Bob Brown' }).compareDocumentPosition(band()) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(after).toBeTruthy();
    // Nor a line telling the reader how to read it.
    expect(band().textContent).not.toMatch(/what this means|in other words|keep in mind|don't worry|no need to/i);
  });

  it('calls the coach Bucket and tags it AI, and names no model or model maker', async () => {
    const env = visitor();
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(within(band()).getByText('AI')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Claude|Anthropic/i);
  });
});

describe('the two views of a member a visitor gets', () => {
  const tabs = () => screen.getByRole('tablist', { name: 'Profile sections' });
  const tab = (name: RegExp) => screen.getByRole('tab', { name });
  /**
   * Which view is on screen on a phone. Both are in the document at every width — from `lg` they sit side by side —
   * and which one a narrow screen shows is a class, because the stylesheet is not loaded in these tests.
   */
  const shown = (panel: HTMLElement) => !panel.classList.contains('hidden');
  const panel = (name: RegExp) => screen.getByRole('tabpanel', { name });

  it('switches between what to give them and their cases, the way a member switches between theirs', async () => {
    const env = visitor();
    const { user } = await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });

    // The pair reads like the member's: the best answer to "what do I give them" first, their cases second.
    expect(within(tabs()).getAllByRole('tab').map((t) => t.textContent)).toEqual(['What to give Bob next', 'Shared cases (2)']);
    expect(tab(/What to give Bob next/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/What to give Bob next/)).toHaveAttribute('data-slide-active', 'true');
    expect(tab(/Shared cases/)).toHaveAttribute('aria-selected', 'false');
    expect(tab(/Shared cases/)).not.toHaveAttribute('data-slide-active');
    expect(shown(panel(/What to give Bob next/))).toBe(true);
    expect(shown(panel(/Shared cases/))).toBe(false);

    await user.click(tab(/Shared cases/));
    expect(tab(/Shared cases/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Shared cases/)).toHaveAttribute('data-slide-active', 'true');
    expect(tab(/What to give Bob next/)).toHaveAttribute('aria-selected', 'false');
    expect(shown(panel(/Shared cases/))).toBe(true);
    expect(shown(panel(/What to give Bob next/))).toBe(false);
    expect(within(panel(/Shared cases/)).getByText('Airline profitability')).toBeInTheDocument();

    await user.click(tab(/What to give Bob next/));
    expect(shown(panel(/What to give Bob next/))).toBe(true);
    expect(within(panel(/What to give Bob next/)).getByRole('region', { name: /What to give Bob next/ })).toBeInTheDocument();
  });

  it('puts both views on screen at once where there is room for them, and the switch away', async () => {
    const env = visitor();
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    // From `lg` the two are columns, so neither is hidden and there is nothing left to switch.
    expect(panel(/What to give Bob next/)).toHaveClass('lg:block', 'lg:col-span-7');
    expect(panel(/Shared cases/)).toHaveClass('lg:block');
    expect(tabs()).toHaveClass('lg:hidden');
  });

  it('keeps the person, the live case band and the invitation in front of a visitor whichever view is open', async () => {
    const env = visitor();
    const { user } = await openLink(env, 'bob');
    const heading = await screen.findByRole('heading', { name: 'Bob Brown' });
    const outside = [heading, screen.getByRole('region', { name: 'Practise a whole case with Bucket' }), screen.getByText('Casing Bob?')];

    for (const view of [/Shared cases/, /What to give Bob next/]) {
      await user.click(tab(view));
      const panels = screen.getAllByRole('tabpanel');
      for (const el of outside) {
        expect(el).toBeInTheDocument();
        expect(panels.some((p) => p.contains(el))).toBe(false);
      }
    }
  });

  /** Pretend to be a window wide enough for the columns (Tailwind's `lg`), or one that is not. */
  const setWide = (wide: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: wide && query.includes('64rem'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

  afterEach(() => vi.unstubAllGlobals());

  it('is two views and no tabs where both are on screen: nothing to switch, and nothing saying there is', async () => {
    setWide(true);
    const env = visitor();
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });

    // Columns, so the tab interface is not there at all: a tabpanel with no reachable tablist describes a page nobody is on.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.queryAllByRole('tabpanel')).toEqual([]);

    // Both views are simply on the page, and the case list still says what it is.
    expect(screen.getByRole('region', { name: /What to give Bob next/ })).toBeInTheDocument();
    const cases = screen.getByRole('region', { name: 'Shared cases (2)' });
    expect(within(cases).getByText('Airline profitability')).toBeInTheDocument();
  });

  it('falls back to the tabs where the browser cannot say how wide the window is', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const env = visitor();
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    // A working switch is the safe answer at any width; two orphaned panels are not.
    expect(screen.getByRole('tablist', { name: 'Profile sections' })).toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(2);
  });

  it('offers no switch to a member who shares no case history: their page is the one view', async () => {
    const env = visitor({ members: [{ ...BOB, sharing: { ...NO_SHARING } }], shared: [] });
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('No shared cases')).toBeInTheDocument();
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
    expect(confirm).toHaveTextContent(/only way to your profile from outside CaseLab/i); // and tells the truth about who can reach you
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
  /** Bob, with the skill scores on his cases on his link too. */
  const SCORER: Profile = { ...BOB, sharing: { ...BOB.sharing, skills: true } };
  const section = async () => within(await screen.findByRole('region', { name: /What to give Bob next/ }));
  const names = (where: ReturnType<typeof within>, list: string) =>
    within(where.getByRole('list', { name: list }))
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
  /** What they have never cased, every name of it. */
  const uncased = (where: ReturnType<typeof within>, title: string) => names(where, `${title}: hasn't cased yet`);
  /** What they have cased, as the bars are drawn and as a screen reader reads them. */
  const cased = (where: ReturnType<typeof within>, title: string) => names(where, `${title}: cased`);

  it('names every case type and industry they have never cased, with nothing folded into "+ n more"', async () => {
    const env = visitor({ shared: FIVE });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.getByText(/From the 5 cases Bob shares\./)).toBeInTheDocument();

    // The ones interviews ask about most come first, and all nine are there.
    const types = uncased(give, 'Case types');
    expect(types.slice(0, 3)).toEqual(['Growth Strategy', 'Mergers and Acquisitions', 'Revenue']);
    expect(types).toContain('Non-traditional');
    expect(types).toHaveLength(9);
    expect(types).not.toContain('Profitability');

    // Then what they have done, fewest cases first, with the counts the chart draws.
    expect(cased(give, 'Case types')).toEqual(['Market Entry: 1 case', 'Market Sizing: 1 case', 'Profitability: 3 cases']);

    expect(uncased(give, 'Industries').slice(0, 3)).toEqual([
      'Healthcare / Pharmaceuticals',
      'Consumer Products / Retail',
      'Energy / Utilities',
    ]);
    expect(uncased(give, 'Industries')).toHaveLength(10);
    expect(cased(give, 'Industries')).toEqual(['Financial Services: 2 cases', 'Technology / SaaS: 3 cases']);
    expect(give.queryByText(/\+ \d+ more/)).not.toBeInTheDocument();
  });

  it('leads with the tag the member put on their own cases, in their words', async () => {
    const env = visitor({ shared: FIVE });
    await openLink(env, 'bob');
    const give = await section();
    const wants = within(give.getByRole('group', { name: 'Wants practice in' }));
    expect(wants.getByText('Quant / Math')).toBeInTheDocument();
    expect(wants.getByText(/Bob's own tag, on 3 cases/)).toBeInTheDocument();
  });

  it('says nothing about a focus the member never tagged', async () => {
    const env = visitor({ shared: FIVE.map((c) => ({ ...c, improvementArea: null })) });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.queryByRole('group', { name: 'Wants practice in' })).not.toBeInTheDocument();
  });

  it('shows what is in the cases, and names no gap, when too few are shared to point anywhere', async () => {
    const env = visitor({ shared: FIVE.slice(0, 2) });
    await openLink(env, 'bob');
    const give = await section();
    expect(give.getByText(/From the 2 cases Bob shares\./)).toBeInTheDocument();
    expect(cased(give, 'Case types')).toEqual(['Profitability: 2 cases']);
    expect(cased(give, 'Industries')).toEqual(['Technology / SaaS: 2 cases']);
    expect(give.queryByText("Hasn't cased yet")).not.toBeInTheDocument();
  });

  it('does not appear at all for a member who shares no case history', async () => {
    const env = visitor({ members: [{ ...BOB, sharing: { ...NO_SHARING } }], shared: [] });
    await openLink(env, 'bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByRole('region', { name: /What to give Bob next/ })).not.toBeInTheDocument();
    expect(screen.getByText('No shared cases')).toBeInTheDocument();
  });

  it('keeps uncased neutral: never a weakness, and never the catch-all "Other" as a gap', async () => {
    const env = visitor({ shared: [...FIVE, ...lots(1, { caseType: 'Other', industry: 'Other' })] });
    await openLink(env, 'bob');
    const give = await section();
    for (const title of ['Case types', 'Industries']) {
      expect(uncased(give, title), title).not.toContain('Other');
      expect(cased(give, title), title).toContain('Other: 1 case'); // still counted as something they have done
    }
    expect(give.queryByText(/gap|weakness in|behind|needs work/i)).not.toBeInTheDocument();
    // "Hasn't cased yet" is the whole claim. Nothing explains that claim or guards it.
    expect(give.queryByText(/not a verdict|isn't a weakness|this is exposure/i)).not.toBeInTheDocument();
  });

  it('never lets one case be the headline score, and keeps the scores in the same card', async () => {
    const rated: SharedCase[] = [
      ...Array.from({ length: 3 }, (_, i) => row({ caseId: `sc${i}`, title: `Scored case ${i}`, skillScores: { framework: 4, quant: 3 } })),
      row({ caseId: 'sc-one', title: 'One behavioral case', caseType: 'Revenue', skillScores: { behavioral1: 2 } }),
    ];
    const env = visitor({ members: [SCORER], shared: rated });
    await openLink(env, 'bob');
    const give = await section();

    // Strongest first, each with the number of cases behind it; the single Behavioral case is not among them.
    expect(names(give, 'Scores Bob shares')).toEqual([
      'Framework: 4.0 out of 5, from 3 cases',
      'Quant / Math: 3.0 out of 5, from 3 cases',
    ]);
    expect(give.getByText('Only a case or two so far:').parentElement).toHaveTextContent('Only a case or two so far: Behavioral 2.0');
    // One card, not two: the averages are not repeated below.
    expect(screen.queryByRole('region', { name: 'Shared performance' })).not.toBeInTheDocument();
  });

  it('holds nobody up against the reader on a link: the card describes this member and stops', async () => {
    const rated: SharedCase[] = Array.from({ length: 3 }, (_, i) => row({ caseId: `sc${i}`, title: `Scored case ${i}`, skillScores: { framework: 4, quant: 3 } }));
    const env = visitor({ members: [SCORER], shared: rated });
    await openLink(env, 'bob');
    const give = await screen.findByRole('region', { name: /What to give Bob next/ });
    // A visitor has no log, so there is no pairing to draw and nothing in the card speaks about the reader.
    expect(screen.queryByRole('group', { name: 'Casing together' })).not.toBeInTheDocument();
    expect(give.textContent).not.toMatch(/You can help Bob with|than you|ahead of you/i);
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

describe('what this member is sharpening (their own switch, off until they ask)', () => {
  /** Bob, with skill scores shared and the summary switched on. */
  const SHARPENER: Profile = { ...BOB, sharing: { ...BOB.sharing, skills: true, sharpening: true } };
  /** Four rated cases: Quant is weak, Framework is strong, Exhibits sits in the middle. */
  const RATED: SharedCase[] = Array.from({ length: 4 }, (_, i) =>
    row({ caseId: `r${i}`, title: `Rated case ${i}`, skillScores: { quant: 2, framework: 5, exhibits: 3 } }),
  );
  const section = async () => within(await screen.findByRole('region', { name: /What Bob is sharpening/ }));
  /** The sentence under their name, which tells a visitor what this page holds. */
  const header = async () => (await screen.findByRole('heading', { name: 'Bob Brown' })).parentElement as HTMLElement;
  const skills = (where: ReturnType<typeof within>, label: string) =>
    within(where.getByRole('list', { name: label }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);

  it('names what they are sharpening and what they are strong at, in the product\'s own words', async () => {
    const env = visitor({ members: [SHARPENER], shared: RATED });
    await openLink(env, 'bob');
    const card = await section();
    expect(skills(card, 'Sharpening now')).toEqual(['Quant / Math', 'Exhibits & Charts']);
    expect(skills(card, 'Strong already')).toEqual(['Framework']);
    expect(card.getByText(/From the skill scores on the 4 cases Bob shares\./)).toBeInTheDocument();
  });

  it('presents no number as a grade, ranks nothing and never calls anything a weakness', async () => {
    const env = visitor({ members: [SHARPENER], shared: RATED });
    await openLink(env, 'bob');
    const card = await section();
    expect(card.queryByText(/weakest|worst|weakness|poor|behind/i)).not.toBeInTheDocument();
    for (const label of ['Sharpening now', 'Strong already']) {
      for (const name of skills(card, label)) expect(name).not.toMatch(/\d/); // no average, no position
    }
    // At most three a side, out of eight skills: never a table of them all.
    expect(skills(card, 'Sharpening now').length + skills(card, 'Strong already').length).toBeLessThanOrEqual(6);
  });

  it('is not on the page at all until the member switches it on, however much else they share', async () => {
    const env = visitor({ members: [{ ...SHARPENER, sharing: { ...SHARPENER.sharing, sharpening: false } }], shared: RATED });
    await openLink(env, 'bob');
    await screen.findByText('Rated case 0'); // the rest of the profile is there, scores and all
    expect(screen.queryByRole('region', { name: /sharpening/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('region', { name: /What to give Bob next/ })).toBeInTheDocument();
  });

  it('has nothing to say when the member shares no skill scores', async () => {
    const env = visitor({ members: [SHARPENER], shared: RATED.map((c) => ({ ...c, skillScores: null })) });
    await openLink(env, 'bob');
    await screen.findByText('Rated case 0');
    expect(screen.queryByRole('region', { name: /What Bob is sharpening/ })).not.toBeInTheDocument();
  });

  it('stays silent below the minimum, with no placeholder and no explanation', async () => {
    const env = visitor({ members: [SHARPENER], shared: RATED.slice(0, 2) });
    await openLink(env, 'bob');
    await screen.findByText('Rated case 0');
    expect(screen.queryByRole('region', { name: /What Bob is sharpening/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/not enough data|too few rated|once they have rated/i);
  });

  it('is announced at the top of the page, where it is on the page', async () => {
    const env = visitor({ members: [SHARPENER], shared: RATED });
    await openLink(env, 'bob');
    await section();
    expect(await header()).toHaveTextContent(/Shares case history, overall scores, skill scores and what they're sharpening/);
  });

  it('is not announced below the minimum: the switch is on, and the page carries no summary to read', async () => {
    const env = visitor({ members: [SHARPENER], shared: RATED.slice(0, 2) });
    await openLink(env, 'bob');
    await screen.findByText('Rated case 0');
    expect(await header()).toHaveTextContent(/Shares case history, overall scores and skill scores/);
    expect((await header()).textContent).not.toMatch(/sharpening/i);
    // And the card's own silence stands: no card, and nothing said about having too little.
    expect(screen.queryByRole('region', { name: /What Bob is sharpening/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/not enough data|too few rated|once they have rated/i);
  });

  it('is not announced when their shared cases carry no skill scores for it to read', async () => {
    const env = visitor({ members: [SHARPENER], shared: RATED.map((c) => ({ ...c, skillScores: null })) });
    await openLink(env, 'bob');
    await screen.findByText('Rated case 0');
    expect((await header()).textContent).not.toMatch(/sharpening/i);
  });

  it('is not announced with the switch off, however many scores they share', async () => {
    const env = visitor({ members: [{ ...SHARPENER, sharing: { ...SHARPENER.sharing, sharpening: false } }], shared: RATED });
    await openLink(env, 'bob');
    await screen.findByText('Rated case 0');
    expect(await header()).toHaveTextContent(/Shares case history, overall scores and skill scores/);
    expect((await header()).textContent).not.toMatch(/sharpening/i);
  });

  it('counts only shared practice cases, and asks for nothing a visitor did not already ask for', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch');
    const burned = { burnedBooks: ['Cosentino'], burnedCases: [{ title: 'Piano tuners', book: '' }] };
    const env = visitor({ members: [{ ...SHARPENER, ...burned, sharing: { ...SHARPENER.sharing, burned: true } }], shared: RATED });
    await openLink(env, 'bob');
    const card = await section();
    expect(card.getByText(/on the 4 cases Bob shares/)).toBeInTheDocument(); // the burned case is not one of them
    expect([...new Set(env.publicReader.calls)].sort()).toEqual(['getPerson', 'getSharedCases']);
    expect(env.calls).toEqual([]);
    expect(env.community.calls).toEqual([]);
    expect(fetched).not.toHaveBeenCalled();
    fetched.mockRestore();
  });
});

describe('the profile link says its piece and stops', () => {
  /** Bob, sharing everything a link can carry, with enough rated cases for both cards to be full. */
  const SHARER: Profile = { ...BOB, sharing: { ...BOB.sharing, skills: true, sharpening: true, improvement: true } };
  const CASES: SharedCase[] = [
    ...Array.from({ length: 3 }, (_, i) =>
      row({ caseId: `p${i}`, title: `Profit case ${i}`, skillScores: { quant: 2, framework: 5 }, improvementArea: 'quant' }),
    ),
    row({ caseId: 'e1', title: 'Entry case', caseType: 'Market Entry', industry: 'Financial Services', skillScores: { quant: 2, framework: 5 } }),
  ];

  /**
   * The convention: a card shows what it has and stops. No sentence that tells the reader how to read the card
   * above it, guards against a misreading nobody has made, or says in prose what the chips already show.
   */
  it('carries no line explaining, hedging or restating what is already on the card', async () => {
    const env = visitor({ members: [SHARER], shared: CASES });
    await openLink(env, 'bob');
    const give = await screen.findByRole('region', { name: /What to give Bob next/ });
    const sharpening = await screen.findByRole('region', { name: /What Bob is sharpening/ });
    for (const card of [give, sharpening]) {
      const text = card.textContent ?? '';
      expect(text, card.getAttribute('aria-labelledby') ?? '').not.toMatch(
        /not a verdict|isn't a weakness|this is exposure|too few to read|only what Bob chose to share|chose to show this|no numbers|no ranking|what this means|in other words|keep in mind|bear in mind|which means that/i,
      );
    }
    // What is left on each: the lists, and one line about the case to give them.
    expect(give.textContent).toMatch(/From the 4 cases Bob shares\./);
    expect(sharpening.textContent).toMatch(/From the skill scores on the 4 cases Bob shares\./);
    expect(sharpening.textContent).toMatch(/A useful case to give Bob asks for what they're sharpening/);
  });
});

describe('deciding whether to be summarised on your link', () => {
  const openProfile = async (env: FakeEnv) => {
    const { user } = await open(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    return { user, dialog };
  };
  const mine = (env: FakeEnv) => env.community.profiles.find((p) => p.userId === TEST_USER.userId)!;
  const ME: Profile = { ...MY_PROFILE, publicProfile: true, sharing: { ...NO_SHARING, cases: true, skills: true } };
  const MY_CASES: SharedCase[] = Array.from({ length: 4 }, (_, i) =>
    row({ caseId: `m${i}`, ownerId: TEST_USER.userId, title: `My case ${i}`, skillScores: { quant: 2, framework: 5 } }),
  );

  it('has a switch of its own, off by default, that saves like the others', async () => {
    const env = createFakeEnv({ profile: ME, shared: MY_CASES });
    const { user, dialog } = await openProfile(env);
    const toggle = within(dialog).getByRole('switch', { name: "What I'm sharpening" });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(mine(env).sharing.sharpening).toBe(true));
    await user.click(within(dialog).getByRole('switch', { name: "What I'm sharpening" }));
    await waitFor(() => expect(mine(env).sharing.sharpening).toBe(false));
  });

  it('tells the member what the switch writes, in a line that does not describe it by what it leaves out', async () => {
    const env = createFakeEnv({ profile: ME, shared: MY_CASES });
    const { dialog } = await openProfile(env);
    const option = within(dialog).getByRole('switch', { name: "What I'm sharpening" }).closest('li') as HTMLElement;
    expect(option).toHaveTextContent(/Whether CaseLab sums up the skill scores you already share/);
    expect(option).toHaveTextContent(/Needs Skill scores to work from\./);
    expect(option.textContent).not.toMatch(/no numbers|no ranking|never a grade|not a verdict/i);
  });

  it('shows the member the card a link holder would read before they decide, and says where it stands', async () => {
    const env = createFakeEnv({ profile: ME, shared: MY_CASES });
    const { user, dialog } = await openProfile(env);
    const preview = within(within(dialog).getByRole('region', { name: /What others see/ }));
    await user.click(within(dialog).getByRole('tab', { name: 'Visitors without an account' }));

    const card = within(await preview.findByRole('region', { name: /What Test is sharpening/ }));
    expect(within(card.getByRole('list', { name: 'Sharpening now' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Quant / Math']);
    expect(within(card.getByRole('list', { name: 'Strong already' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Framework']);
    expect(card.getByText(/joins your link when you turn on What I'm sharpening/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('switch', { name: "What I'm sharpening" }));
    await waitFor(() => expect(preview.getByText(/on your link now, word for word/)).toBeInTheDocument());
  });

  /** The switch on, and whatever rows the member shares: only they are told why the card is empty. */
  const emptyPreview = async (shared: SharedCase[]) => {
    const env = createFakeEnv({ profile: { ...ME, sharing: { ...ME.sharing, sharpening: true } }, shared });
    const { user, dialog } = await openProfile(env);
    const preview = within(within(dialog).getByRole('region', { name: /What others see/ }));
    await user.click(within(dialog).getByRole('tab', { name: 'Visitors without an account' }));
    return preview;
  };

  it('tells the member their link is waiting on a third rated case, which the link itself never says', async () => {
    const preview = await emptyPreview(MY_CASES.slice(0, 2));
    expect(await preview.findByText(/joins your link once you share skill scores on 3 cases/)).toBeInTheDocument();
    expect(preview.queryByRole('region', { name: /is sharpening/ })).not.toBeInTheDocument();
  });

  it('tells the member when every shared score sits in the middle, so nothing stands out to name', async () => {
    // Framework alternates 3 and 4: above the sharpening threshold, below the strong band, so neither list has it.
    const middling = [3, 4, 3, 4].map((rating, i) => row({ caseId: `mid${i}`, ownerId: TEST_USER.userId, title: `Middle case ${i}`, skillScores: { framework: rating as 3 | 4 } }));
    const preview = await emptyPreview(middling);
    expect(await preview.findByText(/sit in the middle so far, so there is nothing to name yet/)).toBeInTheDocument();
    expect(preview.queryByRole('region', { name: /is sharpening/ })).not.toBeInTheDocument();
  });

  it('is kept to the visitors the link reaches: the members preview does not show it, or claim it', async () => {
    const env = createFakeEnv({ profile: { ...ME, sharing: { ...ME.sharing, sharpening: true } }, shared: MY_CASES });
    const { dialog } = await openProfile(env);
    const preview = within(within(dialog).getByRole('region', { name: /What others see/ }));
    await preview.findByText(/My case 0/);
    expect(preview.queryByRole('region', { name: /is sharpening/ })).not.toBeInTheDocument();
    expect(preview.getByText(/· Shares/)).toHaveTextContent('Shares case history and skill scores');
  });

  it('tells the member their preview holds the summary once it does', async () => {
    const preview = await emptyPreview(MY_CASES);
    await preview.findByRole('region', { name: /What Test is sharpening/ });
    expect(preview.getByText(/· Shares/)).toHaveTextContent("Shares case history, skill scores and what they're sharpening");
  });

  it('does not claim the summary in the preview header while the preview has none to show', async () => {
    const preview = await emptyPreview(MY_CASES.slice(0, 2)); // the switch is on, one rated case short of the minimum
    expect(await preview.findByText(/joins your link once you share skill scores on 3 cases/)).toBeInTheDocument();
    expect(preview.getByText(/· Shares/)).toHaveTextContent('Shares case history and skill scores');
    expect(preview.getByText(/· Shares/).textContent).not.toMatch(/sharpening/i);
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
