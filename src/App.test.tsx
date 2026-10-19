import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { parseBackup } from './data/backup';
import { DEMO_KEY, REAL_KEY } from './data/storage';
import { todayISO } from './domain/dates';

const storedCases = () => {
  const raw = window.localStorage.getItem(REAL_KEY);
  return raw ? (JSON.parse(raw).cases as { title: string; overall: number | null; caseType: string; industry: string }[]) : [];
};

async function openApp() {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return { user, ...view };
}

async function logCase(
  user: ReturnType<typeof userEvent.setup>,
  { title, caseType, industry, rating }: { title: string; caseType: string; industry: string; rating?: number },
) {
  await user.click(screen.getByRole('button', { name: 'Log case' }));
  const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
  await user.type(within(dialog).getByLabelText(/Case title/), title);
  await user.selectOptions(within(dialog).getByLabelText(/Case type/), caseType);
  await user.selectOptions(within(dialog).getByLabelText(/Industry/), industry);
  if (rating) await user.click(within(dialog).getByRole('radio', { name: new RegExp(`Overall performance: ${rating},`) }));
  await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
}

// jsdom applies no CSS, so the responsive table and the phone cards are both in the DOM.
// Scope to the desktop table to keep queries unambiguous.
const table = async () => within(await screen.findByRole('table'));

const metric = (label: string) => {
  const card = screen.getByText(label, { selector: 'p' }).closest('div.card') as HTMLElement;
  return card;
};

