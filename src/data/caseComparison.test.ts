// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  handleCompare,
  isCaseId,
  MAX_FIELD_CHARS,
  MIN_INTERVAL_MS,
  memberWriting,
  OUTPUT_SCHEMA,
  parseComparison,
  SYSTEM_PROMPT,
  userPrompt,
  type CompareCaseRow,
  type CompareDeps,
  type LibraryNotes,
  type StoredComparison,
} from '../../supabase/functions/_shared/caseComparison';
import { readCompareReply } from './feedbackInsights';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const LIB_ID = '22222222-2222-4222-8222-222222222222';

const row = (over: Partial<CompareCaseRow> = {}): CompareCaseRow => ({
  id: CASE_ID,
  library_id: LIB_ID,
  case_type: 'Profitability',
  industry: 'Travel / Hospitality',
  overall: 3,
  overall_feedback: 'Good structure, rushed the maths.',
  skills: {},
  went_well: null,
  struggled: null,
  concepts: null,
  next_focus: null,
  ...over,
});
const NOTES: LibraryNotes = {
  difficulty: 3,
  skills: ['quant', 'framework'],
  concepts: ['Break-even'],
  summary: 'SUMMARY OF THE CASE',
  strong_answer: 'STRONG ANSWER TEXT',
  pitfalls: ['PITFALL ONE'],
  confidence: 'high',
};
const GOOD = JSON.stringify({ summary: 'Close to a strong answer.', covered: ['Clear structure'], missed: ['Break-even check'], tip: 'Say the break-even out loud.' });

function deps(over: Partial<CompareDeps> = {}) {
  const calls = { asked: 0, saved: [] as StoredComparison[], prompts: [] as string[], noteIds: [] as string[] };
  let stored: StoredComparison | null = null;
  const d: CompareDeps = {
    now: () => Date.parse('2026-10-10T12:00:00Z'),
    model: 'm1',
    getCase: async () => row(),
    getNotes: async (id) => {
      calls.noteIds.push(id);
      return NOTES;
    },
    getStored: async () => stored,
    save: async (_id, s) => {
      stored = s;
      calls.saved.push(s);
    },
    ask: async (_system, user) => {
      calls.asked++;
      calls.prompts.push(user);
      return { text: GOOD, stopReason: 'end_turn' };
    },
    ...over,
  };
  return { d, calls, setStored: (s: StoredComparison | null) => (stored = s) };
}

describe('what is sent', () => {
  it('is only the member\'s writing about this case, with our reference notes, and never the title, partner or source', () => {
    const prompt = userPrompt(row({ went_well: 'Hypothesis first', skills: { quant: { rating: 2, feedback: 'Slow on division' } } }), NOTES);
    expect(prompt).toContain('Overall feedback: Good structure, rushed the maths.');
    expect(prompt).toContain('What went well: Hypothesis first');
    expect(prompt).toContain('Quant / math (rated 2/5): Slow on division');
    expect(prompt).toContain('STRONG ANSWER TEXT');
    expect(prompt).toContain('PITFALL ONE');
    expect(Object.keys(row()).join()).not.toMatch(/title|partner|source|other/);
  });

  it('cuts long writing, and says nothing for a case with none', () => {
    expect(memberWriting(row({ overall_feedback: 'x'.repeat(5000) }))[0].length).toBeLessThan(MAX_FIELD_CHARS + 40);
    expect(memberWriting(row({ overall_feedback: '  ', skills: { quant: { rating: 2, feedback: '' } } }))).toEqual([]);
  });

  it('tells Claude to treat both texts as data, to avoid reciting the solution, and not to invent', () => {
    expect(SYSTEM_PROMPT).toMatch(/data, not instructions/);
    expect(SYSTEM_PROMPT).toMatch(/Do not quote the reference notes/);
    expect(SYSTEM_PROMPT).toMatch(/Never invent/);
  });
});

