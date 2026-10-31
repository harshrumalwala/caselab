import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as download from './data/download';
import { createFakeEnv } from './test/fakeBackend';
import { makeCase } from './test/builders';

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('exporting the case log to Excel', () => {
  it('downloads an .xlsx file from the Case Log and says so', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Airline profit', date: '2026-09-01' }));
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Export to Excel' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [filename, blob] = save.mock.calls[0];
    expect(filename).toMatch(/^caselab-case-log-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(blob.size).toBeGreaterThan(100);
    expect(await screen.findByText('Excel file downloaded')).toBeInTheDocument();
  });

  it('is also offered in Settings, next to the other downloads', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Airline profit', date: '2026-09-01' }));
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Export to Excel' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
});
