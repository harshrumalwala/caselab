// The logic behind the notify-request Edge Function: who gets an email, when, and what it says. Plain TypeScript with nothing
// Deno-specific in it, so it runs in the function and in the app's tests alike; the function itself (../notify-request/index.ts)
// only plugs real services (the database, Resend) into `handleNotify`.

export type NotifyEvent = 'sent' | 'answered';

/** An email is only sent soon after the thing it is about, so a late or replayed call can't send old news (or be used to nag). */
export const FRESH_FOR_MS = 60 * 60 * 1000;

export interface StoredRequest {
  id: string;
  from_user: string;
  to_user: string;
  case_title: string | null;
  case_book: string | null;
  when_text: string | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  reply: string | null;
  created_at: string;
  responded_at: string | null;
  emailed_at: string | null;
  answer_emailed_at: string | null;
}

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Everything `handleNotify` needs from the outside world. The Edge Function wires these to Supabase and Resend. */
export interface NotifyDeps {
  getRequest(id: string): Promise<StoredRequest | null>;
  /** A member's display name, or null if they have no profile. */
  getName(userId: string): Promise<string | null>;
  /** False only if the member turned the emails off; a member who never chose is on. */
  wantsEmails(userId: string): Promise<boolean>;
  /** The address of a verified member, or null. */
  getEmail(userId: string): Promise<string | null>;
  /** Mark this event's email as sent. Resolves false if it already was (so it is never sent twice). */
  claim(requestId: string, event: NotifyEvent): Promise<boolean>;
  /** Undo a claim after the email could not be sent, so a later call can try again. */
  unclaim(requestId: string, event: NotifyEvent): Promise<void>;
  send(email: Email): Promise<void>;
  now(): number;
  appUrl: string;
}

export interface NotifyOutcome {
  sent: boolean;
  /** Why not (for the function's own log). Never returned to the caller, who must not learn a member's choices. */
  reason: string;
}

// ---------------------------------------------------------------------------------------------------------------------------
// What to send, and to whom
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Handles "the caller says this event happened on this request". The caller only has to be one of the two people: the checks
 * below decide whether an email really goes out, and to whom.
 *  - sent: the sender asks for the recipient to be told. Only while the request is still waiting and new.
 *  - answered: the recipient says they accepted. The sender is told. Declines are never emailed.
 */
export async function handleNotify(input: { event: NotifyEvent; requestId: string; callerId: string }, deps: NotifyDeps): Promise<NotifyOutcome> {
  const skip = (reason: string): NotifyOutcome => ({ sent: false, reason });
  const request = await deps.getRequest(input.requestId);
  if (!request) return skip('no such request');

  const isSent = input.event === 'sent';
  const [actor, target] = isSent ? [request.from_user, request.to_user] : [request.to_user, request.from_user];
  if (input.callerId !== actor) return skip(isSent ? 'caller is not the sender' : 'caller is not the recipient');

  const when = isSent ? request.created_at : request.responded_at;
  if (isSent && request.status !== 'pending') return skip('request is no longer waiting');
  if (!isSent && request.status !== 'accepted') return skip('only accepted requests are emailed');
  if (!when || deps.now() - new Date(when).getTime() > FRESH_FOR_MS) return skip('too old to email about');
  if (isSent ? request.emailed_at : request.answer_emailed_at) return skip('already emailed');

  if (!(await deps.wantsEmails(target))) return skip('recipient turned emails off');
  const to = await deps.getEmail(target);
  if (!to) return skip('recipient has no verified email');

  // The email is written from `actor` (who did the thing) to `target` (who is being told).
  const [actorName, targetName] = await Promise.all([deps.getName(actor), deps.getName(target)]);
  const email = buildEmail(input.event, { request, fromName: actorName ?? 'A CaseLab member', toName: targetName ?? 'there', appUrl: deps.appUrl }, to);

  // Claim first, so two calls at once can't both send.
  if (!(await deps.claim(request.id, input.event))) return skip('already emailed');
  try {
    await deps.send(email);
  } catch (e) {
    await deps.unclaim(request.id, input.event);
    return skip(`could not send: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { sent: true, reason: 'sent' };
}

// ---------------------------------------------------------------------------------------------------------------------------
// What it says and how it looks
// ---------------------------------------------------------------------------------------------------------------------------

const INK = '#1c1a18';
const MAROON = '#800000';
const SUN = '#ffb800';
const SUN_SOFT = '#fff1c2';
const PAPER = '#f6f5f2';
const MUTED = '#7a746d';
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const clean = (s: string | null | undefined, max: number) => (s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The text with line breaks kept and web addresses (https and http only) made clickable. Everything else is plain, escaped text. */
export function linkify(text: string): string {
  return text
    .split(/(https?:\/\/[^\s<>"']+)/g)
    .map((part, i) => {
      if (i % 2 === 0) return escapeHtml(part);
      const trailing = /[.,;:!?)\]]+$/.exec(part)?.[0] ?? '';
      const url = trailing ? part.slice(0, -trailing.length) : part;
      return `<a href="${escapeHtml(url)}" style="color:${MAROON};font-weight:700;">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;
    })
    .join('')
    .replace(/\r?\n/g, '<br>');
}

