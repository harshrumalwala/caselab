import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile, type SharedCase } from './domain/community';
import { makeCase } from './test/builders';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

/**
 * A member following another member's profile link, when that member has left People search and kept the link on.
 * The member path cannot see them at all, so the page is served by the link, the same one a visitor reads — and it
 * offers only what the database would still accept from a reader of it.
 */

const ME = TEST_USER.userId;

/** Eva publishes her link and is not in People search. She shares a lot with members and nothing in free text. */
const EVA: Profile = {
  userId: 'eva',
  displayName: 'Eva Ernst',
  mbaClass: 'Class of 2027',
  listed: false,
  publicProfile: true,
  burnedBooks: [],
  burnedCases: [],
  level: 9,
  sharing: { ...NO_SHARING, cases: true, overall: true, feedback: true, interviewed: true, level: true },
};

const BOB: Profile = { ...EVA, userId: 'bob', displayName: 'Bob Brown', listed: true, publicProfile: false, level: 4 };

const shared = (over: Partial<SharedCase> & Pick<SharedCase, 'caseId' | 'ownerId' | 'title'>): SharedCase => ({
  date: '2026-10-01',
  source: 'Booth casebook',
  partner: '',
  otherNotes: '',
  caseType: 'Profitability',
  industry: 'Technology / SaaS',
  overall: 4,
  skillScores: null,
  feedback: { overall: 'Crisp structure' },
  improvementArea: null,
  notes: null,
  ...over,
});

const CASES: SharedCase[] = [
  shared({ caseId: 'e1', ownerId: 'eva', title: 'Airline profitability' }),
  shared({ caseId: 'e2', ownerId: 'eva', title: 'Bank market entry', caseType: 'Market Entry', industry: 'Financial Services' }),
  shared({ caseId: 'b1', ownerId: 'bob', title: "Bob's airline case" }),
];

const INTERVIEWED = { eva: [{ date: '2026-09-09', title: 'Coffee chain growth', source: 'Wharton', caseType: 'Growth Strategy' as const, industry: 'Food & Beverage' }] };

async function openProfile(env: FakeEnv, id: string, name: string) {
  window.location.hash = `#/people/${id}`;
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name });
  return user;
}

/** One case of my own that nobody has shared back, so "Find a case for them" has something to offer. */
const withMyCase = async (env: FakeEnv) => {
  await env.repo.insertCase(makeCase({ title: 'Hospital market entry', caseType: 'Market Entry', industry: 'Healthcare / Pharmaceuticals' }));
  return env;
};

beforeEach(() => {
  window.location.hash = '';
});

