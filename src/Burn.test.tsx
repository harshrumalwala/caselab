import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { NO_SHARING, type Profile, type SharedCase } from './domain/community';
import { createFakeEnv, MY_PROFILE, TEST_USER, type FakeEnv } from './test/fakeBackend';
import { makeCase } from './test/builders';

const BOB: Profile = {
  userId: 'bob',
  displayName: 'Bob Brown',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: false,
  publicLinkOnly: false,
  burnedBooks: ['Cosentino'],
  sharing: { ...NO_SHARING, cases: true },
};
const BOB_SHARED: SharedCase = {
  caseId: 'b1',
  ownerId: 'bob',
  date: '2026-09-01',
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

const mine = (env: FakeEnv) => env.community.profiles.find((p) => p.userId === TEST_USER.userId)!;

async function openApp(env: FakeEnv) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return { user };
}

/** The three things a case needs before it can be saved. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, title: string) {
  await user.type(within(dialog).getByLabelText(/Case title/), title);
  await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Profitability');
  await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Technology / SaaS');
}

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('keeping a case private with one click', () => {
  async function withCases() {
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Airline profit', date: '2026-09-01', source: 'Cosentino' }));
    const ui = await openApp(env);
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });
    return { env, ...ui };
  }
  const stored = async (env: FakeEnv) => (await env.repo.loadAll()).cases[0];

  it('hides a case from other members straight from the Case Log, and shows that it is private', async () => {
    const { env, user } = await withCases();
    expect((await stored(env)).shareMode).toBe('profile');

    await user.click((await screen.findAllByRole('button', { name: 'Make Airline profit private' }))[0]);
    await waitFor(async () => expect((await stored(env)).shareMode).toBe('private'));
    expect(await screen.findByText('Case is now private')).toBeInTheDocument();
    expect((await screen.findAllByText('Private')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Stop keeping Airline profit private' })[0]).toHaveAttribute('aria-pressed', 'true');

    // And back again.
    await user.click(screen.getAllByRole('button', { name: 'Stop keeping Airline profit private' })[0]);
    await waitFor(async () => expect((await stored(env)).shareMode).toBe('profile'));
  });

  it('leaves the case as it was, and says why, when saving fails', async () => {
    const { env, user } = await withCases();
    env.failOn('updateCase');
    await user.click((await screen.findAllByRole('button', { name: 'Make Airline profit private' }))[0]);
    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    expect((await stored(env)).shareMode).toBe('profile');
    expect(screen.queryByText('Case is now private')).not.toBeInTheDocument();
  });

  it('can be switched on while logging a case, and the case is saved private', async () => {
    const env = createFakeEnv();
    const { user } = await openApp(env);
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await fillRequired(user, dialog, 'Secret practice case');
    const toggle = within(dialog).getByRole('switch', { name: 'Keep this case private' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await waitFor(async () => expect((await env.repo.loadAll()).cases).toHaveLength(1));
    expect((await stored(env)).shareMode).toBe('private');
  });

  it('can be turned off from the case detail as well', async () => {
    const { env, user } = await withCases();
    await user.click((await screen.findAllByText('Airline profit'))[0]);
    const drawer = await screen.findByRole('dialog', { name: 'Airline profit' });
    await user.click(within(drawer).getByRole('button', { name: 'Make private' }));
    await waitFor(async () => expect((await stored(env)).shareMode).toBe('private'));
    expect(await within(drawer).findByRole('button', { name: 'Stop keeping private' })).toBeInTheDocument();
  });
});

describe('burning a book', () => {
  it('lets you list the books you have burned in Profile & privacy, and take them off again', async () => {
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Airline profit', source: 'Cosentino' }));
    const { user } = await openApp(env);
    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });

    await user.type(within(dialog).getByLabelText('Add a burned book'), 'Cosentino');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mine(env).burnedBooks).toEqual(['Cosentino']));
    expect(within(dialog).getByRole('list', { name: 'Burned books' })).toHaveTextContent('Cosentino');

    // A repeat in different case is not added twice.
    await user.type(within(dialog).getByLabelText('Add a burned book'), 'cosentino');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(mine(env).burnedBooks).toEqual(['Cosentino']);

    await user.click(within(dialog).getByRole('button', { name: 'Remove Cosentino' }));
    await waitFor(() => expect(mine(env).burnedBooks).toEqual([]));
  });

  it('can be marked while logging a case from that book', async () => {
    const env = createFakeEnv();
    const { user } = await openApp(env);
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await fillRequired(user, dialog, 'Solo case');
    expect(within(dialog).queryByRole('checkbox', { name: /I've burned this book/ })).not.toBeInTheDocument(); // needs a source first

    await user.type(within(dialog).getByLabelText('Case source'), 'Cosentino');
    const burn = within(dialog).getByRole('checkbox', { name: /I've burned this book/ });
    expect(burn).not.toBeChecked();
    await user.click(burn);
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));

    await waitFor(() => expect(mine(env).burnedBooks).toEqual(['Cosentino']));
    expect((await env.repo.loadAll()).cases).toHaveLength(1);
  });

  it('shows an already-burned book as burned when you log another case from it, and can undo it there', async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, burnedBooks: ['Cosentino'] } });
    const { user } = await openApp(env);
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await fillRequired(user, dialog, 'Another one');
    await user.type(within(dialog).getByLabelText('Case source'), 'cosentino');
    const burn = within(dialog).getByRole('checkbox', { name: /I've burned this book/ });
    expect(burn).toBeChecked();
    await user.click(burn);
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await waitFor(() => expect(mine(env).burnedBooks).toEqual([]));
  });

  it("leaves your list alone when you don't touch the checkbox", async () => {
    const env = createFakeEnv({ profile: { ...MY_PROFILE, burnedBooks: ['Cosentino'] } });
    const { user } = await openApp(env);
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await fillRequired(user, dialog, 'Plain case');
    await user.type(within(dialog).getByLabelText('Case source'), 'Case in Point');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await waitFor(async () => expect((await env.repo.loadAll()).cases).toHaveLength(1));
    expect(mine(env).burnedBooks).toEqual(['Cosentino']);
  });
});

describe("other members' burned books", () => {
  async function openBob() {
    const env = createFakeEnv({ members: [BOB], shared: [BOB_SHARED] });
    for (const c of [
      makeCase({ title: 'Airline profit', caseType: 'Profitability', industry: 'Transportation / Logistics', source: 'Cosentino', date: '2026-09-01' }),
      makeCase({ title: 'Hospital entry', caseType: 'Market Entry', industry: 'Healthcare / Pharmaceuticals', source: 'Booth casebook', date: '2026-09-02' }),
    ]) {
      await env.repo.insertCase(c);
    }
    const ui = await openApp(env);
    window.location.hash = '#/people/bob';
    await screen.findByRole('heading', { name: 'Bob Brown' });
    return { env, ...ui };
  }

  it("shows on their profile which books they've burned", async () => {
    await openBob();
    expect(screen.getByText(/Has burned/)).toHaveTextContent('Has burned Cosentino');
  });

  it("skips your cases from a book they've burned when picking one for them, and says so", async () => {
    await openBob();
    const offer = within(screen.getByRole('region', { name: /Cases you've done that Bob hasn't shared/ }));
    expect(offer.getByText('Hospital entry')).toBeInTheDocument();
    expect(offer.queryByText('Airline profit')).not.toBeInTheDocument(); // from Cosentino, which Bob has burned
    const note = screen.getByText(/Bob has burned Cosentino/).closest('[role="note"]')!;
    expect(note).toHaveTextContent('1 of your cases from that book is left out below.');
  });

  it('shows nothing about burned books for someone who has not burned any', async () => {
    const env = createFakeEnv({ members: [{ ...BOB, burnedBooks: [] }], shared: [BOB_SHARED] });
    await env.repo.insertCase(makeCase({ title: 'Airline profit', source: 'Cosentino' }));
    await openApp(env);
    window.location.hash = '#/people/bob';
    await screen.findByRole('heading', { name: 'Bob Brown' });
    expect(screen.queryByText(/Has burned/)).not.toBeInTheDocument();
    expect(screen.queryByText(/has burned/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Cases you've done that Bob hasn't shared/ })).getByText('Airline profit')).toBeInTheDocument();
  });
});
