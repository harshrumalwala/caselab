import { describe, expect, it } from 'vitest';
import { cleanInterviewed, INTERVIEWED_LIMITS, searchInterviewed, sortInterviewed, type InterviewedCase } from './interviewed';

const row = (over: Partial<InterviewedCase> = {}): InterviewedCase => ({
  id: 'a', date: '2026-10-10', title: 'Airline profit', source: 'Darden', caseType: 'Profitability', industry: 'Transportation / Logistics',
  partner: 'Bob', feedback: '', learned: '', createdAt: '2026-10-10T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z', ...over,
});

describe('cleanInterviewed', () => {
  const today = new Date(2026, 9, 28, 12);

  it('trims what was typed and fills in today, and Other, when they are missing or wrong', () => {
    const c = cleanInterviewed({ title: '  Airline profit  ', date: 'not a date', caseType: 'Made up' as never, partner: ' Bob ' }, today);
    expect(c).toMatchObject({ title: 'Airline profit', date: '2026-10-28', caseType: 'Other', partner: 'Bob', source: '', industry: '', feedback: '', learned: '' });
  });

  it('keeps a real date and a known case type', () => {
    expect(cleanInterviewed({ title: 'x', date: '2026-09-01', caseType: 'Market Entry' }, today)).toMatchObject({ date: '2026-09-01', caseType: 'Market Entry' });
  });

  it('cuts text to what the database accepts', () => {
    const c = cleanInterviewed({ title: 'x'.repeat(500), feedback: 'y'.repeat(9000) }, today);
    expect(c.title).toHaveLength(INTERVIEWED_LIMITS.title);
    expect(c.feedback).toHaveLength(INTERVIEWED_LIMITS.text);
  });
});

describe('sorting and searching', () => {
  it('lists the newest first, and the later-added one first on the same day', () => {
    const list = [row({ id: '1', date: '2026-10-01' }), row({ id: '2', date: '2026-10-09', createdAt: '2026-10-09T08:00:00.000Z' }), row({ id: '3', date: '2026-10-09', createdAt: '2026-10-09T18:00:00.000Z' })];
    expect(sortInterviewed(list).map((c) => c.id)).toEqual(['3', '2', '1']);
  });

  it('finds a case by title, book, partner or industry, ignoring case, and keeps all for an empty search', () => {
    const list = [row({ id: '1' }), row({ id: '2', title: 'Bank entry', source: 'Wharton', partner: 'Dana', industry: 'Financial Services', caseType: 'Market Entry' })];
    expect(searchInterviewed(list, '')).toHaveLength(2);
    expect(searchInterviewed(list, 'AIRLINE').map((c) => c.id)).toEqual(['1']);
    expect(searchInterviewed(list, 'wharton').map((c) => c.id)).toEqual(['2']);
    expect(searchInterviewed(list, 'dana').map((c) => c.id)).toEqual(['2']);
    expect(searchInterviewed(list, 'financial').map((c) => c.id)).toEqual(['2']);
    expect(searchInterviewed(list, 'nothing like it')).toEqual([]);
  });
});
