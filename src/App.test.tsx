import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { parseBackup } from './data/backup';
import { todayISO } from './domain/dates';
import { createFakeEnv, TEST_PASSWORD, TEST_USER, type FakeEnv } from './test/fakeBackend';

type User = ReturnType<typeof userEvent.setup>;

const stored = async (env: FakeEnv) => (await env.repo.loadAll()).cases;

async function openApp(env: FakeEnv = createFakeEnv()) {
  const user = userEvent.setup();
  const view = render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return { user, env, ...view };
}

async function fillCase(
  user: User,
  { title, caseType, industry, rating }: { title: string; caseType: string; industry: string; rating?: number },
) {
  const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
  await user.type(within(dialog).getByLabelText(/Case title/), title);
  await user.selectOptions(within(dialog).getByLabelText(/Case type/), caseType);
  await user.selectOptions(within(dialog).getByLabelText(/Industry/), industry);
  if (rating) await user.click(within(dialog).getByRole('radio', { name: new RegExp(`Overall performance: ${rating},`) }));
  return dialog;
}

async function logCase(user: User, details: Parameters<typeof fillCase>[1]) {
  await user.click(screen.getByRole('button', { name: 'Log case' }));
  const dialog = await fillCase(user, details);
  await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
}

// jsdom applies no CSS, so the responsive table and the phone cards are both in the DOM.
// Scope to the desktop table to keep queries unambiguous.
const table = async () => within(await screen.findByRole('table'));

const metric = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div.sticker') as HTMLElement;

describe('sign in', () => {
  it('shows the public page first, never the app, and requests no member data until you are signed in', async () => {
    const env = createFakeEnv({ signedIn: false });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    expect(await screen.findByRole('heading', { name: /Case smarter/  })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log case' })).not.toBeInTheDocument();
    expect(env.calls).toEqual([]); // no request for personal data without a session
    expect(env.community.calls).toEqual([]);

    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('rejects a wrong password with a visible message, then signs in with the right one', async () => {
    const env = createFakeEnv({ signedIn: false });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('link', { name: 'Sign in' }));
    await user.type(await screen.findByLabelText('Email'), TEST_USER.email);
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password do not match.');
    expect(env.calls).toEqual([]);

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(env.calls).toContain('loadAll');
    expect(window.location.hash).toBe('#/dashboard'); // the sign-in address is dropped once you're in
  });

  it('signs out back to the sign-in screen and keeps your data for next time', async () => {
    const { user, env } = await openApp();
    await logCase(user, { title: 'Keep me', caseType: 'Revenue', industry: 'Insurance', rating: 3 });
    await user.click(await screen.findByRole('button', { name: 'Go to dashboard' }));

    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /Case smarter/  })).toBeInTheDocument(); // back to the public page
    expect(screen.queryByText('Keep me')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    await user.type(await screen.findByLabelText('Email'), TEST_USER.email);
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    await waitFor(() => expect(within(metric('Total cases')).getByText('1')).toBeInTheDocument());
    expect((await stored(env)).map((c) => c.title)).toEqual(['Keep me']);
  });

  it('explains a missing Supabase configuration instead of using other storage', () => {
    render(<App backend={{ problem: 'Missing configuration: VITE_SUPABASE_URL.' }} />);
    expect(screen.getByText("CaseLab isn't connected to Supabase")).toBeInTheDocument();
    expect(screen.getByText('Missing configuration: VITE_SUPABASE_URL.')).toBeInTheDocument();
  });
});

