import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile } from './domain/community';
import { createFakeEnv, MY_PROFILE, TEST_USER, type FakeEnv } from './test/fakeBackend';

const ME = TEST_USER.userId;

const member = (userId: string, displayName: string): Profile => ({
  userId,
  displayName,
  mbaClass: '',
  listed: true,
  publicProfile: false,
  publicLinkOnly: false,
  burnedBooks: [],
  burnedCases: [],
  openToRequests: true,
  sharing: { ...NO_SHARING, cases: true },
});
const BOB = member('bob', 'Bob Brown');
const CAROL = member('carol', 'Carol Chen');
const OPEN_ME = { ...MY_PROFILE, openToRequests: true };

const ask = { caseTitle: 'Airline profit', caseBook: 'Cosentino', when: 'tonight 8pm', message: 'Up for it?' };

/** A world where Bob asked me and I accepted, so there is a conversation. */
async function withConversation(extra: Profile[] = []) {
  const env = createFakeEnv({ profile: OPEN_ME, members: [BOB, ...extra] });
  await env.practice.as('bob').send(ME, ask);
  await env.practice.mine.respond(env.practice.rows[0].id, true, 'Zoom: example.com/room');
  const [conversation] = await env.chat.mine.conversations();
  return { env, id: conversation.id };
}

async function openAt(env: FakeEnv, hash: string, heading: string | RegExp) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: heading });
  return user;
}

const comeBack = () => act(() => void window.dispatchEvent(new Event('focus')));

beforeEach(() => {
  window.location.hash = '';
});

