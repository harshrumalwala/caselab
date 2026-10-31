// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildEmail,
  describeProposal,
  escapeHtml,
  FRESH_FOR_MS,
  handleNotify,
  linkify,
  type Email,
  type NotifyDeps,
  type NotifyEvent,
  type StoredRequest,
} from '../../supabase/functions/_shared/notifyRequest';

const NOW = Date.parse('2026-11-11T20:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const ASKER = 'asker';
const ANSWERER = 'answerer';

const aRequest = (over: Partial<StoredRequest> = {}): StoredRequest => ({
  id: 'r1',
  from_user: ASKER,
  to_user: ANSWERER,
  case_title: 'Airline profitability',
  case_book: 'Cosentino',
  when_text: 'tonight 8pm ET',
  message: 'Up for a profitability case? I can interview first.',
  status: 'pending',
  reply: null,
  created_at: minutesAgo(1),
  responded_at: null,
  emailed_at: null,
  answer_emailed_at: null,
  ...over,
});

/** A pretend database and mailer that remember what happened. */
function world(request: StoredRequest | null, opts: { emailsOn?: Record<string, boolean>; addresses?: Record<string, string | null>; failSend?: boolean; names?: Record<string, string | null> } = {}) {
  const sent: Email[] = [];
  const claims: string[] = [];
  const state = { request };
  const deps: NotifyDeps = {
    appUrl: 'https://caselab.example',
    now: () => NOW,
    getRequest: async () => state.request,
    getName: async (id) => (opts.names ?? { [ASKER]: 'Bob Brown', [ANSWERER]: 'Carol Chen' })[id] ?? null,
    wantsEmails: async (id) => opts.emailsOn?.[id] ?? true,
    getEmail: async (id) => (opts.addresses ?? { [ASKER]: 'bob@example.com', [ANSWERER]: 'carol@example.com' })[id] ?? null,
    claim: async (id, event) => {
      const key = `${id}:${event}`;
      if (claims.includes(key)) return false;
      claims.push(key);
      return true;
    },
    unclaim: async (id, event) => void claims.splice(claims.indexOf(`${id}:${event}`), 1),
    send: async (email) => {
      if (opts.failSend) throw new Error('Resend is down');
      sent.push(email);
    },
  };
  return { deps, sent, claims };
}

const run = (event: NotifyEvent, callerId: string, w: ReturnType<typeof world>) => handleNotify({ event, requestId: 'r1', callerId }, w.deps);

describe('who gets emailed about a new request', () => {
  it('tells the recipient, once, with the details, and nobody else', async () => {
    const w = world(aRequest());
    const out = await run('sent', ASKER, w);
    expect(out).toEqual({ sent: true, reason: 'sent' });
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].to).toBe('carol@example.com'); // the person asked, never the asker
    expect(w.sent[0].subject).toBe('Bob Brown asked you to case: Airline profitability (Cosentino)');
    expect(w.sent[0].html).toContain('Hi Carol Chen');
    expect(w.sent[0].html).toContain('https://caselab.example/#/inbox');

    // However often it is called again, no second email.
    expect(await run('sent', ASKER, w)).toMatchObject({ sent: false, reason: 'already emailed' });
    expect(w.sent).toHaveLength(1);
  });

  it('refuses anyone but the sender to trigger it, so nobody can make CaseLab email a stranger', async () => {
    for (const caller of [ANSWERER, 'someone-else', '']) {
      const w = world(aRequest());
      expect(await run('sent', caller, w), caller).toMatchObject({ sent: false, reason: 'caller is not the sender' });
      expect(w.sent).toEqual([]);
      expect(w.claims).toEqual([]);
    }
  });

  it('only emails about a request that is still waiting, and still new', async () => {
    for (const status of ['accepted', 'declined', 'cancelled'] as const) {
      const w = world(aRequest({ status }));
      expect(await run('sent', ASKER, w), status).toMatchObject({ sent: false, reason: 'request is no longer waiting' });
    }
    const stale = world(aRequest({ created_at: new Date(NOW - FRESH_FOR_MS - 1000).toISOString() }));
    expect(await run('sent', ASKER, stale)).toMatchObject({ sent: false, reason: 'too old to email about' });
    const justInTime = world(aRequest({ created_at: new Date(NOW - FRESH_FOR_MS + 1000).toISOString() }));
    expect((await run('sent', ASKER, justInTime)).sent).toBe(true);
    expect(await run('sent', ASKER, world(null))).toMatchObject({ sent: false, reason: 'no such request' });
  });

  it('respects a member who turned the emails off, and one with no verified address, without using up the one email', async () => {
    const off = world(aRequest(), { emailsOn: { [ANSWERER]: false } });
    expect(await run('sent', ASKER, off)).toMatchObject({ sent: false, reason: 'recipient turned emails off' });
    expect(off.sent).toEqual([]);
    expect(off.claims).toEqual([]);

    const noAddress = world(aRequest(), { addresses: { [ASKER]: 'bob@example.com', [ANSWERER]: null } });
    expect(await run('sent', ASKER, noAddress)).toMatchObject({ sent: false, reason: 'recipient has no verified email' });
  });

  it('lets a later call try again if the email could not be sent, instead of losing it', async () => {
    const down = world(aRequest(), { failSend: true });
    expect(await run('sent', ASKER, down)).toMatchObject({ sent: false, reason: 'could not send: Resend is down' });
    expect(down.claims).toEqual([]); // released

    const back = world(aRequest());
    back.deps.claim = down.deps.claim;
    expect((await run('sent', ASKER, back)).sent).toBe(true);
  });

  it('cannot be tricked into sending twice by two calls at the same moment', async () => {
    const w = world(aRequest());
    const [a, b] = await Promise.all([run('sent', ASKER, w), run('sent', ASKER, w)]);
    expect([a.sent, b.sent].sort()).toEqual([false, true]);
    expect(w.sent).toHaveLength(1);
  });

  it('copes with a member who has no profile name', async () => {
    const w = world(aRequest(), { names: { [ASKER]: null, [ANSWERER]: null } });
    await run('sent', ASKER, w);
    expect(w.sent[0].subject).toBe('A CaseLab member asked you to case: Airline profitability (Cosentino)');
    expect(w.sent[0].html).toContain('Hi there');
  });
});

