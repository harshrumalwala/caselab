import { describe, expect, it } from 'vitest';
import { emptyAppData } from '../domain/factory';
import { SKILLS } from '../domain/constants';
import { backupToJSON, ImportError, mergeAppData, parseBackup } from './backup';
import { casesToCSV, CSV_HEADERS } from './csv';
import { buildDemoData } from './demoData';
import { createLocalStorageAdapter, DEMO_KEY, parseAppData, REAL_KEY } from './storage';
import { NOW, appDataWith, makeCase, richCase } from '../test/builders';

describe('local storage adapter (persistence)', () => {
  it('returns empty data on first run with no warning', async () => {
    const { data, warning } = await createLocalStorageAdapter(REAL_KEY).load();
    expect(data.cases).toEqual([]);
    expect(warning).toBeNull();
  });

  it('keeps saved cases across a "refresh" (a brand new adapter over the same storage)', async () => {
    await createLocalStorageAdapter(REAL_KEY).save(appDataWith([richCase()]));
    const afterRefresh = await createLocalStorageAdapter(REAL_KEY).load();
    expect(afterRefresh.data.cases).toEqual([richCase()]);
  });

  it('clear() removes the data', async () => {
    const store = createLocalStorageAdapter(REAL_KEY);
    await store.save(appDataWith([richCase()]));
    await store.clear();
    expect((await store.load()).data.cases).toEqual([]);
  });

  it('never silently discards unreadable data: it keeps a raw copy and warns', async () => {
    window.localStorage.setItem(REAL_KEY, '{not json');
    const { data, warning } = await createLocalStorageAdapter(REAL_KEY).load();
    expect(data.cases).toEqual([]);
    expect(warning).toMatch(/could not be read/i);
    const rescued = Object.keys(window.localStorage).filter((k) => k.startsWith(`${REAL_KEY}:unreadable:`));
    expect(rescued).toHaveLength(1);
    expect(window.localStorage.getItem(rescued[0])).toBe('{not json');
  });

  it('warns about data written by a newer schema version but still loads it', async () => {
    window.localStorage.setItem(REAL_KEY, JSON.stringify({ ...appDataWith([richCase()]), schemaVersion: 99 }));
    const { data, warning } = await createLocalStorageAdapter(REAL_KEY).load();
    expect(data.cases).toHaveLength(1);
    expect(warning).toMatch(/newer version/i);
  });

  it('keeps demo data under a separate key from real data', async () => {
    const real = createLocalStorageAdapter(REAL_KEY);
    const demo = createLocalStorageAdapter(DEMO_KEY);
    await real.save(appDataWith([richCase()]));
    await demo.save(buildDemoData(NOW));
    expect((await real.load()).data.cases.map((c) => c.id)).toEqual(['rich-1']);
    const demoCases = (await demo.load()).data.cases;
    expect(demoCases.length).toBeGreaterThan(10);
    expect(demoCases.every((c) => c.title.startsWith('Sample: '))).toBe(true);
    expect(demoCases.some((c) => c.id === 'rich-1')).toBe(false);
  });
});

describe('parseAppData', () => {
  it('survives garbage and fills in defaults', () => {
    expect(parseAppData(null)).toEqual(emptyAppData());
    expect(parseAppData('nope')).toEqual(emptyAppData());
    const data = parseAppData({
      cases: [
        null,
        42,
        { id: 'x', title: 'Partial', caseType: 'Not a type', overall: 9, skills: { framework: { rating: '4', feedback: 7 } } },
      ],
    });
    expect(data.cases).toHaveLength(1);
    const c = data.cases[0];
    expect(c.caseType).toBe('Other');
    expect(c.overall).toBeNull(); // 9 is out of range
    expect(c.skills.framework).toEqual({ rating: 4, feedback: '7' });
    expect(c.skills.quant).toEqual({ rating: null, feedback: '' });
  });

  it('de-duplicates by id (newest wins) and rebuilds the custom industry list', () => {
    const older = { ...richCase(), updatedAt: '2026-10-12T10:00:00.000Z', title: 'Old' };
    const newer = { ...richCase(), updatedAt: '2026-10-12T18:00:00.000Z', title: 'New' };
    const data = parseAppData({ cases: [newer, older], customIndustries: ['Insurance', 'Marine'] });
    expect(data.cases).toHaveLength(1);
    expect(data.cases[0].title).toBe('New');
    expect(data.customIndustries.sort()).toEqual(['Aerospace & Defense', 'Marine']);
  });
});