describe('CaseLab app', () => {
  it('starts empty: zero cases, no scores, no trends, an encouraging empty state', async () => {
    const { env } = await openApp();
    expect(screen.getByText('Your case prep starts here')).toBeInTheDocument();
    expect(within(metric('Total cases')).getByText('0')).toBeInTheDocument();
    expect(within(metric('Case types')).getByText('of 13')).toBeInTheDocument();
    expect(screen.queryByText('Skills performance')).not.toBeInTheDocument();
    expect(screen.queryByText('Overall performance over time')).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(await stored(env)).toEqual([]);
  });

  it('saves a case to the database, updates the dashboard, and still has it after a refresh', async () => {
    const { user, env, unmount } = await openApp();
    await logCase(user, {
      title: 'Airline profitability',
      caseType: 'Profitability',
      industry: 'Transportation / Logistics',
      rating: 4,
    });

    const saved = (await screen.findByText('Case saved')).closest('[role="status"]') as HTMLElement;
    expect(within(saved).getByText('First Transportation / Logistics case')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to dashboard' }));
    await waitFor(() => expect(within(metric('Total cases')).getByText('1')).toBeInTheDocument());
    expect(within(metric('This week')).getByText('1')).toBeInTheDocument();
    expect(within(metric('Case types')).getByText('1')).toBeInTheDocument();
    expect(within(metric('Industries')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Skills performance')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();

    // It is in the database...
    expect(await stored(env)).toMatchObject([
      { title: 'Airline profitability', caseType: 'Profitability', industry: 'Transportation / Logistics', overall: 4 },
    ]);
    // ...and nowhere in the browser's own storage.
    const browserStorage = JSON.stringify({ ...window.localStorage, ...window.sessionStorage });
    expect(browserStorage).not.toContain('Airline profitability');

    // "Refresh": throw the whole React tree away and mount it again.
    unmount();
    await openApp(env);
    await waitFor(() => expect(within(metric('Total cases')).getByText('1')).toBeInTheDocument());
    window.location.hash = '#/log';
    expect(await within(await screen.findByRole('table')).findByText('Airline profitability')).toBeInTheDocument();
  });

  it('defaults the date to today and requires a title, case type and industry', async () => {
    const { user, env } = await openApp();
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue(todayISO());

    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    expect(within(dialog).getByText('Give the case a title')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick a case type')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick an industry')).toBeInTheDocument();
    expect(await stored(env)).toEqual([]);
  });

  it('keeps skill ratings optional and records only the ones you chose', async () => {
    const { user, env } = await openApp();
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await fillCase(user, { title: 'Quant only', caseType: 'Market Sizing', industry: 'Other' });
    await user.click(within(dialog).getByRole('button', { name: /Skill ratings/ }));
    await user.click(within(dialog).getByRole('radio', { name: /Quant \/ Math: 2,/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await screen.findByText('Case saved');

    const [saved] = await stored(env);
    expect(saved.overall).toBeNull();
    expect(saved.skills.quant.rating).toBe(2);
    expect(saved.skills.framework.rating).toBeNull();
    expect(saved.skills.behavioral1.rating).toBeNull();
  });

  it('edits and deletes a case, with a confirmation before anything is deleted', async () => {
    const { user, env } = await openApp();
    await logCase(user, { title: 'Original title', caseType: 'Revenue', industry: 'Insurance', rating: 3 });
    await user.click(await screen.findByRole('button', { name: 'View case log' }));

    await user.click((await table()).getByRole('button', { name: 'Edit Original title' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit case' });
    const title = within(edit).getByLabelText(/Case title/);
    await user.clear(title);
    await user.type(title, 'Renamed case');
    await user.click(within(edit).getByRole('radio', { name: /Overall performance: 5,/ }));
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    expect(await (await table()).findByRole('button', { name: 'Renamed case' })).toBeInTheDocument();
    expect(await stored(env)).toMatchObject([{ title: 'Renamed case', overall: 5 }]);
    expect(await stored(env)).toHaveLength(1); // edited in place, not duplicated

    await user.click((await table()).getByRole('button', { name: 'Delete Renamed case' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this case?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(await stored(env)).toHaveLength(1);

    await user.click((await table()).getByRole('button', { name: 'Delete Renamed case' }));
    const confirm2 = await screen.findByRole('dialog', { name: 'Delete this case?' });
    await user.click(within(confirm2).getByRole('button', { name: 'Delete case' }));
    await waitFor(async () => expect(await stored(env)).toEqual([]));
    expect(await screen.findByText('No cases logged yet')).toBeInTheDocument();
  });

  it('searches and filters the case log', async () => {
    const { user } = await openApp();
    await logCase(user, { title: 'Airline profitability', caseType: 'Profitability', industry: 'Transportation / Logistics', rating: 4 });
    await user.click(await screen.findByRole('button', { name: 'Log another case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(await within(dialog).findByLabelText(/Case title/), 'Bank market entry');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Market Entry');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Financial Services');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await user.click(await screen.findByRole('button', { name: 'View case log' }));

    expect(await (await table()).findByText('Airline profitability')).toBeInTheDocument();
    expect((await table()).getByText('Bank market entry')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search cases'), 'airline');
    expect((await table()).queryByText('Bank market entry')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2 cases')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search cases'));
    await user.selectOptions(screen.getByLabelText('Filter by performance'), 'unrated');
    expect((await table()).queryByText('Airline profitability')).not.toBeInTheDocument();
    expect((await table()).getByText('Bank market entry')).toBeInTheDocument();
  });
});

describe('database errors are visible', () => {
  it("doesn't claim a case was saved when the database is unreachable, and keeps what you typed", async () => {
    const { user, env } = await openApp();
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await fillCase(user, { title: 'Offline case', caseType: 'Revenue', industry: 'Insurance', rating: 4 });

    env.failOn('insertCase');
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Not saved\..*can't reach supabase/i);
    expect(screen.queryByText('Case saved')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Case title/)).toHaveValue('Offline case'); // nothing lost
    expect(await stored(env)).toEqual([]);
    expect(within(metric('Total cases')).getByText('0')).toBeInTheDocument(); // dashboard unchanged

    // Connection back: the same form saves.
    env.heal();
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    expect(await screen.findByText('Case saved')).toBeInTheDocument();
    expect(await stored(env)).toMatchObject([{ title: 'Offline case' }]);
  });

  it('shows an error and keeps the case when a delete fails', async () => {
    const { user, env } = await openApp();
    await logCase(user, { title: 'Stubborn case', caseType: 'Revenue', industry: 'Insurance' });
    await user.click(await screen.findByRole('button', { name: 'View case log' }));

    env.failOn('deleteCase', { message: 'permission denied', code: '42501' });
    await user.click((await table()).getByRole('button', { name: 'Delete Stubborn case' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete this case?' })).getByRole('button', { name: 'Delete case' }));

    expect(await screen.findByText('Not deleted')).toBeInTheDocument();
    expect((await table()).getByText('Stubborn case')).toBeInTheDocument();
    expect(await stored(env)).toHaveLength(1);
  });

  it('shows an error screen with Retry, never an empty dashboard, when loading fails', async () => {
    const env = createFakeEnv();
    env.failOn('loadAll', { message: 'TypeError: Failed to fetch' });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);

    expect(await screen.findByText("Couldn't load your cases")).toBeInTheDocument();
    expect(screen.getByText(/can't reach supabase/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByText('Your case prep starts here')).not.toBeInTheDocument();

    env.heal();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('reports a missing database table clearly', async () => {
    const env = createFakeEnv();
    env.failOn('loadAll', { code: 'PGRST205', message: "Could not find the table 'public.cases' in the schema cache" });
    render(<App backend={env.backend} />);
    expect(await screen.findByText(/database tables are missing/i)).toBeInTheDocument();
  });
});

describe('demo mode, backup and clearing', () => {
  it('keeps demo mode completely separate from your real data', async () => {
    const { user, env } = await openApp();
    await logCase(user, { title: 'My real case', caseType: 'Revenue', industry: 'Insurance', rating: 3 });
    await user.click(await screen.findByRole('button', { name: 'Go to dashboard' }));

    const callsBefore = env.calls.length;
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    expect(await screen.findByText(/Demo mode\./)).toBeInTheDocument();
    await waitFor(() => expect(within(metric('Total cases')).getByText('16')).toBeInTheDocument());

    // The real database was never touched while exploring the demo.
    expect(env.calls.length).toBe(callsBefore);
    expect(await stored(env)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Exit demo' }));
    await waitFor(() => expect(within(metric('Total cases')).getByText('1')).toBeInTheDocument());
    expect((await stored(env)).map((c) => c.title)).toEqual(['My real case']);
  });

  it('exports a JSON backup from the UI and restores it into the database after a wipe', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:caselab-test';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user, env } = await openApp();
    await logCase(user, { title: 'Round trip case', caseType: 'Cost Reduction', industry: 'Manufacturing / Industrials', rating: 5 });
    await user.click(await screen.findByRole('button', { name: 'Go to dashboard' }));

    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: /Download backup/ }));
    expect(blobs).toHaveLength(1);
    const json = await blobs[0].text();
    expect(parseBackup(json).data.cases.map((c) => c.title)).toEqual(['Round trip case']);

    await user.click(screen.getByRole('button', { name: /Clear all data/ }));
    const wipe = await screen.findByRole('dialog', { name: 'Delete all data?' });
    await user.type(within(wipe).getByLabelText(/Type/), 'DELETE');
    await user.click(within(wipe).getByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(within(metric('Total cases')).getByText('0')).toBeInTheDocument());
    expect(await stored(env)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    const file = new File([json], 'caselab-backup.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText('Choose a JSON backup file'), file);
    const confirm = await screen.findByRole('dialog', { name: 'Restore this backup?' });
    expect(within(confirm).getByText(/1 case/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Replace everything' }));

    await waitFor(async () =>
      expect(await stored(env)).toMatchObject([{ title: 'Round trip case', overall: 5, industry: 'Manufacturing / Industrials' }]),
    );
  });

  it('requires typing DELETE before clearing all data', async () => {
    const { user, env } = await openApp();
    await logCase(user, { title: 'Keep me', caseType: 'Revenue', industry: 'Insurance' });
    await user.click(await screen.findByRole('button', { name: 'Go to dashboard' }));
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: /Clear all data/ }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete all data?' });
    const button = within(confirm).getByRole('button', { name: 'Delete everything' });
    expect(button).toBeDisabled();
    expect(await stored(env)).toHaveLength(1);
    await user.type(within(confirm).getByLabelText(/Type/), 'DELETE');
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(async () => expect(await stored(env)).toEqual([]));
  });
});