describe('starting a conversation', () => {
  it('opens when you accept a request, and takes you to it from the request', async () => {
    const env = createFakeEnv({ profile: OPEN_ME, members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    const user = await openAt(env, '#/requests', 'Requests');
    await user.type(await screen.findByLabelText(/^Reply/), 'Zoom: example.com/room');
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    const link = await screen.findByRole('link', { name: 'Message Bob' });
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Bob Brown' })).toBeInTheDocument();
    const list = within(screen.getByRole('list', { name: 'Messages' }));
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Airline profit (Cosentino) · tonight 8pm'),
      expect.stringContaining('Zoom: example.com/room'),
    ]);
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('Up for it?');
  });

  it('does not offer a conversation for a request that was declined or is still waiting', async () => {
    const env = createFakeEnv({ profile: OPEN_ME, members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    await openAt(env, '#/requests', 'Requests');
    expect(screen.queryByRole('link', { name: /^Message / })).not.toBeInTheDocument();
  });

  it('says there is nothing yet when there is nothing, and points at requests', async () => {
    await openAt(createFakeEnv(), '#/messages', 'Messages');
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See your requests' })).toBeInTheDocument();
  });
});

describe('the list', () => {
  it('shows who, the last message, when, and how many are new; and opens one', async () => {
    const { env } = await withConversation();
    await env.chat.as('bob').send((await env.chat.as('bob').conversations())[0].id, 'See you at 8');
    const user = await openAt(env, '#/messages', 'Messages');
    const row = await screen.findByRole('link', { name: 'Bob Brown, 1 unread' });
    expect(within(row).getByText('See you at 8')).toBeInTheDocument();
    await user.click(row);
    expect(await screen.findByRole('heading', { name: 'Bob Brown' })).toBeInTheDocument();
    expect(await screen.findByText('See you at 8')).toBeInTheDocument();
    // Opening it reads it.
    await waitFor(async () => expect((await env.chat.mine.conversations())[0].unread).toBe(0));
  });

  it('puts the People tab and the Messages button on the count, and clears it once read', async () => {
    const { env, id } = await withConversation();
    await env.chat.as('bob').send(id, 'new one');
    const user = await openAt(env, '#/people', 'People');
    expect(await screen.findAllByRole('link', { name: 'People, 1 conversation has new messages' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Messages, 1 conversation has new messages' }));
    await user.click(await screen.findByRole('link', { name: 'Bob Brown, 1 unread' }));
    await screen.findByText('new one');
    await waitFor(() => expect(screen.queryByRole('link', { name: /conversation.* new messages/ })).not.toBeInTheDocument());
  });

  it('keeps muted conversations off the count and archived ones in their own section', async () => {
    const { env, id } = await withConversation();
    await env.chat.as('bob').send(id, 'hello');
    await env.chat.mine.setMuted(id, true);
    const user = await openAt(env, '#/messages', 'Messages');
    expect(await screen.findByLabelText('Muted')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /conversation.* new messages/ })).not.toBeInTheDocument();

    await env.chat.mine.setMuted(id, false);
    await env.chat.mine.setArchived(id, true);
    comeBack();
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Conversations' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Archived/ }));
    expect(within(screen.getByRole('list', { name: 'Archived conversations' })).getByText('Bob Brown')).toBeInTheDocument();
  });

  it('shows an error with Retry when it cannot load, and keeps the list when a later refresh fails', async () => {
    const { env } = await withConversation();
    env.chat.mine.control.failing = true;
    const user = await openAt(env, '#/messages', 'Messages');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your messages");
    env.chat.mine.control.failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Bob Brown/ })).toBeInTheDocument();
    env.chat.mine.control.failing = true;
    comeBack();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('link', { name: /Bob Brown/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('talking', () => {
  it('sends with Enter, keeps Shift+Enter for a new line, and clears the box', async () => {
    const { env, id } = await withConversation();
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    const box = await screen.findByLabelText('Message');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    await user.type(box, 'First line{Shift>}{Enter}{/Shift}second line');
    expect(box).toHaveValue('First line\nsecond line');
    await user.type(box, '{Enter}');
    await waitFor(() => expect(box).toHaveValue(''));
    expect(await screen.findByText(/First line/)).toHaveTextContent('First line second line');
    expect(env.chat.msgs.at(-1)).toMatchObject({ sender: ME, body: 'First line\nsecond line' });

    await user.type(box, '  Second one ');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(env.chat.msgs.at(-1)).toMatchObject({ sender: ME, body: 'Second one' }));
  });

  it('shows what they write when you come back to the tab', async () => {
    const { env, id } = await withConversation();
    await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await screen.findByText('Zoom: example.com/room');
    await env.chat.as('bob').send(id, 'Running 5 min late');
    comeBack();
    expect(await screen.findByText('Running 5 min late')).toBeInTheDocument();
    await waitFor(async () => expect((await env.chat.mine.conversations())[0].unread).toBe(0)); // read as it arrived
  });

  it("keeps what you typed and says why when it can't be sent", async () => {
    const { env, id } = await withConversation();
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.type(await screen.findByLabelText('Message'), 'Hello?');
    await env.chat.as('bob').block(ME); // Bob blocks me meanwhile
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't message this member right now.");
    expect(screen.getByLabelText('Message')).toHaveValue('Hello?');
  });

  it('deletes only your own message, after asking, for both of you', async () => {
    const { env, id } = await withConversation();
    await env.chat.as('bob').send(id, 'from Bob');
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await screen.findByText('from Bob');
    const buttons = screen.getAllByRole('button', { name: 'Delete this message' });
    expect(buttons).toHaveLength(1); // only my reply has one
    await user.click(buttons[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Delete this message?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Message deleted')).toBeInTheDocument();
    expect(env.chat.msgs.find((m) => m.sender === ME)).toMatchObject({ body: '', deleted: true });
  });

  it('says so for a conversation that is not yours or does not exist', async () => {
    const env = createFakeEnv({ profile: OPEN_ME, members: [BOB] });
    window.location.hash = '#/messages/nope';
    render(<App backend={env.backend} />);
    expect(await screen.findByText("This conversation isn't available")).toBeInTheDocument();
  });
});

describe('controls', () => {
  it('mutes and unmutes', async () => {
    const { env, id } = await withConversation();
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Mute' }));
    expect(await screen.findByRole('button', { name: 'Unmute' })).toBeInTheDocument();
    expect((await env.chat.mine.conversations())[0].muted).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(await screen.findByRole('button', { name: 'Mute' })).toBeInTheDocument();
  });

  it('archives and goes back to the list; a new message brings it back', async () => {
    const { env, id } = await withConversation();
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await screen.findByRole('heading', { name: 'Messages' });
    expect((await env.chat.mine.conversations())[0].archived).toBe(true);
    await env.chat.as('bob').send(id, 'ping');
    comeBack();
    expect(await screen.findByRole('link', { name: 'Bob Brown, 1 unread' })).toBeInTheDocument();
  });

  it('blocks after asking: nobody can message or ask, the composer goes away, and it can be undone', async () => {
    const { env, id } = await withConversation();
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Block' }));
    const dialog = await screen.findByRole('dialog', { name: 'Block Bob Brown?' });
    expect(within(dialog).getByText(/They won't be told/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Block' }));

    expect(await screen.findByRole('note')).toHaveTextContent("You can't message this member right now");
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    await expect(env.chat.as('bob').send(id, 'hi')).rejects.toThrow(/can't message this member right now/);
    await expect(env.practice.as('bob').send(ME, ask)).rejects.toThrow(/can't be asked right now/);

    await env.practice.mine.unblock('bob');
    comeBack();
    expect(await screen.findByLabelText('Message')).toBeInTheDocument();
  });

  it('reports with a reason, optionally blocking, and says it was sent', async () => {
    const { env, id } = await withConversation();
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Report' }));
    const dialog = await screen.findByRole('dialog', { name: /Report this conversation with Bob Brown/ });
    expect(within(dialog).getByText(/not end-to-end encrypted/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tell us briefly what happened.');
    expect(env.chat.reports).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('What happened'), 'Rude messages');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Report sent')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Report this conversation/ })).not.toBeInTheDocument());
    expect(env.chat.reports).toHaveLength(1);
    expect(env.chat.reports[0]).toMatchObject({ reporter: ME, reported: 'bob', reason: 'Rude messages' });
    expect(env.chat.reports[0].snapshot).toHaveLength(2);
    expect(env.practice.blocks).toEqual([{ blocker: ME, blocked: 'bob' }]); // "also block" is on by default
    expect(await screen.findByRole('note')).toHaveTextContent("You can't message this member right now");
  });

  it('can report without blocking', async () => {
    const { env, id } = await withConversation();
    const user = await openAt(env, `#/messages/${id}`, 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Report' }));
    const dialog = await screen.findByRole('dialog', { name: /Report this conversation/ });
    await user.type(within(dialog).getByLabelText('What happened'), 'Spam');
    await user.click(within(dialog).getByLabelText(/Also block/));
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await screen.findByText('Report sent');
    expect(env.practice.blocks).toEqual([]);
  });
});

describe('finding the conversation from elsewhere', () => {
  it('offers "Message …" on the profile of someone you have a conversation with, and not otherwise', async () => {
    const { env, id } = await withConversation([CAROL]);
    await openAt(env, '#/people/bob', 'Bob Brown');
    const link = await screen.findByRole('link', { name: /Message Bob/ });
    expect(link).toHaveAttribute('href', `#/messages/${id}`);

    window.location.hash = '#/people/carol';
    await screen.findByRole('heading', { name: 'Carol Chen' });
    expect(screen.queryByRole('link', { name: /Message Carol/ })).not.toBeInTheDocument();
  });

  it('shows the count on the profile button', async () => {
    const { env, id } = await withConversation();
    await env.chat.as('bob').send(id, 'a');
    await env.chat.as('bob').send(id, 'b');
    await openAt(env, '#/people/bob', 'Bob Brown');
    expect(await screen.findByRole('link', { name: /Message Bob\s*2/ })).toBeInTheDocument();
  });
});

describe('demo mode', () => {
  it('keeps your real conversations out of demo mode', async () => {
    const { env } = await withConversation();
    const user = await openAt(env, '#/dashboard', 'Dashboard');
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    expect(await screen.findByText(/Demo mode\./)).toBeInTheDocument();
    window.location.hash = '#/messages';
    expect(await screen.findByText("Messages aren't available in demo mode")).toBeInTheDocument();
    expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument();
  });
});
