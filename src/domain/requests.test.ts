import { describe, expect, it } from 'vitest';
import {
  badgeCount,
  cleanReply,
  cleanRequest,
  describeProposal,
  MAX_REQUEST_BOOK,
  MAX_REQUEST_TEXT,
  MAX_REQUEST_TITLE,
  MAX_REQUEST_WHEN,
  sections,
  type PracticeRequest,
} from './requests';

const req = (over: Partial<PracticeRequest> = {}): PracticeRequest => ({
  id: 'r1',
  direction: 'received',
  otherId: 'bob',
  otherName: 'Bob Brown',
  caseTitle: '',
  caseBook: '',
  when: '',
  message: '',
  status: 'pending',
  reply: '',
  createdAt: '2026-11-04T10:00:00Z',
  respondedAt: null,
  answerSeen: false,
  ...over,
});

describe('cleaning what you typed', () => {
  it('trims everything and cuts to the same limits as the database', () => {
    const cleaned = cleanRequest({ caseTitle: `  ${'t'.repeat(300)}  `, caseBook: 'b'.repeat(150), when: 'w'.repeat(120), message: `  ${'m'.repeat(400)} ` });
    expect(cleaned.caseTitle).toHaveLength(MAX_REQUEST_TITLE);
    expect(cleaned.caseBook).toHaveLength(MAX_REQUEST_BOOK);
    expect(cleaned.when).toHaveLength(MAX_REQUEST_WHEN);
    expect(cleaned.message).toHaveLength(MAX_REQUEST_TEXT);
    expect(cleanRequest({ caseTitle: '  ', caseBook: '', when: ' \n ', message: '' })).toEqual({ caseTitle: '', caseBook: '', when: '', message: '' });
    expect(cleanReply(`  ${'r'.repeat(500)}`)).toHaveLength(MAX_REQUEST_TEXT);
  });
});

describe('the badge', () => {
  it('counts requests waiting for your answer and answers you have not seen, and nothing else', () => {
    const list = [
      req({ id: 'a' }), // asked of you, waiting: counts
      req({ id: 'b', direction: 'sent' }), // you're waiting on them: doesn't need you
      req({ id: 'c', direction: 'sent', status: 'accepted' }), // new answer: counts
      req({ id: 'd', direction: 'sent', status: 'declined', answerSeen: true }), // seen already
      req({ id: 'e', status: 'accepted' }), // you answered it
      req({ id: 'f', direction: 'sent', status: 'cancelled' }),
    ];
    expect(badgeCount(list)).toBe(2);
    expect(badgeCount([])).toBe(0);
  });
});

describe('sections', () => {
  it('splits into to answer, waiting on, and earlier, keeping the order it was given', () => {
    const list = [
      req({ id: 'a' }),
      req({ id: 'b', direction: 'sent' }),
      req({ id: 'c', status: 'declined' }),
      req({ id: 'd', direction: 'sent', status: 'accepted' }),
      req({ id: 'e' }),
    ];
    const s = sections(list);
    expect(s.toAnswer.map((r) => r.id)).toEqual(['a', 'e']);
    expect(s.waiting.map((r) => r.id)).toEqual(['b']);
    expect(s.earlier.map((r) => r.id)).toEqual(['c', 'd']);
  });
});

describe('describing a proposal', () => {
  it('says what was proposed, whichever parts were given', () => {
    expect(describeProposal({ caseTitle: 'Airline profit', caseBook: 'Cosentino', when: 'tonight 8pm' })).toBe('Airline profit (Cosentino) · tonight 8pm');
    expect(describeProposal({ caseTitle: 'Airline profit', caseBook: '', when: '' })).toBe('Airline profit');
    expect(describeProposal({ caseTitle: '', caseBook: 'Cosentino', when: '' })).toBe('a case from Cosentino');
    expect(describeProposal({ caseTitle: '', caseBook: '', when: 'this weekend' })).toBe('this weekend');
    expect(describeProposal({ caseTitle: '', caseBook: '', when: '' })).toBe('');
  });
});
