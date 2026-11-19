import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile } from './domain/community';
import { isoToWall, wallToIso } from './domain/meetingTime';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const ME = TEST_USER.userId;
const CHICAGO = 'America/Chicago';
const NEW_YORK = 'America/New_York';
const LONDON = 'Europe/London';

const member = (userId: string, displayName: string): Profile => ({
  userId,
  displayName,
  mbaClass: '',
  listed: true,
  publicProfile: false,
  burnedBooks: [],
  burnedCases: [],
  sharing: { ...NO_SHARING, cases: true },
});
const BOB = member('bob', 'Bob Brown');

const ask = { caseTitle: 'Airline profit', caseBook: 'Cosentino', when: '', message: 'Up for it?' };

/** An instant a few hours from now, as the picker's box holds it (to the minute) and as the database stores it. */
function soon(hours: number, zone = CHICAGO) {
  const wall = isoToWall(new Date(Date.now() + hours * 3600_000).toISOString(), zone);
  return { wall, iso: wallToIso(wall, zone)! };
}

/** Me in Chicago, Bob in New York (an hour ahead, whatever the clocks are doing). */
function withZones(env: FakeEnv, mine = CHICAGO, theirs = NEW_YORK, myLink = 'https://meet.google.com/me-room') {
  env.meeting.saved.timeZone = mine;
  env.meeting.saved.link = myLink;
  env.othersMeeting.bob = { timeZone: theirs, link: 'https://us02web.zoom.us/j/777' };
}

async function openAt(env: FakeEnv, hash: string, heading: string | RegExp) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: heading });
  return user;
}

/** A world where Bob asked me and I accepted, so there is a conversation (and Bob hosts, as the asker). */
async function withConversation() {
  const env = createFakeEnv({ members: [BOB] });
  withZones(env);
  await env.practice.as('bob').send(ME, ask);
  await env.practice.mine.respond(env.practice.rows[0].id, true, 'See you there');
  const [conversation] = await env.chat.mine.conversations();
  return { env, id: conversation.id };
}

/** Types a wall clock into one of the picker's boxes. */
const pick = (box: HTMLElement, wall: string) => fireEvent.change(box, { target: { value: wall } });

const comeBack = () => act(() => void window.dispatchEvent(new Event('focus')));

beforeEach(() => {
  window.location.hash = '';
});

describe('asking someone to case, with times', () => {
  it('sends an ordinary request when you propose none', async () => {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env);
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });
    await user.type(within(dialog).getByLabelText('Case to try'), 'Airline profit');
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('Request sent to Bob')).toBeInTheDocument();
    expect(env.practice.rows).toHaveLength(1);
    expect(env.scheduling.rows).toEqual([]);
  });

  it('no longer asks for a time in words, and still reads back one that was sent before', async () => {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, { ...ask, when: 'tonight 8pm' });
    const user = await openAt(env, '#/inbox', 'Community');
    expect(await screen.findByText('Airline profit (Cosentino) · tonight 8pm')).toBeInTheDocument();

    window.location.hash = '#/people/bob';
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });
    expect(within(dialog).queryByLabelText('When')).not.toBeInTheDocument();
  });

  it('sends up to three times and a length with the request', async () => {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env);
    const first = soon(26);
    const second = soon(50);
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });

    pick(within(dialog).getByLabelText('Time 1'), first.wall);
    await user.click(within(dialog).getByRole('button', { name: 'Add another time' }));
    pick(within(dialog).getByLabelText('Time 2'), second.wall);
    await user.selectOptions(within(dialog).getByLabelText('How long'), '60');
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('Request sent to Bob')).toBeInTheDocument();
    await waitFor(() => expect(env.scheduling.rows).toHaveLength(1));
    const row = env.scheduling.rows[0];
    expect(row.requestId).toBe(env.practice.rows[0].id);
    expect(row.proposals[0].slots).toEqual([first.iso, second.iso]);
    expect(row.proposals[0].durationMinutes).toBe(60);
  });

  it('reads a time back before it is sent, and refuses one the rules would', async () => {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env);
    const past = isoToWall(new Date(Date.now() - 3600_000).toISOString(), CHICAGO);
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });

    pick(within(dialog).getByLabelText('Time 1'), past);
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Propose times at least ten minutes from now.');
    expect(env.practice.rows).toEqual([]); // nothing was sent at all
    expect(within(dialog).getByLabelText('Time 1')).toHaveValue(past); // and what was picked is still there
  });

  it('says so when the request went but the times did not, and sends them again on their own', async () => {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env);
    const slot = soon(26);
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });
    pick(within(dialog).getByLabelText('Time 1'), slot.wall);

    env.scheduling.mine.control.failing = true;
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Sent, but the times didn't go");
    expect(env.practice.rows).toHaveLength(1);
    expect(env.scheduling.rows).toEqual([]);

    env.scheduling.mine.control.failing = false;
    await user.click(within(dialog).getByRole('button', { name: 'Send the times' }));
    await waitFor(() => expect(env.scheduling.rows).toHaveLength(1));
    expect(env.practice.rows).toHaveLength(1); // and not a second request
  });

  it('offers the way to add a meeting link to a member who has none', async () => {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env, CHICAGO, NEW_YORK, '');
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case with Bob?' });
    expect(within(dialog).queryByText(/Add a meeting link/)).not.toBeInTheDocument();

    pick(within(dialog).getByLabelText('Time 1'), soon(26).wall);
    expect(await within(dialog).findByText('Add a meeting link and Bob gets it with the time.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add one' }));
    expect(await screen.findByRole('dialog', { name: 'Profile & privacy' })).toBeInTheDocument();
  });
});

