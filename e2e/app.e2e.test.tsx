import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { cleanup, counts, E2E_EMAIL, E2E_PASSWORD, HAVE_CREDENTIALS, signedInClient, TEST_PREFIX } from './helpers';

const TITLE = `${TEST_PREFIX} app flow`;

describe.skipIf(!HAVE_CREDENTIALS)('live Supabase: the real app, signed in as you', () => {
  let admin: SupabaseClient; // a separate session used only to look at the database directly
  let baseline: { cases: number; opportunities: number };

  beforeAll(async () => {
    ({ client: admin } = await signedInClient());
    await cleanup(admin);
    baseline = await counts(admin);
  });

  afterAll(async () => {
    await cleanup(admin);
  });

  const rowsWithTitle = async (title: string) => {
    const { data, error } = await admin.from('cases').select('*').eq('title', title);
    if (error) throw error;
    return data ?? [];
  };

  it('signs in, saves to Supabase, survives a refresh, edits, deletes and signs out', async () => {
    const user = userEvent.setup();
    let view = render(<App />); // the real backend, built from the VITE_SUPABASE_* settings

    // --- Sign in (wrong password first) ---
    await user.type(await screen.findByLabelText('Email'), E2E_EMAIL);
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password do not match.');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), E2E_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 30_000 });

    // --- Log a case through the form ---
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), TITLE);
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Profitability');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Transportation / Logistics');
    await user.click(within(dialog).getByRole('radio', { name: /Overall performance: 4,/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    await screen.findByText('Case saved', undefined, { timeout: 30_000 });

    // It is really in Supabase, owned by us, with the values we entered.
    const [saved] = await rowsWithTitle(TITLE);
    expect(saved).toMatchObject({ case_type: 'Profitability', industry: 'Transportation / Logistics', overall: 4, source: null });
    expect(await counts(admin)).toEqual({ ...baseline, cases: baseline.cases + 1 });

    // --- "Refresh": a brand new page load restores the session and shows the case ---
    view.unmount();
    view = render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 30_000 }); // no sign-in needed again
    window.location.hash = '#/log';
    const table = within(await screen.findByRole('table', undefined, { timeout: 30_000 }));
    expect(await table.findByRole('button', { name: TITLE })).toBeInTheDocument();

    // --- Edit ---
    await user.click(table.getByRole('button', { name: `Edit ${TITLE}` }));
    const edit = await screen.findByRole('dialog', { name: 'Edit case' });
    await user.click(within(edit).getByRole('radio', { name: /Overall performance: 2,/ }));
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    await waitFor(async () => expect((await rowsWithTitle(TITLE))[0]?.overall).toBe(2), { timeout: 30_000 });
    expect(await rowsWithTitle(TITLE)).toHaveLength(1); // edited in place

    // --- Delete (with confirmation) ---
    await user.click((await screen.findByRole('table')).querySelector(`button[aria-label="Delete ${TITLE}"]`) as HTMLElement);
    const confirm = await screen.findByRole('dialog', { name: 'Delete this case?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete case' }));
    await waitFor(async () => expect(await rowsWithTitle(TITLE)).toHaveLength(0), { timeout: 30_000 });
    expect(await counts(admin)).toEqual(baseline);

    // --- Sign out ---
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 30_000 })).toBeInTheDocument();
    view.unmount();
  });
});
