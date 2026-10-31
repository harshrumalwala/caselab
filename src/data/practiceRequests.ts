import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanReply, cleanRequest, type NewRequest, type PracticeRequest, type RequestStatus } from '../domain/requests';
import { DataError } from './errors';

/** A member you have chosen not to receive requests from. */
export interface BlockedMember {
  userId: string;
  name: string;
}

/**
 * Practice requests for the signed-in member. Everything goes through database functions that act only on your own
 * requests: there is no way to read or change anyone else's.
 */
export interface PracticeRepository {
  /** Your requests, sent and received, newest first (the latest 100). */
  list(): Promise<PracticeRequest[]>;
  send(to: string, request: NewRequest): Promise<void>;
  /** Accept or decline a request someone sent you. Declining can also stop them asking again. */
  respond(id: string, accept: boolean, reply: string, blockAsker?: boolean): Promise<void>;
  cancel(id: string): Promise<void>;
  /** You have looked at the answers to requests you sent. */
  markAnswersSeen(): Promise<void>;
  blocked(): Promise<BlockedMember[]>;
  unblock(userId: string): Promise<void>;
  /** Whether you get an email when someone asks you to case or accepts your request. On unless you turned it off. */
  emailRequests(): Promise<boolean>;
  setEmailRequests(on: boolean): Promise<void>;
}

interface RequestRow {
  id: string;
  direction: 'sent' | 'received';
  other_id: string;
  other_name: string | null;
  case_title: string | null;
  case_book: string | null;
  when_text: string | null;
  message: string | null;
  status: RequestStatus;
  reply: string | null;
  created_at: string;
  responded_at: string | null;
  from_seen_at: string | null;
}

export function rowToRequest(r: RequestRow): PracticeRequest {
  return {
    id: r.id,
    direction: r.direction,
    otherId: r.other_id,
    otherName: r.other_name ?? 'A former member',
    caseTitle: r.case_title ?? '',
    caseBook: r.case_book ?? '',
    when: r.when_text ?? '',
    message: r.message ?? '',
    status: r.status,
    reply: r.reply ?? '',
    createdAt: r.created_at,
    respondedAt: r.responded_at,
    answerSeen: r.from_seen_at !== null,
  };
}

/** The database's own sentences ("You already have a request waiting…") are written to be shown; everything else gets the usual translation. */
function fail(error: { message?: string; code?: string }): never {
  if (error.code === 'P0001' && error.message) throw new DataError(error.message, error);
  throw error;
}