describe('answering a request that came with times', () => {
  /** Bob asks me to case and proposes two times. */
  async function bobAsks() {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env);
    const first = soon(26);
    const second = soon(50);
    const requestId = await env.practice.as('bob').send(ME, ask);
    await env.scheduling.as('bob').propose(ME, { slots: [first.iso, second.iso], durationMinutes: 45 }, { requestId });
    return { env, first, second, requestId };
  }

  it('shows the times in both zones and settles one by tapping it', async () => {
    const { env, first } = await bobAsks();
    const user = await openAt(env, '#/inbox', 'Community');
    const card = (await screen.findByRole('heading', { name: /Waiting for your answer/ })).closest('section')!;
    const times = within(card).getByRole('group', { name: 'Pick a time' });
    expect(within(times).getAllByRole('button')).toHaveLength(2);
    expect(within(times).getAllByRole('button')[0]).toHaveTextContent(/for you \(.* for Bob\)$/);
    expect(within(card).getByText('45 minutes')).toBeInTheDocument();

    await user.click(within(times).getAllByRole('button')[0]);
    await waitFor(() => expect(env.practice.rows[0].status).toBe('accepted'));
    expect(env.scheduling.rows[0]).toMatchObject({ status: 'confirmed', startsAt: first.iso });
  });

  it('accepts without a time, leaving the times waiting', async () => {
    const { env } = await bobAsks();
    const user = await openAt(env, '#/inbox', 'Community');
    await user.click(await screen.findByRole('button', { name: 'Accept without a time' }));
    await waitFor(() => expect(env.practice.rows[0].status).toBe('accepted'));
    expect(env.scheduling.rows[0].status).toBe('proposed');
  });

  it('asks for other times without answering the request itself', async () => {
    const { env } = await bobAsks();
    const mine = soon(74);
    const user = await openAt(env, '#/inbox', 'Community');
    await user.click(await screen.findByRole('button', { name: 'Suggest other times' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suggest other times to Bob' });
    pick(within(dialog).getByLabelText('Time 1'), mine.wall);
    await user.click(within(dialog).getByRole('button', { name: 'Send times' }));

    expect(await screen.findByText('Times sent to Bob')).toBeInTheDocument();
    await waitFor(() => expect(env.scheduling.rows[0].proposals).toHaveLength(2));
    expect(env.scheduling.rows[0].proposals[1]).toMatchObject({ by: ME, slots: [mine.iso] });
    expect(env.practice.rows[0].status).toBe('pending');
    expect(await screen.findByText('Waiting for Bob to pick')).toBeInTheDocument();
  });

  it('declines the times with the request', async () => {
    const { env } = await bobAsks();
    const user = await openAt(env, '#/inbox', 'Community');
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(env.practice.rows[0].status).toBe('declined'));
    expect(env.scheduling.rows[0].status).toBe('declined');
  });

  it('keeps everything and says why when the times have gone since the page loaded', async () => {
    const { env } = await bobAsks();
    const user = await openAt(env, '#/inbox', 'Community');
    const card = (await screen.findByRole('heading', { name: /Waiting for your answer/ })).closest('section')!;
    await user.type(within(card).getByLabelText(/^Reply/), 'Sounds good');

    await env.scheduling.as('bob').cancel(env.scheduling.rows[0].id); // Bob calls them off first
    await user.click(within(within(card).getByRole('group', { name: 'Pick a time' })).getAllByRole('button')[0]);

    expect(await within(card).findByRole('alert')).toHaveTextContent("That time isn't available.");
    expect(env.practice.rows[0].status).toBe('pending');
    expect(within(card).getByLabelText(/^Reply/)).toHaveValue('Sounds good');
  });
});

describe('scheduling inside a conversation', () => {
  it('proposes times, shows them waiting, and calls them off', async () => {
    const { env, id } = await withConversation();
    const slot = soon(26);
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Schedule a time' }));
    const dialog = await screen.findByRole('dialog', { name: 'Propose times to Bob' });
    pick(within(dialog).getByLabelText('Time 1'), slot.wall);
    await user.click(within(dialog).getByRole('button', { name: 'Send times' }));

    expect(await screen.findByText('Waiting for Bob to pick')).toBeInTheDocument();
    expect(env.scheduling.rows[0].conversationId).toBe((await env.chat.mine.conversations())[0].id);

    await user.click(screen.getByRole('button', { name: 'Call it off' }));
    await waitFor(() => expect(env.scheduling.rows[0].status).toBe('cancelled'));
    expect(await screen.findByRole('button', { name: 'Schedule a time' })).toBeInTheDocument();
  });

  it('settles a time Bob proposed, and only then hands over his link', async () => {
    const { env, id } = await withConversation();
    const slot = soon(26);
    await env.scheduling.as('bob').propose(ME, { slots: [slot.iso], durationMinutes: 30 }, { conversationId: id });
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');

    expect(await screen.findByText('Bob proposed times')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /zoom\.us/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /for you \(/ }));
    expect(await screen.findByText("You're casing")).toBeInTheDocument();
    expect(screen.getByText('30 minutes')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'https://us02web.zoom.us/j/777' });
    expect(link).toHaveAttribute('href', 'https://us02web.zoom.us/j/777');
    expect(link.parentElement).toHaveTextContent("Zoom · Bob's link");
  });

  it('moves a settled time, leaving the old one standing until Bob picks', async () => {
    const { env, id } = await withConversation();
    const slot = soon(26);
    const later = soon(50);
    const meeting = await env.scheduling.as('bob').propose(ME, { slots: [slot.iso], durationMinutes: 45 }, { conversationId: id });
    await env.scheduling.mine.confirm(meeting, slot.iso);

    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Move it' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move your case' });
    expect(within(dialog).getByLabelText('Time 1')).toHaveValue(slot.wall); // the time you have, ready to change
    pick(within(dialog).getByLabelText('Time 1'), later.wall);
    await user.click(within(dialog).getByRole('button', { name: 'Ask to move it' }));

    expect(await screen.findByText('Waiting for Bob to pick')).toBeInTheDocument();
    expect(screen.getByText("You're casing")).toBeInTheDocument();
    expect(env.scheduling.rows[0]).toMatchObject({ status: 'confirmed', startsAt: slot.iso });
    expect(env.scheduling.rows[0].proposals[1]).toMatchObject({ by: ME, isChange: true, slots: [later.iso] });
  });

  it('lets a blocked pair call a settled time off, with no link and nothing else to do', async () => {
    const { env, id } = await withConversation();
    const slot = soon(26);
    const meeting = await env.scheduling.as('bob').propose(ME, { slots: [slot.iso], durationMinutes: 45 }, { conversationId: id });
    await env.scheduling.mine.confirm(meeting, slot.iso);
    await env.chat.mine.block('bob');

    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    expect(await screen.findByText("You're casing")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /zoom\.us/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move it' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Call it off' }));
    await waitFor(() => expect(env.scheduling.rows[0].status).toBe('cancelled'));
  });
});