describe('who gets emailed when a request is accepted', () => {
  const accepted = (over: Partial<StoredRequest> = {}) => aRequest({ status: 'accepted', reply: 'Yes! Zoom: https://zoom.example/room', responded_at: minutesAgo(1), ...over });

  it('tells the person who asked, in the name of the person who said yes', async () => {
    const w = world(accepted());
    expect(await run('answered', ANSWERER, w)).toEqual({ sent: true, reason: 'sent' });
    expect(w.sent[0].to).toBe('bob@example.com');
    expect(w.sent[0].subject).toBe('Carol Chen said yes to casing with you');
    expect(w.sent[0].html).toContain('Hi Bob Brown');
    expect(w.sent[0].html).toContain('Carol Chen said yes');
  });

  it('never emails about a decline, or while still waiting', async () => {
    for (const status of ['declined', 'pending', 'cancelled'] as const) {
      const w = world(accepted({ status }));
      expect(await run('answered', ANSWERER, w), status).toMatchObject({ sent: false, reason: 'only accepted requests are emailed' });
      expect(w.sent).toEqual([]);
    }
  });

  it('only counts when the person who was asked says so', async () => {
    const w = world(accepted());
    expect(await run('answered', ASKER, w)).toMatchObject({ sent: false, reason: 'caller is not the recipient' });
    expect(await run('answered', 'stranger', w)).toMatchObject({ sent: false, reason: 'caller is not the recipient' });
    expect(w.sent).toEqual([]);
  });

  it('is its own email, sent once, and independent of the first one', async () => {
    const w = world(accepted({ emailed_at: minutesAgo(30) })); // the first email already went
    expect((await run('answered', ANSWERER, w)).sent).toBe(true);
    expect(await run('answered', ANSWERER, w)).toMatchObject({ reason: 'already emailed' });
    expect(w.sent).toHaveLength(1);

    const both = world(accepted({ created_at: minutesAgo(5) }));
    expect((await run('sent', ASKER, both)).reason).toBe('request is no longer waiting'); // a request that has been answered isn't announced afterwards
    expect((await run('answered', ANSWERER, both)).sent).toBe(true);
  });

  it('is not sent long after the fact, to someone who turned emails off, or twice', async () => {
    expect(await run('answered', ANSWERER, world(accepted({ responded_at: new Date(NOW - FRESH_FOR_MS - 1000).toISOString() })))).toMatchObject({ reason: 'too old to email about' });
    expect(await run('answered', ANSWERER, world(accepted(), { emailsOn: { [ASKER]: false } }))).toMatchObject({ reason: 'recipient turned emails off' });
    expect(await run('answered', ANSWERER, world(accepted({ answer_emailed_at: minutesAgo(2) })))).toMatchObject({ reason: 'already emailed' });
  });
});