describe('CaseLab app', () => {
  it('starts empty: zero cases, no scores, no trends, an encouraging empty state', async () => {
    await openApp();
    expect(screen.getByText('Your case prep starts here')).toBeInTheDocument();
    expect(within(metric('Total cases')).getByText('0')).toBeInTheDocument();
    expect(within(metric('Case types')).getByText('of 13')).toBeInTheDocument();
    // None of the data-driven cards render without data, so nothing can show a misleading number.
    expect(screen.queryByText('Skills performance')).not.toBeInTheDocument();
    expect(screen.queryByText('Overall performance over time')).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(storedCases()).toEqual([]);
  });

  it('logs a case quickly, updates the dashboard immediately, and persists across a refresh', async () => {
    const { user, unmount } = await openApp();
    await logCase(user, {
      title: 'Airline profitability',
      caseType: 'Profitability',
      industry: 'Transportation / Logistics',
      rating: 4,
    });

    // Success panel shows what changed.
    const saved = (await screen.findByText('Case saved')).closest('[role="status"]') as HTMLElement;
    expect(within(saved).getByText('First Transportation / Logistics case')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to dashboard' }));
    await waitFor(() => expect(within(metric('Total cases')).getByText('1')).toBeInTheDocument());
    expect(within(metric('This week')).getByText('1')).toBeInTheDocument();
    expect(within(metric('Case types')).getByText('1')).toBeInTheDocument();
    expect(within(metric('Industries')).getByText('1')).toBeInTheDocument();
    // The overall rating became a real, unpadded average.
    expect(screen.getByText('Skills performance')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();

    // Saved to storage with the right shape.
    expect(storedCases()).toMatchObject([
      { title: 'Airline profitability', caseType: 'Profitability', industry: 'Transportation / Logistics', overall: 4 },
    ]);

    // "Refresh": throw the whole React tree away and mount it again.
    unmount();
    await openApp();
    await waitFor(() => expect(within(metric('Total cases')).getByText('1')).toBeInTheDocument());
    window.location.hash = '#/log';
    expect(await within(await screen.findByRole('table')).findByText('Airline profitability')).toBeInTheDocument();
  });

  it('defaults the date to today and requires a title, case type and industry', async () => {
    const { user } = await openApp();
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue(todayISO());

    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    expect(within(dialog).getByText('Give the case a title')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick a case type')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick an industry')).toBeInTheDocument();
    expect(storedCases()).toEqual([]);
  });

  it('keeps skill ratings optional and records only the ones you chose', async () => {
    const { user } = await openApp();
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), 'Quant only');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Market Sizing');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Other');
    await user.click(within(dialog).getByRole('button', { name: /Skill ratings/ }));
    await user.click(within(dialog).getByRole('radio', { name: /Quant \/ Math: 2,/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await screen.findByText('Case saved');

    const [saved] = JSON.parse(window.localStorage.getItem(REAL_KEY) as string).cases;
    expect(saved.overall).toBeNull();
    expect(saved.skills.quant.rating).toBe(2);
    expect(saved.skills.framework.rating).toBeNull();
    expect(saved.skills.behavioral1.rating).toBeNull();
  });

  it('edits and deletes a case, with a confirmation before anything is deleted', async () => {
    const { user } = await openApp();
    await logCase(user, { title: 'Original title', caseType: 'Revenue', industry: 'Insurance', rating: 3 });
    await user.click(await screen.findByRole('button', { name: 'View case log' }));

    // Edit
    await user.click((await table()).getByRole('button', { name: 'Edit Original title' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit case' });
    const title = within(edit).getByLabelText(/Case title/);
    await user.clear(title);
    await user.type(title, 'Renamed case');
    await user.click(within(edit).getByRole('radio', { name: /Overall performance: 5,/ }));
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    expect(await (await table()).findByRole('button', { name: 'Renamed case' })).toBeInTheDocument();
    expect(storedCases()).toMatchObject([{ title: 'Renamed case', overall: 5 }]);
    expect(storedCases()).toHaveLength(1); // edited in place, not duplicated

    // Delete: cancelling keeps the case...
    await user.click((await table()).getByRole('button', { name: 'Delete Renamed case' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this case?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(storedCases()).toHaveLength(1);

    // ...confirming removes it.
    await user.click((await table()).getByRole('button', { name: 'Delete Renamed case' }));
    const confirm2 = await screen.findByRole('dialog', { name: 'Delete this case?' });
    await user.click(within(confirm2).getByRole('button', { name: 'Delete case' }));
    await waitFor(() => expect(storedCases()).toEqual([]));
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

  it('keeps demo mode completely separate from real data', async () => {
    const { user } = await openApp();
    await logCase(user, { title: 'My real case', caseType: 'Revenue', industry: 'Insurance', rating: 3 });
    await user.click(await screen.findByRole('button', { name: 'Go to dashboard' }));

    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    expect(await screen.findByText(/Demo mode\./)).toBeInTheDocument();
    await waitFor(() => expect(within(metric('Total cases')).getByText('16')).toBeInTheDocument());

    // Real data untouched; demo data lives under its own key.
    expect(storedCases()).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(DEMO_KEY) as string).cases.length).toBe(16);

    await user.click(screen.getByRole('button', { name: 'Exit demo' }));
    await waitFor(() => expect(within(metric('Total cases')).getByText('1')).toBeInTheDocument());
    expect(window.localStorage.getItem(DEMO_KEY)).toBeNull();
    expect(storedCases().map((c) => c.title)).toEqual(['My real case']);
  });

  it('exports a JSON backup from the UI and restores it after the data is wiped', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:caselab-test';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user } = await openApp();
    await logCase(user, { title: 'Round trip case', caseType: 'Cost Reduction', industry: 'Manufacturing / Industrials', rating: 5 });
    await user.click(await screen.findByRole('button', { name: 'Go to dashboard' }));

    // Export
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: /Export backup/ }));
    expect(blobs).toHaveLength(1);
    const json = await blobs[0].text();
    expect(parseBackup(json).data.cases.map((c) => c.title)).toEqual(['Round trip case']);

    // Wipe everything
    await user.click(screen.getByRole('button', { name: /Clear all data/ }));
    const wipe = await screen.findByRole('dialog', { name: 'Delete all data?' });
    await user.type(within(wipe).getByLabelText(/Type/), 'DELETE');
    await user.click(within(wipe).getByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(within(metric('Total cases')).getByText('0')).toBeInTheDocument());

    // Restore from the file
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    const file = new File([json], 'caselab-backup.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText('Choose a JSON backup file'), file);
    const confirm = await screen.findByRole('dialog', { name: 'Restore this backup?' });
    expect(within(confirm).getByText(/1 case/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Replace everything' }));

    await waitFor(() => expect(storedCases()).toMatchObject([{ title: 'Round trip case', overall: 5, industry: 'Manufacturing / Industrials' }]));
  });

  it('requires typing DELETE before clearing all data', async () => {
    const { user } = await openApp();
    await logCase(user, { title: 'Keep me', caseType: 'Revenue', industry: 'Insurance' });
    await user.click(await screen.findByRole('button', { name: 'Go to dashboard' }));
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: /Clear all data/ }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete all data?' });
    const button = within(confirm).getByRole('button', { name: 'Delete everything' });
    expect(button).toBeDisabled();
    await user.type(within(confirm).getByLabelText(/Type/), 'DELETE');
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(window.localStorage.getItem(REAL_KEY)).toBeNull());
  });
});
