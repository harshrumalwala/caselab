import { describe, expect, it } from 'vitest';
import { rowToLibraryCase } from '../data/caseLibrary';
import { libraryLabel, libraryPrefill, searchLibrary, type LibraryCase } from './library';

const c = (name: string, over: Partial<LibraryCase> = {}): LibraryCase => ({
  id: `id-${name}`,
  name,
  book: 'Booth MCG 2026-2027',
  school: 'Booth',
  year: 2026,
  caseType: 'Profitability',
  industry: 'Travel / Hospitality',
  cochairPick: false,
  alsoIn: [],
  ...over,
});

describe('searching the library', () => {
  const all = [
    c('Army Hotel', { cochairPick: true }),
    c('Hawaiian Smoothies', { cochairPick: true, industry: 'Consumer Products / Retail' }),
    c('Duck Island Beer Company', { book: 'Fuqua Case Book 2017', school: 'Fuqua', year: 2017 }),
    c('Army Base Housing', { book: 'Ross Case Book 2013', school: 'Ross', year: 2013 }),
  ];

  it('needs every word to match the name, book, school or year, in any order and any case', () => {
    expect(searchLibrary(all, 'army').map((x) => x.name)).toEqual(['Army Hotel', 'Army Base Housing']);
    expect(searchLibrary(all, 'HOTEL  army').map((x) => x.name)).toEqual(['Army Hotel']);
    expect(searchLibrary(all, 'fuqua 2017').map((x) => x.name)).toEqual(['Duck Island Beer Company']);
    expect(searchLibrary(all, 'booth smoothies').map((x) => x.name)).toEqual(['Hawaiian Smoothies']);
    expect(searchLibrary(all, 'army smoothies')).toEqual([]);
  });

  it('also finds a case by another book it appears in', () => {
    const dup = [c('Hawaiian Smoothies', { alsoIn: ['Kellogg Case Book 2020', 'Ross Case Book 2016'] })];
    expect(searchLibrary(dup, 'kellogg 2020').map((x) => x.name)).toEqual(['Hawaiian Smoothies']);
    expect(searchLibrary(dup, 'ross smoothies').map((x) => x.name)).toEqual(['Hawaiian Smoothies']);
    expect(searchLibrary(dup, 'wharton')).toEqual([]);
  });

  it('finds nothing for an empty or one-letter search', () => {
    expect(searchLibrary(all, '')).toEqual([]);
    expect(searchLibrary(all, ' a ')).toEqual([]);
  });

  it('puts exact and starting matches first, then the co-chairs\' picks, then newer books', () => {
    const hotels = [c('Hotel Chain', { year: 2020 }), c('Army Hotel', { year: 2026 }), c('Grand Hotel', { year: 2026, cochairPick: true }), c('Hotel', { year: 2010 })];
    expect(searchLibrary(hotels, 'hotel').map((x) => x.name)).toEqual(['Hotel', 'Hotel Chain', 'Grand Hotel', 'Army Hotel']);
  });

  it('limits the number of results', () => {
    const many = Array.from({ length: 30 }, (_, i) => c(`Coffee ${i}`));
    expect(searchLibrary(many, 'coffee')).toHaveLength(8);
    expect(searchLibrary(many, 'coffee', 100)).toHaveLength(20);
    expect(searchLibrary(many, 'coffee', 0)).toHaveLength(1);
  });
});

describe('picking a library case', () => {
  it('fills in the title, the book as the source, the type, the industry and the link, and nothing else', () => {
    const hotel = c('Army Hotel', { caseType: 'Market Entry' });
    // The book that wins is the source it fills in, whichever book the member actually used.
    expect(libraryPrefill(hotel)).toEqual({ title: 'Army Hotel', source: 'Booth MCG 2026-2027', caseType: 'Market Entry', industry: 'Travel / Hospitality', libraryId: 'id-Army Hotel' });
    expect(libraryLabel(hotel)).toBe('Army Hotel (Booth MCG 2026-2027)');
  });
});

describe('a row from the database', () => {
  const row = { id: 'x', name: 'Army Hotel', book: 'Booth MCG 2026-2027', school: 'Booth', year: 2026, case_type: 'Market Entry', industry: 'Travel / Hospitality', cochair_pick: true, also_in: ['Kellogg Case Book 2020'] };

  it('becomes a library case', () => {
    expect(rowToLibraryCase(row)).toEqual({ id: 'x', name: 'Army Hotel', book: 'Booth MCG 2026-2027', school: 'Booth', year: 2026, caseType: 'Market Entry', industry: 'Travel / Hospitality', cochairPick: true, alsoIn: ['Kellogg Case Book 2020'] });
  });

  it('treats an unknown case type as Other, and leaves out a row that is not shaped as expected', () => {
    expect(rowToLibraryCase({ ...row, case_type: 'Invented' })?.caseType).toBe('Other');
    expect(rowToLibraryCase({ ...row, name: undefined as unknown as string })).toBeNull();
    expect(rowToLibraryCase({ ...row, cochair_pick: undefined as unknown as boolean })?.cochairPick).toBe(false);
    expect(rowToLibraryCase({ ...row, also_in: null })?.alsoIn).toEqual([]);
    expect(rowToLibraryCase({ ...row, also_in: undefined })?.alsoIn).toEqual([]);
  });
});
