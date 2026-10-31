// notify-request: emails a member about a practice request (someone asked them to case, or accepted their request).
//
// The app calls this right after a member sends or accepts a request, with the signed-in member's token. All the decisions (who is
// emailed, when, what it says) live in ../_shared/notifyRequest.ts and are tested there; this file only plugs in the real services.
//
// Secrets to set (supabase secrets set ...):  RESEND_API_KEY, EMAIL_FROM (e.g. "CaseLab <hello@sleepiepie.com>"), APP_URL.
// Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY itself.
//
// The reply never says whether an email was sent, so that a member can't find out whether someone else has emails turned on.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleNotify, type NotifyDeps, type NotifyEvent, type StoredRequest } from '../_shared/notifyRequest.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const COLUMNS = 'id, from_user, to_user, case_title, case_book, when_text, message, status, reply, created_at, responded_at, emailed_at, answer_emailed_at';
const MARKER = { sent: 'emailed_at', answered: 'answer_emailed_at' } as const;
const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(token);
  if (!auth.user) return reply(401, { error: 'Sign in first' });

  let body: { event?: unknown; requestId?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Bad request' });
  }
  if ((body.event !== 'sent' && body.event !== 'answered') || !isUuid(body.requestId)) return reply(400, { error: 'Bad request' });
  const event: NotifyEvent = body.event;

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log('notify-request: RESEND_API_KEY is not set, so no email is sent');
    return reply(200, { ok: true });
  }

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const from = Deno.env.get('EMAIL_FROM') ?? 'CaseLab <hello@sleepiepie.com>';

  const deps: NotifyDeps = {
    appUrl: Deno.env.get('APP_URL') ?? 'https://caselab-booth.vercel.app',
    now: () => Date.now(),
    getRequest: async (id) => {
      const { data } = await db.from('practice_requests').select(COLUMNS).eq('id', id).maybeSingle();
      return (data as StoredRequest | null) ?? null;
    },
    getName: async (id) => {
      const { data } = await db.from('profiles').select('display_name').eq('user_id', id).maybeSingle();
      return data?.display_name ?? null;
    },
    wantsEmails: async (id) => {
      const { data } = await db.from('notification_settings').select('email_requests').eq('user_id', id).maybeSingle();
      return data?.email_requests ?? true; // no row: the member never chose, and the default is on
    },
    getEmail: async (id) => {
      const { data } = await db.auth.admin.getUserById(id);
      const user = data?.user;
      return user?.email && user.email_confirmed_at ? user.email : null;
    },
    claim: async (id, ev) => {
      const column = MARKER[ev];
      const { data } = await db.from('practice_requests').update({ [column]: new Date().toISOString() }).eq('id', id).is(column, null).select('id');
      return (data?.length ?? 0) > 0;
    },
    unclaim: async (id, ev) => {
      await db.from('practice_requests').update({ [MARKER[ev]]: null }).eq('id', id);
    },
    send: async (email) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      });
      if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    },
  };

  try {
    const outcome = await handleNotify({ event, requestId: body.requestId, callerId: auth.user.id }, deps);
    console.log(`notify-request ${event}: ${outcome.sent ? 'sent' : `not sent (${outcome.reason})`}`);
  } catch (e) {
    console.log(`notify-request ${event}: failed (${e instanceof Error ? e.message : String(e)})`);
  }
  return reply(200, { ok: true });
});