describe('the new-request email', () => {
  const email = (over: Partial<StoredRequest> = {}, names = { fromName: 'Bob Brown', toName: 'Carol Chen' }) =>
    buildEmail('sent', { request: aRequest(over), ...names, appUrl: 'https://caselab.example/' }, 'carol@example.com');

  it('shows what is being asked: the case, the casebook, the time and the note', () => {
    const e = email();
    for (const detail of ['Airline profitability', 'Cosentino', 'tonight 8pm ET', 'Up for a profitability case? I can interview first.', 'Bob Brown wrote']) expect(e.html, detail).toContain(detail);
    expect(e.html).toContain('Answer in CaseLab');
    expect(e.html).toContain('href="https://caselab.example/#/inbox"'); // the trailing slash on the base address is tidied
    expect(e.html).toContain('Profile &amp; privacy');
  });

  it('has a plain-text version with the same details, for clients that need one', () => {
    const { text } = email();
    expect(text).toContain('Bob Brown asked you to case');
    expect(text).toContain('Case: Airline profitability');
    expect(text).toContain('Casebook: Cosentino');
    expect(text).toContain('When: tonight 8pm ET');
    expect(text).toContain('Bob Brown wrote:\nUp for a profitability case? I can interview first.');
    expect(text).toContain('Answer in CaseLab: https://caselab.example/#/inbox');
    expect(text).not.toMatch(/<[a-z]/i); // no markup in the text version
  });

  it('puts the case in the subject and the preview line, so the inbox already says what it is', () => {
    const e = email();
    expect(e.subject).toBe('Bob Brown asked you to case: Airline profitability (Cosentino)');
    expect(e.html).toContain('Airline profitability (Cosentino) · tonight 8pm ET'); // the hidden preview text
    expect(email({ case_title: null, case_book: null, when_text: null, message: null }).subject).toBe('Bob Brown asked you to case');
    expect(email({ case_title: null, case_book: 'Cosentino' }).subject).toBe('Bob Brown asked you to case: a case from Cosentino');
  });

  it('says so when they left everything open, rather than showing an empty card', () => {
    const e = email({ case_title: null, case_book: null, when_text: null, message: null });
    expect(e.html).toContain('didn’t suggest a case or a time');
    expect(e.html).not.toContain('Casebook');
    expect(e.text).toContain("Bob Brown didn't suggest a case or a time.");
    expect(e.text).not.toContain('Case:');
  });

  it('shows only the details that were given', () => {
    const e = email({ case_book: null, when_text: null, message: null });
    expect(e.html).toContain('Airline profitability');
    expect(e.html).not.toContain('Casebook');
    expect(e.html).not.toContain('When');
    expect(e.html).not.toContain('wrote');
  });

  it('keeps everything the sender typed from breaking or abusing the email', () => {
    const e = email(
      {
        case_title: '<script>alert(1)</script> & "quotes"',
        case_book: "'><img src=x onerror=alert(2)>",
        when_text: '</td></tr></table><h1>boo</h1>',
        message: 'Hi <b>there</b>\njavascript:alert(3) and <a href="https://evil.example">click</a>',
      },
      { fromName: 'Bob <i>Brown</i>', toName: 'Carol "Chen"' },
    );
    expect(e.html).not.toMatch(/<script/i);
    expect(e.html).not.toMatch(/<img/i);
    expect(e.html).not.toContain('<h1>boo');
    expect(e.html).not.toContain('<b>there');
    expect(e.html).not.toContain('<i>Brown');
    expect(e.html).not.toMatch(/onerror=alert\(2\)>/); // it is shown as text, not as an element
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
    expect(e.html).toContain('Hi &lt;b&gt;there&lt;/b&gt;<br>javascript:alert(3)'); // line break kept; no script link
    expect(e.html).not.toContain('href="javascript:');
    expect(e.html).toContain('Carol &quot;Chen&quot;');
  });

  it('cannot be given extra headers through a name or a title', () => {
    const e = email({ case_title: 'Airline\r\nBcc: someone@example.com' }, { fromName: 'Bob\nBrown\r\nBcc: x@example.com', toName: 'Carol' });
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.subject).toBe('Bob Brown Bcc: x@example.com asked you to case: Airline Bcc: someone@example.com (Cosentino)');
  });

  it('is a self-contained, light email: no scripts, no images or remote files, and well under the size Gmail cuts off at', () => {
    const e = email();
    expect(e.html.startsWith('<!doctype html>')).toBe(true);
    expect(e.html).toContain('<html lang="en">');
    expect(e.html).not.toMatch(/<script|<img|<link|<iframe|src=|url\(/i);
    expect(e.html).toContain('max-width:560px'); // a narrow column, readable on a phone
    expect(Buffer.byteLength(e.html)).toBeLessThan(40_000);
  });
});