export class SupabasePractice implements PracticeRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<PracticeRequest[]> {
    const { data, error } = await this.client.rpc('my_practice_requests');
    if (error) throw error;
    return ((data ?? []) as RequestRow[]).map(rowToRequest);
  }

  async send(to: string, request: NewRequest): Promise<void> {
    const r = cleanRequest(request);
    const { data, error } = await this.client.rpc('send_practice_request', {
      p_to: to,
      p_case_title: r.caseTitle,
      p_case_book: r.caseBook,
      p_when: r.when,
      p_message: r.message,
    });
    if (error) fail(error);
    this.notify('sent', data as string);
  }

  /**
   * Ask the notify-request function to email the other member. Best effort and in the background: the request itself is already
   * saved, and if the email can't go out (function not deployed, offline) nobody needs to know. The function decides whether an email
   * is really sent, and what it says.
   */
  private notify(event: 'sent' | 'answered', requestId: string): void {
    if (typeof requestId !== 'string') return;
    void Promise.resolve()
      .then(() => this.client.functions.invoke('notify-request', { body: { event, requestId } }))
      .catch(() => undefined);
  }

  async respond(id: string, accept: boolean, reply: string, blockAsker = false): Promise<void> {
    const { error } = await this.client.rpc('respond_practice_request', {
      p_id: id,
      p_accept: accept,
      p_reply: cleanReply(reply),
      p_block: !accept && blockAsker,
    });
    if (error) fail(error);
    if (accept) this.notify('answered', id);
  }

  async cancel(id: string): Promise<void> {
    const { error } = await this.client.rpc('cancel_practice_request', { p_id: id });
    if (error) fail(error);
  }

  async markAnswersSeen(): Promise<void> {
    const { error } = await this.client.rpc('mark_practice_answers_seen');
    if (error) throw error;
  }

  async blocked(): Promise<BlockedMember[]> {
    const { data, error } = await this.client.rpc('my_practice_blocks');
    if (error) throw error;
    return ((data ?? []) as { user_id: string; display_name: string | null }[]).map((b) => ({ userId: b.user_id, name: b.display_name ?? 'A former member' }));
  }

  async unblock(userId: string): Promise<void> {
    const { error } = await this.client.rpc('unblock_practice_asker', { p_user: userId });
    if (error) throw error;
  }

  async emailRequests(): Promise<boolean> {
    const { data, error } = await this.client.from('notification_settings').select('email_requests').maybeSingle();
    if (error) throw error;
    return data?.email_requests ?? true; // no row yet: never chose, so on
  }

  async setEmailRequests(on: boolean): Promise<void> {
    const { error } = await this.client.from('notification_settings').upsert({ email_requests: on, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
  }
}

/** What the messages twin needs to open a conversation when a request is accepted. */
export interface AcceptedRequest {
  from: string;
  to: string;
  caseTitle: string;
  caseBook: string;
  when: string;
  message: string;
  reply: string;
  createdAt: string;
  respondedAt: string;
}

interface MemoryMember {
  userId: string;
  name: string;
  /** Takes requests (listed and switched on). */
  open: boolean;
}

/**
 * For tests: several members' requests in one in-memory "database", with the same rules as the real one (one waiting
 * request per person, five waiting at a time, blocks that give nothing away). `as(userId)` gives that member's view.
 */
export function createMemoryPractice(members: () => MemoryMember[]) {
  interface Stored extends Omit<PracticeRequest, 'direction' | 'otherId' | 'otherName' | 'answerSeen'> {
    from: string;
    to: string;
    fromSeen: boolean;
  }
  const rows: Stored[] = [];
  const blocks: { blocker: string; blocked: string }[] = [];
  const acceptListeners: ((r: AcceptedRequest) => void)[] = [];
  /** Members who turned the request emails off (the default is on). */
  const emailsOff = new Set<string>();
  /** The emails the real function would send, for tests: who is told, and why. */
  const emailed: { to: string; event: 'sent' | 'answered'; requestId: string }[] = [];
  const tell = (to: string, event: 'sent' | 'answered', requestId: string) => {
    if (!emailsOff.has(to)) emailed.push({ to, event, requestId });
  };
  /** Whether two members already have a conversation (set by the messages twin). Connected members message each other instead. */
  let connected: (a: string, b: string) => boolean = () => false;
  let next = 1;
  const nameOf = (id: string) => members().find((m) => m.userId === id)?.name ?? 'A former member';
  const refused = () => new DataError("This member can't be asked right now.");
  const gone = () => new DataError('That request is no longer waiting.');

  function view(me: string) {
    const control = { failing: false as boolean };
    const guard = () => {
      if (control.failing) throw new Error('TypeError: Failed to fetch');
    };
    const repo: PracticeRepository = {
      async list() {
        guard();
        return rows
          .filter((r) => r.from === me || r.to === me)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id.slice(4)) - Number(a.id.slice(4)))
          .map(({ from, to, fromSeen, ...rest }) => ({
            ...rest,
            direction: from === me ? ('sent' as const) : ('received' as const),
            otherId: from === me ? to : from,
            otherName: nameOf(from === me ? to : from),
            answerSeen: fromSeen,
          }));
      },
      async send(to, request) {
        guard();
        const target = members().find((m) => m.userId === to);
        if (!target || !target.open || to === me || blocks.some((b) => b.blocker === to && b.blocked === me)) throw refused();
        if (connected(me, to)) throw new DataError("You're already connected with this member. Send them a message instead.");
        if (rows.some((r) => r.from === me && r.to === to && r.status === 'pending')) throw new DataError('You already have a request waiting with this member.');
        if (rows.filter((r) => r.from === me && r.status === 'pending').length >= 5) throw new DataError('You have 5 requests waiting. Wait for answers or cancel one first.');
        const c = cleanRequest(request);
        const id = `req-${next++}`;
        rows.push({ id, from: me, to, caseTitle: c.caseTitle, caseBook: c.caseBook, when: c.when, message: c.message, status: 'pending', reply: '', createdAt: new Date().toISOString(), respondedAt: null, fromSeen: false });
        tell(to, 'sent', id);
      },
      async respond(id, accept, reply, blockAsker = false) {
        guard();
        const r = rows.find((x) => x.id === id && x.to === me && x.status === 'pending');
        if (!r) throw gone();
        r.status = accept ? 'accepted' : 'declined';
        r.reply = cleanReply(reply);
        r.respondedAt = new Date().toISOString();
        if (accept) tell(r.from, 'answered', r.id);
        if (!accept && blockAsker && !blocks.some((b) => b.blocker === me && b.blocked === r.from)) blocks.push({ blocker: me, blocked: r.from });
        const blockedEitherWay = blocks.some((b) => (b.blocker === me && b.blocked === r.from) || (b.blocker === r.from && b.blocked === me));
        if (accept && !blockedEitherWay) {
          for (const listen of acceptListeners) listen({ from: r.from, to: r.to, caseTitle: r.caseTitle, caseBook: r.caseBook, when: r.when, message: r.message, reply: r.reply, createdAt: r.createdAt, respondedAt: r.respondedAt! });
        }
      },
      async cancel(id) {
        guard();
        const r = rows.find((x) => x.id === id && x.from === me && x.status === 'pending');
        if (!r) throw gone();
        r.status = 'cancelled';
        r.respondedAt = new Date().toISOString();
      },
      async markAnswersSeen() {
        guard();
        for (const r of rows) if (r.from === me && (r.status === 'accepted' || r.status === 'declined')) r.fromSeen = true;
      },
      async blocked() {
        guard();
        return blocks.filter((b) => b.blocker === me).map((b) => ({ userId: b.blocked, name: nameOf(b.blocked) }));
      },
      async unblock(userId) {
        guard();
        const i = blocks.findIndex((b) => b.blocker === me && b.blocked === userId);
        if (i >= 0) blocks.splice(i, 1);
      },
      async emailRequests() {
        guard();
        return !emailsOff.has(me);
      },
      async setEmailRequests(on) {
        guard();
        if (on) emailsOff.delete(me);
        else emailsOff.add(me);
      },
    };
    return Object.assign(repo, { control });
  }

  return {
    as: view,
    rows,
    blocks,
    emailed,
    onAccept: (listen: (r: AcceptedRequest) => void) => void acceptListeners.push(listen),
    setConnected: (fn: (a: string, b: string) => boolean) => void (connected = fn),
  };
}
