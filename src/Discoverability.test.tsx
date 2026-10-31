import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile } from './domain/community';
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
const ask = { caseTitle: 'Airline profit', caseBook: '', when: '', message: 'Up for it?' };

async function openAt(env: FakeEnv, hash: string, heading: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: heading });
  return user;
}

/** Bob has asked me (waiting), and Carol and I agreed to case and she has written since. */
async function withThingsWaiting() {
  const env = createFakeEnv({ members: [BOB, CAROL] });
  await env.practice.as('bob').send(ME, ask);
  await env.practice.as('carol').send(ME, ask);
  await env.practice.mine.respond(env.practice.rows[1].id, true, 'Zoom');
  const [conversation] = await env.chat.mine.conversations();
  await env.chat.as('carol').send(conversation.id, 'See you at 8');
  return env;
}

beforeEach(() => {
  window.location.hash = '';
});

describe('Messages has its own place in the navigation', () => {
  it('is in the top bar and the phone bar for everyone signed in, with no member needing to do anything first', async () => {
    await openAt(createFakeEnv(), '#/dashboard', 'Dashboard');
    const tabs = screen.getAllByRole('link', { name: 'Messages' }); // top bar and phone bar
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      expect(tab).toHaveAttribute('href', '#/messages');
      expect(tab).not.toHaveAttribute('aria-current');
    }
  });

  it('is marked as the current page on Messages and on a conversation, and People is not', async () => {
    const env = await withThingsWaiting();
    const [conversation] = await env.chat.mine.conversations();
    await openAt(env, `#/messages/${conversation.id}`, 'Carol Chen');
    for (const tab of screen.getAllByRole('link', { name: /^Messages/ })) expect(tab).toHaveAttribute('aria-current', 'page');
    for (const tab of screen.getAllByRole('link', { name: /^People/ })) expect(tab).not.toHaveAttribute('aria-current');
  });

  it('keeps Requests under People, which stays marked as the current page there', async () => {
    const env = await withThingsWaiting();
    await openAt(env, '#/requests', 'Requests');
    for (const tab of screen.getAllByRole('link', { name: /^People/ })) expect(tab).toHaveAttribute('aria-current', 'page');
    for (const tab of screen.getAllByRole('link', { name: /^Messages/ })) expect(tab).not.toHaveAttribute('aria-current');
  });

  it('counts requests on People and conversations on Messages, each its own number', async () => {
    const env = await withThingsWaiting();
    await openAt(env, '#/dashboard', 'Dashboard');
    expect(await screen.findAllByRole('link', { name: 'People, 1 request needs you' })).toHaveLength(2);
    expect(await screen.findAllByRole('link', { name: 'Messages, 1 conversation has new messages' })).toHaveLength(2);
  });

  it('leaves the People page with a Requests button only: Messages is in the navigation', async () => {
    await openAt(createFakeEnv(), '#/people', 'People');
    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Messages/ })).not.toBeInTheDocument();
  });
});

describe('the "needs you" strip on the Dashboard', () => {
  it('shows what is waiting, with a link to each', async () => {
    const env = await withThingsWaiting();
    await openAt(env, '#/dashboard', 'Dashboard');
    const strip = await screen.findByRole('region', { name: 'Needs you' });
    expect(within(strip).getByRole('link', { name: '1 request to look at' })).toHaveAttribute('href', '#/requests');
    expect(within(strip).getByRole('link', { name: '1 conversation with new messages' })).toHaveAttribute('href', '#/messages');
  });

  it('shows only the part that applies', async () => {
    const env = createFakeEnv({ members: [BOB] });
    await env.practice.as('bob').send(ME, ask);
    await env.practice.as('bob').send(ME, ask).catch(() => undefined); // a second one to the same person is refused
    await openAt(env, '#/dashboard', 'Dashboard');
    const strip = await screen.findByRole('region', { name: 'Needs you' });
    expect(within(strip).getByRole('link', { name: '1 request to look at' })).toBeInTheDocument();
    expect(within(strip).queryByRole('link', { name: /conversation/ })).not.toBeInTheDocument();
  });

  it('takes no space when nothing is waiting', async () => {
    await openAt(createFakeEnv({ members: [BOB] }), '#/dashboard', 'Dashboard');
    expect(screen.queryByRole('region', { name: 'Needs you' })).not.toBeInTheDocument();
  });

  it('stays out of demo mode, which shows sample data', async () => {
    const env = await withThingsWaiting();
    const user = await openAt(env, '#/dashboard', 'Dashboard');
    await screen.findByRole('region', { name: 'Needs you' });
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    expect(await screen.findByText(/Demo mode\./)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Needs you' })).not.toBeInTheDocument();
  });
});