describe('the accepted email', () => {
  const email = (over: Partial<StoredRequest> = {}) =>
    buildEmail('answered', { request: aRequest({ status: 'accepted', reply: 'Yes! Zoom: https://zoom.example/room.', ...over }), fromName: 'Carol Chen', toName: 'Bob Brown', appUrl: 'https://caselab.example' }, 'bob@example.com');

  it('says who said yes, what it was about, what they wrote back, and links to the chat', () => {
    const e = email();
    expect(e.subject).toBe('Carol Chen said yes to casing with you');
    for (const detail of ['Carol Chen said yes', 'Hi Bob Brown', 'Airline profitability', 'tonight 8pm ET', 'Carol Chen wrote', 'Say hello in CaseLab']) expect(e.html, detail).toContain(detail);
    expect(e.text).toContain('Carol Chen wrote:\nYes! Zoom: https://zoom.example/room.');
    expect(e.text).toContain('Say hello in CaseLab: https://caselab.example/#/inbox');
  });

  it('makes a web address in the reply clickable, without swallowing the full stop after it', () => {
    const e = email();
    expect(e.html).toContain('<a href="https://zoom.example/room" style="color:#800000;font-weight:700;">https://zoom.example/room</a>.');
  });

  it('still reads well when there was no reply and no details', () => {
    const e = email({ reply: null, case_title: null, case_book: null, when_text: null, message: null });
    expect(e.html).toContain('Carol Chen said yes');
    expect(e.html).not.toContain('wrote');
    expect(e.html).not.toContain('Casebook');
  });
});

describe('small helpers', () => {
  it('escapes everything that could be read as markup', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('turns only http and https addresses into links, and keeps line breaks', () => {
    expect(linkify('see https://a.example/x?y=1&z=2, then http://b.example!')).toBe(
      'see <a href="https://a.example/x?y=1&amp;z=2" style="color:#800000;font-weight:700;">https://a.example/x?y=1&amp;z=2</a>, then <a href="http://b.example" style="color:#800000;font-weight:700;">http://b.example</a>!',
    );
    expect(linkify('ftp://a.example javascript:alert(1) data:text/html,x')).toBe('ftp://a.example javascript:alert(1) data:text/html,x');
    expect(linkify('one\ntwo\r\nthree')).toBe('one<br>two<br>three');
    expect(linkify('https://a.example"onmouseover="alert(1)')).not.toContain('onmouseover="');
  });

  it('describes a proposal the way the app does', () => {
    expect(describeProposal({ title: 'Airline', book: 'Cosentino', when: 'tonight' })).toBe('Airline (Cosentino) · tonight');
    expect(describeProposal({ title: 'Airline', book: '', when: '' })).toBe('Airline');
    expect(describeProposal({ title: '', book: 'Cosentino', when: '' })).toBe('a case from Cosentino');
    expect(describeProposal({ title: '', book: '', when: 'this weekend' })).toBe('this weekend');
    expect(describeProposal({ title: '', book: '', when: '' })).toBe('');
  });
});
