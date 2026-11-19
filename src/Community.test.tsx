import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile, type SharedCase } from './domain/community';
import { createFakeEnv, TEST_PASSWORD, TEST_USER, type FakeEnv } from './test/fakeBackend';
import { makeCase } from './test/builders';

type User = ReturnType<typeof userEvent.setup>;

const BOB: Profile = {
  userId: 'bob',
  displayName: 'Bob Brown',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: false, burnedBooks: [], burnedCases: [],
  sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true },
};
const CAROL: Profile = { userId: 'carol', displayName: 'Carol Chen', mbaClass: '', listed: true, publicProfile: false, burnedBooks: [], burnedCases: [], sharing: NO_SHARING };
const HIDDEN: Profile = { userId: 'ghost', displayName: 'Hidden Harry', mbaClass: '', listed: false, publicProfile: false, burnedBooks: [], burnedCases: [], sharing: NO_SHARING };

const shared = (over: Partial<SharedCase> & Pick<SharedCase, 'caseId' | 'title'>): SharedCase => ({
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

const BOB_CASES: SharedCase[] = [
  shared({ caseId: 'b1', title: 'Airline profitability', source: 'Booth casebook', industry: 'Transportation / Logistics', overall: 4 }),
  shared({ caseId: 'b2', title: 'Bank market entry', source: 'Case in Point', caseType: 'Market Entry', industry: 'Financial Services', feedback: { overall: 'Crisp structure' } }),
];

async function openApp(env: FakeEnv) {
  const user = userEvent.setup();
  const view = render(<App backend={env.backend} />);
  return { user, ...view };
}

const metric = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div.sticker') as HTMLElement;

async function goTo(hash: string) {
  window.location.hash = hash;
}

describe('creating an account', () => {
  async function fillSignup(user: User, email: string, pw = 'new-password-1', confirm = pw) {
    await user.click(await screen.findByRole('link', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), pw);
    await user.type(screen.getByLabelText('Confirm password'), confirm);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('registers, asks you to verify your email, then sets up a profile and starts logging', async () => {
    const env = createFakeEnv({ signedIn: false, profile: null });
    const { user } = await openApp(env);
    await fillSignup(user, 'new@booth.edu');

    // Verification step: no access yet, and the email was sent.
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('new@booth.edu')).toBeInTheDocument();
    expect(env.emails).toEqual([{ kind: 'verify', to: 'new@booth.edu' }]);
    expect(env.signedIn()).toBe(false);
    expect(env.calls).toEqual([]); // still no data requests

    await user.click(screen.getByRole('button', { name: 'Send it again' }));
    expect(await screen.findByText(/Sent again/)).toBeInTheDocument();
    expect(env.emails).toHaveLength(2);

    // They click the link in the email: verified, signed in, and asked to set up a profile.
    env.clickVerificationLink('new@booth.edu');
    expect(await screen.findByRole('heading', { name: 'Set up your profile' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /^Your name/ }), 'Nina Newcomer');
    await user.type(screen.getByLabelText(/MBA class/), 'Class of 2028');
    await user.click(screen.getByRole('button', { name: 'Start casing' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    // Nothing is shared unless they chose it.
    expect(env.community.profiles.find((p) => p.displayName === 'Nina Newcomer')).toMatchObject({
      mbaClass: 'Class of 2028',
      listed: true,
      sharing: { ...NO_SHARING, level: true }, // everything private except the level badge, which starts on
    });
  });

  it('checks the password before contacting the server', async () => {
    const env = createFakeEnv({ signedIn: false });
    const { user } = await openApp(env);
    await fillSignup(user, 'a@b.edu', 'short');
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'long-enough-1');
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'different-one');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(env.emails).toEqual([]);
  });

  it('will not let an unverified account in, and offers a new verification link', async () => {
    const env = createFakeEnv({ signedIn: false, profile: null });
    const { user } = await openApp(env);
    await fillSignup(user, 'late@booth.edu');
    await user.click(await screen.findByRole('button', { name: 'Back to sign in' }));

    // The form keeps the email and password you just typed, so just sign in.
    expect(screen.getByLabelText('Email')).toHaveValue('late@booth.edu');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not verified yet');
    expect(env.signedIn()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Send a new verification link' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  });

  it('tells you when an email link has expired', async () => {
    const env = createFakeEnv({ signedIn: false });
    env.backend.backend.linkProblem = 'That email link has expired or was already used. Request a new one below.';
    render(<App backend={env.backend} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('expired or was already used');
  });
});

describe('profile setup', () => {
  it('requires a name, and keeps every sharing switch off until chosen, except your level, which starts on', async () => {
    const env = createFakeEnv({ profile: null });
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Set up your profile' });
    for (const label of ['Case history', 'Overall scores', 'Skill scores', 'Written feedback', 'Improvement focus', 'Learning notes', 'Who cased me']) {
      expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.getByRole('switch', { name: 'Level' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Start casing' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the name');
    expect(env.community.profiles).toEqual([]);
  });

  it('saves the sharing choices made at sign-up', async () => {
    const env = createFakeEnv({ profile: null });
    const { user } = await openApp(env);
    await user.type(await screen.findByRole('textbox', { name: /^Your name/ }), 'Sam Sharer');
    await user.click(screen.getByRole('switch', { name: 'Case history' }));
    await user.click(screen.getByRole('switch', { name: 'Overall scores' }));
    await user.click(screen.getByRole('button', { name: 'Start casing' }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(env.community.profiles[0].sharing).toEqual({ ...NO_SHARING, cases: true, overall: true, level: true });
  });

  it('greys out score and feedback switches until case history is on', async () => {
    const env = createFakeEnv({ profile: null });
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Set up your profile' });
    expect(screen.getByRole('switch', { name: 'Written feedback' })).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Case history' }));
    expect(screen.getByRole('switch', { name: 'Written feedback' })).toBeEnabled();
  });
});

describe('password recovery', () => {
  it('emails a reset link, then lets you choose a new password', async () => {
    const env = createFakeEnv({ signedIn: false });
    const { user } = await openApp(env);
    await user.click(await screen.findByRole('link', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), TEST_USER.email);
    await user.click(screen.getByRole('button', { name: 'Email me a reset link' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(env.emails).toEqual([{ kind: 'reset', to: TEST_USER.email }]);

    env.clickResetLink(TEST_USER.email); // they follow the link
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument(); // not in the app yet

    await user.type(screen.getByLabelText('New password'), TEST_PASSWORD);
    await user.type(screen.getByLabelText('Confirm new password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('different from your current one');

    await user.clear(screen.getByLabelText('New password'));
    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('New password'), 'a-brand-new-one');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-one');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(env.password()).toBe('a-brand-new-one');
  });
});

describe('People', () => {
  const people = { members: [BOB, CAROL, HIDDEN], shared: BOB_CASES };

  it('lists listed members (not me, not unlisted ones) and finds them by name', async () => {
    const env = createFakeEnv(people);
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people');
    expect(await screen.findByRole('button', { name: /Bob Brown/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Carol Chen/ })).toBeInTheDocument();
    expect(screen.queryByText('Hidden Harry')).not.toBeInTheDocument();
    expect(screen.queryByText('Test User')).not.toBeInTheDocument(); // myself
    expect(within(screen.getByRole('main')).queryByText(/@/)).not.toBeInTheDocument(); // never an email address

    await user.type(screen.getByLabelText('Search members by name'), 'car');
    await waitFor(() => expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument());
    expect(screen.getByText('Carol Chen')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search members by name'));
    await user.type(screen.getByLabelText('Search members by name'), 'zzz');
    expect(await screen.findByText('No members found')).toBeInTheDocument();
  });

  it("opens a member's profile showing only what they share, and filters their shared cases", async () => {
    const env = createFakeEnv(people);
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people');
    await user.click(await screen.findByRole('button', { name: /Bob Brown/ }));

    const heading = await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(heading.parentElement).toHaveTextContent(/Shares case history, overall scores and written feedback/);
    expect(heading.parentElement).toHaveTextContent('Class of 2027');

    await user.click(screen.getByRole('tab', { name: /Shared cases/ }));
    expect(screen.getByText('Airline profitability')).toBeInTheDocument();
    expect(screen.getByText('Bank market entry')).toBeInTheDocument();
    // Only the case that has shared feedback offers it.
    expect(screen.getAllByText('See more details')).toHaveLength(1);
    expect(screen.queryByText(/Working on:/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search cases'), 'point'); // matches the casebook
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

  it('still leads with "Find a case for them" for a signed-in member, not with the visitor\'s summary', async () => {
    const env = createFakeEnv(people);
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people/bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    // Overlap with your own log is the better answer once you have one, so it stays the open tab.
    expect(screen.getByRole('tab', { name: /Find a case for them/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: /What to give Bob next/ })).not.toBeInTheDocument();
  }, 20000); // may pay for loading the whole app when the full suite is running

  it('pitches no account to a member who has one: no live case band on a profile they open from inside', async () => {
    const env = createFakeEnv(people);
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people/bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    // The band is the visitor's introduction to CaseLab; a member has the Live case tab instead.
    expect(screen.queryByRole('region', { name: 'Practise a whole case with Bucket' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create an account/ })).not.toBeInTheDocument();
  }, 20000); // may pay for loading the whole app when the full suite is running

  it('reads the scores a member shares as bars, strongest first, holding back the ones one case carries', async () => {
    const rated = [
      ...Array.from({ length: 3 }, (_, i) => shared({ caseId: `r${i}`, title: `Rated case ${i}`, skillScores: { framework: 4, quant: 3 } })),
      shared({ caseId: 'r-one', title: 'One behavioral case', skillScores: { behavioral1: 2 } }),
    ];
    const env = createFakeEnv({ members: [{ ...BOB, sharing: { ...BOB.sharing, skills: true } }], shared: rated });
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people/bob');
    const card = within(await screen.findByRole('region', { name: 'Shared performance' }));
    expect(
      within(card.getByRole('list', { name: 'Shared performance' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Framework: 4.0 out of 5, from 3 cases', 'Quant / Math: 3.0 out of 5, from 3 cases']);
    expect(card.getByText('Only a case or two so far:').parentElement).toHaveTextContent('Only a case or two so far: Behavioral 2.0');
    // The card shows what it has and stops: no line telling the reader how to read it.
    expect(card.queryByText(/counting only the scores|Averages across/i)).not.toBeInTheDocument();
  }, 20000); // may pay for loading the whole app when the full suite is running

  it("says what their page holds: a member's page carries no sharpening summary, so the line never offers one", async () => {
    // Bob has the summary switched on and four rated cases: it rides on his link, and a member's page is not his link.
    const sharpener: Profile = { ...BOB, sharing: { ...BOB.sharing, skills: true, sharpening: true } };
    const rated = Array.from({ length: 4 }, (_, i) => shared({ caseId: `r${i}`, title: `Rated case ${i}`, skillScores: { quant: 2, framework: 5 } }));
    const env = createFakeEnv({ members: [sharpener], shared: rated });
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people/bob');
    const heading = await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(heading.parentElement).toHaveTextContent(/Shares case history, overall scores, skill scores and written feedback/);
    expect(heading.parentElement?.textContent).not.toMatch(/sharpening/i);
    expect(screen.queryByRole('region', { name: /is sharpening/ })).not.toBeInTheDocument();
  }, 20000); // may pay for loading the whole app when the full suite is running

  it('shows nothing about a member who is not visible, or does not exist', async () => {
    const env = createFakeEnv(people);
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people/ghost');
    expect(await screen.findByText("This member isn't available")).toBeInTheDocument();
    expect(screen.queryByText('Hidden Harry')).not.toBeInTheDocument();
  });

  it('says plainly when someone shares no case history, and claims nothing about what they have done', async () => {
    const env = createFakeEnv(people);
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people/carol');
    expect(await screen.findByRole('heading', { name: 'Carol Chen' })).toBeInTheDocument();
    expect(screen.getByText(/hasn't shared any case history/)).toBeInTheDocument();
    expect(screen.getByText(/no way to\s+tell what they've already done/)).toBeInTheDocument();
  });

  it('shows an error with a retry when members cannot be loaded', async () => {
    const env = createFakeEnv(people);
    env.community.failOn('searchPeople');
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people');
    expect(await screen.findByText("Couldn't load members")).toBeInTheDocument();
    env.community.heal();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Bob Brown')).toBeInTheDocument();
  });

  it('is unavailable in demo mode, so sample cases are never compared with real members', async () => {
    const env = createFakeEnv(people);
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    await goTo('#/people');
    expect(await screen.findByText("People isn't available in demo mode")).toBeInTheDocument();
    expect(env.community.calls).not.toContain('searchPeople');
  });
});

describe('Find a case for another student', () => {
  async function openBob() {
    const env = createFakeEnv({ members: [BOB], shared: BOB_CASES });
    for (const c of [
      makeCase({ title: 'Airline profit case', caseType: 'Profitability', industry: 'Transportation / Logistics', date: '2026-09-01' }),
      makeCase({ title: 'Hospital market entry', caseType: 'Market Entry', industry: 'Healthcare / Pharmaceuticals', date: '2026-09-02' }),
      makeCase({ title: 'Piano tuners', caseType: 'Market Sizing', industry: 'Other', date: '2026-09-03' }),
      makeCase({ title: 'Regional Bank market entry strategy', caseType: 'Market Entry', industry: 'Financial Services', date: '2026-09-04' }),
    ]) {
      await env.repo.insertCase(c);
    }
    const ui = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await goTo('#/people/bob');
    await screen.findByRole('heading', { name: 'Bob Brown' });
    return { env, ...ui };
  }

  it("offers cases you've done that they haven't shared, and leaves out ones they have", async () => {
    await openBob();
    const offer = within(await screen.findByRole('region', { name: /Cases you've done that Bob hasn't shared/ }));
    expect(offer.getByText('Hospital market entry')).toBeInTheDocument();
    expect(offer.getByText('Piano tuners')).toBeInTheDocument();
    expect(offer.queryByText('Airline profit case')).not.toBeInTheDocument(); // same case as their "Airline profitability"
  }, 20000); // the first test to open a profile pays for loading the whole app, which can pass 5 seconds when the full suite is running

  it('flags a similar-looking case as worth checking, rather than calling it new or repeated', async () => {
    await openBob();
    const offer = within(await screen.findByRole('region', { name: /Cases you've done that Bob hasn't shared/ }));
    expect(offer.getByText('Might overlap: check first')).toBeInTheDocument();
    expect(offer.getByText(/Looks similar to "Bank market entry"/)).toBeInTheDocument();
  });

  it('lists what they have shared, marking the ones you have also done', async () => {
    await openBob();
    const done = within(screen.getByRole('region', { name: /Cases Bob has shared/ }));
    expect(done.getByText('Airline profitability')).toBeInTheDocument();
    expect(done.getByText("You've done this one too")).toBeInTheDocument();
    expect(done.getByText('Bank market entry')).toBeInTheDocument();
  });

  it('always says it only knows what they chose to share', async () => {
    await openBob();
    expect(screen.getByRole('note')).toHaveTextContent(/only uses what Bob has chosen to share/i);
    expect(screen.getByRole('note')).toHaveTextContent(/may not be/i);
  });

  it('shows gaps in their shared history and narrows your offers to one with a tap', async () => {
    const { user } = await openBob();
    const gaps = within(screen.getByRole('region', { name: /Where their shared history is thin/ }));
    await user.click(gaps.getByRole('button', { name: /Market Sizing/ }));
    const offer = within(await screen.findByRole('region', { name: /Cases you've done that Bob hasn't shared/ }));
    expect(offer.getByText('Piano tuners')).toBeInTheDocument();
    expect(offer.queryByText('Hospital market entry')).not.toBeInTheDocument();
    await user.click(gaps.getByRole('button', { name: /Market Sizing/ })); // tap again to clear
    expect(offer.getByText('Hospital market entry')).toBeInTheDocument();
  });

  it('filters your offers by industry, case type and casebook', async () => {
    const { user } = await openBob();
    await user.selectOptions(screen.getByLabelText('Filter by industry'), 'Healthcare / Pharmaceuticals');
    const offer = within(await screen.findByRole('region', { name: /Cases you've done that Bob hasn't shared/ }));
    expect(offer.getByText('Hospital market entry')).toBeInTheDocument();
    expect(offer.queryByText('Piano tuners')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by industry'), 'all');
    await user.type(screen.getByLabelText('Search cases'), 'piano');
    expect(offer.queryByText('Hospital market entry')).not.toBeInTheDocument();
    expect(offer.getByText('Piano tuners')).toBeInTheDocument();
  });
});

describe('Profile & privacy settings', () => {
  const open = async (env = createFakeEnv({ members: [BOB], shared: [] })) => {
    const ui = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await ui.user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    return { env, dialog, ...ui };
  };

  it('starts with everything private and saves each switch the moment it is flipped', async () => {
    const { user, env, dialog } = await open();
    const sw = (name: string) => within(dialog).getByRole('switch', { name });
    expect(sw('Case history')).toHaveAttribute('aria-checked', 'false');
    expect(sw('Overall scores')).toBeDisabled(); // needs case history first

    await user.click(sw('Case history'));
    await waitFor(() => expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.sharing.cases).toBe(true));
    await waitFor(() => expect(sw('Overall scores')).toBeEnabled());

    await user.click(sw('Written feedback'));
    await waitFor(() => expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.sharing.feedback).toBe(true));
    await user.click(sw('Case history'));
    await waitFor(() => expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.sharing.cases).toBe(false));
  });

  it('offers "Who cased me" as its own switch, off by default, saved like the others', async () => {
    const { user, env, dialog } = await open();
    const sw = (name: string) => within(dialog).getByRole('switch', { name });
    expect(sw('Who cased me')).toHaveAttribute('aria-checked', 'false');
    expect(sw('Who cased me')).toBeDisabled(); // needs case history first
    await user.click(sw('Case history'));
    await waitFor(() => expect(sw('Who cased me')).toBeEnabled());
    await user.click(sw('Who cased me'));
    await waitFor(() => expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.sharing.partner).toBe(true));
  });

  it('re-reads what other members can see after every change', async () => {
    const { user, env, dialog } = await open();
    await waitFor(() => expect(env.community.calls.filter((c) => c === 'getSharedCases').length).toBe(1));
    expect(within(dialog).getByText(/No cases are visible to other members/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Case history' }));
    await waitFor(() => expect(env.community.calls.filter((c) => c === 'getSharedCases').length).toBe(2));
  });

  it('can hide you from People entirely', async () => {
    const { user, env, dialog } = await open();
    await user.click(within(dialog).getByRole('switch', { name: 'Appear in People search' }));
    await waitFor(() => expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.listed).toBe(false));
    expect(await within(dialog).findByText(/not listed in People/)).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Case history' })).toBeDisabled();
  });

  it('edits your name and class', async () => {
    const { user, env, dialog } = await open();
    const save = within(dialog).getByRole('button', { name: 'Save name and class' });
    expect(save).toBeDisabled();
    const name = within(dialog).getByLabelText('Your name');
    await user.clear(name);
    await user.type(name, 'Renamed Person');
    await user.click(save);
    await waitFor(() => expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.displayName).toBe('Renamed Person'));
  });

  it('shows an error and leaves the switch as it was when saving fails', async () => {
    const { user, env, dialog } = await open();
    env.community.failOn('saveProfile');
    await user.click(within(dialog).getByRole('switch', { name: 'Case history' }));
    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Case history' })).toHaveAttribute('aria-checked', 'false');
    expect(env.community.profiles.find((p) => p.userId === TEST_USER.userId)?.sharing.cases).toBe(false);
  });
});

describe('sharing a single case', () => {
  it('defaults to your profile settings and lets you override one case', async () => {
    const env = createFakeEnv();
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });

    // Collapsed by default, showing the default.
    expect(within(dialog).getByText('Use my profile settings')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Case title/), 'Secret case');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Revenue');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Insurance');
    await user.click(within(dialog).getByRole('button', { name: /Sharing for this case/ }));
    await user.click(within(dialog).getByRole('radio', { name: /Keep this case private/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await screen.findByText('Case saved');

    const [saved] = (await env.repo.loadAll()).cases;
    expect(saved.shareMode).toBe('private');
  });

  it('saves new cases with "use my profile settings" unless you choose otherwise', async () => {
    const env = createFakeEnv();
    const { user } = await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), 'Ordinary case');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Revenue');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Insurance');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await screen.findByText('Case saved');
    expect((await env.repo.loadAll()).cases[0].shareMode).toBe('profile');
  });
});

describe('my own dashboard stays mine', () => {
  it('only counts cases from my own database, never shared cases from other members', async () => {
    const env = createFakeEnv({ members: [BOB], shared: BOB_CASES });
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await waitFor(() => expect(within(metric('Total cases')).getByText('0')).toBeInTheDocument());
    expect(env.calls).not.toContain('upsertMany');
    expect(env.community.calls).not.toContain('getSharedCases'); // not even requested for the personal dashboard
  });
});

describe('navigation', () => {
  it('has Dashboard, Live Case, My Case Log, Community and Warm-up in the top bar', async () => {
    const env = createFakeEnv();
    await openApp(env);
    await screen.findByRole('heading', { name: 'Dashboard' });
    for (const name of ['Dashboard', 'Live Case', 'My Case Log', 'Community', 'Warm-up']) {
      expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0);
    }
  });
});
