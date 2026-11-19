import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile, type SharedCase } from './domain/community';
import { createFakeEnv, MY_PROFILE, TEST_USER, type FakeEnv } from './test/fakeBackend';
import { makeCase } from './test/builders';

const ME = TEST_USER.userId;

const profile = (userId: string, displayName: string, over: Partial<Profile> = {}): Profile => ({
  userId,
  displayName,
  mbaClass: '',
  listed: true,
  publicProfile: false,
  burnedBooks: [],
  burnedCases: [],
  sharing: { ...NO_SHARING, cases: true },
  ...over,
});
const BOB = profile('bob', 'Bob Brown');
const CAROL = profile('carol', 'Carol Chen');

const BOB_CASE: SharedCase = {
  caseId: 'b1',
  ownerId: 'bob',
  date: '2026-10-01',
  title: 'Bank fee strategy',
  source: 'Case in Point',
  partner: '',
  otherNotes: '',
  caseType: 'Revenue',
  industry: 'Financial Services',
  overall: null,
  skillScores: null,
  feedback: null,
  improvementArea: null,
  notes: null,
};

// A request as it arrives from the database. `when` is the free text the ask dialog no longer collects: rows that
// already have one still read it back.
const ask = { caseTitle: 'Airline profit', caseBook: 'Cosentino', when: 'tonight 8pm', message: 'Up for it?' };

/** The app, signed in, opened at a screen. */
async function openAt(env: FakeEnv, hash: string, heading: string | RegExp) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: heading });
  return user;
}

beforeEach(() => {
  window.location.hash = '';
});

describe('emails about requests', () => {
  const openSettings = async (env: FakeEnv) => {
    const user = await openAt(env, '#/dashboard', 'Dashboard');
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    return { user, dialog };
  };

  it('is on until you turn it off, and your choice is kept', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openSettings(env);
    const sw = await within(dialog).findByRole('switch', { name: 'Email me about requests' });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).toBeChecked();

    await user.click(sw);
    await waitFor(() => expect(sw).not.toBeChecked());
    expect(await env.practice.mine.emailRequests()).toBe(false);

    await user.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    expect(await env.practice.mine.emailRequests()).toBe(true);
  });

  it('shows it as off when you turned it off before', async () => {
    const env = createFakeEnv();
    await env.practice.mine.setEmailRequests(false);
    const { dialog } = await openSettings(env);
    const sw = await within(dialog).findByRole('switch', { name: 'Email me about requests' });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).not.toBeChecked();
  });
});

