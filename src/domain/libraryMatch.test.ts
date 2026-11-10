import { describe, expect, it } from 'vitest';
import { nameKey } from '../../scripts/librarySeed.mjs';
import { rowToCaseMatch } from '../data/caseLibrary';
import { makeCase } from '../test/builders';
import type { LibraryCase } from './library';
import { changesFor, libraryNameKey, matchCases, sourceNamesBook } from './libraryMatch';

const lib = (name: string, over: Partial<LibraryCase> = {}): LibraryCase => ({
  id: `id-${name}`,
  name,
  book: 'Booth MCG 2026-2027',
  school: 'Booth',
  year: 2026,
  caseType: 'Market Entry',
  industry: 'Travel / Hospitality',
  cochairPick: false,
  alsoIn: [],
  ...over,
});

describe('the same case under different names', () => {
  it('ignores case, punctuation, "&" and "Co.", exactly as the loader and the database do', () => {
    for (const name of ['Midwest Machinery Co.', 'midwest machinery', "Linda's Great Burgers", 'Smith & Sons Inc.', 'Army  Hotel', '  Army Hotel!', 'Acme Corporation, Ltd.', '']) {
      expect(libraryNameKey(name), name).toBe(nameKey(name));
    }
    expect(libraryNameKey('Army Hotel')).not.toBe(libraryNameKey('Army Base Housing'));
  });
});

describe('does a source name the book', () => {
  it('counts the book, another book the case is in, and "MCG" for Booth, by whole word', () => {
    expect(sourceNamesBook('Booth casebook', 'Booth MCG 2026-2027', [])).toBe(true);
    expect(sourceNamesBook('MCG', 'Booth MCG 2026-2027', [])).toBe(true);
    expect(sourceNamesBook('Kellogg 2020', 'Booth MCG 2026-2027', ['Kellogg Case Book 2020'])).toBe(true);
    expect(sourceNamesBook('Kellogg 2020', 'Booth MCG 2026-2027', [])).toBe(false);
    expect(sourceNamesBook('', 'Booth MCG 2026-2027', [])).toBe(false);
    expect(sourceNamesBook('Across the pond', 'Ross Case Book 2024', [])).toBe(false);
    expect(sourceNamesBook('Ross casebook', 'Ross Case Book 2024', [])).toBe(true);
  });
});

describe('what updating a case would change', () => {
  const m = { title: 'army hotel', source: 'Booth casebook', caseType: 'Profitability' as const, industry: 'Energy / Utilities', library: lib('Army Hotel') };

  it('lists the title, book, case type and industry that differ, with where each goes', () => {
    expect(changesFor(m)).toEqual([
      { field: 'title', label: 'Title', from: 'army hotel', to: 'Army Hotel' },
      { field: 'source', label: 'Book', from: 'Booth casebook', to: 'Booth MCG 2026-2027' },
      { field: 'caseType', label: 'Case type', from: 'Profitability', to: 'Market Entry' },
      { field: 'industry', label: 'Industry', from: 'Energy / Utilities', to: 'Travel / Hospitality' },
    ]);
  });

  it('lists nothing for what is already the same', () => {
    expect(changesFor({ title: 'Army Hotel', source: 'Booth MCG 2026-2027', caseType: 'Market Entry', industry: 'Travel / Hospitality', library: lib('Army Hotel') })).toEqual([]);
  });
});

describe('finding the cases that look like library cases', () => {
  const library = [lib('Army Hotel', { cochairPick: true }), lib('Hawaiian Smoothies', { alsoIn: ['Kellogg Case Book 2020'] })];

  it('finds unlinked cases by name, and says how sure it is from the source', () => {
    const found = matchCases(
      [makeCase({ title: 'army hotel', source: 'MCG' }), makeCase({ title: 'Hawaiian Smoothies', source: '' }), makeCase({ title: 'Hawaiian Smoothies', source: 'Kellogg 2020' }), makeCase({ title: 'Unrelated' })],
      library,
    );
    expect(found.map((x) => [x.title, x.source, x.sure, x.linked])).toEqual([
      ['army hotel', 'MCG', true, false],
      ['Hawaiian Smoothies', '', false, false],
      ['Hawaiian Smoothies', 'Kellogg 2020', true, false],
    ]);
  });

  it('lists a linked case only while it differs from the library case it is linked to', () => {
    const consistent = makeCase({ title: 'Army Hotel', source: 'Booth MCG 2026-2027', caseType: 'Market Entry', industry: 'Travel / Hospitality', libraryId: 'id-Army Hotel' });
    const differs = makeCase({ title: 'Army Hotel', source: 'Booth casebook', libraryId: 'id-Army Hotel' });
    expect(matchCases([consistent], library)).toEqual([]);
    expect(matchCases([differs], library).map((x) => x.linked)).toEqual([true]);
  });

  it('ignores a case linked to a library case that is not in the list, and a blank title', () => {
    expect(matchCases([makeCase({ title: 'Army Hotel', libraryId: 'someone-else' })], library)).toEqual([]);
    expect(matchCases([makeCase({ title: '   ' })], library)).toEqual([]);
  });
});

describe('a row from the database', () => {
  const row = {
    case_id: 'c1', title: 'army hotel', source: 'Booth', case_type: 'Profitability', industry: null, linked: false, sure: true,
    library_id: 'l1', lib_name: 'Army Hotel', lib_book: 'Booth MCG 2026-2027', lib_school: 'Booth', lib_year: 2026,
    lib_case_type: 'Market Entry', lib_industry: 'Travel / Hospitality', lib_cochair: true, lib_also_in: null,
  };

  it('becomes a match, and a row that is not shaped as expected is left out', () => {
    expect(rowToCaseMatch(row)).toMatchObject({ caseId: 'c1', title: 'army hotel', industry: '', sure: true, linked: false, library: { id: 'l1', name: 'Army Hotel', alsoIn: [] } });
    expect(rowToCaseMatch({ ...row, lib_name: undefined as unknown as string })).toBeNull();
    expect(rowToCaseMatch({ ...row, case_id: undefined as unknown as string })).toBeNull();
    expect(rowToCaseMatch({ ...row, case_type: 'Invented' })?.caseType).toBe('Other');
  });
});
