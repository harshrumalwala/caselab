import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv, TEST_USER } from './test/fakeBackend';

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

async function openCase(title: string) {
  const env = createFakeEnv();
  await env.repo.insertCase(makeCase({ title, date: '2026-09-01', wentWell: 'Clear structure', struggled: 'The maths', nextFocus: 'Pricing levers' }));
  window.location.hash = '#/log';
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'My Case Log' });
  await user.click((await screen.findAllByText(title))[0]);
  const dialog = await screen.findByRole('dialog', { name: title });
  return { user, dialog };
}

describe('viewing a past case', () => {
  it('opens in a wide window in the middle of the screen, not a side panel, so long solutions have room', async () => {
    const { dialog } = await openCase('Army Hotel');
    expect(dialog.className).not.toContain('animate-drawer'); // no slide-in side panel
    expect(dialog.className).toContain('sm:max-w-5xl'); // wide
    expect(dialog.className).toContain('sm:max-h-[92vh]'); // and tall
    // Its holder centers it (a side panel would push it to the right edge).
    expect(dialog.parentElement?.className).toContain('justify-center');
    expect(dialog.parentElement?.className).not.toContain('justify-end');
  });

  it('still shows the case, closes with Escape, and goes to editing from its footer', async () => {
    const { user, dialog } = await openCase('Army Hotel');
    const view = within(dialog);
    expect(view.getByText('Clear structure')).toBeInTheDocument();
    expect(view.getByText('Pricing levers')).toBeInTheDocument();
    expect(view.getByRole('button', { name: /Edit case/ })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Army Hotel' })).not.toBeInTheDocument());
  });

  it('closes when you click outside the window', async () => {
    const { user, dialog } = await openCase('Army Hotel');
    await user.click(dialog.parentElement as HTMLElement); // the space around the window
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Army Hotel' })).not.toBeInTheDocument());
  });
});