describe('a member opening the link of a member who is not in People search', () => {
  it('reads their profile and their shared cases instead of being told they are not available', async () => {
    const env = createFakeEnv({ members: [EVA], shared: CASES });
    await openProfile(env, 'eva', 'Eva Ernst');
    expect(screen.queryByText("This member isn't available")).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shared cases (2)' })).toBeInTheDocument();
    expect(screen.getByText('Class of 2027')).toBeInTheDocument();
  });

  it('reads them as the link publishes them, not as a member would be read: no written feedback', async () => {
    const env = createFakeEnv({ members: [EVA], shared: CASES });
    const user = await openProfile(env, 'eva', 'Eva Ernst');
    await user.click(screen.getByRole('tab', { name: 'Shared cases (2)' }));
    expect(screen.getByText('Airline profitability')).toBeInTheDocument();
    expect(screen.queryByText('Crisp structure')).not.toBeInTheDocument();
  });

  it("doesn't offer to ask them to case, which the database would refuse, and says so once", async () => {
    const env = await withMyCase(createFakeEnv({ members: [EVA], shared: CASES }));
    await openProfile(env, 'eva', 'Eva Ernst');
    expect(screen.queryByRole('button', { name: /Case with Eva/ })).not.toBeInTheDocument();
    expect(screen.getByText("Eva can't be asked to case right now.")).toBeInTheDocument();
    // The same request, offered a second way, from the case the member might give her.
    const offer = within(await screen.findByRole('region', { name: /Cases you've done that Eva hasn't shared/ }));
    expect(offer.getByText('Hospital market entry')).toBeInTheDocument();
    expect(offer.queryByRole('button', { name: 'Ask to case this' })).not.toBeInTheDocument();
  });

  it('shows neither their level nor the cases they interviewed, which the link does not carry', async () => {
    const env = createFakeEnv({ members: [EVA], shared: CASES, interviewedBy: INTERVIEWED });
    await openProfile(env, 'eva', 'Eva Ernst');
    expect(screen.queryByLabelText(/^Level 9/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Interviewed cases' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Has interviewed/)).not.toBeInTheDocument();
    expect(env.community.calls).not.toContain('getInterviewed'); // not even asked for: the answer would be nothing
  });

  it('keeps the conversation the two of you already have, which no switch of theirs closes', async () => {
    const env = createFakeEnv({ members: [EVA], shared: CASES });
    await env.practice.as('eva').send(ME, { caseTitle: 'Airline profit', caseBook: 'Cosentino', when: '', message: 'Up for it?' });
    await env.practice.mine.respond(env.practice.rows[0].id, true, 'Zoom: example.com/room');
    await openProfile(env, 'eva', 'Eva Ernst');
    expect(await screen.findByRole('link', { name: 'Message Eva' })).toBeInTheDocument();
  });

  it('still shows nothing about a member who publishes no link', async () => {
    const env = createFakeEnv({ members: [{ ...EVA, publicProfile: false }], shared: CASES });
    window.location.hash = '#/people/eva';
    render(<App backend={env.backend} />);
    expect(await screen.findByText("This member isn't available")).toBeInTheDocument();
    expect(screen.queryByText('Eva Ernst')).not.toBeInTheDocument();
  });
});

describe('a member who is in People search', () => {
  it('is read from the member tables, with everything a member is given and the ask they accept', async () => {
    const env = await withMyCase(createFakeEnv({ members: [BOB], shared: CASES, interviewedBy: { bob: INTERVIEWED.eva } }));
    const user = await openProfile(env, 'bob', 'Bob Brown');
    expect(screen.getByRole('button', { name: /Case with Bob/ })).toBeInTheDocument();
    expect(screen.queryByText(/can't be asked to case/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Level 4/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Interviewed cases' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Shared cases (1)' }));
    expect(screen.getByText('Crisp structure')).toBeInTheDocument(); // the written feedback a link would hold back
  });
});

describe('your own page when you have left People search and kept your link on', () => {
  const ME_LINK_ONLY: Profile = { ...EVA, userId: ME, displayName: 'Test User', listed: false, publicProfile: true };
  const LINE = "You're not in People search, so members see nothing here. Your link is unaffected.";

  const openOwn = async (profile: Profile) => {
    const env = createFakeEnv({ profile, members: [EVA, BOB], shared: CASES });
    const user = await openProfile(env, ME, 'Test User');
    await user.click(screen.getByRole('tab', { name: /^Shared cases/ }));
    return { env, user };
  };

  it('says the member list is empty on purpose and the link is fine', async () => {
    await openOwn(ME_LINK_ONLY);
    expect(screen.getByText(LINE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See what your link shows' })).toBeInTheDocument();
  });

  it('opens Profile & privacy at "What others see", on what a visitor reads', async () => {
    const { user } = await openOwn(ME_LINK_ONLY);
    await user.click(screen.getByRole('button', { name: 'See what your link shows' }));
    expect(await screen.findByRole('heading', { name: 'What others see' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Visitors without an account', selected: true })).toBeInTheDocument();
  });

  it('is not there for a listed member, whose page is unchanged', async () => {
    await openOwn({ ...ME_LINK_ONLY, listed: true });
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.getByText('No shared cases')).toBeInTheDocument();
    expect(screen.getByText("Test User hasn't shared any case history with other members.")).toBeInTheDocument();
  });

  it('is not there for a member with both switches off, who sees the plain empty state', async () => {
    await openOwn({ ...ME_LINK_ONLY, publicProfile: false });
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See what your link shows' })).not.toBeInTheDocument();
    expect(screen.getByText("Test User hasn't shared any case history with other members.")).toBeInTheDocument();
  });

  it("is not on someone else's page, link view or not", async () => {
    const env = createFakeEnv({ members: [EVA, { ...BOB, listed: true }], shared: [] });
    const user = await openProfile(env, 'eva', 'Eva Ernst');
    await user.click(screen.getByRole('tab', { name: /^Shared cases/ }));
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See what your link shows' })).not.toBeInTheDocument();
    expect(screen.getByText("Eva Ernst hasn't shared any case history with other members.")).toBeInTheDocument();
  });
});
