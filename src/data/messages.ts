import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanMessage, cleanReason, type ChatMessage, type Conversation } from '../domain/messages';
import { DataError } from './errors';
import type { createMemoryPractice } from './practiceRequests';

/**
 * Messages for the signed-in member. Everything goes through database functions that act only on your own
 * conversations: there is no way to read or change anyone else's. A conversation starts when a practice request is
 * accepted, never by hand.
 */
export interface MessagesRepository {
  /** Your conversations, newest first (the latest 100). */
  conversations(): Promise<Conversation[]>;
  /** The latest 200 messages in one, oldest first. */
  messages(conversationId: string): Promise<ChatMessage[]>;
  send(conversationId: string, body: string): Promise<void>;
  markRead(conversationId: string): Promise<void>;
  setMuted(conversationId: string, muted: boolean): Promise<void>;
  setArchived(conversationId: string, archived: boolean): Promise<void>;
  /** Delete one of your own messages (gone for both of you). */
  deleteMessage(messageId: string): Promise<void>;
  /** Stop requests and messages between you, in both directions, without telling them. */
  block(userId: string): Promise<void>;
  /** Report a conversation (the database keeps its last messages); optionally block as well. */
  report(conversationId: string, reason: string, alsoBlock: boolean): Promise<void>;
}

interface ConversationRow {
  id: string;
  other_id: string;
  other_name: string | null;
  last_body: string | null;
  last_deleted: boolean;
  last_mine: boolean;
  last_at: string;
  unread: number;
  muted: boolean;
  archived: boolean;
  blocked: boolean;
}

interface MessageRow {
  id: string;
  mine: boolean;
  body: string;
  created_at: string;
  deleted: boolean;
}

export function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    otherId: r.other_id,
    otherName: r.other_name ?? 'A former member',
    lastBody: r.last_body ?? '',
    lastDeleted: r.last_deleted,
    lastMine: r.last_mine,
    lastAt: r.last_at,
    unread: r.unread,
    muted: r.muted,
    archived: r.archived,
    blocked: r.blocked,
  };
}

export const rowToMessage = (r: MessageRow): ChatMessage => ({ id: r.id, mine: r.mine, body: r.body, createdAt: r.created_at, deleted: r.deleted });

/** The database's own sentences ("You can't message this member right now.") are written to be shown; everything else gets the usual translation. */
function fail(error: { message?: string; code?: string }): never {
  if (error.code === 'P0001' && error.message) throw new DataError(error.message, error);
  throw error;
}

export class SupabaseMessages implements MessagesRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async call(fn: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) fail(error);
    return data;
  }

  async conversations(): Promise<Conversation[]> {
    return (((await this.call('my_conversations')) ?? []) as ConversationRow[]).map(rowToConversation);
  }

  async messages(conversationId: string): Promise<ChatMessage[]> {
    return (((await this.call('conversation_messages', { p_conversation: conversationId })) ?? []) as MessageRow[]).map(rowToMessage);
  }

  async send(conversationId: string, body: string): Promise<void> {
    await this.call('send_message', { p_conversation: conversationId, p_body: cleanMessage(body) });
  }

  async markRead(conversationId: string): Promise<void> {
    await this.call('mark_conversation_read', { p_conversation: conversationId });
  }

  async setMuted(conversationId: string, muted: boolean): Promise<void> {
    await this.call('set_conversation_muted', { p_conversation: conversationId, p_muted: muted });
  }

  async setArchived(conversationId: string, archived: boolean): Promise<void> {
    await this.call('set_conversation_archived', { p_conversation: conversationId, p_archived: archived });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.call('delete_message', { p_id: messageId });
  }

  async block(userId: string): Promise<void> {
    await this.call('block_member', { p_user: userId });
  }

  async report(conversationId: string, reason: string, alsoBlock: boolean): Promise<void> {
    await this.call('report_conversation', { p_conversation: conversationId, p_reason: cleanReason(reason), p_block: alsoBlock });
  }
}

interface Stored {
  id: string;
  lo: string;
  hi: string;
  createdAt: string;
  members: Record<string, { readAt: string; muted: boolean; archived: boolean }>;
}
interface StoredMessage {
  id: string;
  conversationId: string;
  sender: string;
  body: string;
  createdAt: string;
  deleted: boolean;
}

/**
 * For tests: the same rules as the database, in memory. It opens a conversation when the practice twin accepts a request,
 * seeds it the same way, and refuses sends the same way (blocked either way, empty text). `as(userId)` is that member's view.
 */