describe('two time zones, across a daylight-saving boundary', () => {
  // The United States puts its clocks forward on Sunday 14 March 2027, the United Kingdom not until the 28th, so the
  // two evenings below are the same hour in Chicago and an hour apart in London.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2027-03-10T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reads both evenings in both zones, in the window where the two zones disagree', async () => {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env, CHICAGO, LONDON);
    const before = '2027-03-11T01:00:00.000Z'; // Wed 10 March, 7:00 pm in Chicago (CST)
    const after = '2027-03-18T00:00:00.000Z'; // Wed 17 March, 7:00 pm in Chicago (CDT)
    const requestId = await env.practice.as('bob').send(ME, ask);
    await env.scheduling.as('bob').propose(ME, { slots: [before, after], durationMinutes: 45 }, { requestId });

    const user = userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
    window.location.hash = '#/inbox';
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Community' });

    const times = await screen.findByRole('group', { name: 'Pick a time' });
    expect(within(times).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Wed 10 Mar, 7:00 pm for you (Thu 1:00 am for Bob)',
      'Wed 17 Mar, 7:00 pm for you (Thu 12:00 am for Bob)',
    ]);

    // And the same two zones when you pick times of your own, before you send them.
    await user.click(screen.getByRole('button', { name: 'Suggest other times' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suggest other times to Bob' });
    pick(within(dialog).getByLabelText('Time 1'), '2027-03-17T19:00');
    expect(await within(dialog).findByText('Wed 17 Mar, 7:00 pm for you (Thu 12:00 am for Bob)')).toBeInTheDocument();
    pick(within(dialog).getByLabelText('Time 1'), '2027-03-10T19:00');
    expect(await within(dialog).findByText('Wed 10 Mar, 7:00 pm for you (Thu 1:00 am for Bob)')).toBeInTheDocument();
  });
});

