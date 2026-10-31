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

/** Like openAt, but hands back unmount so a test can look at several screens in turn. */
async function openAtAndKeep(env: FakeEnv, hash: string, heading: string) {
  window.location.hash = hash;
  const view = render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: heading });
  return view;
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

describe('five tabs, with people and messages together under Community', () => {
  it('has Dashboard, My Case Log, Improvement Areas, Community and Warm-up in the top bar and the phone bar', async () => {
    await openAt(createFakeEnv(), '#/dashboard', 'Dashboard');
    for (const nav of screen.getAllByRole('navigation', { name: 'Primary' })) {
      expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('aria-label') ?? l.textContent)).toEqual([
        'Dashboard',
        'My Case Log',
        'Improvement Areas',
        'Community',
        'Warm-up',
      ]);
    }
    expect(screen.queryByRole('link', { name: /^Messages/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^People/ })).not.toBeInTheDocument();
  });

  it('marks Community as the current page on Members, the Inbox, and a conversation, and nothing else', async () => {
    const env = await withThingsWaiting();
    const [conversation] = await env.chat.mine.conversations();
    for (const [hash, heading] of [
      ['#/people', 'Community'],
      ['#/inbox', 'Community'],
      [`#/messages/${conversation.id}`, 'Carol Chen'],
    ] as const) {
      const { unmount } = await openAtAndKeep(env, hash, heading);
      for (const tab of screen.getAllByRole('link', { name: /^Community/ })) expect(tab).toHaveAttribute('aria-current', 'page');
      for (const tab of screen.getAllByRole('link', { name: /^(Dashboard|My Case Log|Improvement Areas|Warm-up)/ })) expect(tab).not.toHaveAttribute('aria-current');
      unmount();
    }
  });

  it('puts one count on Community, and the same on its Inbox view, naming both parts for screen readers', async () => {
    const env = await withThingsWaiting();
    await openAt(env, '#/people', 'Community');
    const spoken = '1 request needs you and 1 conversation has new messages';
    expect(await screen.findAllByRole('link', { name: `Community, ${spoken}` })).toHaveLength(2);
    expect(screen.getByRole('link', { name: `Inbox, ${spoken}` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Members' })).not.toHaveAccessibleName(/need|new/);
  });

  it('switches between Members and Inbox with the two views at the top of the page', async () => {
    const env = await withThingsWaiting();
    const user = await openAt(env, '#/people', 'Community');
    const views = within(screen.getByRole('navigation', { name: 'Community' }));
    expect(views.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Search members by name')).toBeInTheDocument();

    await user.click(views.getByRole('link', { name: /^Inbox/ }));
    expect(await screen.findByRole('heading', { name: /Waiting for your answer/ })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Community' })).getByRole('link', { name: /^Inbox/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByLabelText('Search members by name')).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('navigation', { name: 'Community' })).getByRole('link', { name: 'Members' }));
    expect(await screen.findByLabelText('Search members by name')).toBeInTheDocument();
  });

  it('shows Members and Inbox as one control split evenly across the full width', async () => {
    await openAt(createFakeEnv(), '#/people', 'Community');
    const views = screen.getByRole('navigation', { name: 'Community' });
    const [members, inbox] = within(views).getAllByRole('link');
    expect(members).toHaveTextContent('Members');
    expect(inbox).toHaveTextContent('Inbox');
    expect(views).toHaveClass('flex'); // one row, not wrapping pills
    expect(views).not.toHaveClass('flex-wrap');
    expect(members).toHaveClass('flex-1'); // each half takes half the width
    expect(inbox).toHaveClass('flex-1');
  });

  it('gives the chosen half the same yellow, outlined look as the current page in the main navigation', async () => {
    await openAt(createFakeEnv(), '#/people', 'Community');
    const views = within(screen.getByRole('navigation', { name: 'Community' }));
    const [members, inbox] = views.getAllByRole('link');
    expect(screen.getByRole('navigation', { name: 'Community' })).toHaveClass('sticker');
    expect(members).toHaveAttribute('aria-current', 'page');
    expect(members).toHaveClass('bg-sun', 'ring-2'); // chosen
    expect(inbox).not.toHaveClass('bg-sun'); // not chosen
    expect(inbox).toHaveClass('hover:bg-sun-soft');
    const mainNav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    expect(within(mainNav).getByRole('link', { name: /^Community/ })).toHaveClass('bg-sun', 'ring-2'); // the same look up top
  });

  it('uses the same full-width split for the other two-way switches: the Case Log and a member profile', async () => {
    const env = createFakeEnv({ members: [BOB] });
    const { unmount } = await openAtAndKeep(env, '#/log', 'My Case Log');
    const log = screen.getByRole('tablist', { name: 'Case log views' });
    expect(within(log).getAllByRole('tab').map((t) => t.textContent)).toEqual(['My cases', 'Burned (0)']);
    expect(log).toHaveClass('flex', 'sticker');
    expect(log).not.toHaveClass('flex-wrap');
    for (const tab of within(log).getAllByRole('tab')) expect(tab).toHaveClass('flex-1');
    unmount();

    await openAtAndKeep(env, '#/people/bob', 'Bob Brown');
    const profile = await screen.findByRole('tablist', { name: 'Profile sections' });
    expect(within(profile).getAllByRole('tab')).toHaveLength(2);
    expect(profile).toHaveClass('flex', 'sticker');
    expect(profile).not.toHaveClass('flex-wrap');
    for (const tab of within(profile).getAllByRole('tab')) expect(tab).toHaveClass('flex-1');
  });

  it('shows requests and conversations together in the Inbox, in the order you would act on them', async () => {
    const env = await withThingsWaiting();
    await openAt(env, '#/inbox', 'Community');
    const headings = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent);
    expect(headings.findIndex((t) => /Waiting for your answer/.test(t ?? ''))).toBeLessThan(headings.findIndex((t) => /Conversations/.test(t ?? '')));
    expect(screen.getByRole('list', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Earlier requests/ })).toBeInTheDocument(); // the accepted one carries on as a conversation, and is also in the history
  });

  it('still understands the older addresses for requests and messages', async () => {
    const env = await withThingsWaiting();
    for (const hash of ['#/requests', '#/messages']) {
      const { unmount } = await openAtAndKeep(env, hash, 'Community');
      expect(await screen.findByRole('heading', { name: /Waiting for your answer/ })).toBeInTheDocument();
      expect(within(screen.getByRole('navigation', { name: 'Community' })).getByRole('link', { name: /^Inbox/ })).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('has nothing separate for Requests or Messages on the Members page', async () => {
    await openAt(createFakeEnv(), '#/people', 'Community');
    expect(screen.queryByRole('button', { name: /^Requests/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Messages/ })).not.toBeInTheDocument();
  });
});

describe('the "needs you" strip on the Dashboard', () => {
  it('shows what is waiting, with a link to each', async () => {
    const env = await withThingsWaiting();
    await openAt(env, '#/dashboard', 'Dashboard');
    const strip = await screen.findByRole('region', { name: 'Needs you' });
    expect(within(strip).getByRole('link', { name: '1 request to look at' })).toHaveAttribute('href', '#/inbox');
    expect(within(strip).getByRole('link', { name: '1 conversation with new messages' })).toHaveAttribute('href', '#/inbox');
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
