import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as download from './data/download';
import * as mcgTemplate from './data/mcgTemplate';
import { createFakeEnv, MY_PROFILE } from './test/fakeBackend';
import { makeCase } from './test/builders';

// No network in tests: hand the export the template straight from disk, as the browser would fetch it.
const template = () => new Uint8Array(readFileSync(resolve(process.cwd(), 'src/data/mcg-case-log-template.xlsx')));

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(mcgTemplate, 'loadMcgTemplate').mockImplementation(async () => template());
});

const sheet = async (blob: Blob, path: string) => strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))[path]);

describe('exporting the case log to Excel', () => {
  it('downloads the MCG workbook from the Case Log and says so', async () => {
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
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBeGreaterThan(100_000); // the real workbook, not a stripped-down sheet
    expect(await screen.findByText('Excel file downloaded')).toBeInTheDocument();
  });

  it('puts your cases with all their detail in the Log, and your name on the Dashboard', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    const env = createFakeEnv();
    await env.repo.insertCase(
      makeCase({
        title: 'Airline profit',
        date: '2026-09-01',
        overallFeedback: 'Great structure',
        wentWell: 'Clean MECE tree',
        struggled: 'Quick maths',
        concepts: 'Load factor',
        nextFocus: 'Daily drills',
        improvementArea: 'quant',
      }),
    );
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export to Excel' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    const blob = save.mock.calls[0][1];
    const log = await sheet(blob, 'xl/worksheets/sheet2.xml');
    for (const detail of ['Airline profit', 'Great structure', 'Clean MECE tree', 'Quick maths', 'Load factor', 'Daily drills', 'Quant / Math']) {
      expect(log, detail).toContain(detail);
    }
    expect(await sheet(blob, 'xl/worksheets/sheet1.xml')).toContain(MY_PROFILE.displayName);
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

  it('says so, in plain words, when the template cannot be loaded, and downloads nothing', async () => {
    const save = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    vi.spyOn(mcgTemplate, 'loadMcgTemplate').mockRejectedValue(new Error("Couldn't load the MCG template. Check your internet connection and try again."));
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Airline profit', date: '2026-09-01' }));
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export to Excel' }));
    expect(await screen.findByText("Couldn't make the Excel file")).toBeInTheDocument();
    expect(screen.getByText(/Check your internet connection/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