describe('times waiting for you', () => {
  it('count on the Community tab and in the Dashboard strip', async () => {
    const { env, id } = await withConversation();
    await openAt(env, '#/dashboard', 'Dashboard');
    expect(screen.queryByText(/time.? to pick/)).not.toBeInTheDocument();

    await env.scheduling.as('bob').propose(ME, { slots: [soon(26).iso], durationMinutes: 45 }, { conversationId: id });
    await comeBack();
    expect(await screen.findByText('1 time to pick')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Community, 1 time needs you' })) expect(link).toBeInTheDocument();

    window.location.hash = '#/inbox';
    await screen.findByRole('heading', { name: 'Community' });
    expect(await screen.findByText('Time to pick')).toBeInTheDocument();
    window.location.hash = `#/messages/${id}`;
    expect(await screen.findByText('Bob proposed times')).toBeInTheDocument();
  });

  it('are not counted twice when they came with a request you have not answered', async () => {
    const env = createFakeEnv({ members: [BOB] });
    withZones(env);
    const requestId = await env.practice.as('bob').send(ME, ask);
    await env.scheduling.as('bob').propose(ME, { slots: [soon(26).iso], durationMinutes: 45 }, { requestId });

    await openAt(env, '#/dashboard', 'Dashboard');
    expect(await screen.findByText('1 request to look at')).toBeInTheDocument();
    expect(screen.queryByText(/time.? to pick/)).not.toBeInTheDocument();
  });
});

describe('demo mode', () => {
  it('offers no scheduling and says nothing about it', async () => {
    const { env, id } = await withConversation();
    await env.scheduling.as('bob').propose(ME, { slots: [soon(26).iso], durationMinutes: 45 }, { conversationId: id });
    const user = await openAt(env, '#/dashboard', 'Dashboard');
    await screen.findByText('1 time to pick');

    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    expect(await screen.findByText(/Demo mode\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('1 time to pick')).not.toBeInTheDocument());

    window.location.hash = '#/inbox';
    expect(await screen.findByText("Requests and messages aren't available in demo mode")).toBeInTheDocument();
    expect(screen.queryByText(/Schedule a time|proposed times|You're casing/)).not.toBeInTheDocument();
    expect(env.scheduling.rows).toHaveLength(1); // and nothing was written while in demo mode
  });
});
