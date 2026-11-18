import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { parseBackup } from './data/backup';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const ROOM = 'https://us02web.zoom.us/j/9876543210';

beforeEach(() => {
  window.location.hash = '';
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

async function openProfile(env: FakeEnv) {
  const user = userEvent.setup();
  const { unmount } = render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
  const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
  return { user, dialog, unmount };
}

const linkBox = (dialog: HTMLElement) => within(dialog).getByLabelText(/Meeting link or phone number/);
const zoneBox = (dialog: HTMLElement) => within(dialog).getByLabelText(/Time zone/);
const saveButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Save how I meet' });

describe('How I like to meet', () => {
  it('is one section in Profile & privacy with two optional fields, and says once who will see it', async () => {
    const env = createFakeEnv();
    const { dialog } = await openProfile(env);
    const section = await within(dialog).findByRole('region', { name: 'How I like to meet' });
    expect(within(section).getByText('Only the person you schedule a case with will see this.')).toBeInTheDocument();
    expect(await within(section).findByLabelText(/Meeting link or phone number \(optional\)/)).toHaveValue('');
    expect(within(section).getByLabelText(/Time zone \(optional\)/)).toBeInTheDocument();
    expect(within(section).getByText(/Zoom room, Google Meet, Teams, or a phone number/)).toBeInTheDocument();
  });

  it('saves a link and a time zone, and shows them as saved only once the database has them', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openProfile(env);
    await within(dialog).findByRole('region', { name: 'How I like to meet' });

    await user.type(linkBox(dialog), ROOM);
    await user.selectOptions(zoneBox(dialog), 'America/Chicago');
    expect(env.meeting.saved).toEqual({ link: '', timeZone: '' }); // nothing stored while typing
    await user.click(saveButton(dialog));

    await waitFor(() => expect(env.meeting.saved).toEqual({ link: ROOM, timeZone: 'America/Chicago' }));
    await screen.findByText('Saved how you like to meet');
    // Saved: there is nothing left to save until something changes again.
    await waitFor(() => expect(saveButton(dialog)).toBeDisabled());
  });

  it('names the room it recognises, and takes a phone number just as happily', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openProfile(env);
    await within(dialog).findByRole('region', { name: 'How I like to meet' });

    await user.type(linkBox(dialog), 'https://meet.google.com/abc-defg-hij');
    expect(within(dialog).getByText('Google Meet')).toBeInTheDocument();
    await user.clear(linkBox(dialog));
    await user.type(linkBox(dialog), '+1 773-555-0134');
    expect(within(dialog).getByText('Phone')).toBeInTheDocument();
    await user.click(saveButton(dialog));
    await waitFor(() => expect(env.meeting.saved.link).toBe('+1 773-555-0134'));
  });

  it('refuses a link that is not one, says why, and never asks the database', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openProfile(env);
    await within(dialog).findByRole('region', { name: 'How I like to meet' });
    const save = vi.spyOn(env.meeting, 'save');

    for (const bad of ['javascript:alert(1)', 'http://zoom.us/j/1', 'ask me on Slack']) {
      await user.clear(linkBox(dialog));
      await user.type(linkBox(dialog), bad);
      await user.click(saveButton(dialog));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/https:\/\/|phone number/);
      expect(linkBox(dialog)).toHaveValue(bad); // what they typed is still there to fix
    }
    expect(save).not.toHaveBeenCalled();
    expect(env.meeting.saved).toEqual({ link: '', timeZone: '' });
  });

  it('keeps what was typed when the save fails, and says it was not saved', async () => {
    const env = createFakeEnv();
    const { user, dialog } = await openProfile(env);
    await within(dialog).findByRole('region', { name: 'How I like to meet' });

    env.meeting.failing = true;
    await user.type(linkBox(dialog), ROOM);
    await user.click(saveButton(dialog));
    await screen.findByText('Not saved');
    expect(linkBox(dialog)).toHaveValue(ROOM);
    expect(env.meeting.saved).toEqual({ link: '', timeZone: '' });

    env.meeting.failing = false;
    await user.click(saveButton(dialog));
    await waitFor(() => expect(env.meeting.saved.link).toBe(ROOM));
  });

  it('shows what is already stored, and offers the browser’s own zone only while nothing is stored', async () => {
    const stored = createFakeEnv();
    await stored.meeting.save({ link: ROOM, timeZone: 'Europe/London' });
    const first = await openProfile(stored);
    await within(first.dialog).findByRole('region', { name: 'How I like to meet' });
    await waitFor(() => expect(linkBox(first.dialog)).toHaveValue(ROOM));
    expect(zoneBox(first.dialog)).toHaveValue('Europe/London');
    first.unmount();

    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fresh = createFakeEnv();
    const second = await openProfile(fresh);
    await within(second.dialog).findByRole('region', { name: 'How I like to meet' });
    await waitFor(() => expect(zoneBox(second.dialog)).toHaveValue(guess));
    expect(fresh.meeting.saved.timeZone).toBe(''); // offered, not stored: saving is still the member's move
  });

  it('is not shown in demo mode, where there is nothing to save it to', async () => {
    const env = createFakeEnv();
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Try demo mode' }));
    await screen.findByText(/Demo mode\./);

    await user.click(screen.getByRole('button', { name: 'Profile and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Profile & privacy' });
    expect(within(dialog).queryByRole('region', { name: 'How I like to meet' })).not.toBeInTheDocument();
    expect(env.meeting.saved).toEqual({ link: '', timeZone: '' });
  });
});

describe('your own backup', () => {
  it('carries your link and zone, and puts them back when the backup is restored', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:caselab-test';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const env = createFakeEnv();
    await env.meeting.save({ link: ROOM, timeZone: 'America/Chicago' });
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: /Download backup/ }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    const json = await blobs[0].text();
    expect(parseBackup(json).meeting).toEqual({ link: ROOM, timeZone: 'America/Chicago' });

    // Lost them since: restoring the same file brings them back.
    await env.meeting.save({ link: '', timeZone: '' });
    const file = new File([json], 'caselab-backup.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText('Choose a JSON backup file'), file);
    const confirm = await screen.findByRole('dialog', { name: 'Restore this backup?' });
    await user.click(within(confirm).getByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(env.meeting.saved).toEqual({ link: ROOM, timeZone: 'America/Chicago' }));
  });

  it('holds nothing of the kind for a member who never set one, and takes nothing dubious back from a hand-edited file', async () => {
    const empty = parseBackup(JSON.stringify({ app: 'caselab', data: { cases: [] } }));
    expect(empty.meeting).toBeUndefined();
    const hostile = parseBackup(
      JSON.stringify({ app: 'caselab', data: { cases: [] }, meeting: { link: 'javascript:alert(1)', timeZone: 'Mars/Olympus_Mons' } }),
    );
    expect(hostile.meeting).toBeUndefined();
    const half = parseBackup(JSON.stringify({ app: 'caselab', data: { cases: [] }, meeting: { link: ROOM, timeZone: 'nonsense' } }));
    expect(half.meeting).toEqual({ link: ROOM, timeZone: '' });
  });
});