describe('nothing to switch on', () => {
  it('has no requests switch in Profile & privacy: every member can be asked', async () => {
    const env = createFakeEnv();
    const user = await openAt(env, '#/dashboard', 'Dashboard');
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    expect(within(dialog).getByRole('switch', { name: 'Appear in People search' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('switch', { name: /ask me to case/ })).not.toBeInTheDocument();
  });

  it('shows no "not taking requests" notice in the Inbox, or a nudge on Members', async () => {
    const env = createFakeEnv();
    await openAt(env, '#/inbox', 'Community');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    window.location.hash = '#/people';
    await waitFor(() => expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page'));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('can be asked as soon as you are signed in and listed: a member who set nothing up is reachable', async () => {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    await openAt(env, '#/inbox', 'Community');
    expect(await screen.findByRole('heading', { name: /Waiting for your answer/ })).toHaveTextContent('(1)');
  });

  it('is withdrawn when you stop appearing in People: nobody can find or ask you', async () => {
    const env = createFakeEnv({ members: [BOB] });
    const i = env.community.profiles.findIndex((p) => p.userId === ME);
    env.community.profiles[i] = { ...env.community.profiles[i], listed: false };
    await expect(env.practice.as('bob').send(ME, ask)).rejects.toThrow(/can't be asked right now/);
  });
});

describe('asking someone to case', () => {
  it('offers "Case with …?" on every other member\'s profile, but not on your own', async () => {
    const env = createFakeEnv({ members: [BOB, CAROL] });
    await openAt(env, '#/people/carol', 'Carol Chen');
    expect(await screen.findByRole('button', { name: 'Case with Carol?' })).toBeInTheDocument();
    window.location.hash = `#/people/${ME}`;
    await screen.findByRole('heading', { name: MY_PROFILE.displayName });
    expect(screen.queryByRole('button', { name: /Case with/ })).not.toBeInTheDocument();
  });

  it('sends a short request, then shows that it is waiting', async () => {
    const env = createFakeEnv({ members: [BOB] });
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });
    await user.type(within(dialog).getByLabelText('Case to try'), ask.caseTitle);
    await user.type(within(dialog).getByLabelText('Casebook'), ask.caseBook);
    await user.type(within(dialog).getByLabelText('Note'), ask.message);
    expect(within(dialog).getByText((_, el) => el?.tagName === 'P' && el.textContent === '10 / 280')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('Request sent to Bob')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(env.practice.rows).toHaveLength(1);
    expect(env.practice.rows[0]).toMatchObject({ from: ME, to: 'bob', status: 'pending', caseTitle: 'Airline profit', caseBook: 'Cosentino', when: '', message: 'Up for it?' });
    expect(await screen.findByRole('button', { name: 'Request waiting' })).toBeDisabled();
  });

  it('can be sent with nothing filled in', async () => {
    const env = createFakeEnv({ members: [BOB] });
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    await user.click(await screen.findByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(env.practice.rows).toHaveLength(1));
  });

  it('offers to ask them to case one of the cases you have done, with it filled in', async () => {
    const env = createFakeEnv({ members: [BOB], shared: [BOB_CASE] });
    await env.repo.insertCase(makeCase({ title: 'Airline profit', source: 'Cosentino', date: '2026-09-01' }));
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Ask to case this' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });
    expect(within(dialog).getByLabelText('Case to try')).toHaveValue('Airline profit');
    expect(within(dialog).getByLabelText('Casebook')).toHaveValue('Cosentino');
  });

  it("keeps what you typed and says why when it can't be sent", async () => {
    const env = createFakeEnv({ members: [BOB] });
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });
    await user.type(within(dialog).getByLabelText('Note'), 'Hello');
    const i = env.community.profiles.findIndex((p) => p.userId === 'bob');
    env.community.profiles[i] = { ...env.community.profiles[i], listed: false }; // Bob stops appearing in People meanwhile
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("This member can't be asked right now.");
    expect(within(dialog).getByLabelText('Note')).toHaveValue('Hello');
    expect(env.practice.rows).toHaveLength(0);
  });
});

describe('answering requests', () => {
  async function withRequestFromBob() {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    const user = await openAt(env, '#/inbox', 'Community');
    return { env, user };
  }
  const mineRow = (env: FakeEnv) => env.practice.rows[0];

  it('shows who asked, what they proposed, and a count on Community while it waits', async () => {
    await withRequestFromBob();
    expect(await screen.findByRole('heading', { name: /Waiting for your answer/ })).toHaveTextContent('(1)');
    expect(screen.getByRole('link', { name: 'Bob Brown' })).toHaveAttribute('href', '#/people/bob');
    expect(screen.getByText('Airline profit (Cosentino) · tonight 8pm')).toBeInTheDocument();
    expect(screen.getByText('“Up for it?”')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Community, 1 request needs you' })) expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('accepts with a reply, and the request moves to Earlier', async () => {
    const { env, user } = await withRequestFromBob();
    await user.type(await screen.findByLabelText(/^Reply/), 'Zoom: example.com/room');
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('You said yes to Bob')).toBeInTheDocument();
    expect(mineRow(env)).toMatchObject({ status: 'accepted', reply: 'Zoom: example.com/room' });
    expect(screen.queryByRole('heading', { name: /Waiting for your answer/ })).not.toBeInTheDocument();
    const earlier = screen.getByRole('heading', { name: 'Earlier requests' }).closest('section')!;
    expect(within(earlier).getByText('Accepted')).toBeInTheDocument();
    expect(within(earlier).getByText(/You said:/).closest('p')).toHaveTextContent('You said: Zoom: example.com/room');
    expect(screen.queryByRole('link', { name: /request.* you/ })).not.toBeInTheDocument(); // the badge is gone
  });

  it('declines, and can stop that person asking again: silently, and reversibly', async () => {
    const { env, user } = await withRequestFromBob();
    await user.click(await screen.findByLabelText(/don't let Bob ask again/));
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText("You declined Bob's request")).toBeInTheDocument();
    expect(mineRow(env).status).toBe('declined');

    const blocked = (await screen.findByRole('heading', { name: 'Blocked members' })).closest('section')!;
    expect(within(blocked).getByText('Bob Brown')).toBeInTheDocument();
    await expect(env.practice.as('bob').send(ME, ask)).rejects.toThrow(/can't be asked right now/);

    await user.click(within(blocked).getByRole('button', { name: 'Allow again' }));
    expect(await screen.findByText('Bob Brown can ask you again')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Blocked members' })).not.toBeInTheDocument());
    await env.practice.as('bob').send(ME, ask);
  });

  it('declining without the box does not block anyone', async () => {
    const { env, user } = await withRequestFromBob();
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    await screen.findByText("You declined Bob's request");
    expect(env.practice.blocks).toEqual([]);
    expect(screen.queryByRole('heading', { name: 'Blocked members' })).not.toBeInTheDocument();
  });
});

describe('following up on what you sent', () => {
  it('shows a new answer once, with their reply, and clears the badge after you have seen it', async () => {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.mine.send('bob', ask);
    await env.practice.as('bob').respond(env.practice.rows[0].id, true, 'Zoom: example.com/room');

    const user = await openAt(env, '#/people', 'Community');
    // The answer and the reply that came with it: one request to look at, one conversation with something new, on one tab.
    const spoken = '1 request needs you and 1 conversation has new messages';
    expect(await screen.findAllByRole('link', { name: `Community, ${spoken}` })).toHaveLength(2);
    await user.click(screen.getByRole('link', { name: `Inbox, ${spoken}` }));

    await screen.findByRole('heading', { name: 'Community' });
    expect(await screen.findByText('New answer')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText(/Bob says:/).closest('p')).toHaveTextContent('Bob says: Zoom: example.com/room');
    await waitFor(() => expect(env.practice.rows[0].fromSeen).toBe(true));
    await waitFor(() => expect(screen.queryByRole('link', { name: /request.* you/ })).not.toBeInTheDocument());
  });

  it('lists what you are waiting on and lets you cancel it', async () => {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.mine.send('bob', ask);
    const user = await openAt(env, '#/inbox', 'Community');
    const waiting = (await screen.findByRole('heading', { name: /You're waiting on/ })).closest('section')!;
    expect(within(waiting).getByText('Airline profit (Cosentino) · tonight 8pm')).toBeInTheDocument();
    await user.click(within(waiting).getByRole('button', { name: 'Cancel request' }));
    expect(await screen.findByText('Request cancelled')).toBeInTheDocument();
    expect(env.practice.rows[0].status).toBe('cancelled');
    expect(screen.queryByRole('heading', { name: /You're waiting on/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Earlier requests' }).closest('section')!).getByText('Cancelled')).toBeInTheDocument();
  });

  it('says there is nothing yet when there is nothing', async () => {
    await openAt(createFakeEnv(), '#/inbox', 'Community');
    expect(await screen.findByText('Nothing in your inbox yet')).toBeInTheDocument();
  });
});

describe('noticing new requests', () => {
  it('picks up a request that arrives while the app is open, when you come back to the tab', async () => {
    const env = createFakeEnv({ members: [BOB] });
    await openAt(env, '#/dashboard', 'Dashboard');
    expect(screen.queryByRole('link', { name: /request.* you/ })).not.toBeInTheDocument();

    await env.practice.as('bob').send(ME, ask);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(await screen.findAllByRole('link', { name: 'Community, 1 request needs you' })).toHaveLength(2);
  });

  it('keeps what you see when a refresh fails, and shows an error with Retry when the first load fails', async () => {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    env.practice.mine.control.failing = true;
    const user = await openAt(env, '#/inbox', 'Community');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your requests");
    env.practice.mine.control.failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: /Waiting for your answer/ })).toBeInTheDocument();

    // Later refreshes that fail leave the list alone.
    env.practice.mine.control.failing = true;
    act(() => void window.dispatchEvent(new Event('focus')));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: /Waiting for your answer/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('demo mode', () => {
  it("keeps your real requests out of demo mode", async () => {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    const user = await openAt(env, '#/dashboard', 'Dashboard');
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    expect(await screen.findByText(/Demo mode\./)).toBeInTheDocument();
    window.location.hash = '#/inbox';
    expect(await screen.findByText("Requests and messages aren't available in demo mode")).toBeInTheDocument();
    expect(screen.queryByText('Airline profit (Cosentino) · tonight 8pm')).not.toBeInTheDocument();
  });
});
