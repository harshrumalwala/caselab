import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { createFakeEnv, type FakeEnv } from './test/fakeBackend';

const workbook = (name: string) => {
  const bytes = readFileSync(resolve(process.cwd(), 'src/test/fixtures', name));
  return new File([new Uint8Array(bytes)], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

async function openImport(env: FakeEnv) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await user.click(await screen.findByRole('button', { name: /Import your Excel case log/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Import from Excel' });
  return { user, dialog };
}

async function pick(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, file: File) {
  await user.upload(within(dialog).getByLabelText('Choose your Excel workbook'), file);
}

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('importing a case log from Excel', () => {
  it('shows what it found before saving anything, with industries suggested and problems flagged', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openImport(env);
    await pick(user, dialog, workbook('mcg-rich.xlsx'));

    expect(await within(dialog).findByText(/3 cases found, plus 5 list entries from Opportunity Areas/)).toBeInTheDocument();
    // Nothing has been written yet.
    expect((await env.repo.loadAll()).cases).toEqual([]);

    // Industry comes from the sheet when it has one, and is suggested from the title otherwise.
    expect(within(dialog).getByLabelText('Industry for Regional airline profit squeeze')).toHaveValue('Transportation / Logistics');
    expect(within(dialog).getByLabelText('Industry for Hospital network expansion')).toHaveValue('Healthcare / Pharmaceuticals');
    expect(within(dialog).getByLabelText('Industry for Private equity bakery buy')).toHaveValue('');
    // Cleaned-up values are listed under the case they belong to.
    expect(within(dialog).getByText(/Framework rating “seven”/)).toBeInTheDocument();
    // Private is the default.
    expect(within(dialog).getByRole('radio', { name: /Keep them private/ })).toBeChecked();
  });

  it('imports the chosen cases and lists, as private cases, with the industries you picked', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openImport(env);
    await pick(user, dialog, workbook('mcg-rich.xlsx'));
    await within(dialog).findByText(/3 cases found/);

    await user.selectOptions(within(dialog).getByLabelText('Industry for Private equity bakery buy'), 'Consumer Products / Retail');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Import Hospital network expansion' })); // leave this one out
    await user.click(within(dialog).getByRole('button', { name: 'Import 2 cases' }));

    await waitFor(async () => expect((await env.repo.loadAll()).cases).toHaveLength(2));
    const stored = await env.repo.loadAll();
    const byTitle = Object.fromEntries(stored.cases.map((c) => [c.title, c]));
    expect(Object.keys(byTitle).sort()).toEqual(['Private equity bakery buy', 'Regional airline profit squeeze']);
    expect(byTitle['Private equity bakery buy']).toMatchObject({ industry: 'Consumer Products / Retail', shareMode: 'private', caseType: 'Investment Decision', overall: 4 });
    expect(byTitle['Regional airline profit squeeze']).toMatchObject({
      industry: 'Transportation / Logistics',
      shareMode: 'private',
      partner: 'Alex Kim',
      overall: 4,
      overallFeedback: 'Strong hypothesis',
    });
    expect(byTitle['Regional airline profit squeeze'].skills.quant).toEqual({ rating: 3, feedback: 'Rushed the math' });
    expect(stored.opportunities.map((o) => [o.kind, o.text]).sort()).toEqual([
      ['exposure', 'Insurance'],
      ['exposure', 'Pricing'],
      ['exposure', 'Supply chain cases'],
      ['skill', 'Quant speed'],
      ['skill', 'Synthesis at the end'],
    ]);

    expect(await screen.findByText('Imported 2 cases')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Import from Excel' })).not.toBeInTheDocument();
  });

  it('can follow the profile sharing settings instead, and can leave the lists out', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openImport(env);
    await pick(user, dialog, workbook('mcg-rich.xlsx'));
    await within(dialog).findByText(/3 cases found/);

    await user.click(within(dialog).getByRole('radio', { name: /Follow my profile settings/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Bring in my Opportunity Areas lists/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Import 3 cases' }));

    await waitFor(async () => expect((await env.repo.loadAll()).cases).toHaveLength(3));
    const stored = await env.repo.loadAll();
    expect(stored.cases.every((c) => c.shareMode === 'profile')).toBe(true);
    expect(stored.opportunities).toEqual([]);
  });

  it('is safe to do twice: cases and list entries already there are skipped', async () => {
    const env = createFakeEnv();
    const first = await openImport(env);
    await pick(first.user, first.dialog, workbook('mcg-rich.xlsx'));
    await within(first.dialog).findByText(/3 cases found/);
    await first.user.click(within(first.dialog).getByRole('button', { name: 'Import 3 cases' }));
    await waitFor(async () => expect((await env.repo.loadAll()).cases).toHaveLength(3));

    // Open it again from Settings and choose the same file.
    await first.user.click(await screen.findByRole('button', { name: /Settings|Data/ }));
    await first.user.click(await screen.findByRole('button', { name: 'Import from Excel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from Excel' });
    await pick(first.user, dialog, workbook('mcg-rich.xlsx'));

    expect(await within(dialog).findByText(/3 cases found, 3 already in your log/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Already in your log/).length).toBeGreaterThanOrEqual(3);
    expect(within(dialog).queryByRole('checkbox', { name: /Bring in my Opportunity Areas lists/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Import lists' })).toBeDisabled();
    expect((await env.repo.loadAll()).cases).toHaveLength(3);
  });

  it('says plainly when the file is not a workbook, and lets you pick another', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openImport(env);
    await pick(user, dialog, new File(['not a spreadsheet'], 'cases.xlsx'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/could not be read as an .xlsx workbook/);
    expect(within(dialog).getByRole('button', { name: /Choose a file/ })).toBeEnabled();
    expect((await env.repo.loadAll()).cases).toEqual([]);
  });

  it('says so when the workbook has nothing filled in', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openImport(env);
    const empty = readFileSync(resolve(process.cwd(), 'MCG Case Log Template.xlsx'));
    await pick(user, dialog, new File([new Uint8Array(empty)], 'template.xlsx'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/nothing to import/);
  });
});