interface Proposal {
  title: string;
  book: string;
  when: string;
  note: string;
}

const proposalOf = (r: StoredRequest): Proposal => ({
  title: clean(r.case_title, 200),
  book: clean(r.case_book, 100),
  when: clean(r.when_text, 80),
  note: clean(r.message, 280),
});

/** The case in a line: "Airline profitability (Cosentino) · tonight 8pm". */
export function describeProposal(p: Pick<Proposal, 'title' | 'book' | 'when'>): string {
  const what = p.title ? (p.book ? `${p.title} (${p.book})` : p.title) : p.book ? `a case from ${p.book}` : '';
  return [what, p.when && (what ? `· ${p.when}` : p.when)].filter(Boolean).join(' ');
}

function row(label: string, valueHtml: string): string {
  return `<tr><td style="padding:6px 0;vertical-align:top;width:92px;font:700 11px/1.5 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${label}</td><td style="padding:6px 0;font:600 16px/1.4 ${FONT};color:${INK};">${valueHtml}</td></tr>`;
}

function card(rows: string, tone = SUN_SOFT): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;background:${tone};border:2px solid ${INK};border-radius:14px;"><tr><td style="padding:14px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`;
}

function quote(who: string, textHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr><td style="border-left:4px solid ${SUN};padding:4px 0 4px 14px;font:400 16px/1.55 ${FONT};color:${INK};"><span style="display:block;font:700 12px/1.4 ${FONT};color:${MUTED};margin-bottom:4px;">${escapeHtml(who)}</span>${textHtml}</td></tr></table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 4px;"><tr><td style="background:${MAROON};border:2px solid ${INK};border-radius:12px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font:700 16px/1 ${FONT};color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

function layout(o: { subject: string; preheader: string; eyebrow: string; headline: string; subline?: string; body: string; button: string; footer: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(o.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(o.preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};"><tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 6px 14px;font:800 22px/1 ${FONT};color:${INK};"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${SUN};border:2px solid ${INK};vertical-align:middle;margin-right:9px;"></span><span style="vertical-align:middle;">CaseLab</span></td></tr>
<tr><td style="background:#ffffff;border:2px solid ${INK};border-radius:18px;padding:28px 26px 26px;">
<div style="font:700 11px/1.4 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${MAROON};">${escapeHtml(o.eyebrow)}</div>
<h1 style="margin:8px 0 0;font:800 26px/1.2 ${FONT};color:${INK};">${o.headline}</h1>
${o.subline ? `<p style="margin:8px 0 0;font:400 16px/1.5 ${FONT};color:#46423d;">${o.subline}</p>` : ''}
${o.body}
${o.button}
</td></tr>
<tr><td style="padding:16px 8px 0;font:400 12px/1.6 ${FONT};color:${MUTED};">${o.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Builds the email for one event: HTML in CaseLab's look, a plain-text twin, and a subject that says what it is about.
 * `fromName` is who the email is about (who asked, or who said yes); `toName` is who it is for.
 */
export function buildEmail(event: NotifyEvent, input: { request: StoredRequest; fromName: string; toName: string; appUrl: string }, to: string): Email {
  const { request } = input;
  const app = input.appUrl.replace(/\/+$/, '');
  const inbox = `${app}/#/inbox`;
  const from = oneLine(clean(input.fromName, 80)) || 'A CaseLab member';
  const toName = oneLine(clean(input.toName, 80)) || 'there';
  const p = proposalOf(request);
  const offline = 'To stop these emails, open CaseLab, choose the profile icon, then Profile & privacy, and turn off “Email me about requests”.';

  if (event === 'sent') {
    const line = describeProposal(p);
    const subject = oneLine(line ? `${from} asked you to case: ${line.split(' · ')[0]}` : `${from} asked you to case`);
    const rows = [p.title && row('Case', escapeHtml(p.title)), p.book && row('Casebook', escapeHtml(p.book)), p.when && row('When', escapeHtml(p.when))].filter(Boolean).join('');
    const body =
      (rows ? card(rows) : `<p style="margin:18px 0 0;font:400 16px/1.55 ${FONT};color:#46423d;">${escapeHtml(from)} didn’t suggest a case or a time, so it’s open for you to decide together.</p>`) +
      (p.note ? quote(`${from} wrote`, linkify(p.note)) : '');
    const html = layout({
      subject,
      preheader: line || `${from} would like to case with you.`,
      eyebrow: 'A request for you',
      headline: `${escapeHtml(from)} asked you to case`,
      subline: `Hi ${escapeHtml(toName)}, here’s what they have in mind. You can accept or decline in CaseLab, with a note back.`,
      body,
      button: button(inbox, 'Answer in CaseLab'),
      footer: `You’re getting this because ${escapeHtml(from)} used CaseLab to ask you. Only you can see these details. ${escapeHtml(offline)}`,
    });
    const text = [
      `${from} asked you to case`,
      '',
      `Hi ${toName}, here's what they have in mind.`,
      '',
      ...(p.title ? [`Case: ${p.title}`] : []),
      ...(p.book ? [`Casebook: ${p.book}`] : []),
      ...(p.when ? [`When: ${p.when}`] : []),
      ...(!line ? [`${from} didn't suggest a case or a time.`] : []),
      ...(p.note ? ['', `${from} wrote:`, p.note] : []),
      '',
      `Answer in CaseLab: ${inbox}`,
      '',
      `You're getting this because ${from} used CaseLab to ask you. ${offline}`,
    ].join('\n');
    return { to, subject, html, text };
  }

  // answered (accepted)
  const reply = clean(request.reply, 280);
  const line = describeProposal(p);
  const subject = oneLine(`${from} said yes to casing with you`);
  // Here `from` is whoever said yes (the request's recipient) and `toName` is whoever asked: handleNotify passes them that way round.
  const rows = [p.title && row('Case', escapeHtml(p.title)), p.book && row('Casebook', escapeHtml(p.book)), p.when && row('When', escapeHtml(p.when))].filter(Boolean).join('');
  const body = (rows ? card(rows) : '') + (reply ? quote(`${from} wrote`, linkify(reply)) : '');
  const html = layout({
    subject,
    preheader: reply ? oneLine(reply).slice(0, 90) : `${from} accepted your request. Say hello.`,
    eyebrow: 'Good news',
    headline: `${escapeHtml(from)} said yes`,
    subline: `Hi ${escapeHtml(toName)}, ${escapeHtml(from)} accepted your request${line ? ' to case' : ''}. You can chat in CaseLab to settle the details.`,
    body,
    button: button(inbox, 'Say hello in CaseLab'),
    footer: `You’re getting this because you asked ${escapeHtml(from)} to case on CaseLab. ${escapeHtml(offline)}`,
  });
  const text = [
    `${from} said yes to casing with you`,
    '',
    `Hi ${toName}, ${from} accepted your request${line ? ' to case' : ''}.`,
    '',
    ...(p.title ? [`Case: ${p.title}`] : []),
    ...(p.book ? [`Casebook: ${p.book}`] : []),
    ...(p.when ? [`When: ${p.when}`] : []),
    ...(reply ? ['', `${from} wrote:`, reply] : []),
    '',
    `Say hello in CaseLab: ${inbox}`,
    '',
    `You're getting this because you asked ${from} to case on CaseLab. ${offline}`,
  ].join('\n');
  return { to, subject, html, text };
}
