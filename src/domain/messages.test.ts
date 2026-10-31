import { describe, expect, it } from 'vitest';
import {
  chatsHaveNew,
  cleanMessage,
  cleanReason,
  conversationSections,
  countsOnBadge,
  formatWhen,
  MAX_MESSAGE,
  MAX_REPORT_REASON,
  preview,
  unreadChats,
  type Conversation,
} from './messages';

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  otherId: 'bob',
  otherName: 'Bob Brown',
  lastBody: 'See you at 8',
  lastDeleted: false,
  lastMine: false,
  lastAt: '2026-11-06T20:00:00Z',
  unread: 0,
  muted: false,
  archived: false,
  blocked: false,
  ...over,
});

describe('cleaning what you typed', () => {
  it('trims and cuts to the same limits as the database', () => {
    expect(cleanMessage(`  ${'m'.repeat(1500)}  `)).toHaveLength(MAX_MESSAGE);
    expect(cleanMessage('  hello \n')).toBe('hello');
    expect(cleanMessage('   ')).toBe('');
    expect(cleanReason(`  ${'r'.repeat(900)}`)).toHaveLength(MAX_REPORT_REASON);
  });
});

describe('the badge', () => {
  it('counts conversations with something new, not messages, and skips muted and archived ones', () => {
    const list = [
      conv({ id: 'a', unread: 5 }),
      conv({ id: 'b', unread: 1 }),
      conv({ id: 'c', unread: 3, muted: true }),
      conv({ id: 'd', unread: 2, archived: true }),
      conv({ id: 'e', unread: 0 }),
    ];
    expect(list.filter(countsOnBadge).map((c) => c.id)).toEqual(['a', 'b']);
    expect(unreadChats(list)).toBe(2);
    expect(unreadChats([])).toBe(0);
  });

  it('reads well aloud', () => {
    expect(chatsHaveNew(1)).toBe('1 conversation has new messages');
    expect(chatsHaveNew(3)).toBe('3 conversations have new messages');
  });
});

describe('the line under a name', () => {
  it('shows the last message on one line, with "You:" for yours', () => {
    expect(preview(conv())).toBe('See you at 8');
    expect(preview(conv({ lastBody: 'line one\n\n  line two' }))).toBe('line one line two');
    expect(preview(conv({ lastMine: true }))).toBe('You: See you at 8');
  });

  it('says so when the last message was deleted or there are none', () => {
    expect(preview(conv({ lastDeleted: true, lastBody: '' }))).toBe('Message deleted');
    expect(preview(conv({ lastDeleted: true, lastBody: '', lastMine: true }))).toBe('You deleted a message');
    expect(preview(conv({ lastBody: '' }))).toBe('No messages yet. Say hello.');
  });
});

describe('sections', () => {
  it('splits active from archived, keeping the order it was given', () => {
    const s = conversationSections([conv({ id: 'a' }), conv({ id: 'b', archived: true }), conv({ id: 'c' }), conv({ id: 'd', archived: true })]);
    expect(s.active.map((c) => c.id)).toEqual(['a', 'c']);
    expect(s.archived.map((c) => c.id)).toEqual(['b', 'd']);
  });
});

describe('formatting when', () => {
  const now = new Date(2026, 10, 6, 21, 0);
  it('shows the time today, the date for earlier days, and the year for earlier years', () => {
    expect(formatWhen(new Date(2026, 10, 6, 9, 41).toISOString(), now)).toBe('9:41 AM');
    expect(formatWhen(new Date(2026, 10, 5, 9, 41).toISOString(), now)).toBe('Nov 5');
    expect(formatWhen(new Date(2025, 10, 5, 9, 41).toISOString(), now)).toBe('Nov 5, 2025');
    expect(formatWhen('not a date', now)).toBe('');
  });
});