export function createMemoryMessages(practice: ReturnType<typeof createMemoryPractice>, members: () => { userId: string; name: string }[]) {
  const convs: Stored[] = [];
  const msgs: StoredMessage[] = [];
  const reports: { reporter: string; reported: string; reason: string; snapshot: { from: string; body: string; deleted: boolean }[] }[] = [];
  let next = 1;
  let tick = 0;
  /** Strictly increasing, so ordering never depends on how fast the test runs. */
  const stamp = () => new Date(Date.UTC(2026, 10, 6, 12, 0, 0) + ++tick * 1000).toISOString();
  const nameOf = (id: string) => members().find((m) => m.userId === id)?.name ?? 'A former member';
  const blockedBetween = (a: string, b: string) => practice.blocks.some((x) => (x.blocker === a && x.blocked === b) || (x.blocker === b && x.blocked === a));
  const unavailable = () => new DataError("That conversation isn't available.");

  practice.setConnected((a, b) => convs.some((c) => (c.lo === a && c.hi === b) || (c.lo === b && c.hi === a)));

  practice.onAccept((r) => {
    const lo = r.from < r.to ? r.from : r.to;
    const hi = r.from < r.to ? r.to : r.from;
    let c = convs.find((x) => x.lo === lo && x.hi === hi);
    if (!c) {
      c = { id: `conv-${next++}`, lo, hi, createdAt: stamp(), members: {} };
      c.members[lo] = { readAt: c.createdAt, muted: false, archived: false };
      c.members[hi] = { readAt: c.createdAt, muted: false, archived: false };
      convs.push(c);
    }
    const proposal = [r.caseTitle ? (r.caseBook ? `${r.caseTitle} (${r.caseBook})` : r.caseTitle) : r.caseBook ? `A case from ${r.caseBook}` : '', r.when].filter(Boolean).join(' · ');
    const first = [proposal, r.message].filter(Boolean).join('\n');
    if (first) msgs.push({ id: `msg-${next++}`, conversationId: c.id, sender: r.from, body: first, createdAt: stamp(), deleted: false });
    if (r.reply) msgs.push({ id: `msg-${next++}`, conversationId: c.id, sender: r.to, body: r.reply, createdAt: stamp(), deleted: false });
    c.members[r.to].readAt = stamp();
    c.members[r.from] = { ...c.members[r.from], readAt: c.createdAt, archived: false };
  });

  function view(me: string) {
    const control = { failing: false as boolean };
    const guard = () => {
      if (control.failing) throw new Error('TypeError: Failed to fetch');
    };
    const mine = (id: string) => {
      const c = convs.find((x) => x.id === id && x.members[me]);
      if (!c) throw unavailable();
      return c;
    };
    const other = (c: Stored) => (c.lo === me ? c.hi : c.lo);
    const lastOf = (id: string) => msgs.filter((m) => m.conversationId === id).at(-1);

    const repo: MessagesRepository = {
      async conversations() {
        guard();
        return convs
          .filter((c) => c.members[me])
          .map((c): Conversation => {
            const last = lastOf(c.id);
            const m = c.members[me];
            return {
              id: c.id,
              otherId: other(c),
              otherName: nameOf(other(c)),
              lastBody: last && !last.deleted ? last.body : '',
              lastDeleted: Boolean(last?.deleted),
              lastMine: last?.sender === me,
              lastAt: last?.createdAt ?? c.createdAt,
              unread: msgs.filter((x) => x.conversationId === c.id && x.sender !== me && !x.deleted && x.createdAt > m.readAt).length,
              muted: m.muted,
              archived: m.archived,
              blocked: blockedBetween(c.lo, c.hi),
            };
          })
          .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
      },
      async messages(id) {
        guard();
        const c = mine(id);
        return msgs
          .filter((m) => m.conversationId === c.id)
          .slice(-200)
          .map((m) => ({ id: m.id, mine: m.sender === me, body: m.body, createdAt: m.createdAt, deleted: m.deleted }));
      },
      async send(id, body) {
        guard();
        const c = mine(id);
        const text = cleanMessage(body);
        if (!text) throw new DataError('Write a message first.');
        if (blockedBetween(c.lo, c.hi)) throw new DataError("You can't message this member right now.");
        msgs.push({ id: `msg-${next++}`, conversationId: c.id, sender: me, body: text, createdAt: stamp(), deleted: false });
        c.members[me].readAt = stamp();
        c.members[other(c)].archived = false;
      },
      async markRead(id) {
        guard();
        mine(id).members[me].readAt = stamp();
      },
      async setMuted(id, muted) {
        guard();
        mine(id).members[me].muted = muted;
      },
      async setArchived(id, archived) {
        guard();
        mine(id).members[me].archived = archived;
      },
      async deleteMessage(messageId) {
        guard();
        const m = msgs.find((x) => x.id === messageId && x.sender === me && !x.deleted);
        if (!m) throw new DataError("That message can't be deleted.");
        m.deleted = true;
        m.body = '';
      },
      async block(userId) {
        guard();
        if (userId === me) throw new DataError("That member can't be blocked.");
        if (!practice.blocks.some((b) => b.blocker === me && b.blocked === userId)) practice.blocks.push({ blocker: me, blocked: userId });
      },
      async report(id, reason, alsoBlock) {
        guard();
        const c = mine(id);
        const why = cleanReason(reason);
        if (!why) throw new DataError('Tell us briefly what happened.');
        reports.push({
          reporter: me,
          reported: other(c),
          reason: why,
          snapshot: msgs.filter((m) => m.conversationId === c.id).slice(-30).map((m) => ({ from: m.sender === me ? 'reporter' : 'reported', body: m.body, deleted: m.deleted })),
        });
        if (alsoBlock && !practice.blocks.some((b) => b.blocker === me && b.blocked === other(c))) practice.blocks.push({ blocker: me, blocked: other(c) });
      },
    };
    return Object.assign(repo, { control });
  }

  return { as: view, convs, msgs, reports };
}