describe('JSON export / import', () => {
  const full = {
    ...emptyAppData(),
    cases: [richCase(), makeCase({ id: 'plain', title: 'Plain case', overall: 3 })],
    opportunities: [
      { id: 'o1', kind: 'exposure' as const, text: 'Pricing cases', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'o2', kind: 'skill' as const, text: 'Mental math', createdAt: '2026-10-02T00:00:00.000Z' },
    ],
    customIndustries: ['Aerospace & Defense'],
  };

  it('round-trips every case, rating, feedback field, learning note and list without loss', () => {
    const json = backupToJSON(full, NOW);
    const restored = parseBackup(json);
    expect(restored.caseCount).toBe(2);
    expect(restored.data.cases).toEqual(full.cases);
    expect(restored.data.opportunities).toEqual(full.opportunities);
    expect(restored.data.customIndustries).toEqual(full.customIndustries);
    expect(restored.data.cases[0].concepts).toBe('Load factor\nCost per available seat mile');
    expect(restored.data.cases[0].skills.behavioral1.feedback).toBe('Strong story, "quoted" detail');
  });

  it('wraps the data in an identifiable, versioned file', () => {
    const file = JSON.parse(backupToJSON(full, NOW));
    expect(file.app).toBe('caselab');
    expect(file.schemaVersion).toBe(1);
    expect(file.exportedAt).toBe(NOW.toISOString());
    expect(file.data.lastExportAt).toBe(NOW.toISOString());
  });

  it('rejects files that are not CaseLab backups', () => {
    expect(() => parseBackup('not json')).toThrow(ImportError);
    expect(() => parseBackup('{"hello": "world"}')).toThrow(/does not look like a CaseLab backup/);
    expect(() => parseBackup('{"app":"caselab","data":{"nothing":true}}')).toThrow(ImportError);
  });

  it('also accepts a bare array of cases', () => {
    expect(parseBackup(JSON.stringify([richCase()])).caseCount).toBe(1);
  });

  it('merge keeps both sides and lets the newer edit of a shared case win', () => {
    const current = appDataWith([
      makeCase({ id: 'shared', title: 'Current', updatedAt: '2026-10-10T10:00:00.000Z' }),
      makeCase({ id: 'only-current', title: 'Only here' }),
    ]);
    const incoming = appDataWith([
      makeCase({ id: 'shared', title: 'Incoming newer', updatedAt: '2026-10-11T10:00:00.000Z' }),
      makeCase({ id: 'only-incoming', title: 'Only in file' }),
    ]);
    const merged = mergeAppData(current, incoming);
    expect(merged.cases.map((c) => c.id).sort()).toEqual(['only-current', 'only-incoming', 'shared']);
    expect(merged.cases.find((c) => c.id === 'shared')?.title).toBe('Incoming newer');

    const olderIncoming = appDataWith([makeCase({ id: 'shared', title: 'Stale', updatedAt: '2026-10-01T10:00:00.000Z' })]);
    expect(mergeAppData(current, olderIncoming).cases.find((c) => c.id === 'shared')?.title).toBe('Current');
  });
});

describe('CSV export', () => {
  it('includes a column for every field of every case', () => {
    expect(CSV_HEADERS).toContain('Case Title');
    expect(CSV_HEADERS).toContain('Industry');
    expect(CSV_HEADERS).toContain('Concepts Learned');
    for (const s of SKILLS) {
      expect(CSV_HEADERS).toContain(s.label);
      expect(CSV_HEADERS).toContain(`${s.label} Feedback`);
    }
  });

  it('writes one row per case with proper quoting, newlines and a BOM for Excel', () => {
    const csv = casesToCSV([richCase(), makeCase({ id: 'p', title: 'Plain', date: '2026-10-01' })]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Airline, ""Alpha"" profitability"');
    expect(csv).toContain('"Load factor\nCost per available seat mile"');
    expect(csv).toContain('"Second story\nwas weaker, with a comma"');
    expect(csv).toContain('café – naïve');
    // Oldest case first, and an unrated skill is an empty cell rather than a 0.
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toContain('Plain');
    expect(lines[1]).not.toMatch(/,0,/);
  });
});
