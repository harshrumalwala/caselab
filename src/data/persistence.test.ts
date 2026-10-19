import { describe, expect, it } from 'vitest';
import { emptyAppData } from '../domain/factory';
import { SKILLS } from '../domain/constants';
import { backupToJSON, ImportError, mergeAppData, parseBackup } from './backup';
import { createSupabaseBackend } from './backend';
import { casesToCSV, CSV_HEADERS } from './csv';
import { buildDemoData } from './demoData';
import { describeError } from './errors';
import { createMemoryRepository } from './memoryRepository';
import { parseAppData } from './parse';
import { NOW, appDataWith, makeCase, richCase } from '../test/builders';

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

  it('de-duplicates by id (newest wins) and derives the custom industry list from the cases', () => {
    const older = { ...richCase(), updatedAt: '2026-10-12T10:00:00.000Z', title: 'Old' };
    const newer = { ...richCase(), updatedAt: '2026-10-12T18:00:00.000Z', title: 'New' };
    const data = parseAppData({ cases: [newer, older], customIndustries: ['Ignored, not on any case'] });
    expect(data.cases).toHaveLength(1);
    expect(data.cases[0].title).toBe('New');
    expect(data.customIndustries).toEqual(['Aerospace & Defense']);
  });
});

describe('demo mode data', () => {
  it('is labelled as sample data and lives in its own in-memory repository', async () => {
    const demo = createMemoryRepository(buildDemoData(NOW));
    const real = createMemoryRepository({ cases: [richCase()] });
    const demoCases = (await demo.loadAll()).cases;
    expect(demoCases.length).toBeGreaterThan(10);
    expect(demoCases.every((c) => c.title.startsWith('Sample: '))).toBe(true);
    await demo.clearAll();
    expect((await real.loadAll()).cases.map((c) => c.id)).toEqual(['rich-1']);
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
  });

  it('still reads backups made by the earlier browser-storage version (extra fields are ignored)', () => {
    const legacy = JSON.stringify({
      app: 'caselab',
      schemaVersion: 1,
      exportedAt: '2026-10-01T00:00:00.000Z',
      data: { ...full, lastExportAt: '2026-10-01T00:00:00.000Z' },
    });
    expect(parseBackup(legacy).data.cases).toEqual(full.cases);
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

describe('Supabase configuration', () => {
  it('reports missing settings instead of falling back to anything else', () => {
    expect(createSupabaseBackend('', '')).toEqual({
      problem: 'Missing configuration: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    });
    expect('problem' in createSupabaseBackend('https://x.supabase.co', '')).toBe(true);
  });

  it('refuses a malformed URL and anything that looks like a secret key', () => {
    expect(createSupabaseBackend('x.supabase.co', 'sb_publishable_abc')).toHaveProperty('problem');
    expect(createSupabaseBackend('https://x.supabase.co', 'sb_secret_abc')).toHaveProperty('problem');
    expect(createSupabaseBackend('https://x.supabase.co', 'service_role_key')).toHaveProperty('problem');
  });

  it('builds a backend from a URL and publishable key', () => {
    expect(createSupabaseBackend('https://x.supabase.co', 'sb_publishable_abc')).toHaveProperty('backend');
  });
});

describe('error messages', () => {
  it('turns Supabase and network errors into plain language', () => {
    expect(describeError({ message: 'TypeError: Failed to fetch' })).toMatch(/can't reach supabase/i);
    expect(describeError({ message: 'JWT expired', code: 'PGRST301' })).toMatch(/session expired/i);
    expect(describeError({ code: 'PGRST205', message: "Could not find the table 'public.cases'" })).toMatch(/migration/i);
    expect(describeError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/permission denied/i);
    expect(describeError({ code: 'PGRST116', message: 'no rows' })).toMatch(/no longer exists/i);
    expect(describeError({ code: '23514', message: 'violates check constraint' })).toMatch(/rejected the data/i);
    expect(describeError(new Error('boom'))).toBe('Supabase error: boom');
    expect(describeError({})).toMatch(/something went wrong/i);
  });
});