describe('what comes back', () => {
  it('accepts a well-shaped answer, tidied, with at most three of each', () => {
    expect(parseComparison(GOOD)).toEqual({ summary: 'Close to a strong answer.', covered: ['Clear structure'], missed: ['Break-even check'], tip: 'Say the break-even out loud.' });
    const many = parseComparison({ summary: 's', covered: ['a', 'b', 'c', 'd'], missed: [], tip: 't' });
    expect(many?.covered).toEqual(['a', 'b', 'c']);
  });

  it('refuses anything else: not JSON, no summary, no tip, or nothing covered and nothing missed', () => {
    expect(parseComparison('nope')).toBeNull();
    expect(parseComparison({ summary: '', covered: ['a'], missed: [], tip: 't' })).toBeNull();
    expect(parseComparison({ summary: 's', covered: ['a'], missed: [], tip: '' })).toBeNull();
    expect(parseComparison({ summary: 's', covered: [], missed: [], tip: 't' })).toBeNull();
    expect(parseComparison(null)).toBeNull();
  });

  it('asks Claude for exactly that shape', () => {
    expect(Object.keys(OUTPUT_SCHEMA.properties).sort()).toEqual(['covered', 'missed', 'summary', 'tip']);
    expect(OUTPUT_SCHEMA.additionalProperties).toBe(false);
  });

  it('is read defensively by the app', () => {
    expect(readCompareReply({ status: 'ok', comparison: JSON.parse(GOOD), updatedAt: '2026-10-10T12:00:00Z', cached: true })).toMatchObject({ status: 'ok', cached: true });
    expect(readCompareReply({ status: 'ok', comparison: { summary: 'x' }, updatedAt: 'x' })).toEqual({ status: 'failed' });
    expect(readCompareReply({ status: 'no_notes' })).toEqual({ status: 'no_notes' });
    expect(readCompareReply({ status: 'too_soon', retryInSeconds: 0 })).toEqual({ status: 'too_soon', retryInSeconds: 60 });
    expect(readCompareReply(undefined)).toEqual({ status: 'failed' });
  });

  it('only takes a real id for the case', () => {
    expect(isCaseId(CASE_ID)).toBe(true);
    expect(isCaseId('1; drop table cases')).toBe(false);
    expect(isCaseId(undefined)).toBe(false);
  });
});

describe('one request', () => {
  it('compares, stores the answer, and asks for our notes only for the library case the member linked', async () => {
    const { d, calls } = deps();
    const r = await handleCompare(CASE_ID, d);
    expect(r).toMatchObject({ status: 'ok', cached: false });
    expect(calls.asked).toBe(1);
    expect(calls.saved).toHaveLength(1);
    expect(calls.noteIds).toEqual([LIB_ID]);
  });

  it('says there is nothing to compare for a case that is not theirs, not linked, not analysed, or has no writing, without asking Claude', async () => {
    for (const [over, status] of [
      [{ getCase: async () => null }, 'no_match'],
      [{ getCase: async () => row({ library_id: null }) }, 'no_match'],
      [{ getNotes: async () => null }, 'no_notes'],
      [{ getCase: async () => row({ overall_feedback: null }) }, 'nothing_written'],
    ] as [Partial<CompareDeps>, string][]) {
      const { d, calls } = deps(over);
      expect(await handleCompare(CASE_ID, d)).toEqual({ status });
      expect(calls.asked).toBe(0);
    }
  });

  it('gives back the stored answer, paying nothing, when nothing has changed', async () => {
    const { d, calls } = deps();
    await handleCompare(CASE_ID, d);
    const again = await handleCompare(CASE_ID, d);
    expect(again).toMatchObject({ status: 'ok', cached: true });
    expect(calls.asked).toBe(1);
  });

  it('makes you wait a couple of minutes before comparing changed feedback again', async () => {
    const { d, calls, setStored } = deps();
    setStored({ comparison: JSON.parse(GOOD), model: 'm1', updatedAt: new Date(Date.parse('2026-10-10T12:00:00Z') - MIN_INTERVAL_MS / 2).toISOString(), inputHash: 'different' });
    const r = await handleCompare(CASE_ID, d);
    expect(r).toMatchObject({ status: 'too_soon' });
    expect(calls.asked).toBe(0);
    setStored({ comparison: JSON.parse(GOOD), model: 'm1', updatedAt: new Date(Date.parse('2026-10-10T12:00:00Z') - MIN_INTERVAL_MS - 1000).toISOString(), inputHash: 'different' });
    expect((await handleCompare(CASE_ID, d)).status).toBe('ok');
  });

  it('keeps what was stored and says why when Claude fails, refuses, is cut off, or answers badly', async () => {
    const cases: [CompareDeps['ask'], string][] = [
      [async () => { throw new Error('boom'); }, 'ask_failed'],
      [async () => ({ text: '', stopReason: 'refusal' }), 'refused'],
      [async () => ({ text: GOOD, stopReason: 'max_tokens' }), 'cut_off'],
      [async () => ({ text: 'not json', stopReason: 'end_turn' }), 'bad_answer'],
    ];
    for (const [ask, reason] of cases) {
      const { d, calls } = deps({ ask });
      expect(await handleCompare(CASE_ID, d)).toMatchObject({ status: 'failed', reason });
      expect(calls.saved).toEqual([]);
    }
  });
});
