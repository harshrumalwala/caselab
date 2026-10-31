import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { DRAFT_KEY, THEME_KEY, warmupKeyFor } from './state/storageKeys';
import { tourKey } from './features/tour/seen';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';
import { makeCase } from './test/builders';

beforeEach(() => {
  window.location.hash = '';
});

async function openSettings(env: FakeEnv = createFakeEnv()) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  await user.click(screen.getByRole('button', { name: 'Data and settings' }));
  const settings = await screen.findByRole('dialog', { name: 'Data & settings' });
  return { env, user, settings };
}

async function openConfirm(env?: FakeEnv) {
  const ctx = await openSettings(env);
  await ctx.user.click(within(ctx.settings).getByRole('button', { name: 'Delete my account…' }));
  const confirm = await screen.findByRole('dialog', { name: 'Delete your account?' });
  return { ...ctx, confirm };
}

describe('deleting your account from Settings', () => {
  it('is offered in the Danger zone, next to clearing your data', async () => {
    const { settings } = await openSettings();
    expect(within(settings).getByText(/Permanently delete your account and everything in it/)).toBeInTheDocument();
    expect(within(settings).getByRole('button', { name: 'Delete my account…' })).toBeEnabled();
    expect(within(settings).getByRole('button', { name: 'Clear all data…' })).toBeEnabled(); // still its own, lighter, option
  });

  it('says plainly what goes, including that the other person loses the conversation, before anything happens', async () => {
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Airline profit', date: '2026-09-01' }));
    const { confirm } = await openConfirm(env);
    for (const text of [/your 1 case, lists, weekly goal and Warm-up record/, /your profile, and everything you shared or made public/, /every conversation you are in \(the other person loses it too\)/, /you can't sign in again with this email/, /It can't be undone/, /download a backup or an Excel copy/]) {
      expect(within(confirm).getByText(text)).toBeInTheDocument();
    }
    expect(env.deletedAccounts).toEqual([]);
  });

  it('only goes ahead once you have typed DELETE', async () => {
    const { env, user, confirm } = await openConfirm();
    const button = within(confirm).getByRole('button', { name: 'Delete my account' });
    expect(button).toBeDisabled();
    const box = within(confirm).getByRole('textbox');
    for (const wrong of ['delete', 'DELET', 'yes please']) {
      await user.clear(box);
      await user.type(box, wrong);
      expect(button).toBeDisabled();
    }
    await user.click(within(screen.getByRole('dialog', { name: 'Delete your account?' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete your account?' })).not.toBeInTheDocument());
    expect(env.deletedAccounts).toEqual([]);
    expect(env.signedIn()).toBe(true);
  });

  it('deletes the account, signs you out to the public page, and says so', async () => {
    const { env, user, confirm } = await openConfirm();
    await user.type(within(confirm).getByRole('textbox'), 'DELETE');
    await user.click(within(confirm).getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByRole('heading', { name: /Case smarter/ })).toBeInTheDocument();
    expect(env.deletedAccounts).toEqual([TEST_USER.userId]);
    expect(env.signedIn()).toBe(false);
    expect(await screen.findByText('Your account was deleted')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('forgets the member on this device too, but keeps the theme', async () => {
    window.localStorage.setItem(DRAFT_KEY, '{"title":"half-written"}');
    window.localStorage.setItem(warmupKeyFor(TEST_USER.userId), '{"score":99,"streak":5}');
    window.localStorage.setItem(tourKey(TEST_USER.userId), '1');
    window.localStorage.setItem(warmupKeyFor('someone-else'), '{"score":1,"streak":1}');
    const { user, settings } = await openSettings();
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' })); // the theme is the member's choice for this device, not their data
    await waitFor(() => expect(window.localStorage.getItem(THEME_KEY)).toBe('dark'));
    await user.click(within(settings).getByRole('button', { name: 'Delete my account…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete your account?' });
    await user.type(within(confirm).getByRole('textbox'), 'DELETE');
    await user.click(within(confirm).getByRole('button', { name: 'Delete my account' }));
    await screen.findByRole('heading', { name: /Case smarter/ });

    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(warmupKeyFor(TEST_USER.userId))).toBeNull();
    expect(window.localStorage.getItem(tourKey(TEST_USER.userId))).toBeNull();
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark'); // not personal
  });

  it('says what went wrong, and changes nothing, if the deletion fails; you can try again', async () => {
    window.localStorage.setItem(warmupKeyFor(TEST_USER.userId), '{"score":99,"streak":5}');
    const env = createFakeEnv();
    env.failAccountDeletion({ message: 'TypeError: Failed to fetch' });
    const { user, confirm } = await openConfirm(env);
    await user.type(within(confirm).getByRole('textbox'), 'DELETE');
    await user.click(within(confirm).getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText("Couldn't delete your account")).toBeInTheDocument();
    expect(env.deletedAccounts).toEqual([]);
    expect(env.signedIn()).toBe(true); // still signed in, nothing removed
    expect(window.localStorage.getItem(warmupKeyFor(TEST_USER.userId))).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument(); // the dialog stays so you can retry
    const again = within(screen.getByRole('dialog', { name: 'Delete your account?' }));
    expect(again.getByRole('button', { name: 'Delete my account' })).toBeDisabled(); // you type DELETE again: it is not a one-click retry

    env.failAccountDeletion(undefined); // the connection is back
    await user.type(again.getByRole('textbox'), 'DELETE');
    await user.click(again.getByRole('button', { name: 'Delete my account' }));
    await screen.findByRole('heading', { name: /Case smarter/ });
    expect(env.deletedAccounts).toEqual([TEST_USER.userId]);
  });

  it('is not available in demo mode, which only shows sample data', async () => {
    const { user, settings } = await openSettings();
    await user.click(within(settings).getByRole('button', { name: 'Try demo mode' }));
    await screen.findByText(/Demo mode\./);
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    const again = await screen.findByRole('dialog', { name: 'Data & settings' });
    expect(within(again).getByRole('button', { name: 'Delete my account…' })).toBeDisabled();
  });
});
