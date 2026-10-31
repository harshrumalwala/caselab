/**
 * Messages: private conversations between two members who agreed to case. The limits match the database's; the app trims
 * and cuts before sending so a long paste is never an error.
 */

export const MAX_MESSAGE = 1000;
export const MAX_REPORT_REASON = 500;

export interface Conversation {
  id: string;
  otherId: string;
  /** The other member's current name ("A former member" if they have left). */
  otherName: string;
  /** The newest message's text; empty for a conversation with no messages or a deleted last message. */
  lastBody: string;
  lastDeleted: boolean;
  lastMine: boolean;
  /** When the newest message was sent (or the conversation started). */
  lastAt: string;
  /** Messages from them that you haven't read. */
  unread: number;
  muted: boolean;
  archived: boolean;
  /** One of you has blocked the other: no new messages either way. */
  blocked: boolean;
}

export interface ChatMessage {
  id: string;
  mine: boolean;
  /** Empty when deleted. */
  body: string;
  createdAt: string;
  deleted: boolean;
}

const tidy = (text: string, max: number) => text.trim().slice(0, max).trim();

export const cleanMessage = (text: string) => tidy(text, MAX_MESSAGE);
export const cleanReason = (text: string) => tidy(text, MAX_REPORT_REASON);

/** Conversations with something new that should count on the badge: unread, not muted, not archived. */
export const countsOnBadge = (c: Conversation) => c.unread > 0 && !c.muted && !c.archived;

/** The number on the badge: conversations with new messages (not messages, so a chatty friend can't blow it up). */
export const unreadChats = (conversations: readonly Conversation[]) => conversations.filter(countsOnBadge).length;

/** The line under a name in the list. */
export function preview(c: Conversation): string {
  if (c.lastDeleted) return c.lastMine ? 'You deleted a message' : 'Message deleted';
  if (!c.lastBody) return 'No messages yet. Say hello.';
  const oneLine = c.lastBody.replace(/\s+/g, ' ');
  return c.lastMine ? `You: ${oneLine}` : oneLine;
}

/** For a link's spoken name: "2 conversations have new messages". */
export const chatsHaveNew = (n: number) => `${n} conversation${n === 1 ? ' has' : 's have'} new messages`;

export interface Sections {
  active: Conversation[];
  archived: Conversation[];
}

/** Newest first (the list arrives newest first, and that order is kept). */
export function conversationSections(list: readonly Conversation[]): Sections {
  return { active: list.filter((c) => !c.archived), archived: list.filter((c) => c.archived) };
}

/** "9:41 PM" today, "Nov 6" on another day this year, "Nov 6, 2025" before that. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}
