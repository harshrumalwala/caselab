/**
 * Practice requests: one member asking another to case. Short and structured on purpose (a nudge, not a conversation).
 * The limits here match the database's; the app trims and cuts before sending so a long paste is never an error.
 */

export const MAX_REQUEST_TITLE = 200;
export const MAX_REQUEST_BOOK = 100;
export const MAX_REQUEST_WHEN = 80;
/** The note on a request and the reply to it. */
export const MAX_REQUEST_TEXT = 280;

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface PracticeRequest {
  id: string;
  /** `sent` by you, or `received` from someone else. */
  direction: 'sent' | 'received';
  otherId: string;
  /** The other member's current name ("A former member" if they have left). */
  otherName: string;
  caseTitle: string;
  caseBook: string;
  /** Free text, e.g. "tonight 8pm ET". */
  when: string;
  message: string;
  status: RequestStatus;
  reply: string;
  createdAt: string;
  respondedAt: string | null;
  /** For requests you sent: you have seen how it was answered. */
  answerSeen: boolean;
}

/** What you fill in when asking. Every part is optional. */
export interface NewRequest {
  caseTitle: string;
  caseBook: string;
  when: string;
  message: string;
}

export const EMPTY_REQUEST: NewRequest = { caseTitle: '', caseBook: '', when: '', message: '' };

const tidy = (text: string, max: number) => text.trim().slice(0, max).trim();

/** Trimmed and cut to the limits. */
export function cleanRequest(input: NewRequest): NewRequest {
  return {
    caseTitle: tidy(input.caseTitle, MAX_REQUEST_TITLE),
    caseBook: tidy(input.caseBook, MAX_REQUEST_BOOK),
    when: tidy(input.when, MAX_REQUEST_WHEN),
    message: tidy(input.message, MAX_REQUEST_TEXT),
  };
}

export const cleanReply = (text: string) => tidy(text, MAX_REQUEST_TEXT);

/** Requests that need you: someone asked and you haven't answered. */
export const needsAnswer = (r: PracticeRequest) => r.direction === 'received' && r.status === 'pending';
/** Answers you haven't looked at yet, on requests you sent. */
export const unseenAnswer = (r: PracticeRequest) => r.direction === 'sent' && (r.status === 'accepted' || r.status === 'declined') && !r.answerSeen;

/** The number on the badge: requests waiting for your answer plus answers you haven't seen. */
export function badgeCount(requests: readonly PracticeRequest[]): number {
  return requests.filter((r) => needsAnswer(r) || unseenAnswer(r)).length;
}

/** For a link's spoken name: "1 request needs you", "3 requests need you". */
export const needYou = (n: number) => `${n} request${n === 1 ? ' needs' : 's need'} you`;

export interface Sections {
  /** Asked of you and waiting for your answer. */
  toAnswer: PracticeRequest[];
  /** Sent by you and still waiting. */
  waiting: PracticeRequest[];
  /** Everything else: answered, declined or cancelled, either way round. */
  earlier: PracticeRequest[];
}

/** Newest first within each section (the list arrives newest first, and that order is kept). */
export function sections(requests: readonly PracticeRequest[]): Sections {
  return {
    toAnswer: requests.filter(needsAnswer),
    waiting: requests.filter((r) => r.direction === 'sent' && r.status === 'pending'),
    earlier: requests.filter((r) => r.status !== 'pending'),
  };
}

/**
 * When you're already connected, "Case with …?" is a message in your conversation instead of a new request: the case, book and
 * time if given, then your note. With nothing filled in it is just "Case again?".
 */
export function proposalMessage(input: NewRequest): string {
  const r = cleanRequest(input);
  const what = describeProposal(r);
  return [`Case again?${what ? ` ${what}` : ''}`, r.message].filter(Boolean).join('\n');
}

/** "Asks to case" in a sentence: the proposed case, book and time, whichever were given. */
export function describeProposal(r: Pick<PracticeRequest, 'caseTitle' | 'caseBook' | 'when'>): string {
  const what = r.caseTitle ? (r.caseBook ? `${r.caseTitle} (${r.caseBook})` : r.caseTitle) : r.caseBook ? `a case from ${r.caseBook}` : '';
  return [what, r.when && (what ? `· ${r.when}` : r.when)].filter(Boolean).join(' ');
}
