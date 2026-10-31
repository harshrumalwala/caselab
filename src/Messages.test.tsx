import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile } from './domain/community';
import { makeCase } from './test/builders';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

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
  sharing: { ...NO_SHARING, cases: true },
});
const BOB = member('bob', 'Bob Brown');
const CAROL = member('carol', 'Carol Chen');

const ask = { caseTitle: 'Airline profit', caseBook: 'Cosentino', when: 'tonight 8pm', message: 'Up for it?' };

/** A world where Bob asked me and I accepted, so there is a conversation. */
async function withConversation(extra: Profile[] = []) {
  const env = createFakeEnv({ members: [BOB, ...extra] });
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
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    const user = await openAt(env, '#/inbox', 'Community');
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
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    await openAt(env, '#/inbox', 'Community');
    expect(screen.queryByRole('link', { name: /^Message / })).not.toBeInTheDocument();
  });

  it('says there is nothing yet when there is nothing, and points at requests', async () => {
    await openAt(createFakeEnv(), '#/inbox', 'Community');
    expect(await screen.findByText('Nothing in your inbox yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find members' })).toBeInTheDocument();
  });
});

describe('the list', () => {
  it('shows who, the last message, when, and how many are new; and opens one', async () => {
    const { env } = await withConversation();
    await env.chat.as('bob').send((await env.chat.as('bob').conversations())[0].id, 'See you at 8');
    const user = await openAt(env, '#/inbox', 'Community');
    const row = await screen.findByRole('link', { name: 'Bob Brown, 1 unread' });
    expect(within(row).getByText('See you at 8')).toBeInTheDocument();
    await user.click(row);
    expect(await screen.findByRole('heading', { name: 'Bob Brown' })).toBeInTheDocument();
    expect(await screen.findByText('See you at 8')).toBeInTheDocument();
    // Opening it reads it.
    await waitFor(async () => expect((await env.chat.mine.conversations())[0].unread).toBe(0));
  });

  it('puts the count on the Community tab and its Inbox view, and clears it once read', async () => {
    const { env, id } = await withConversation();
    await env.chat.as('bob').send(id, 'new one');
    const user = await openAt(env, '#/people', 'Community');
    const tabs = await screen.findAllByRole('link', { name: 'Community, 1 conversation has new messages' }); // top bar and phone bar
    expect(tabs).toHaveLength(2);
    await user.click(screen.getByRole('link', { name: 'Inbox, 1 conversation has new messages' }));
    await user.click(await screen.findByRole('link', { name: 'Bob Brown, 1 unread' }));
    await screen.findByText('new one');
    await waitFor(() => expect(screen.queryByRole('link', { name: /conversation.* new messages/ })).not.toBeInTheDocument());
  });

  it('keeps muted conversations off the count and archived ones in their own section', async () => {
    const { env, id } = await withConversation();
    await env.chat.as('bob').send(id, 'hello');
    await env.chat.mine.setMuted(id, true);
    const user = await openAt(env, '#/inbox', 'Community');
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
    const user = await openAt(env, '#/inbox', 'Community');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your messages");
    env.chat.mine.control.failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    const conversations = () => within(screen.getByRole('list', { name: 'Conversations' }));
    await screen.findByRole('list', { name: 'Conversations' });
    expect(conversations().getByRole('link', { name: /Bob Brown/ })).toBeInTheDocument();
    env.chat.mine.control.failing = true;
    comeBack();
    await new Promise((r) => setTimeout(r, 20));
    expect(conversations().getByRole('link', { name: /Bob Brown/ })).toBeInTheDocument();
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
    const env = createFakeEnv({ members: [BOB] });
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
    await screen.findByRole('heading', { name: 'Community' });
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

describe('asking again when you are already connected', () => {
  const again = { caseTitle: 'Jumping Jack', caseBook: 'Booth', when: 'this weekend', message: 'want to do it' };
  const requestRows = (env: FakeEnv) => env.practice.rows.length;

  async function openDialog() {
    const { env, id } = await withConversation();
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Case again with Bob?' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case again with Bob?' });
    return { env, id, user, dialog };
  }

  it('sends the case details as a message in your conversation, not as a new request', async () => {
    const { env, id, user, dialog } = await openDialog();
    const before = requestRows(env);
    expect(within(dialog).getByText(/already connected, so this goes into your conversation as a message/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Case to try'), again.caseTitle);
    await user.type(within(dialog).getByLabelText('Casebook'), again.caseBook);
    await user.type(within(dialog).getByLabelText('When'), again.when);
    await user.type(within(dialog).getByLabelText('Note'), again.message);
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Sent to Bob')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(env.chat.msgs.at(-1)).toMatchObject({ conversationId: id, sender: ME, body: 'Case again? Jumping Jack (Booth) · this weekend\nwant to do it' });
    expect(requestRows(env)).toBe(before); // no new request
    expect(env.practice.rows.filter((r) => r.status === 'pending')).toEqual([]);
  });

  it('shows up as new in their inbox, with the case details', async () => {
    const { env, id, user, dialog } = await openDialog();
    await env.chat.as('bob').markRead(id); // Bob has read everything so far
    await user.type(within(dialog).getByLabelText('Case to try'), again.caseTitle);
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }));
    await screen.findByText('Sent to Bob');
    const theirs = (await env.chat.as('bob').conversations()).find((c) => c.id === id)!;
    expect(theirs).toMatchObject({ unread: 1, lastBody: 'Case again? Jumping Jack' });
  });

  it('adds nothing to the requests you are waiting on in your inbox', async () => {
    const { env, user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Send message' })); // even with nothing filled in
    await screen.findByText('Sent to Bob');
    expect(env.chat.msgs.at(-1)).toMatchObject({ body: 'Case again?' });
    window.location.hash = '#/inbox';
    await screen.findByRole('heading', { name: 'Conversations (1)' });
    expect(screen.queryByRole('heading', { name: /You're waiting on/ })).not.toBeInTheDocument();
  });

  it('keeps what you typed and says why when it can not be sent', async () => {
    const { env, user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText('Note'), 'Hello?');
    await env.chat.as('bob').block(ME); // Bob blocks me meanwhile
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("You can't message this member right now.");
    expect(within(dialog).getByLabelText('Note')).toHaveValue('Hello?');
  });

  it('also works from "Ask to case this" in Find a case for them', async () => {
    const { env, id } = await withConversation();
    await env.repo.insertCase(makeCase({ title: 'Airline profit', source: 'Cosentino', date: '2026-09-01' }));
    const user = await openAt(env, '#/people/bob', 'Bob Brown');
    await user.click(await screen.findByRole('button', { name: 'Ask to case this' }));
    const dialog = await screen.findByRole('dialog', { name: 'Case again with Bob?' });
    expect(within(dialog).getByLabelText('Case to try')).toHaveValue('Airline profit');
    await user.click(within(dialog).getByRole('button', { name: 'Send message' }));
    await screen.findByText('Sent to Bob');
    expect(env.chat.msgs.at(-1)).toMatchObject({ conversationId: id, body: 'Case again? Airline profit (Cosentino)' });
  });

  it('refuses a new request between connected members even if one is sent anyway', async () => {
    const { env } = await withConversation();
    await expect(env.practice.mine.send('bob', ask)).rejects.toThrow(/already connected with this member\. Send them a message instead/);
    await expect(env.practice.as('bob').send(ME, ask)).rejects.toThrow(/already connected/);
  });

  it('still sends a normal request to someone you are not connected to', async () => {
    const env = createFakeEnv({ members: [BOB, CAROL] });
    await env.practice.as('bob').send(ME, ask);
    await env.practice.mine.respond(env.practice.rows[0].id, true, 'Yes'); // connected to Bob, not to Carol
    const user = await openAt(env, '#/people/carol', 'Carol Chen');
    await user.click(await screen.findByRole('button', { name: 'Case with Carol?' })); // not "again"
    const dialog = await screen.findByRole('dialog', { name: 'Case with Carol?' });
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await screen.findByText('Request sent to Carol');
    expect(env.practice.rows.filter((r) => r.to === 'carol')).toHaveLength(1);
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

  it('puts "Case again with …?" and "Message …" side by side in one row, the main action first', async () => {
    const { env } = await withConversation();
    await openAt(env, '#/people/bob', 'Bob Brown');
    const ask = await screen.findByRole('button', { name: 'Case again with Bob?' });
    const message = await screen.findByRole('link', { name: /Message Bob/ });
    expect(ask.parentElement).toBe(message.parentElement);
    expect(ask.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ask.parentElement).toHaveClass('flex', 'flex-wrap');
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
    window.location.hash = '#/inbox';
    expect(await screen.findByText("Requests and messages aren't available in demo mode")).toBeInTheDocument();
    expect(screen.queryByText('Bob Brown')).not.toBeInTheDocument();
  });
});
